const { HttpsError } = require('firebase-functions/v2/https')
const { Timestamp } = require('firebase-admin/firestore')
const { adminDb } = require('./admin')
const {
  getTrustedActor,
  hasSystemRole,
  requirePermission,
} = require('./authorization')
const { ACCESS_MODES, normalizeAccessPolicy } = require('./news-service')

const ARTICLE_STATUSES = new Set(['draft', 'published'])
const CATEGORY_STATUSES = new Set(['active', 'disabled'])
const ACL_SCOPES = new Set(['ARTICLE', 'CATEGORY'])
const PRINCIPAL_TYPES = new Set(['USER', 'GROUP'])
const MAX_TITLE_LENGTH = 240
const MAX_EXCERPT_LENGTH = 1000
const MAX_CONTENT_LENGTH = 500000
const MAX_DESCRIPTION_LENGTH = 1000
const MAX_SLUG_LENGTH = 160
const MAX_ID_LENGTH = 128

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message)
}

function notFound(message) {
  throw new HttpsError('not-found', message)
}

function failedPrecondition(message) {
  throw new HttpsError('failed-precondition', message)
}

function alreadyExists(message) {
  throw new HttpsError('already-exists', message)
}

function assertObject(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    invalidArgument('Request payload must be an object.')
  }
}

function assertAllowedKeys(data, allowed, required = []) {
  assertObject(data)
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(data).find((key) => !allowedSet.has(key))
  if (unknown) invalidArgument(`Unsupported request field: ${unknown}.`)
  const missing = required.find((key) => data[key] === undefined)
  if (missing) invalidArgument(`Missing request field: ${missing}.`)
}

function normalizeText(value, field, { required = false, max = 1000 } = {}) {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || !value.trim()) {
    invalidArgument(`${field} must be a non-empty string.`)
  }
  const normalized = value.trim()
  if (normalized.length > max) invalidArgument(`${field} is too long.`)
  return normalized
}

function normalizeContent(value) {
  if (typeof value !== 'string') invalidArgument('content must be a string.')
  if (value.length > MAX_CONTENT_LENGTH) invalidArgument('content is too long.')
  return value
}

function makeSlug(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
}

function normalizeSlug(value, fallback) {
  const source = value === undefined ? fallback : value
  if (typeof source !== 'string' || !source.trim()) invalidArgument('slug must be a non-empty string.')
  const slug = makeSlug(source)
  if (!slug) invalidArgument('slug must contain at least one Latin letter or number.')
  return slug
}

function normalizeReferenceId(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_ID_LENGTH || value.includes('/')) {
    invalidArgument(`${field} must be a valid document identifier.`)
  }
  return value.trim()
}

function normalizeCategoryId(value) {
  if (value === null) return null
  if (value === undefined) return undefined
  return normalizeReferenceId(value, 'categoryId')
}

function normalizeManagedAccessPolicy(policy, { allowInherit = true } = {}) {
  assertObject(policy)
  assertAllowedKeys(policy, ['mode', 'minVipLevel', 'inheritCategory'], ['mode'])
  if (policy.mode === 'INHERIT') {
    if (!allowInherit || policy.inheritCategory !== true) {
      invalidArgument('INHERIT access policy is not allowed here.')
    }
    return { mode: 'INHERIT', inheritCategory: true }
  }
  const normalized = normalizeAccessPolicy(policy)
  if (!normalized) invalidArgument('accessPolicy is invalid.')
  return normalized
}

function normalizeDirectAccessPolicy(policy) {
  const normalized = normalizeManagedAccessPolicy(policy, { allowInherit: false })
  if (normalized.mode === 'INHERIT') invalidArgument('Category access policy cannot inherit another policy.')
  return normalized
}

function normalizeArticleCreatePayload(data) {
  assertAllowedKeys(data, [
    'title', 'slug', 'excerpt', 'content', 'contentFormat', 'categoryId', 'accessPolicy',
  ], ['title', 'content', 'accessPolicy'])
  const title = normalizeText(data.title, 'title', { required: true, max: MAX_TITLE_LENGTH })
  const content = normalizeContent(data.content)
  const contentFormat = data.contentFormat === undefined
    ? 'PLAIN_TEXT'
    : normalizeText(data.contentFormat, 'contentFormat', { max: 32 }).toUpperCase()
  const categoryId = normalizeCategoryId(data.categoryId) || null
  return {
    title,
    slug: normalizeSlug(data.slug, title),
    excerpt: data.excerpt === undefined
      ? ''
      : normalizeText(data.excerpt, 'excerpt', { max: MAX_EXCERPT_LENGTH }),
    content,
    contentFormat,
    categoryId,
    accessPolicy: normalizeManagedAccessPolicy(data.accessPolicy),
  }
}

function normalizeArticleUpdatePayload(data) {
  assertAllowedKeys(data, [
    'articleId', 'title', 'slug', 'excerpt', 'content', 'contentFormat', 'categoryId',
  ], ['articleId'])
  const articleId = normalizeReferenceId(data.articleId, 'articleId')
  const fields = {}
  if (data.title !== undefined) fields.title = normalizeText(data.title, 'title', { max: MAX_TITLE_LENGTH })
  if (data.slug !== undefined) fields.slug = normalizeSlug(data.slug, data.slug)
  if (data.excerpt !== undefined) fields.excerpt = normalizeText(data.excerpt, 'excerpt', { max: MAX_EXCERPT_LENGTH })
  if (data.content !== undefined) fields.content = normalizeContent(data.content)
  if (data.contentFormat !== undefined) {
    fields.contentFormat = normalizeText(data.contentFormat, 'contentFormat', { max: 32 }).toUpperCase()
  }
  if (data.categoryId !== undefined) fields.categoryId = normalizeCategoryId(data.categoryId)
  if (!Object.keys(fields).length) invalidArgument('At least one article field must be provided for update.')
  return { articleId, fields }
}

function normalizeCategoryCreatePayload(data) {
  assertAllowedKeys(data, [
    'name', 'slug', 'description', 'defaultAccessPolicy',
  ], ['name', 'defaultAccessPolicy'])
  const name = normalizeText(data.name, 'name', { required: true, max: MAX_TITLE_LENGTH })
  return {
    name,
    slug: normalizeSlug(data.slug, name),
    description: data.description === undefined
      ? ''
      : normalizeText(data.description, 'description', { max: MAX_DESCRIPTION_LENGTH }),
    defaultAccessPolicy: normalizeDirectAccessPolicy(data.defaultAccessPolicy),
  }
}

function normalizeCategoryUpdatePayload(data) {
  assertAllowedKeys(data, [
    'categoryId', 'name', 'slug', 'description', 'defaultAccessPolicy', 'status',
  ], ['categoryId'])
  const categoryId = normalizeReferenceId(data.categoryId, 'categoryId')
  const fields = {}
  if (data.name !== undefined) fields.name = normalizeText(data.name, 'name', { max: MAX_TITLE_LENGTH })
  if (data.slug !== undefined) fields.slug = normalizeSlug(data.slug, data.slug)
  if (data.description !== undefined) fields.description = normalizeText(data.description, 'description', { max: MAX_DESCRIPTION_LENGTH })
  if (data.defaultAccessPolicy !== undefined) fields.defaultAccessPolicy = normalizeDirectAccessPolicy(data.defaultAccessPolicy)
  if (data.status !== undefined) {
    if (typeof data.status !== 'string' || !CATEGORY_STATUSES.has(data.status)) invalidArgument('Category status is invalid.')
    fields.status = data.status
  }
  if (!Object.keys(fields).length) invalidArgument('At least one category field must be provided for update.')
  return { categoryId, fields }
}

function normalizeAclPayload(data) {
  assertAllowedKeys(data, ['scope', 'resourceId', 'principalType', 'principalId'], [
    'scope', 'resourceId', 'principalType', 'principalId',
  ])
  if (!ACL_SCOPES.has(data.scope)) invalidArgument('ACL scope is invalid.')
  if (!PRINCIPAL_TYPES.has(data.principalType)) invalidArgument('ACL principalType is invalid.')
  return {
    scope: data.scope,
    resourceId: normalizeReferenceId(data.resourceId, 'resourceId'),
    principalType: data.principalType,
    principalId: normalizeReferenceId(data.principalId, 'principalId'),
  }
}

function aclId(principalType, principalId) {
  return `${principalType}_${Buffer.from(principalId, 'utf8').toString('base64url')}`
}

function articleRef(db, articleId) {
  return db.doc(`newsArticles/${articleId}`)
}

function categoryRef(db, categoryId) {
  return db.doc(`newsCategories/${categoryId}`)
}

function aclRef(db, payload) {
  const collection = payload.scope === 'ARTICLE'
    ? `newsArticles/${payload.resourceId}/acl`
    : `newsCategories/${payload.resourceId}/acl`
  return db.doc(`${collection}/${aclId(payload.principalType, payload.principalId)}`)
}

function categoryData(snapshot, categoryId) {
  if (!snapshot.exists) notFound(`News category ${categoryId} was not found.`)
  const data = snapshot.data()
  if (!data || data.id !== categoryId || !CATEGORY_STATUSES.has(data.status)) {
    failedPrecondition('The News category is invalid.')
  }
  if (!data.defaultAccessPolicy || !normalizeAccessPolicy(data.defaultAccessPolicy)) {
    failedPrecondition('The News category access policy is invalid.')
  }
  return { id: categoryId, ...data }
}

function articleData(snapshot, articleId) {
  if (!snapshot.exists) notFound(`News article ${articleId} was not found.`)
  const data = snapshot.data()
  if (!data || data.id !== articleId || !ARTICLE_STATUSES.has(data.status)) {
    failedPrecondition('The News article is invalid.')
  }
  normalizeManagedAccessPolicy(data.accessPolicy)
  return { id: articleId, ...data }
}

async function activeCategory(categoryId, db, transaction = null) {
  if (!categoryId) return null
  const snapshot = transaction
    ? await transaction.get(categoryRef(db, categoryId))
    : await categoryRef(db, categoryId).get()
  const category = categoryData(snapshot, categoryId)
  if (category.status !== 'active') failedPrecondition('The News category is not active.')
  return category
}

function validateArticleCategory(article, category) {
  if (article.categoryId && !category) failedPrecondition('The News article category is invalid.')
  if (article.accessPolicy.mode === 'INHERIT') {
    if (!category) failedPrecondition('An inherited access policy requires a category.')
    normalizeDirectAccessPolicy(category.defaultAccessPolicy)
  }
}

async function readArticle(articleId, db, transaction = null) {
  const snapshot = transaction
    ? await transaction.get(articleRef(db, articleId))
    : await articleRef(db, articleId).get()
  return articleData(snapshot, articleId)
}

async function readCategory(categoryId, db, transaction = null) {
  const snapshot = transaction
    ? await transaction.get(categoryRef(db, categoryId))
    : await categoryRef(db, categoryId).get()
  return categoryData(snapshot, categoryId)
}

async function createNewsArticle(actor, data, db = adminDb) {
  requirePermission(actor, 'news.create')
  const payload = normalizeArticleCreatePayload(data)
  const ref = db.collection('newsArticles').doc()
  await db.runTransaction(async (transaction) => {
    const category = payload.categoryId ? await activeCategory(payload.categoryId, db, transaction) : null
    if (payload.accessPolicy.mode === 'INHERIT') validateArticleCategory({ ...payload }, category)
    const now = Timestamp.now()
    transaction.create(ref, {
      id: ref.id,
      title: payload.title,
      slug: payload.slug,
      excerpt: payload.excerpt,
      content: payload.content,
      contentFormat: payload.contentFormat,
      categoryId: payload.categoryId,
      accessPolicy: payload.accessPolicy,
      status: 'draft',
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    })
  })
  return { ok: true, operation: 'createNewsArticle', articleId: ref.id, status: 'draft' }
}

async function updateNewsArticle(actor, data, db = adminDb) {
  requirePermission(actor, 'news.update')
  const payload = normalizeArticleUpdatePayload(data)
  const ref = articleRef(db, payload.articleId)
  await db.runTransaction(async (transaction) => {
    const current = await readArticle(payload.articleId, db, transaction)
    const currentCategoryId = current.categoryId || null
    const nextCategoryId = Object.prototype.hasOwnProperty.call(payload.fields, 'categoryId')
      ? payload.fields.categoryId
      : currentCategoryId
    const category = nextCategoryId ? await activeCategory(nextCategoryId, db, transaction) : null
    validateArticleCategory({ ...current, ...payload.fields, categoryId: nextCategoryId }, category)
    transaction.update(ref, { ...payload.fields, updatedAt: Timestamp.now() })
  })
  return { ok: true, operation: 'updateNewsArticle', articleId: payload.articleId }
}

async function setNewsArticlePublished(actor, data, published, db = adminDb) {
  requirePermission(actor, 'news.publish')
  assertAllowedKeys(data, ['articleId'], ['articleId'])
  const articleId = normalizeReferenceId(data.articleId, 'articleId')
  await db.runTransaction(async (transaction) => {
    const current = await readArticle(articleId, db, transaction)
    const category = current.categoryId ? await activeCategory(current.categoryId, db, transaction) : null
    validateArticleCategory(current, category)
    const next = published
      ? { status: 'published', publishedAt: Timestamp.now(), updatedAt: Timestamp.now() }
      : { status: 'draft', publishedAt: null, updatedAt: Timestamp.now() }
    transaction.update(articleRef(db, articleId), next)
  })
  return {
    ok: true,
    operation: published ? 'publishNewsArticle' : 'unpublishNewsArticle',
    articleId,
    status: published ? 'published' : 'draft',
  }
}

async function setNewsAccessPolicy(actor, data, db = adminDb) {
  requirePermission(actor, 'news.update')
  assertAllowedKeys(data, ['articleId', 'accessPolicy'], ['articleId', 'accessPolicy'])
  const articleId = normalizeReferenceId(data.articleId, 'articleId')
  const accessPolicy = normalizeManagedAccessPolicy(data.accessPolicy)
  await db.runTransaction(async (transaction) => {
    const current = await readArticle(articleId, db, transaction)
    const category = current.categoryId ? await activeCategory(current.categoryId, db, transaction) : null
    validateArticleCategory({ ...current, accessPolicy }, category)
    transaction.update(articleRef(db, articleId), { accessPolicy, updatedAt: Timestamp.now() })
  })
  return { ok: true, operation: 'setNewsAccessPolicy', articleId, accessPolicy }
}

async function createNewsCategory(actor, data, db = adminDb) {
  requirePermission(actor, 'news.create')
  const payload = normalizeCategoryCreatePayload(data)
  const ref = db.collection('newsCategories').doc()
  const now = Timestamp.now()
  await ref.create({
    id: ref.id,
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
    status: 'active',
    defaultAccessPolicy: payload.defaultAccessPolicy,
    createdBy: actor.uid,
    createdAt: now,
    updatedAt: now,
  })
  return { ok: true, operation: 'createNewsCategory', categoryId: ref.id }
}

async function updateNewsCategory(actor, data, db = adminDb) {
  requirePermission(actor, 'news.update')
  const payload = normalizeCategoryUpdatePayload(data)
  await db.runTransaction(async (transaction) => {
    const current = await readCategory(payload.categoryId, db, transaction)
    const next = { ...current, ...payload.fields }
    if (next.status === 'active') normalizeDirectAccessPolicy(next.defaultAccessPolicy)
    transaction.update(categoryRef(db, payload.categoryId), { ...payload.fields, updatedAt: Timestamp.now() })
  })
  return { ok: true, operation: 'updateNewsCategory', categoryId: payload.categoryId }
}

async function deleteNewsCategory(actor, data, db = adminDb) {
  requirePermission(actor, 'news.delete')
  assertAllowedKeys(data, ['categoryId'], ['categoryId'])
  const categoryId = normalizeReferenceId(data.categoryId, 'categoryId')
  await db.runTransaction(async (transaction) => {
    await readCategory(categoryId, db, transaction)
    const articles = await transaction.get(db.collection('newsArticles').where('categoryId', '==', categoryId).limit(1))
    if (!articles.empty) failedPrecondition('Cannot delete a category that is still used by an article.')
    const aclEntries = await transaction.get(db.collection(`newsCategories/${categoryId}/acl`).limit(1))
    if (!aclEntries.empty) failedPrecondition('Cannot delete a category that still has ACL entries.')
    transaction.delete(categoryRef(db, categoryId))
  })
  return { ok: true, operation: 'deleteNewsCategory', categoryId }
}

async function readAclResource(transaction, payload, db, { requireSpecial = true } = {}) {
  if (payload.scope === 'ARTICLE') {
    const article = await readArticle(payload.resourceId, db, transaction)
    const category = article.categoryId ? await readCategory(article.categoryId, db, transaction) : null
    validateArticleCategory(article, category)
    if (requireSpecial && category?.status !== 'active') {
      failedPrecondition('The News article category is not active.')
    }
    if (requireSpecial && article.accessPolicy.mode !== ACCESS_MODES.SPECIAL) {
      failedPrecondition('Article ACL can only be managed for a SPECIAL article policy.')
    }
    return { resource: article, ref: articleRef(db, payload.resourceId) }
  }
  const category = await readCategory(payload.resourceId, db, transaction)
  if (requireSpecial && category.status !== 'active') failedPrecondition('The News category is not active.')
  if (requireSpecial && category.defaultAccessPolicy.mode !== ACCESS_MODES.SPECIAL) {
    failedPrecondition('Category ACL can only be managed for a SPECIAL category policy.')
  }
  return { resource: category, ref: categoryRef(db, payload.resourceId) }
}

async function validatePrincipal(transaction, payload, actor, db) {
  if (payload.principalType === 'USER') {
    if (payload.principalId === actor.uid && !hasSystemRole(actor, 'ROOT_ADMIN')) {
      throw new HttpsError('permission-denied', 'A non-root actor cannot add themselves to a News ACL.')
    }
    const snapshot = await transaction.get(db.doc(`users/${payload.principalId}`))
    if (!snapshot.exists || snapshot.data()?.uid !== payload.principalId || snapshot.data()?.status !== 'active') {
      notFound('The ACL user principal was not found or is inactive.')
    }
    return
  }
  const snapshot = await transaction.get(db.doc(`newsGroups/${payload.principalId}`))
  if (!snapshot.exists || snapshot.data()?.status !== 'active') {
    notFound('The ACL group principal was not found or is inactive.')
  }
}

async function setNewsAclEntry(actor, data, db = adminDb) {
  requirePermission(actor, 'news.update')
  const payload = normalizeAclPayload(data)
  await db.runTransaction(async (transaction) => {
    await readAclResource(transaction, payload, db)
    await validatePrincipal(transaction, payload, actor, db)
    const now = Timestamp.now()
    transaction.set(aclRef(db, payload), {
      principalType: payload.principalType,
      principalId: payload.principalId,
      effect: 'ALLOW',
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    }, { merge: true })
  })
  return {
    ok: true,
    operation: 'setNewsAclEntry',
    scope: payload.scope,
    resourceId: payload.resourceId,
    aclId: aclId(payload.principalType, payload.principalId),
  }
}

async function removeNewsAclEntry(actor, data, db = adminDb) {
  requirePermission(actor, 'news.update')
  const payload = normalizeAclPayload(data)
  await db.runTransaction(async (transaction) => {
    await readAclResource(transaction, payload, db, { requireSpecial: false })
    const ref = aclRef(db, payload)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) notFound('The News ACL entry was not found.')
    transaction.delete(ref)
  })
  return {
    ok: true,
    operation: 'removeNewsAclEntry',
    scope: payload.scope,
    resourceId: payload.resourceId,
    aclId: aclId(payload.principalType, payload.principalId),
  }
}

async function invokeNewsMutation(request, handler) {
  const actor = await getTrustedActor(request)
  try {
    return await handler(actor, request?.data || {})
  } catch (error) {
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'Trusted News mutation failed.')
  }
}

module.exports = {
  normalizeManagedAccessPolicy,
  normalizeArticleCreatePayload,
  normalizeArticleUpdatePayload,
  normalizeCategoryCreatePayload,
  normalizeCategoryUpdatePayload,
  normalizeAclPayload,
  createNewsArticle,
  updateNewsArticle,
  publishNewsArticle: (actor, data, db) => setNewsArticlePublished(actor, data, true, db),
  unpublishNewsArticle: (actor, data, db) => setNewsArticlePublished(actor, data, false, db),
  setNewsAccessPolicy,
  createNewsCategory,
  updateNewsCategory,
  deleteNewsCategory,
  setNewsAclEntry,
  removeNewsAclEntry,
  invokeNewsMutation,
}
