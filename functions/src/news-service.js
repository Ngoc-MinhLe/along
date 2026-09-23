const { HttpsError } = require('firebase-functions/v2/https')
const { adminDb } = require('./admin')
const {
  assertNoClientActorUid,
  getTrustedActor,
  hasPermission,
} = require('./authorization')

const ACCESS_MODES = Object.freeze({ PUBLIC: 'PUBLIC', VIP: 'VIP', SPECIAL: 'SPECIAL' })
const MAX_LIST_LIMIT = 50
const MAX_SCAN_LIMIT = 100

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
  if (categoryId !== undefined && (typeof categoryId !== 'string' || !categoryId.trim())) {
    invalidArgument('categoryId must be a non-empty string when provided.')
  }
  const limit = data?.limit === undefined ? 20 : data.limit
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    invalidArgument(`limit must be an integer from 1 to ${MAX_LIST_LIMIT}.`)
  }
  return { categoryId: categoryId?.trim() || null, limit }
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
    if (!Number.isInteger(policy.minVipLevel) || policy.minVipLevel < 1 || policy.minVipLevel > 3) return null
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
  if (!entitlement || !Number.isInteger(entitlement.newsLevel)
    || entitlement.newsLevel < 0 || entitlement.newsLevel > 3) return null
  return isWithinEntitlementWindow(entitlement) ? entitlement : null
}

async function hasAclAccess(uid, aclPath, db) {
  const snapshot = await db.collection(aclPath).get()
  const entries = snapshot.docs.map((item) => item.data()).filter((entry) => entry?.effect === 'ALLOW')
  if (entries.some((entry) => entry.principalType === 'USER' && entry.principalId === uid)) return true

  const groupIds = [...new Set(entries
    .filter((entry) => entry.principalType === 'GROUP' && typeof entry.principalId === 'string')
    .map((entry) => entry.principalId))]
  if (!groupIds.length) return false

  const memberships = await Promise.all(groupIds.map((groupId) => db.doc(`newsGroups/${groupId}/members/${uid}`).get()))
  return memberships.some((membership) => {
    if (!membership.exists) return false
    const data = membership.data()
    return data?.status === 'active' && isWithinEntitlementWindow(data)
  })
}

async function canReadArticle(actor, article, policyResult, db) {
  const { policy, source, categoryId } = policyResult
  if (policy.mode === ACCESS_MODES.PUBLIC) return true
  if (!actor || !hasPermission(actor, 'news.read')) return false

  if (policy.mode === ACCESS_MODES.VIP) {
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
  invokeNews,
}
