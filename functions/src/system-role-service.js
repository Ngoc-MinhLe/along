const { HttpsError } = require('firebase-functions/v2/https')
const { adminAuth, adminDb } = require('./admin')
const {
  getTrustedActor,
  requireRootActor,
  SYSTEM_ROLES,
  readActorAuthorization,
} = require('./auth')
const {
  planAuthorization,
  readProfile,
  readUserAuthorization,
} = require('./custom-role-service')

const ASSIGNABLE_SYSTEM_ROLES = Object.freeze([
  SYSTEM_ROLES.USER,
  SYSTEM_ROLES.EDITOR,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.SUPER_ADMIN,
])

const SYSTEM_ROLE_SET = new Set(Object.values(SYSTEM_ROLES))

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message)
}

function notFound(message) {
  throw new HttpsError('not-found', message)
}

function failedPrecondition(message) {
  throw new HttpsError('failed-precondition', message)
}

function permissionDenied(message) {
  throw new HttpsError('permission-denied', message)
}

function assertPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    invalidArgument('Request payload must be an object.')
  }
  const keys = Object.keys(data)
  const unsupported = keys.find((key) => !['targetUid', 'targetSystemRole'].includes(key))
  if (unsupported) invalidArgument('Unsupported request field: ' + unsupported + '.')
  if (typeof data.targetUid !== 'string' || !data.targetUid.trim()) {
    invalidArgument('targetUid is required.')
  }
  if (!ASSIGNABLE_SYSTEM_ROLES.includes(data.targetSystemRole)) {
    invalidArgument('targetSystemRole must be an assignable non-ROOT system role.')
  }
  return {
    targetUid: data.targetUid.trim(),
    targetSystemRole: data.targetSystemRole,
  }
}

function claimsRole(claims = {}) {
  return claims.systemRole || SYSTEM_ROLES.USER
}

function assertTargetSourcesConsistent(profile, claims) {
  if (claims.systemRole !== undefined && !SYSTEM_ROLE_SET.has(claims.systemRole)) {
    failedPrecondition('The target user has an invalid System Role claim.')
  }
  if (claimsRole(claims) !== profile.systemRole) {
    failedPrecondition('The target user Custom Claims and profile are inconsistent.')
  }
  if (claims.systemRole === undefined && profile.systemRole !== SYSTEM_ROLES.USER) {
    failedPrecondition('The elevated target user is missing a System Role claim.')
  }
}

async function readTargetAuth(targetUid, auth = adminAuth) {
  try {
    const target = await auth.getUser(targetUid)
    if (target.disabled) failedPrecondition('The target user is disabled in Firebase Authentication.')
    return target
  } catch (error) {
    if (error instanceof HttpsError) throw error
    if (error.code === 'auth/user-not-found') notFound('The target Firebase Authentication user was not found.')
    throw new HttpsError('internal', 'The target Firebase Authentication user could not be read.')
  }
}

async function assertTargetIsNotRoot(targetUid, profile, targetAuth, db = adminDb) {
  const rootLock = await db.doc('systemConfig/root').get()
  if (rootLock.exists && rootLock.data()?.rootUid === targetUid) {
    permissionDenied('The protected ROOT_ADMIN account cannot be changed.')
  }
  if (profile.systemRole === SYSTEM_ROLES.ROOT_ADMIN
    || targetAuth.customClaims?.systemRole === SYSTEM_ROLES.ROOT_ADMIN) {
    permissionDenied('ROOT_ADMIN accounts cannot be changed.')
  }
}

async function readCurrentAuthorization(targetUid, profile, db = adminDb) {
  const current = await readUserAuthorization(targetUid, db)
  if (!current) return null
  const validated = await readActorAuthorization(targetUid, db)
  if (!validated
    || validated.systemRole !== profile.systemRole
    || validated.customRoles.length !== profile.customRoles.length
    || validated.customRoles.some((roleId) => !profile.customRoles.includes(roleId))) {
    failedPrecondition('The target user authorization is missing or inconsistent.')
  }
  return current
}

async function verifyMutation(targetUid, targetSystemRole, expectedAuthorization, db = adminDb, auth = adminAuth) {
  const [profileSnapshot, authorizationSnapshot, targetAuth] = await Promise.all([
    db.doc('users/' + targetUid).get(),
    db.doc('userAuthorizations/' + targetUid).get(),
    auth.getUser(targetUid),
  ])
  const profile = profileSnapshot.exists ? profileSnapshot.data() : null
  const authorization = authorizationSnapshot.exists ? authorizationSnapshot.data() : null
  const verifiedRole = claimsRole(targetAuth.customClaims || {})
  if (!profile
    || profile.uid !== targetUid
    || profile.systemRole !== targetSystemRole
    || verifiedRole !== targetSystemRole
    || !authorization
    || authorization.uid !== targetUid
    || authorization.systemRole !== targetSystemRole
    || authorization.version !== expectedAuthorization.version) {
    failedPrecondition('System Role mutation consistency verification failed.')
  }
  return { profile, authorization, targetAuth }
}

async function restoreFirestore(targetUid, previousProfileRole, previousAuthorization, db = adminDb) {
  const batch = db.batch()
  batch.set(db.doc('users/' + targetUid), { systemRole: previousProfileRole }, { merge: true })
  const authorizationRef = db.doc('userAuthorizations/' + targetUid)
  if (previousAuthorization) batch.set(authorizationRef, previousAuthorization)
  else batch.delete(authorizationRef)
  await batch.commit()
}

async function setSystemRole(actor, data, db = adminDb, auth = adminAuth) {
  const payload = assertPayload(data)
  await requireRootActor(actor, { db })

  const [targetAuth, targetProfile] = await Promise.all([
    readTargetAuth(payload.targetUid, auth),
    readProfile(payload.targetUid, db),
  ])
  assertTargetSourcesConsistent(targetProfile, targetAuth.customClaims || {})
  await assertTargetIsNotRoot(payload.targetUid, targetProfile, targetAuth, db)

  const currentAuthorization = await readCurrentAuthorization(payload.targetUid, targetProfile, db)
  const previousProfileRole = targetProfile.systemRole
  const currentClaims = targetAuth.customClaims || {}
  const currentRoleVersion = Number.isSafeInteger(currentClaims.roleVersion) && currentClaims.roleVersion >= 0
    ? currentClaims.roleVersion
    : 0
  const claimsNeedUpdate = currentClaims.systemRole !== payload.targetSystemRole
  const nextClaims = claimsNeedUpdate
    ? { ...currentClaims, systemRole: payload.targetSystemRole, roleVersion: currentRoleVersion + 1 }
    : currentClaims
  const nextAuthorization = await planAuthorization(
    { ...targetProfile, systemRole: payload.targetSystemRole },
    currentAuthorization,
    {},
    db,
  )

  let claimsApplied = false
  let firestoreApplied = false
  try {
    if (claimsNeedUpdate) {
      await auth.setCustomUserClaims(payload.targetUid, nextClaims)
      claimsApplied = true
    }

    await db.runTransaction(async (transaction) => {
      const [profileSnapshot, authorizationSnapshot] = await Promise.all([
        transaction.get(db.doc('users/' + payload.targetUid)),
        transaction.get(db.doc('userAuthorizations/' + payload.targetUid)),
      ])
      if (!profileSnapshot.exists) notFound('The target user profile was not found.')
      const freshProfile = profileSnapshot.data()
      if (freshProfile.systemRole !== previousProfileRole
        || JSON.stringify(freshProfile.customRoles || []) !== JSON.stringify(targetProfile.customRoles || [])) {
        failedPrecondition('The target user changed while the mutation was in progress.')
      }
      if (currentAuthorization && !authorizationSnapshot.exists) {
        failedPrecondition('The target authorization changed while the mutation was in progress.')
      }
      transaction.set(
        db.doc('users/' + payload.targetUid),
        { systemRole: payload.targetSystemRole },
        { merge: true },
      )
      transaction.set(db.doc('userAuthorizations/' + payload.targetUid), nextAuthorization)
    })
    firestoreApplied = true

    await verifyMutation(payload.targetUid, payload.targetSystemRole, nextAuthorization, db, auth)
  } catch (error) {
    const rollbackErrors = []
    if (firestoreApplied) {
      try {
        await restoreFirestore(payload.targetUid, previousProfileRole, currentAuthorization, db)
      } catch (rollbackError) {
        rollbackErrors.push('Firestore rollback failed: ' + rollbackError.message)
      }
    }
    if (claimsApplied) {
      try {
        await auth.setCustomUserClaims(payload.targetUid, currentClaims)
      } catch (rollbackError) {
        rollbackErrors.push('Custom Claims rollback failed: ' + rollbackError.message)
      }
    }
    if (rollbackErrors.length) {
      throw new HttpsError('internal', 'CRITICAL INCONSISTENCY: ' + rollbackErrors.join(' '))
    }
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'System Role mutation failed; all changes were rolled back.')
  }

  return {
    ok: true,
    operation: 'setSystemRole',
    targetUid: payload.targetUid,
    previousSystemRole: previousProfileRole,
    systemRole: payload.targetSystemRole,
    authorizationVersion: nextAuthorization.version,
  }
}

async function invokeTrusted(request, handler) {
  const actor = await getTrustedActor(request)
  try {
    return await handler(actor, request?.data || {})
  } catch (error) {
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'Trusted System Role mutation failed.')
  }
}

module.exports = {
  ASSIGNABLE_SYSTEM_ROLES,
  setSystemRole,
  invokeTrusted,
}
