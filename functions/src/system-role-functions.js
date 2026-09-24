const { onCall } = require('firebase-functions/v2/https')
const service = require('./system-role-service')

const setSystemRole = onCall((request) => service.invokeTrusted(request, service.setSystemRole))

module.exports = {
  setSystemRole,
}
