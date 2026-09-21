import { ROLE_HIERARCHY, SYSTEM_ROLES } from '../../src/services/rbac/roles.js'

export const ASSIGNABLE_SYSTEM_ROLES = Object.freeze([
  SYSTEM_ROLES.USER,
  SYSTEM_ROLES.EDITOR,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.SUPER_ADMIN,
])

export function claimsSystemRole(claims = {}) {
  return claims.systemRole || SYSTEM_ROLES.USER
}

export function validateRootAuthorization({ rootUid, actorUid, actorClaims, rootProfile, rootAuthClaims, rootCount }) {
  if (!rootUid) throw new Error('Authorization failed: systemConfig/root.rootUid is missing.')
  if (!actorUid || actorUid !== rootUid) throw new Error('Authorization failed: operator is not the current ROOT.')
  if (actorClaims?.systemRole !== SYSTEM_ROLES.ROOT_ADMIN) throw new Error('Authorization failed: operator token has no ROOT_ADMIN claim.')
  if (rootProfile?.uid !== rootUid || rootProfile?.systemRole !== SYSTEM_ROLES.ROOT_ADMIN) throw new Error('Authorization failed: ROOT profile is inconsistent.')
  if (rootAuthClaims?.systemRole !== SYSTEM_ROLES.ROOT_ADMIN) throw new Error('Authorization failed: trusted ROOT claim is inconsistent.')
  if (rootCount !== 1) throw new Error(`Authorization failed: expected exactly one ROOT profile, found ${rootCount}.`)
  return true
}

export function buildSystemRolePlan({ rootUid, targetUid, targetProfile, targetClaims = {}, requestedRole }) {
  if (!ASSIGNABLE_SYSTEM_ROLES.includes(requestedRole)) throw new Error(`Invalid system role: ${requestedRole || '(empty)'}.`)
  if (!targetProfile) throw new Error('Target not found: users/{uid} does not exist.')
  if (!targetUid || targetProfile.uid !== targetUid) throw new Error('Target profile UID is invalid or inconsistent.')
  if (targetUid === rootUid || targetProfile.systemRole === SYSTEM_ROLES.ROOT_ADMIN || targetClaims.systemRole === SYSTEM_ROLES.ROOT_ADMIN) {
    throw new Error('Target is ROOT. ROOT cannot be modified.')
  }
  if (targetProfile.status !== 'active') throw new Error(`Target status is invalid for role mutation: ${targetProfile.status || '(empty)'}.`)
  if (!ROLE_HIERARCHY.includes(targetProfile.systemRole)) throw new Error(`Target Firestore role is invalid: ${targetProfile.systemRole || '(empty)'}.`)

  const currentClaimsRole = claimsSystemRole(targetClaims)
  if (!ROLE_HIERARCHY.includes(currentClaimsRole)) throw new Error(`Target Custom Claim role is invalid: ${currentClaimsRole}.`)

  const claimsNeedUpdate = currentClaimsRole !== requestedRole
  const profileNeedsUpdate = targetProfile.systemRole !== requestedRole
  const currentVersion = Number.isSafeInteger(targetClaims.roleVersion) && targetClaims.roleVersion >= 0
    ? targetClaims.roleVersion
    : 0
  const nextClaims = claimsNeedUpdate
    ? { ...targetClaims, systemRole: requestedRole, roleVersion: currentVersion + 1 }
    : { ...targetClaims }

  return {
    targetUid,
    requestedRole,
    currentProfileRole: targetProfile.systemRole,
    currentClaimsRole,
    oldClaims: { ...targetClaims },
    nextClaims,
    currentRoleVersion: currentVersion,
    nextRoleVersion: claimsNeedUpdate ? currentVersion + 1 : currentVersion,
    claimsNeedUpdate,
    profileNeedsUpdate,
    noChange: !claimsNeedUpdate && !profileNeedsUpdate,
  }
}

async function rollbackOrThrow(plan, adapters, { claimsApplied, profileApplied }, cause) {
  const rollbackErrors = []
  if (profileApplied) {
    try {
      await adapters.updateProfile(plan.currentProfileRole)
    } catch (error) {
      rollbackErrors.push(`Firestore rollback failed: ${error.message}`)
    }
  }
  if (claimsApplied) {
    try {
      await adapters.setClaims(plan.oldClaims)
    } catch (error) {
      rollbackErrors.push(`Claims rollback failed: ${error.message}`)
    }
  }
  if (rollbackErrors.length) {
    throw new Error(`CRITICAL INCONSISTENCY: Custom Claims and Firestore profile may be inconsistent. ${rollbackErrors.join(' ')}`)
  }
  throw cause
}

export async function executeSystemRolePlan(plan, adapters, { dryRun = false } = {}) {
  if (plan.noChange) return { status: 'no-change' }
  if (dryRun) return { status: 'dry-run' }

  let claimsApplied = false
  let profileApplied = false

  if (plan.claimsNeedUpdate) {
    try {
      await adapters.setClaims(plan.nextClaims)
      claimsApplied = true
    } catch (error) {
      throw new Error(`Claims update failed: ${error.message}`)
    }
  }

  if (plan.profileNeedsUpdate) {
    try {
      await adapters.updateProfile(plan.requestedRole)
      profileApplied = true
    } catch (error) {
      return rollbackOrThrow(plan, adapters, { claimsApplied, profileApplied }, new Error(`Firestore update failed: ${error.message}. Custom Claims were rolled back.`))
    }
  }

  let verified
  try {
    verified = await adapters.readState()
  } catch (error) {
    return rollbackOrThrow(plan, adapters, { claimsApplied, profileApplied }, new Error(`Verification failed: ${error.message}`))
  }

  if (verified.profileRole !== plan.requestedRole || claimsSystemRole(verified.claims) !== plan.requestedRole) {
    return rollbackOrThrow(plan, adapters, { claimsApplied, profileApplied }, new Error('Verification failed: Custom Claims and Firestore do not match the requested role.'))
  }

  return { status: 'changed', roleVersion: plan.nextRoleVersion }
}
