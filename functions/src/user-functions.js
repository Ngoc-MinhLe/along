const { onCall } = require('firebase-functions/v2/https')
const service = require('./user-service')

exports.updateUserProfile = onCall((request) => service.invokeTrusted(request, service.updateUserProfile, 'updateUserProfile'))
