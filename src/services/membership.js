import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/client'

function callMembershipFunction(name, payload = {}) {
  if (!functions) throw new Error('Firebase Functions chưa được cấu hình.')
  return httpsCallable(functions, name)(payload).then((response) => response.data)
}

export function listMembershipTiers({ includeInactive = false } = {}) {
  return callMembershipFunction('listMembershipTiers', { includeInactive })
}

export function listMemberships({ limit = 25 } = {}) {
  return callMembershipFunction('listMemberships', { limit })
}

export function getUserMemberships(userId, { limit = 25 } = {}) {
  return callMembershipFunction('getUserMemberships', { userId, limit })
}

export function createManualMembership({ userId, tierId, startsAt, expiresAt = null }) {
  return callMembershipFunction('createManualMembership', { userId, tierId, startsAt, expiresAt })
}

export function revokeMembership(membershipId) {
  return callMembershipFunction('revokeMembership', { membershipId })
}

export function createMembershipTier({ tierId, name, level, description = '' }) {
  return callMembershipFunction('createMembershipTier', { tierId, name, level, description })
}

export function updateMembershipTier({ tierId, name, level, description = '' }) {
  return callMembershipFunction('updateMembershipTier', { tierId, name, level, description })
}

export function deactivateMembershipTier(tierId) {
  return callMembershipFunction('deactivateMembershipTier', { tierId })
}
