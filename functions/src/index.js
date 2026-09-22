const { authHealth } = require('./health')
const customRoleFunctions = require('./custom-role-functions')

exports.authHealth = authHealth
exports.createCustomRole = customRoleFunctions.createCustomRole
exports.updateCustomRole = customRoleFunctions.updateCustomRole
exports.disableCustomRole = customRoleFunctions.disableCustomRole
exports.enableCustomRole = customRoleFunctions.enableCustomRole
exports.deleteCustomRole = customRoleFunctions.deleteCustomRole
exports.assignCustomRole = customRoleFunctions.assignCustomRole
exports.revokeCustomRole = customRoleFunctions.revokeCustomRole
