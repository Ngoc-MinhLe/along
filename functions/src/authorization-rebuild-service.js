const { HttpsError } = require('firebase-functions/v2/https')
const { Timestamp } = require('firebase-admin/firestore')
const { adminDb } = require('./admin')
const { requireRootActor } = require('./auth')
const { SYSTEM_ROLES, SYSTEM_ROLE_SET, PERMISSION_SET } = require('./policy')
const {
  buildAuthorizationData,
  planAuthorization,
  validatedRoleEntry,
  readProfile,
  readUserAuthorization,
  invokeTrusted: invokeCustomRoleTrusted,
} = require('./custom-role-service')

const PROTECTED_SYSTEM_ROLES = Object.freeze([SYSTEM_ROLES.ROOT_ADMIN, SYSTEM_ROLES.SUPER_ADMIN])
const PROTECTED_SYSTEM_ROLE_SET = new Set(PROTECTED_SYSTEM_ROLES)

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message)
}

function failedPrecondition(message) {
  throw new HttpsError('failed-precondition', message)
}

function assertEmptyPayload(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    invalidArgument('Request payload must be an object.')
  }
  if (Object.keys(data).length) invalidArgument('This operation does not accept target or authorization data.')
}

function uniqueStrings(value) {
  return Array.isArray(value)
    && value.every((item) => typeof item === 'string' && item.length > 0)
    && new Set(value).size === value.length
}

function sameSet(left, right) {
  return uniqueStrings(left)
    && uniqueStrings(right)
    && left.length === right.length
    && left.every((value) => right.includes(value))
}

function isSameAuthorizationState(current, next) {
  return Boolean(current)
    && current.uid === next.uid
    && current.systemRole === next.systemRole
    && sameSet(current.customRoles, next.customRoles)
    && sameSet(current.permissions, next.permissions)
}

function validateCurrentAuthorization(current, profile) {
  if (current === null) return
  if (!current || current.uid !== profile.uid || !SYSTEM_ROLE_SET.has(current.systemRole)) {
    failedPrecondition(`Authorization for ${profile.uid} is invalid or inconsistent.`)
  }
  if (current.systemRole !== profile.systemRole || !sameSet(current.customRoles, profile.customRoles)) {
    failedPrecondition(`Authorization for ${profile.uid} is inconsistent with the user profile.`)
  }
  if (!uniqueStrings(current.permissions)
    || current.permissions.some((permission) => !PERMISSION_SET.has(permission))
    || !Number.isSafeInteger(current.version)
    || current.version < 1) {
    failedPrecondition(`Authorization for ${profile.uid} is invalid.`)
  }
}

function assertAdditiveAuthorizationChange(current, next) {
  if (current && current.permissions.some((permission) => !next.permissions.includes(permission))) {
    failedPrecondition('Authorization rebuild would remove an existing permission.')
  }
}

async function commitAuthorizationPlan(plan, db = adminDb) {
  let updated = false
  await db.runTransaction(async (transaction) => {
    const profileRef = db.doc(`users/${plan.profile.uid}`)
    const authorizationRef = db.doc(`userAuthorizations/${plan.profile.uid}`)
    const [profileSnapshot, authorizationSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(authorizationRef),
    ])
    if (!profileSnapshot.exists) failedPrecondition(`Protected user ${plan.profile.uid} no longer exists.`)
    const data = profileSnapshot.data()
    const customRoles = data?.customRoles
    if (data?.uid !== plan.profile.uid
      || data.status !== 'active'
      || data.systemRole !== plan.profile.systemRole
      || !sameSet(customRoles, plan.profile.customRoles)) {
      failedPrecondition(`Protected user ${plan.profile.uid} changed during authorization rebuild.`)
    }
    const profile = { ...data, uid: plan.profile.uid, customRoles: [...customRoles] }
    const currentAuthorization = authorizationSnapshot.exists ? authorizationSnapshot.data() : null
    validateCurrentAuthorization(currentAuthorization, profile)
    const roleSnapshots = await Promise.all(profile.customRoles.map((roleId) => (
      transaction.get(db.doc(`roles/${roleId}`))
    )))
    const roleMap = Object.fromEntries(roleSnapshots.map(validatedRoleEntry).filter(Boolean))
    const nextAuthorization = buildAuthorizationData(profile, roleMap, currentAuthorization)
    assertAdditiveAuthorizationChange(currentAuthorization, nextAuthorization)
    if (isSameAuthorizationState(currentAuthorization, nextAuthorization)) return
    transaction.set(authorizationRef, {
      ...nextAuthorization,
      updatedAt: Timestamp.now(),
    })
    updated = true
  })
  return updated
}

async function listProtectedProfiles(db = adminDb) {
  const snapshot = await db.collection('users').where('systemRole', 'in', PROTECTED_SYSTEM_ROLES).get()
  const profiles = []
  for (const userSnapshot of snapshot.docs) {
    const data = userSnapshot.data()
    if (data?.status !== 'active') continue
    if (!PROTECTED_SYSTEM_ROLE_SET.has(data?.systemRole)) {
      failedPrecondition(`Protected user ${userSnapshot.id} has an invalid System Role.`)
    }
    const profile = await readProfile(userSnapshot.id, db)
    if (!PROTECTED_SYSTEM_ROLE_SET.has(profile.systemRole)) {
      failedPrecondition(`Protected user ${userSnapshot.id} has an invalid System Role.`)
    }
    profiles.push(profile)
  }
  return profiles
}

async function rebuildProtectedSystemRoleAuthorizations(actor, data, db = adminDb) {
  assertEmptyPayload(data)
  await requireRootActor(actor, { db })

  const profiles = await listProtectedProfiles(db)
  if (!profiles.some((profile) => profile.uid === actor.uid && profile.systemRole === SYSTEM_ROLES.ROOT_ADMIN)) {
    failedPrecondition('The protected ROOT_ADMIN profile was not found in the rebuild scope.')
  }

  const plans = []
  for (const profile of profiles) {
    const currentAuthorization = await readUserAuthorization(profile.uid, db)
    validateCurrentAuthorization(currentAuthorization, profile)
    const nextAuthorization = await planAuthorization(profile, currentAuthorization, {}, db)
    assertAdditiveAuthorizationChange(currentAuthorization, nextAuthorization)
    plans.push({ profile, currentAuthorization, nextAuthorization })
  }

  let updatedUserCount = 0
  for (const plan of plans) {
    if (await commitAuthorizationPlan(plan, db)) updatedUserCount += 1
  }

  return {
    ok: true,
    operation: 'rebuildProtectedSystemRoleAuthorizations',
    affectedUserCount: plans.length,
    updatedUserCount,
    unchangedUserCount: plans.length - updatedUserCount,
  }
}

async function invokeTrusted(request, handler) {
  return invokeCustomRoleTrusted(request, handler, 'rebuildProtectedSystemRoleAuthorizations')
}

module.exports = {
  rebuildProtectedSystemRoleAuthorizations,
  invokeTrusted,
  PROTECTED_SYSTEM_ROLES,
}
