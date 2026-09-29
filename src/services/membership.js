import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/client'

function callMembershipFunction(name, payload = {}) {
  if (!functions) throw new Error('Firebase Functions chưa được cấu hình.')
  return httpsCallable(functions, name)(payload).then((response) => response.data)
}

export function listMembershipTiers() {
  return callMembershipFunction('listMembershipTiers', {})
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
