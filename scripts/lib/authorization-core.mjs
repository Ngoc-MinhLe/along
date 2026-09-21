import { getEffectivePermissions } from '../../src/services/rbac/policy.js'
import { isKnownPermission } from '../../src/services/rbac/permissions.js'
import { isSystemRole } from '../../src/services/rbac/roles.js'

function uniqueSortedStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))].sort()
}

function sameArray(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isCanonicalArray(values, expected) {
  return Array.isArray(values) && sameArray(values, expected)
}

export function buildAuthorizationPlan({ uid, profile, roleMap = {}, currentAuthorization = null }) {
  if (!uid || !profile || profile.uid !== uid) throw new Error('Authorization source user is missing or inconsistent.')
  if (!isSystemRole(profile.systemRole)) throw new Error(`Invalid System Role: ${profile.systemRole || '(empty)'}.`)

  const customRoles = uniqueSortedStrings(profile.customRoles)
  const permissions = uniqueSortedStrings(
    getEffectivePermissions({ systemRole: profile.systemRole, customRoles }, roleMap)
      .filter(isKnownPermission),
  )
  const hasValidCurrentVersion = Number.isSafeInteger(currentAuthorization?.version) && currentAuthorization.version >= 1
  const currentVersion = hasValidCurrentVersion
    ? currentAuthorization.version
    : 0
  const consistent = Boolean(
    currentAuthorization
    && hasValidCurrentVersion
    && currentAuthorization.uid === uid
    && currentAuthorization.systemRole === profile.systemRole
    && isCanonicalArray(currentAuthorization.customRoles, customRoles)
    && isCanonicalArray(currentAuthorization.permissions, permissions),
  )

  return {
    uid,
    systemRole: profile.systemRole,
    customRoles,
    permissions,
    currentVersion,
    version: consistent ? currentVersion : currentVersion + 1,
    needsWrite: !consistent,
  }
}

export function authorizationData(plan, updatedAt) {
  return {
    uid: plan.uid,
    systemRole: plan.systemRole,
    customRoles: plan.customRoles,
    permissions: plan.permissions,
    version: plan.version,
    updatedAt,
  }
}
