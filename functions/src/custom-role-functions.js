const { onCall } = require('firebase-functions/v2/https')
const service = require('./custom-role-service')

function trustedCallable(handler) {
  return onCall((request) => service.invokeTrusted(request, handler))
}

const createCustomRole = trustedCallable(service.createCustomRole)
const updateCustomRole = trustedCallable(service.updateCustomRole)
const disableCustomRole = trustedCallable(service.disableCustomRole)
const enableCustomRole = trustedCallable(service.enableCustomRole)
const deleteCustomRole = trustedCallable(service.deleteCustomRole)
const assignCustomRole = trustedCallable(service.assignCustomRole)
const revokeCustomRole = trustedCallable(service.revokeCustomRole)

module.exports = {
  createCustomRole,
  updateCustomRole,
  disableCustomRole,
  enableCustomRole,
  deleteCustomRole,
  assignCustomRole,
  revokeCustomRole,
}
