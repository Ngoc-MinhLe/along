const { onCall } = require('firebase-functions/v2/https')
const service = require('./news-service')
const mutationService = require('./news-mutation-service')

function trustedNewsReadCallable(handler) {
  return onCall((request) => service.invokeNews(request, handler))
}

function trustedNewsMutationCallable(handler) {
  return onCall((request) => mutationService.invokeNewsMutation(request, handler))
}

const listNews = trustedNewsReadCallable(service.listNews)
const getNewsArticle = trustedNewsReadCallable(service.getNewsArticle)
const createNewsArticle = trustedNewsMutationCallable(mutationService.createNewsArticle)
const updateNewsArticle = trustedNewsMutationCallable(mutationService.updateNewsArticle)
const publishNewsArticle = trustedNewsMutationCallable(mutationService.publishNewsArticle)
const unpublishNewsArticle = trustedNewsMutationCallable(mutationService.unpublishNewsArticle)
const setNewsAccessPolicy = trustedNewsMutationCallable(mutationService.setNewsAccessPolicy)
const createNewsCategory = trustedNewsMutationCallable(mutationService.createNewsCategory)
const updateNewsCategory = trustedNewsMutationCallable(mutationService.updateNewsCategory)
const deleteNewsCategory = trustedNewsMutationCallable(mutationService.deleteNewsCategory)
const setNewsAclEntry = trustedNewsMutationCallable(mutationService.setNewsAclEntry)
const removeNewsAclEntry = trustedNewsMutationCallable(mutationService.removeNewsAclEntry)

module.exports = {
  listNews,
  getNewsArticle,
  createNewsArticle,
  updateNewsArticle,
  publishNewsArticle,
  unpublishNewsArticle,
  setNewsAccessPolicy,
  createNewsCategory,
  updateNewsCategory,
  deleteNewsCategory,
  setNewsAclEntry,
  removeNewsAclEntry,
}
