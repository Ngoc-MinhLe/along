const { HttpsError } = require('firebase-functions/v2/https')
const { adminDb } = require('./admin')

function assertNoClientActorUid(data) {
  if (data && Object.prototype.hasOwnProperty.call(data, 'actorUid')) {
    throw new HttpsError('invalid-argument', 'actorUid is derived from Firebase Authentication and cannot be supplied by the client.')
  }
}

function requireAuthenticatedRequest(request) {
  assertNoClientActorUid(request?.data)
  const uid = request?.auth?.uid
  const token = request?.auth?.token
  if (typeof uid !== 'string' || !uid || !token || typeof token !== 'object') {
    throw new HttpsError('unauthenticated', 'Authentication is required.')
  }
  return {
    uid,
    token,
  }
}

async function readActorAuthorization(uid) {
  if (typeof uid !== 'string' || !uid) return null
  const snapshot = await adminDb.doc(`userAuthorizations/${uid}`).get()
  if (!snapshot.exists) return null
  const data = snapshot.data()
  if (data?.uid !== uid || !Array.isArray(data.permissions)) return null
  return {
    uid,
    systemRole: typeof data.systemRole === 'string' ? data.systemRole : null,
    customRoles: Array.isArray(data.customRoles) ? data.customRoles : [],
    permissions: data.permissions,
    version: Number.isSafeInteger(data.version) ? data.version : null,
  }
}

async function getTrustedActor(request) {
  const actor = requireAuthenticatedRequest(request)
  const authorization = await readActorAuthorization(actor.uid)
  return { ...actor, authorization }
}

function hasPermission(actor, permission) {
  return Boolean(
    actor?.authorization
      && Array.isArray(actor.authorization.permissions)
      && typeof permission === 'string'
      && actor.authorization.permissions.includes(permission),
  )
}

module.exports = {
  assertNoClientActorUid,
  requireAuthenticatedRequest,
  readActorAuthorization,
  getTrustedActor,
  hasPermission,
}
