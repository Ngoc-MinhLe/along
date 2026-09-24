const { HttpsError } = require('firebase-functions/v2/https')
const { Timestamp } = require('firebase-admin/firestore')
const { adminAuth, adminDb } = require('./admin')
const { getTrustedActor, requirePermission, SYSTEM_ROLES } = require('./auth')
const { readProfile } = require('./custom-role-service')
const { invokeAudited } = require('./audit')

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message)
}

function failedPrecondition(message) {
  throw new HttpsError('failed-precondition', message)
}

function notFound(message) {
  throw new HttpsError('not-found', message)
}

function permissionDenied(message) {
  throw new HttpsError('permission-denied', message)
}

function normalizePayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalidArgument('Request payload must be an object.')
  const unsupported = Object.keys(data).find((key) => !['targetUid', 'displayName', 'photoURL'].includes(key))
  if (unsupported) invalidArgument('Unsupported request field: ' + unsupported + '.')
  if (typeof data.targetUid !== 'string' || !data.targetUid.trim()) invalidArgument('targetUid is required.')
  const fields = {}
  for (const field of ['displayName', 'photoURL']) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue
    if (typeof data[field] !== 'string') invalidArgument(field + ' must be a string.')
    const value = data[field].trim()
    const maxLength = field === 'displayName' ? 200 : 2048
    if (value.length > maxLength) invalidArgument(field + ' is too long.')
    fields[field] = value
  }
  if (!Object.keys(fields).length) invalidArgument('At least one editable profile field is required.')
  return { targetUid: data.targetUid.trim(), fields }
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

function sameSecurityState(left, right) {
  return left.systemRole === right.systemRole
    && left.status === right.status
    && JSON.stringify(left.customRoles || []) === JSON.stringify(right.customRoles || [])
}

async function updateUserProfile(actor, data, db = adminDb, auth = adminAuth) {
  const payload = normalizePayload(data)
  requirePermission(actor, 'users.update')

  const [profile, targetAuth] = await Promise.all([
    readProfile(payload.targetUid, db),
    readTargetAuth(payload.targetUid, auth),
  ])
  const targetClaimRole = targetAuth.customClaims?.systemRole
  if ((targetClaimRole !== undefined && targetClaimRole !== profile.systemRole)
    || (targetClaimRole === undefined && profile.systemRole !== SYSTEM_ROLES.USER)) {
    failedPrecondition('The target user Custom Claims and profile are inconsistent.')
  }
  await assertTargetIsNotRoot(payload.targetUid, profile, targetAuth, db)

  const previousAuthProfile = Object.fromEntries(
    Object.keys(payload.fields).map((field) => [field, targetAuth[field] ?? null]),
  )
  const nextAuthProfile = Object.fromEntries(
    Object.entries(payload.fields).map(([field, value]) => [
      field,
      (field === 'displayName' || field === 'photoURL') && value === '' ? null : value,
    ]),
  )
  let authApplied = false
  let firestoreApplied = false

  try {
    await auth.updateUser(payload.targetUid, nextAuthProfile)
    authApplied = true

    await db.runTransaction(async (transaction) => {
      const targetRef = db.doc(`users/${payload.targetUid}`)
      const targetSnapshot = await transaction.get(targetRef)
      if (!targetSnapshot.exists) notFound('The target user profile was not found.')
      const freshProfile = targetSnapshot.data()
      if (!sameSecurityState(freshProfile, profile)) {
        failedPrecondition('The target user security state changed while the mutation was in progress.')
      }
      transaction.update(targetRef, { ...payload.fields, updatedAt: Timestamp.now() })
    })
    firestoreApplied = true

    const [verifiedProfileSnapshot, verifiedAuth] = await Promise.all([
      db.doc(`users/${payload.targetUid}`).get(),
      auth.getUser(payload.targetUid),
    ])
    const verifiedProfile = verifiedProfileSnapshot.exists ? verifiedProfileSnapshot.data() : null
    const profileMatches = verifiedProfile
      && Object.entries(payload.fields).every(([field, value]) => verifiedProfile[field] === value)
    const authMatches = Object.entries(nextAuthProfile).every(([field, value]) => verifiedAuth[field] === value)
    if (!profileMatches || !authMatches || verifiedAuth.disabled) {
      failedPrecondition('User profile consistency verification failed.')
    }
  } catch (error) {
    const rollbackErrors = []
    if (firestoreApplied) {
      try {
        await db.doc(`users/${payload.targetUid}`).set({ ...profile, uid: payload.targetUid }, { merge: false })
      } catch (rollbackError) {
        rollbackErrors.push('Firestore rollback failed: ' + rollbackError.message)
      }
    }
    if (authApplied) {
      try {
        await auth.updateUser(payload.targetUid, previousAuthProfile)
      } catch (rollbackError) {
        rollbackErrors.push('Firebase Authentication rollback failed: ' + rollbackError.message)
      }
    }
    if (rollbackErrors.length) throw new HttpsError('internal', 'CRITICAL INCONSISTENCY: ' + rollbackErrors.join(' '))
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'User profile mutation failed; all changes were rolled back.')
  }

  return {
    ok: true,
    operation: 'updateUserProfile',
    targetUid: payload.targetUid,
    updatedFields: Object.keys(payload.fields),
  }
}

async function invokeTrusted(request, handler, operation = 'updateUserProfile') {
  return invokeAudited(request, handler, operation)
}

module.exports = {
  normalizePayload,
  updateUserProfile,
  invokeTrusted,
}
