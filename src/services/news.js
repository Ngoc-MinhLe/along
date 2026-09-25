import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/client'

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions chưa được cấu hình.')
  return functions
}

function normalizeCallableError(error) {
  const code = typeof error?.code === 'string'
    ? error.code.replace(/^functions\//, '')
    : 'internal'
  const message = error?.details?.message || error?.message || 'Yêu cầu News thất bại.'
  const normalized = new Error(message)
  normalized.code = code
  normalized.details = error?.details
  return normalized
}

async function callNewsFunction(name, payload = {}) {
  try {
    const callable = httpsCallable(requireFunctions(), name)
    const response = await callable(payload)
    return response.data
  } catch (error) {
    throw normalizeCallableError(error)
  }
}

export function listNews({ categoryId = null, limit = 20 } = {}) {
  return callNewsFunction('listNews', { categoryId: categoryId || null, limit })
}

export function getNewsArticle(articleId) {
  return callNewsFunction('getNewsArticle', { articleId })
}

export function listNewsManagement({ query = '', limit = 20 } = {}) {
  return callNewsFunction('listNewsManagement', { query, limit })
}

export function getNewsManagementArticle(articleId) {
  return callNewsFunction('getNewsManagementArticle', { articleId })
}

export function listNewsCategories({ query = '', limit = 20, includeDisabled = false } = {}) {
  return callNewsFunction('listNewsCategories', { query, limit, includeDisabled })
}

export function listNewsUsers({ query = '', limit = 20 } = {}) {
  return callNewsFunction('listNewsUsers', { query, limit })
}

export function listNewsGroups({ query = '', limit = 20 } = {}) {
  return callNewsFunction('listNewsGroups', { query, limit })
}

export function createNewsArticle({ title, slug, excerpt, content, contentFormat, categoryId, accessPolicy }) {
  return callNewsFunction('createNewsArticle', {
    title, slug, excerpt, content, contentFormat, categoryId: categoryId || null, accessPolicy,
  })
}

export function updateNewsArticle({ articleId, title, slug, excerpt, content, contentFormat, categoryId }) {
  return callNewsFunction('updateNewsArticle', {
    articleId, title, slug, excerpt, content, contentFormat, categoryId,
  })
}

export function archiveNewsArticle(articleId) {
  return callNewsFunction('archiveNewsArticle', { articleId })
}

export function publishNewsArticle(articleId) {
  return callNewsFunction('publishNewsArticle', { articleId })
}

export function unpublishNewsArticle(articleId) {
  return callNewsFunction('unpublishNewsArticle', { articleId })
}

export function setNewsAccessPolicy(articleId, accessPolicy) {
  return callNewsFunction('setNewsAccessPolicy', { articleId, accessPolicy })
}

export function createNewsCategory({ name, slug, description, defaultAccessPolicy }) {
  const payload = { name, description, defaultAccessPolicy }
  if (typeof slug === 'string' && slug.trim()) payload.slug = slug.trim()
  return callNewsFunction('createNewsCategory', payload)
}

export function updateNewsCategory({ categoryId, name, slug, description, defaultAccessPolicy, status }) {
  return callNewsFunction('updateNewsCategory', {
    categoryId, name, slug, description, defaultAccessPolicy, status,
  })
}

export function deleteNewsCategory(categoryId) {
  return callNewsFunction('deleteNewsCategory', { categoryId })
}

export function setNewsAclEntry({ scope, resourceId, principalType, principalId }) {
  return callNewsFunction('setNewsAclEntry', { scope, resourceId, principalType, principalId })
}

export function removeNewsAclEntry({ scope, resourceId, principalType, principalId }) {
  return callNewsFunction('removeNewsAclEntry', { scope, resourceId, principalType, principalId })
}
