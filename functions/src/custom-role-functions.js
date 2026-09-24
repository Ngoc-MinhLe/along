const { onCall } = require('firebase-functions/v2/https')
const service = require('./custom-role-service')

function trustedCallable(handler, operation) {
  return onCall((request) => service.invokeTrusted(request, handler, operation))
}

const createCustomRole = trustedCallable(service.createCustomRole, 'createCustomRole')
const updateCustomRole = trustedCallable(service.updateCustomRole, 'updateCustomRole')
const disableCustomRole = trustedCallable(service.disableCustomRole, 'disableCustomRole')
const enableCustomRole = trustedCallable(service.enableCustomRole, 'enableCustomRole')
const deleteCustomRole = trustedCallable(service.deleteCustomRole, 'deleteCustomRole')
const assignCustomRole = trustedCallable(service.assignCustomRole, 'assignCustomRole')
const revokeCustomRole = trustedCallable(service.revokeCustomRole, 'revokeCustomRole')

module.exports = {
  createCustomRole,
  updateCustomRole,
  disableCustomRole,
  enableCustomRole,
  deleteCustomRole,
  assignCustomRole,
  revokeCustomRole,
}
