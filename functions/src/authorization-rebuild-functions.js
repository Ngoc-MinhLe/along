const { onCall } = require('firebase-functions/v2/https')
const service = require('./authorization-rebuild-service')

const rebuildProtectedSystemRoleAuthorizations = onCall((request) => (
  service.invokeTrusted(request, service.rebuildProtectedSystemRoleAuthorizations)
))

module.exports = {
  rebuildProtectedSystemRoleAuthorizations,
}
