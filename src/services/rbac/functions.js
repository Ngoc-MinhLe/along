import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/client'

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions chưa được cấu hình.')
  return functions
}

function normalizeCallableError(error) {
  const code = typeof error?.code === 'string'
    ? error.code.replace(/^functions\//, '')
    : 'internal'
  const message = error?.details?.message || error?.message || 'Trusted backend request thất bại.'
  const normalized = new Error(message)
  normalized.code = code
  normalized.details = error?.details
  return normalized
}

async function callFunction(name, payload) {
  try {
    const callable = httpsCallable(requireFunctions(), name)
    const response = await callable(payload)
    return response.data
  } catch (error) {
    throw normalizeCallableError(error)
  }
}

export function createCustomRole({ name, description = '', permissions }) {
  return callFunction('createCustomRole', { name, description, permissions })
}

export function updateCustomRole({ roleId, name, description = '', permissions }) {
  return callFunction('updateCustomRole', { roleId, name, description, permissions })
}

export function disableCustomRole(roleId) {
  return callFunction('disableCustomRole', { roleId })
}

export function enableCustomRole(roleId) {
  return callFunction('enableCustomRole', { roleId })
}

export function deleteCustomRole(roleId) {
  return callFunction('deleteCustomRole', { roleId })
}

export function assignCustomRole(targetUid, roleId) {
  return callFunction('assignCustomRole', { targetUid, customRoleId: roleId })
}

export function revokeCustomRole(targetUid, roleId) {
  return callFunction('revokeCustomRole', { targetUid, customRoleId: roleId })
}

export function setSystemRole(targetUid, targetSystemRole) {
  return callFunction('setSystemRole', { targetUid, targetSystemRole })
}

export function updateUserProfile(targetUid, fields) {
  const payload = { targetUid }
  for (const field of ['displayName', 'photoURL']) {
    if (Object.prototype.hasOwnProperty.call(fields || {}, field)) payload[field] = fields[field]
  }
  return callFunction('updateUserProfile', payload)
}
