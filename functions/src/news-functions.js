const { onCall } = require('firebase-functions/v2/https')
const service = require('./news-service')
const mutationService = require('./news-mutation-service')

function trustedNewsReadCallable(handler) {
  return onCall((request) => service.invokeNews(request, handler))
}

function trustedNewsMutationCallable(handler, operation) {
  return onCall((request) => mutationService.invokeNewsMutation(request, handler, operation))
}

const listNews = trustedNewsReadCallable(service.listNews)
const getNewsArticle = trustedNewsReadCallable(service.getNewsArticle)
const listNewsManagement = trustedNewsReadCallable(service.listNewsManagement)
const getNewsManagementArticle = trustedNewsReadCallable(service.getNewsManagementArticle)
const listNewsCategories = trustedNewsReadCallable(service.listNewsCategories)
const listNewsUsers = trustedNewsReadCallable(service.listNewsUsers)
const listNewsGroups = trustedNewsReadCallable(service.listNewsGroups)
const createNewsArticle = trustedNewsMutationCallable(mutationService.createNewsArticle, 'createNewsArticle')
const updateNewsArticle = trustedNewsMutationCallable(mutationService.updateNewsArticle, 'updateNewsArticle')
const publishNewsArticle = trustedNewsMutationCallable(mutationService.publishNewsArticle, 'publishNewsArticle')
const unpublishNewsArticle = trustedNewsMutationCallable(mutationService.unpublishNewsArticle, 'unpublishNewsArticle')
const setNewsAccessPolicy = trustedNewsMutationCallable(mutationService.setNewsAccessPolicy, 'setNewsAccessPolicy')
const createNewsCategory = trustedNewsMutationCallable(mutationService.createNewsCategory, 'createNewsCategory')
const updateNewsCategory = trustedNewsMutationCallable(mutationService.updateNewsCategory, 'updateNewsCategory')
const deleteNewsCategory = trustedNewsMutationCallable(mutationService.deleteNewsCategory, 'deleteNewsCategory')
const setNewsAclEntry = trustedNewsMutationCallable(mutationService.setNewsAclEntry, 'setNewsAclEntry')
const removeNewsAclEntry = trustedNewsMutationCallable(mutationService.removeNewsAclEntry, 'removeNewsAclEntry')

module.exports = {
  listNews,
  getNewsArticle,
  listNewsManagement,
  getNewsManagementArticle,
  listNewsCategories,
  listNewsUsers,
  listNewsGroups,
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
