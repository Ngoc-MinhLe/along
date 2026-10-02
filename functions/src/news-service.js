const { HttpsError } = require('firebase-functions/v2/https')
const { FieldPath, Timestamp } = require('firebase-admin/firestore')
const { adminDb } = require('./admin')
const {
  assertNoClientActorUid,
  getTrustedActor,
  hasPermission,
} = require('./authorization')
const { resolveEffectiveMembership } = require('./membership-service')

const ACCESS_MODES = Object.freeze({ PUBLIC: 'PUBLIC', VIP: 'VIP', SPECIAL: 'SPECIAL' })
const MAX_LIST_LIMIT = 50
const MAX_SCAN_LIMIT = 100
const MAX_SELECTOR_LIMIT = 50
const MAX_CATEGORY_TREE_LIMIT = 1000

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodeCursor(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 2048) invalidArgument('cursor is invalid.')
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!decoded || typeof decoded.field !== 'string' || !['title', 'name', 'displayName', 'email', 'updatedAt'].includes(decoded.field)
      || typeof decoded.id !== 'string' || !decoded.id) invalidArgument('cursor is invalid.')
    if (decoded.field === 'updatedAt' ? !Number.isFinite(decoded.value) : typeof decoded.value !== 'string') invalidArgument('cursor is invalid.')
    return decoded
  } catch {
    invalidArgument('cursor is invalid.')
  }
}

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message)
}

function notFound() {
  // Do not reveal whether a protected or unpublished article exists.
  throw new HttpsError('not-found', 'News article was not found.')
}

function assertObject(value, message = 'Request payload must be an object.') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalidArgument(message)
  }
}

function assertAllowedKeys(data, allowed) {
  assertObject(data)
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(data).find((key) => !allowedSet.has(key))
  if (unknown) invalidArgument(`Unsupported request field: ${unknown}.`)
}

function normalizeListPayload(data) {
  assertAllowedKeys(data || {}, ['categoryId', 'limit'])
  const categoryId = data?.categoryId
  if (categoryId !== undefined && categoryId !== null
    && (typeof categoryId !== 'string' || !categoryId.trim())) {
    invalidArgument('categoryId must be a non-empty string when provided.')
  }
  const limit = data?.limit === undefined ? 20 : data.limit
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    invalidArgument(`limit must be an integer from 1 to ${MAX_LIST_LIMIT}.`)
  }
  return { categoryId: categoryId?.trim() || null, limit }
}

function normalizeSelectorPayload(data, allowedKeys = []) {
  assertAllowedKeys(data || {}, ['query', 'limit', 'cursor', ...allowedKeys])
  const query = data?.query
  if (query !== undefined && (typeof query !== 'string' || query.length > 120)) {
    invalidArgument('query must be a string with at most 120 characters.')
  }
  const limit = data?.limit === undefined ? 20 : data.limit
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SELECTOR_LIMIT) {
    invalidArgument(`limit must be an integer from 1 to ${MAX_SELECTOR_LIMIT}.`)
  }
  return { query: query?.trim() || '', limit, cursor: decodeCursor(data?.cursor) }
}

function normalizeCategorySearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

function normalizeStoredParentId(value) {
  if (value === undefined || value === null || value === '') return null
  return typeof value === 'string' && value.length <= 128 && !value.includes('/') ? value : null
}

function serializeCategory(snapshot) {
  const data = snapshot.data() || {}
  return {
    id: snapshot.id,
    name: typeof data.name === 'string' ? data.name : '',
    slug: typeof data.slug === 'string' ? data.slug : '',
    description: typeof data.description === 'string' ? data.description : '',
    status: data.status,
    parentId: normalizeStoredParentId(data.parentId),
    defaultAccessPolicy: data.defaultAccessPolicy || null,
  }
}

function normalizeManagementPayload(data) {
  const payload = normalizeSelectorPayload(data, ['status', 'categoryId'])
  const status = data?.status === undefined || data.status === '' ? null : data.status
  if (status !== null && !['draft', 'published', 'archived'].includes(status)) invalidArgument('status is invalid.')
  const categoryId = data?.categoryId === undefined || data.categoryId === '' ? null : data.categoryId
  if (categoryId !== null && (typeof categoryId !== 'string' || categoryId.length > 128)) invalidArgument('categoryId is invalid.')
  return { ...payload, status, categoryId }
}

function applyStringCursor(query, payload, field) {
  if (payload.cursor) query = query.startAfter(payload.cursor.value, payload.cursor.id)
  else if (payload.query) query = query.startAt(payload.query)
  if (payload.query) query = query.endAt(`${payload.query}\uf8ff`)
  return query
}

function requireAnyPermission(actor, permissions) {
  if (!actor || !permissions.some((permission) => hasPermission(actor, permission))) {
    throw new HttpsError('permission-denied', 'The actor does not have a News management permission.')
  }
}

function normalizeArticleId(data) {
  assertAllowedKeys(data || {}, ['articleId'])
  if (typeof data?.articleId !== 'string' || !data.articleId.trim()) {
    invalidArgument('articleId is required.')
  }
  return data.articleId.trim()
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  return null
}

function isWithinEntitlementWindow(entitlement, now = Date.now()) {
  if (!entitlement || entitlement.status !== 'active') return false
  const startsAt = timestampMillis(entitlement.startsAt)
  const expiresAt = timestampMillis(entitlement.expiresAt)
  if (startsAt !== null && startsAt > now) return false
  if (expiresAt !== null && expiresAt <= now) return false
  return true
}

function normalizeAccessPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null
  const mode = policy.mode
  if (!Object.values(ACCESS_MODES).includes(mode)) return null
  if (mode === ACCESS_MODES.VIP) {
    if (!Number.isSafeInteger(policy.minVipLevel) || policy.minVipLevel < 1) return null
    return { mode, minVipLevel: policy.minVipLevel }
  }
  return { mode, minVipLevel: null }
}

async function readCategoryPolicy(categoryId, db) {
  if (!categoryId) return null
  const snapshot = await db.doc(`newsCategories/${categoryId}`).get()
  if (!snapshot.exists) return null
  const category = snapshot.data()
  if (!category || category.status !== 'active') return null
  const policy = normalizeAccessPolicy(category.defaultAccessPolicy)
  return policy ? { policy, source: 'CATEGORY', categoryId } : null
}

async function resolveArticlePolicy(article, db) {
  const articlePolicy = article.accessPolicy
  const inheritsCategory = articlePolicy?.inheritCategory === true || articlePolicy?.mode === 'INHERIT'
  if (!inheritsCategory) {
    const policy = normalizeAccessPolicy(articlePolicy)
    return policy ? { policy, source: 'ARTICLE', categoryId: article.categoryId || null } : null
  }
  return readCategoryPolicy(article.categoryId, db)
}

async function readEntitlement(uid, db) {
  const snapshot = await db.doc(`contentEntitlements/${uid}`).get()
  if (!snapshot.exists) return null
  const entitlement = snapshot.data()
  if (!entitlement || entitlement.uid !== uid || !Number.isInteger(entitlement.newsLevel)
    || entitlement.newsLevel < 0 || entitlement.newsLevel > 3) return null
  return isWithinEntitlementWindow(entitlement) ? entitlement : null
}

async function readCanonicalMembershipLevel(uid, db) {
  try {
    const resolved = await resolveEffectiveMembership(uid, db)
    return resolved?.level ?? null
  } catch (error) {
    // Malformed membership data or an invariant violation must fail closed for
    // News reads and must not expose protected article existence.
    return null
  }
}

async function hasAclAccess(uid, aclPath, db) {
  const snapshot = await db.collection(aclPath).get()
  const entries = snapshot.docs
    .map((item) => item.data())
    .filter((entry) => entry?.effect === 'ALLOW'
      && ['USER', 'GROUP'].includes(entry.principalType)
      && typeof entry.principalId === 'string'
      && entry.principalId.length > 0)
  if (entries.some((entry) => entry.principalType === 'USER' && entry.principalId === uid)) return true

  const groupIds = [...new Set(entries
    .filter((entry) => entry.principalType === 'GROUP' && typeof entry.principalId === 'string')
    .map((entry) => entry.principalId))]
  if (!groupIds.length) return false

  const memberships = await Promise.all(groupIds.map(async (groupId) => {
    const [group, membership] = await Promise.all([
      db.doc(`newsGroups/${groupId}`).get(),
      db.doc(`newsGroups/${groupId}/members/${uid}`).get(),
    ])
    if (!group.exists || group.data()?.status !== 'active' || !membership.exists) return false
    const data = membership.data()
    return data?.uid === uid && data?.status === 'active' && isWithinEntitlementWindow(data)
  }))
  return memberships.some(Boolean)
}

async function canReadArticle(actor, article, policyResult, db) {
  const { policy, source, categoryId } = policyResult
  if (policy.mode === ACCESS_MODES.PUBLIC) return true
  if (!actor || !hasPermission(actor, 'news.read')) return false

  if (policy.mode === ACCESS_MODES.VIP) {
    const membershipLevel = await readCanonicalMembershipLevel(actor.uid, db)
    if (membershipLevel !== null && membershipLevel >= policy.minVipLevel) return true

    // Legacy contentEntitlements remains a compatibility fallback while
    // canonical Membership data becomes the primary VIP source.
    const entitlement = await readEntitlement(actor.uid, db)
    return Boolean(entitlement && entitlement.newsLevel >= policy.minVipLevel)
  }

  const aclPath = source === 'CATEGORY' && categoryId
    ? `newsCategories/${categoryId}/acl`
    : `newsArticles/${article.id}/acl`
  return hasAclAccess(actor.uid, aclPath, db)
}

function toIso(value) {
  const millis = timestampMillis(value)
  return millis === null ? null : new Date(millis).toISOString()
}

function serializeArticle(article, includeContent = false) {
  const result = {
    id: article.id,
    slug: typeof article.slug === 'string' ? article.slug : null,
    title: typeof article.title === 'string' ? article.title : '',
    excerpt: typeof article.excerpt === 'string' ? article.excerpt : '',
    categoryId: typeof article.categoryId === 'string' ? article.categoryId : null,
    publishedAt: toIso(article.publishedAt),
    updatedAt: toIso(article.updatedAt),
    accessMode: article.resolvedAccessMode,
    accessLevel: article.resolvedAccessLevel,
  }
  if (includeContent) {
    result.content = article.content ?? null
    result.contentFormat = typeof article.contentFormat === 'string' ? article.contentFormat : null
  }
  return result
}

async function readPublishedArticle(snapshot, actor, db, includeContent = false) {
  if (!snapshot.exists) return null
  const article = { id: snapshot.id, ...snapshot.data() }
  if (article.status !== 'published') return null
  const policyResult = await resolveArticlePolicy(article, db)
  if (!policyResult) return null
  const allowed = await canReadArticle(actor, article, policyResult, db)
  if (!allowed) return null
  const { mode } = policyResult.policy
  return serializeArticle({
    ...article,
    resolvedAccessMode: mode,
    resolvedAccessLevel: mode === ACCESS_MODES.VIP ? policyResult.policy.minVipLevel : null,
  }, includeContent)
}

async function getOptionalTrustedActor(request) {
  assertNoClientActorUid(request?.data)
  if (!request?.auth) return null
  return getTrustedActor(request)
}

async function listNews(actor, data, db = adminDb) {
  const payload = normalizeListPayload(data)
  let query = db.collection('newsArticles')
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .limit(Math.min(payload.limit * 2, MAX_SCAN_LIMIT))
  if (payload.categoryId) query = query.where('categoryId', '==', payload.categoryId)

  const snapshot = await query.get()
  const items = []
  for (const articleSnapshot of snapshot.docs) {
    const item = await readPublishedArticle(articleSnapshot, actor, db)
    if (item) items.push(item)
    if (items.length >= payload.limit) break
  }
  return { ok: true, items }
}

async function getNewsArticle(actor, data, db = adminDb) {
  const articleId = normalizeArticleId(data)
  const snapshot = await db.doc(`newsArticles/${articleId}`).get()
  const article = await readPublishedArticle(snapshot, actor, db, true)
  if (!article) notFound()
  return { ok: true, article }
}

function managementArticleData(snapshot, articleId, { includeContent = false } = {}) {
  if (!snapshot.exists) notFound()
  const data = snapshot.data()
  if (!data || data.id !== articleId || !['draft', 'published', 'archived'].includes(data.status)) {
    throw new HttpsError('failed-precondition', 'The News article is invalid.')
  }
  const policy = normalizeAccessPolicy(data.accessPolicy)
  if (!policy && data.accessPolicy?.mode !== 'INHERIT') {
    throw new HttpsError('failed-precondition', 'The News article access policy is invalid.')
  }
  const result = {
    id: articleId,
    title: typeof data.title === 'string' ? data.title : '',
    slug: typeof data.slug === 'string' ? data.slug : '',
    excerpt: typeof data.excerpt === 'string' ? data.excerpt : '',
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
    status: data.status,
    accessPolicy: data.accessPolicy || null,
    updatedAt: toIso(data.updatedAt),
    publishedAt: toIso(data.publishedAt),
  }
  if (includeContent) {
    result.content = typeof data.content === 'string' ? data.content : ''
    result.contentFormat = typeof data.contentFormat === 'string' ? data.contentFormat : 'PLAIN_TEXT'
  }
  return result
}

async function listNewsManagement(actor, data, db = adminDb) {
  requireAnyPermission(actor, ['news.read', 'news.create', 'news.update', 'news.delete', 'news.publish', 'news.restore'])
  const payload = normalizeManagementPayload(data)
  const queryText = payload.query.toLowerCase()
  let query = db.collection('newsArticles')
  if (payload.status) query = query.where('status', '==', payload.status)
  if (payload.categoryId) query = query.where('categoryId', '==', payload.categoryId)
  if (payload.query) {
    query = query.orderBy('title').orderBy(FieldPath.documentId())
    if (payload.cursor) query = query.startAfter(payload.cursor.value, payload.cursor.id)
    else query = query.startAt(payload.query)
    query = query.endAt(`${payload.query}\uf8ff`)
  } else {
    query = query.orderBy('updatedAt', 'desc').orderBy(FieldPath.documentId(), 'desc')
    if (payload.cursor) query = query.startAfter(Timestamp.fromMillis(payload.cursor.value), payload.cursor.id)
  }
  const snapshot = await query.limit(payload.limit).get()
  const items = snapshot.docs
    .map((item) => managementArticleData(item, item.id))
    .filter((item) => {
      const searchable = `${item.title} ${item.slug}`.toLowerCase()
      return !queryText || searchable.includes(queryText)
    })
  const last = snapshot.docs.at(-1)
  const cursorValue = last ? (payload.query
    ? String(last.data()?.title || '')
    : (last.data()?.updatedAt?.toMillis?.() || 0)) : null
  return { ok: true, items, hasMore: snapshot.docs.length === payload.limit, nextCursor: last ? encodeCursor({ field: payload.query ? 'title' : 'updatedAt', value: cursorValue, id: last.id }) : null }
}

async function getNewsManagementArticle(actor, data, db = adminDb) {
  requireAnyPermission(actor, ['news.read', 'news.create', 'news.update', 'news.delete', 'news.publish', 'news.restore'])
  const articleId = normalizeArticleId(data)
  const snapshot = await db.doc(`newsArticles/${articleId}`).get()
  return { ok: true, article: managementArticleData(snapshot, articleId, { includeContent: true }) }
}

async function listNewsCategories(actor, data, db = adminDb) {
  const payload = normalizeSelectorPayload(data, ['includeDisabled'])
  const includeDisabled = data?.includeDisabled === true
  if (includeDisabled) requireAnyPermission(actor, ['news.create', 'news.update', 'news.delete'])
  let query = db.collection('newsCategories')
  if (!includeDisabled) query = query.where('status', '==', 'active')
  query = query.orderBy('name').orderBy(FieldPath.documentId())
  if (payload.query) {
    // Firestore prefix matching is case-sensitive. A bounded catalog read lets
    // legacy categories (which have no normalized search field) participate in
    // case/diacritic-insensitive selector search without a client-side scan.
    const snapshot = await query.limit(MAX_CATEGORY_TREE_LIMIT).get()
    const queryText = normalizeCategorySearchText(payload.query)
    const filtered = snapshot.docs
      .map(serializeCategory)
      .filter((item) => (includeDisabled || item.status === 'active')
        && normalizeCategorySearchText(`${item.name} ${item.slug} ${item.description}`).includes(queryText))
    const cursorIndex = payload.cursor
      ? filtered.findIndex((item) => item.id === payload.cursor.id)
      : -1
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0
    const items = filtered.slice(startIndex, startIndex + payload.limit)
    const last = items.at(-1)
    return {
      ok: true,
      items,
      hasMore: startIndex + items.length < filtered.length,
      nextCursor: last ? encodeCursor({ field: 'name', value: last.name, id: last.id }) : null,
    }
  }
  if (payload.cursor) query = query.startAfter(payload.cursor.value, payload.cursor.id)
  const snapshot = await query.limit(payload.limit).get()
  const items = snapshot.docs.map(serializeCategory).filter((item) => includeDisabled || item.status === 'active')
  const last = snapshot.docs.at(-1)
  return { ok: true, items, hasMore: snapshot.docs.length === payload.limit, nextCursor: last ? encodeCursor({ field: 'name', value: String(last.data()?.name || ''), id: last.id }) : null }
}

async function listNewsCategoryTree(actor, data, db = adminDb) {
  assertAllowedKeys(data || {}, ['query', 'includeDisabled', 'limit'])
  const query = typeof data?.query === 'string' ? data.query.trim() : ''
  if (query.length > 120) invalidArgument('query must be a string with at most 120 characters.')
  const includeDisabled = data?.includeDisabled !== false
  requireAnyPermission(actor, ['news.create', 'news.update', 'news.delete'])
  const requestedLimit = data?.limit === undefined ? MAX_CATEGORY_TREE_LIMIT : data.limit
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_CATEGORY_TREE_LIMIT) {
    invalidArgument(`limit must be an integer from 1 to ${MAX_CATEGORY_TREE_LIMIT}.`)
  }

  let queryRef = db.collection('newsCategories').orderBy('name').orderBy(FieldPath.documentId())
  if (!includeDisabled) queryRef = queryRef.where('status', '==', 'active')
  const snapshot = await queryRef.limit(requestedLimit).get()
  const allItems = snapshot.docs
    .map(serializeCategory)
    .filter((item) => includeDisabled || item.status === 'active')
  if (!query) {
    return { ok: true, items: allItems, hasMore: snapshot.docs.length === requestedLimit, nextCursor: null }
  }

  const queryText = normalizeCategorySearchText(query)
  const matches = new Set(allItems
    .filter((item) => normalizeCategorySearchText(`${item.name} ${item.slug} ${item.description}`).includes(queryText))
    .map((item) => item.id))
  const byId = new Map(allItems.map((item) => [item.id, item]))
  const contextIds = new Set(matches)
  for (const matchId of matches) {
    let parentId = byId.get(matchId)?.parentId
    const seen = new Set([matchId])
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      if (!byId.has(parentId)) break
      contextIds.add(parentId)
      parentId = byId.get(parentId)?.parentId
    }
  }
  const items = allItems.filter((item) => contextIds.has(item.id))
  return { ok: true, items, hasMore: snapshot.docs.length === requestedLimit, nextCursor: null }
}

async function listNewsUsers(actor, data, db = adminDb) {
  requireAnyPermission(actor, ['news.update'])
  const payload = normalizeSelectorPayload(data)
  const searchField = payload.query.includes('@') ? 'email' : 'displayName'
  let query = db.collection('users').where('status', '==', 'active').orderBy(searchField).orderBy(FieldPath.documentId())
  if (payload.query) {
    if (payload.cursor) query = query.startAfter(payload.cursor.value, payload.cursor.id)
    else query = query.startAt(payload.query)
    query = query.endAt(`${payload.query}\uf8ff`)
  } else if (payload.cursor) query = query.startAfter(payload.cursor.value, payload.cursor.id)
  const snapshot = await query.limit(payload.limit).get()
  const queryText = payload.query.toLowerCase()
  const items = snapshot.docs.map((item) => {
    const data = item.data()
    return {
      id: item.id,
      uid: data.uid === item.id ? item.id : null,
      email: typeof data.email === 'string' ? data.email : '',
      displayName: typeof data.displayName === 'string' ? data.displayName : '',
      status: data.status || 'active',
    }
  }).filter((item) => item.uid)
  const last = snapshot.docs.at(-1)
  return { ok: true, items, hasMore: snapshot.docs.length === payload.limit, nextCursor: last ? encodeCursor({ field: searchField, value: String(last.data()?.[searchField] || ''), id: last.id }) : null }
}

async function listNewsGroups(actor, data, db = adminDb) {
  requireAnyPermission(actor, ['news.update'])
  const payload = normalizeSelectorPayload(data)
  let query = db.collection('newsGroups').where('status', '==', 'active').orderBy('name').orderBy(FieldPath.documentId())
  if (payload.query) {
    if (payload.cursor) query = query.startAfter(payload.cursor.value, payload.cursor.id)
    else query = query.startAt(payload.query)
    query = query.endAt(`${payload.query}\uf8ff`)
  } else if (payload.cursor) query = query.startAfter(payload.cursor.value, payload.cursor.id)
  const snapshot = await query.limit(payload.limit).get()
  const items = snapshot.docs.map((item) => {
    const data = item.data()
    return {
      id: item.id,
      name: typeof data.name === 'string' ? data.name : item.id,
      status: data.status,
    }
  })
  const last = snapshot.docs.at(-1)
  return { ok: true, items, hasMore: snapshot.docs.length === payload.limit, nextCursor: last ? encodeCursor({ field: 'name', value: String(last.data()?.name || ''), id: last.id }) : null }
}

async function invokeNews(request, handler) {
  const actor = await getOptionalTrustedActor(request)
  try {
    return await handler(actor, request?.data || {})
  } catch (error) {
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'News request failed.')
  }
}

module.exports = {
  ACCESS_MODES,
  normalizeAccessPolicy,
  canReadArticle,
  listNews,
  getNewsArticle,
  listNewsManagement,
  getNewsManagementArticle,
  listNewsCategories,
  listNewsCategoryTree,
  listNewsUsers,
  listNewsGroups,
  invokeNews,
}
