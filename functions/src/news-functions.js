const { onCall } = require('firebase-functions/v2/https')
const service = require('./news-service')

function trustedNewsCallable(handler) {
  return onCall((request) => service.invokeNews(request, handler))
}

const listNews = trustedNewsCallable(service.listNews)
const getNewsArticle = trustedNewsCallable(service.getNewsArticle)

module.exports = { listNews, getNewsArticle }
