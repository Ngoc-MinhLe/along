const { HttpsError } = require('firebase-functions/v2/https')
const { adminAuth, adminDb } = require('./admin')

const SYSTEM_ROLES = Object.freeze({
  USER: 'USER',
  EDITOR: 'EDITOR',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  ROOT_ADMIN: 'ROOT_ADMIN',
})

const SYSTEM_ROLE_SET = new Set(Object.values(SYSTEM_ROLES))
const PERMISSIONS = Object.freeze([
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'roles.read',
  'roles.create',
  'roles.update',
  'roles.disable',
  'roles.delete',
  'roles.assign',
  'roles.revoke',
  'calendar.search',
  'calendar.export',
  'calendar.import',
  'news.read',
  'news.create',
  'news.update',
  'news.delete',
  'news.publish',
  'quiz.question.read',
  'quiz.question.create',
  'quiz.question.update',
  'quiz.question.delete',
  'quiz.exam.create',
  'quiz.exam.update',
  'quiz.exam.publish',
  'quiz.exam.delete',
  'approval.create',
  'approval.review',
  'audit.read',
])

const PERMISSION_SET = new Set(PERMISSIONS)

function failAuthorization(message) {
  throw new HttpsError('permission-denied', message)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSystemRole(value) {
  return typeof value === 'string' && SYSTEM_ROLE_SET.has(value)
}

function isKnownPermission(value) {
  return typeof value === 'string' && PERMISSION_SET.has(value)
}

function uniqueStringList(value) {
  return Array.isArray(value)
    && value.every((item) => typeof item === 'string' && item.length > 0)
    && new Set(value).size === value.length
}

function sameStringSet(left, right) {
  if (!uniqueStringList(left) || !uniqueStringList(right) || left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((item) => rightSet.has(item))
}

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

async function readActorAuthorization(uid, db = adminDb) {
  return readActorAuthorizationWithDb(uid, db)
}

async function readActorProfile(uid, db = adminDb) {
  let snapshot
  try {
    snapshot = await db.doc(`users/${uid}`).get()
  } catch {
    failAuthorization('The authenticated user profile could not be read.')
  }
  if (!snapshot.exists) failAuthorization('The authenticated user profile is missing.')
  const profile = snapshot.data()
  if (!isObject(profile)
    || profile.uid !== uid
    || profile.status !== 'active'
    || !isSystemRole(profile.systemRole)
    || (profile.customRoles !== undefined && !uniqueStringList(profile.customRoles))) {
    failAuthorization('The authenticated user profile is invalid or inactive.')
  }
  return {
    ...profile,
    uid,
    customRoles: profile.customRoles || [],
  }
}

async function readAuthoritativeClaims(uid, auth = adminAuth) {
  try {
    const userRecord = await auth.getUser(uid)
    const claims = isObject(userRecord.customClaims) ? userRecord.customClaims : {}
    if (claims.systemRole !== undefined && !isSystemRole(claims.systemRole)) {
      failAuthorization('The authenticated user has an invalid system role claim.')
    }
    return claims
  } catch (error) {
    if (error instanceof HttpsError) throw error
    failAuthorization('The authenticated user could not be verified by Firebase Authentication.')
  }
}

async function getTrustedActor(request, dependencies = {}) {
  const actor = requireAuthenticatedRequest(request)
  const db = dependencies.db || adminDb
  const auth = dependencies.auth || adminAuth
  const [profile, claims, authorization] = await Promise.all([
    readActorProfile(actor.uid, db),
    readAuthoritativeClaims(actor.uid, auth),
    readActorAuthorizationWithDb(actor.uid, db),
  ])

  if (!authorization) failAuthorization('The authenticated user authorization is missing or invalid.')
  if (authorization.systemRole !== profile.systemRole
    || !sameStringSet(authorization.customRoles, profile.customRoles)) {
    failAuthorization('The authenticated user authorization is inconsistent with the user profile.')
  }

  // Existing USER profiles may predate Custom Claims. They remain valid only
  // when every server-side source agrees on USER. Elevated roles must have a
  // matching authoritative claim before they can be trusted.
  if (claims.systemRole !== undefined && claims.systemRole !== profile.systemRole) {
    failAuthorization('The authenticated user Custom Claims are inconsistent with the user profile.')
  }
  if (claims.systemRole === undefined && profile.systemRole !== 'USER') {
    failAuthorization('The elevated user is missing a matching system role claim.')
  }

  return {
    ...actor,
    profile,
    claims,
    authorization,
  }
}

function hasPermission(actor, permission) {
  return Boolean(
    isKnownPermission(permission)
      && actor?.authorization
      && Array.isArray(actor.authorization.permissions)
      && actor.authorization.permissions.includes(permission),
  )
}

function requirePermission(actor, permission) {
  if (!isKnownPermission(permission)) {
    throw new HttpsError('invalid-argument', 'The requested permission is not in the server permission catalog.')
  }
  if (!hasPermission(actor, permission)) {
    throw new HttpsError('permission-denied', 'The actor does not have the required permission.')
  }
  return true
}

function hasSystemRole(actor, role) {
  return isSystemRole(role)
    && actor?.profile?.systemRole === role
    && actor?.authorization?.systemRole === role
    && (actor.claims?.systemRole === role || (role === 'USER' && actor.claims?.systemRole === undefined))
}

function requireSystemRole(actor, role) {
  if (!hasSystemRole(actor, role)) {
    throw new HttpsError('permission-denied', 'The actor does not have the required system role.')
  }
  return true
}

function canManageCustomRole(actor, role, action) {
  if (!role || role.type !== 'CUSTOM' || typeof action !== 'string') return false
  if (hasSystemRole(actor, 'ROOT_ADMIN')) return true
  return hasPermission(actor, `roles.${action}`)
    && Array.isArray(role.permissions)
    && role.permissions.every((permission) => hasPermission(actor, permission))
}

function requireCanManageCustomRole(actor, role, action) {
  if (!canManageCustomRole(actor, role, action)) {
    throw new HttpsError('permission-denied', `The actor cannot perform roles.${action} for this Custom Role.`)
  }
  return true
}

async function readActorAuthorizationWithDb(uid, db) {
  if (typeof uid !== 'string' || !uid) return null
  let snapshot
  try {
    snapshot = await db.doc(`userAuthorizations/${uid}`).get()
  } catch {
    return null
  }
  if (!snapshot.exists) return null
  const data = snapshot.data()
  if (!isObject(data)
    || data.uid !== uid
    || !isSystemRole(data.systemRole)
    || !uniqueStringList(data.customRoles)
    || !uniqueStringList(data.permissions)
    || !data.permissions.every(isKnownPermission)
    || !Number.isSafeInteger(data.version)
    || data.version < 1) return null
  return {
    uid,
    systemRole: data.systemRole,
    customRoles: data.customRoles,
    permissions: data.permissions,
    version: data.version,
  }
}

async function isRootActor(actor, dependencies = {}) {
  if (!hasSystemRole(actor, 'ROOT_ADMIN')) return false
  const db = dependencies.db || adminDb
  let lockSnapshot
  let rootsSnapshot
  try {
    [lockSnapshot, rootsSnapshot] = await Promise.all([
      db.doc('systemConfig/root').get(),
      db.collection('users').where('systemRole', '==', 'ROOT_ADMIN').limit(2).get(),
    ])
  } catch {
    return false
  }
  if (!lockSnapshot.exists || lockSnapshot.data()?.rootUid !== actor.uid) return false
  return rootsSnapshot.size === 1 && rootsSnapshot.docs[0].id === actor.uid
}

async function requireRootActor(actor, dependencies = {}) {
  if (!(await isRootActor(actor, dependencies))) {
    throw new HttpsError('permission-denied', 'Only the current protected ROOT_ADMIN may perform this operation.')
  }
  return true
}

module.exports = {
  assertNoClientActorUid,
  requireAuthenticatedRequest,
  readActorAuthorization,
  readActorProfile,
  readAuthoritativeClaims,
  getTrustedActor,
  hasPermission,
  requirePermission,
  hasSystemRole,
  requireSystemRole,
  canManageCustomRole,
  requireCanManageCustomRole,
  isRootActor,
  requireRootActor,
  SYSTEM_ROLES,
  PERMISSIONS,
}
