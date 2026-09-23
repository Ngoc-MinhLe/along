const { HttpsError } = require('firebase-functions/v2/https')
const { Timestamp } = require('firebase-admin/firestore')
const { adminAuth, adminDb } = require('./admin')
const {
  PERMISSIONS,
  SYSTEM_ROLES,
  getTrustedActor,
  hasSystemRole,
  requireCanManageCustomRole,
  requirePermission,
} = require('./authorization')
const { generateRoleId, roleIdCandidate } = require('./role-id')

const ROLE_ID_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/
const SYSTEM_ROLE_SET = new Set(Object.values(SYSTEM_ROLES))
const PERMISSION_SET = new Set(PERMISSIONS)
const FORBIDDEN_CUSTOM_PERMISSIONS = new Set([
  'users.delete',
  'roles.create',
  'roles.update',
  'roles.disable',
  'roles.delete',
  'roles.assign',
  'roles.revoke',
])

const ROLE_PERMISSIONS = Object.freeze({
  USER: ['calendar.search', 'calendar.export'],
  EDITOR: [
    'calendar.search', 'calendar.export',
    'news.read', 'news.create', 'news.update', 'news.delete', 'news.publish',
    'quiz.question.read', 'quiz.question.create', 'quiz.question.update', 'quiz.question.delete',
  ],
  ADMIN: [
    'calendar.search', 'calendar.export', 'calendar.import',
    'users.read', 'roles.read', 'roles.assign', 'roles.revoke',
    'news.read', 'news.create', 'news.update', 'news.delete', 'news.publish',
    'quiz.question.read', 'quiz.question.create', 'quiz.question.update', 'quiz.question.delete',
  ],
  SUPER_ADMIN: PERMISSIONS,
  ROOT_ADMIN: PERMISSIONS,
})

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message)
}

function notFound(message) {
  throw new HttpsError('not-found', message)
}

function failedPrecondition(message) {
  throw new HttpsError('failed-precondition', message)
}

function alreadyExists(message) {
  throw new HttpsError('already-exists', message)
}

function assertObject(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    invalidArgument('Request payload must be an object.')
  }
}

function assertAllowedKeys(data, allowed, required = []) {
  assertObject(data)
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(data).filter((key) => !allowedSet.has(key))
  if (unknown.length) invalidArgument(`Unsupported request field: ${unknown[0]}.`)
  const missing = required.find((key) => data[key] === undefined)
  if (missing) invalidArgument(`Missing request field: ${missing}.`)
}

function normalizeRoleId(roleId) {
  if (typeof roleId !== 'string' || !ROLE_ID_PATTERN.test(roleId)) {
    invalidArgument('roleId must be a valid immutable Custom Role ID.')
  }
  if (SYSTEM_ROLE_SET.has(roleId)) {
    invalidArgument('System Role IDs cannot be used as Custom Role IDs.')
  }
  return roleId
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) invalidArgument('permissions must be an array.')
  const unique = [...new Set(permissions)]
  const unknown = unique.filter((permission) => !PERMISSION_SET.has(permission))
  if (unknown.length) invalidArgument(`Unknown permission: ${unknown[0]}.`)
  const forbidden = unique.filter((permission) => FORBIDDEN_CUSTOM_PERMISSIONS.has(permission))
  if (forbidden.length) {
    throw new HttpsError('permission-denied', `Permission cannot be granted by a Custom Role: ${forbidden[0]}.`)
  }
  return unique.sort()
}

function normalizeName(name) {
  if (typeof name !== 'string' || !name.trim()) invalidArgument('Role name is required.')
  return name.trim()
}

function normalizeDescription(description) {
  if (description === undefined) return ''
  if (typeof description !== 'string') invalidArgument('Role description must be a string.')
  return description.trim()
}

function normalizeRolePayload(data, { includeRoleId = false } = {}) {
  assertAllowedKeys(
    data,
    includeRoleId ? ['roleId', 'name', 'description', 'permissions'] : ['name', 'description', 'permissions'],
    includeRoleId ? ['roleId', 'name', 'description', 'permissions'] : ['name', 'permissions'],
  )
  return {
    ...(includeRoleId ? { roleId: normalizeRoleId(data.roleId) } : {}),
    name: normalizeName(data.name),
    description: normalizeDescription(data.description),
    permissions: normalizePermissions(data.permissions),
  }
}

function normalizeRoleReferencePayload(data) {
  assertAllowedKeys(data, ['roleId'], ['roleId'])
  return { roleId: normalizeRoleId(data.roleId) }
}

function normalizeAssignmentPayload(data) {
  assertAllowedKeys(data, ['targetUid', 'customRoleId'], ['targetUid', 'customRoleId'])
  if (typeof data.targetUid !== 'string' || !data.targetUid.trim()) invalidArgument('targetUid is required.')
  return { targetUid: data.targetUid.trim(), roleId: normalizeRoleId(data.customRoleId) }
}

function validateCustomRoleData(roleId, role) {
  if (!role || role.type !== 'CUSTOM') failedPrecondition('System Roles cannot be mutated as Custom Roles.')
  if (role.id !== roleId || SYSTEM_ROLE_SET.has(role.id)) failedPrecondition('The role document is not a valid Custom Role.')
  if (!['active', 'disabled'].includes(role.status)) failedPrecondition('The Custom Role status is invalid.')
  if (!Array.isArray(role.permissions)) failedPrecondition('The Custom Role permissions are invalid.')
  const invalidPermissions = [...new Set(role.permissions)].filter((permission) => !PERMISSION_SET.has(permission))
  if (invalidPermissions.length) failedPrecondition('The Custom Role contains an unknown permission.')
  const forbiddenPermissions = [...new Set(role.permissions)].filter((permission) => FORBIDDEN_CUSTOM_PERMISSIONS.has(permission))
  if (forbiddenPermissions.length) failedPrecondition('The Custom Role contains a policy-protected permission.')
  return role
}

function roleFromSnapshot(roleId, snapshot) {
  if (!snapshot.exists) notFound(`Custom Role ${roleId} was not found.`)
  return validateCustomRoleData(roleId, { id: snapshot.id, ...snapshot.data() })
}

function validatedRoleEntry(snapshot) {
  if (!snapshot.exists) return null
  try {
    const role = roleFromSnapshot(snapshot.id, snapshot)
    return [snapshot.id, role]
  } catch {
    return null
  }
}

async function readRole(roleId, db = adminDb) {
  const normalizedId = normalizeRoleId(roleId)
  let snapshot
  try {
    snapshot = await db.doc(`roles/${normalizedId}`).get()
  } catch {
    throw new HttpsError('internal', 'The Custom Role could not be read.')
  }
  return roleFromSnapshot(normalizedId, snapshot)
}

async function readProfile(uid, db = adminDb) {
  let snapshot
  try {
    snapshot = await db.doc(`users/${uid}`).get()
  } catch {
    throw new HttpsError('internal', 'The target user profile could not be read.')
  }
  if (!snapshot.exists) notFound('The target user profile was not found.')
  const profile = snapshot.data()
  if (!profile || profile.uid !== uid) failedPrecondition('The target user profile is inconsistent.')
  if (profile.status !== 'active') failedPrecondition('The target user is not active.')
  if (!SYSTEM_ROLE_SET.has(profile.systemRole)) failedPrecondition('The target user has an invalid System Role.')
  const customRoles = profile.customRoles || []
  if (!Array.isArray(customRoles) || customRoles.some((roleId) => typeof roleId !== 'string')) {
    failedPrecondition('The target user customRoles field is invalid.')
  }
  return { ...profile, uid, customRoles: [...new Set(customRoles)] }
}

async function readUserAuthorization(uid, db = adminDb) {
  const snapshot = await db.doc(`userAuthorizations/${uid}`).get()
  return snapshot.exists ? snapshot.data() : null
}

async function readRoleMap(roleIds, db = adminDb) {
  const uniqueRoleIds = [...new Set(roleIds)]
  const snapshots = await Promise.all(uniqueRoleIds.map((roleId) => db.doc(`roles/${roleId}`).get()))
  return Object.fromEntries(snapshots.map(validatedRoleEntry).filter(Boolean))
}

function buildAuthorizationData(profile, roleMap, currentAuthorization) {
  if (!SYSTEM_ROLE_SET.has(profile.systemRole)) failedPrecondition('Cannot materialize an invalid System Role.')
  const permissions = new Set(ROLE_PERMISSIONS[profile.systemRole] || [])
  for (const roleId of profile.customRoles) {
    const role = roleMap[roleId]
    try {
      validateCustomRoleData(roleId, role)
    } catch {
      continue
    }
    if (role.status !== 'active') continue
    for (const permission of role.permissions || []) {
      if (PERMISSION_SET.has(permission) && !FORBIDDEN_CUSTOM_PERMISSIONS.has(permission)) permissions.add(permission)
    }
  }
  const currentVersion = Number.isSafeInteger(currentAuthorization?.version) && currentAuthorization.version >= 1
    ? currentAuthorization.version
    : 0
  return {
    uid: profile.uid,
    systemRole: profile.systemRole,
    customRoles: [...new Set(profile.customRoles)].sort(),
    permissions: [...permissions].sort(),
    version: currentVersion + 1,
    updatedAt: Timestamp.now(),
  }
}

async function planAuthorization(profile, currentAuthorization, roleOverrides = {}, db = adminDb) {
  const roleMap = await readRoleMap(profile.customRoles, db)
  return buildAuthorizationData(profile, { ...roleMap, ...roleOverrides }, currentAuthorization)
}

async function getAffectedUsers(roleId, db = adminDb) {
  const snapshot = await db.collection('users').where('customRoles', 'array-contains', roleId).get()
  return snapshot.docs.map((userSnapshot) => ({
    snapshot: userSnapshot,
    profile: { uid: userSnapshot.id, ...userSnapshot.data(), customRoles: userSnapshot.data().customRoles || [] },
  }))
}

async function commitRoleAndAuthorizations(roleId, originalRole, nextRole, affectedUsers, db = adminDb) {
  const plans = []
  for (const affected of affectedUsers) {
    const currentAuthorization = await readUserAuthorization(affected.profile.uid, db)
    const plan = await planAuthorization(
      affected.profile,
      currentAuthorization,
      { [roleId]: nextRole },
      db,
    )
    plans.push({
      uid: affected.profile.uid,
      authorizationRef: db.doc(`userAuthorizations/${affected.profile.uid}`),
      previousAuthorization: currentAuthorization,
      nextAuthorization: plan,
    })
  }

  const committed = []
  try {
    const chunkSize = 200
    for (let offset = 0; offset < plans.length || offset === 0; offset += chunkSize) {
      const batch = db.batch()
      if (offset === 0) batch.set(db.doc(`roles/${roleId}`), nextRole)
      const chunk = plans.slice(offset, offset + chunkSize)
      chunk.forEach((plan) => batch.set(plan.authorizationRef, plan.nextAuthorization))
      await batch.commit()
      committed.push(...chunk)
      if (!plans.length) break
    }
  } catch (error) {
    try {
      const rollbackItems = [...committed]
      const rollbackChunkSize = 200
      for (let offset = 0; offset < rollbackItems.length || offset === 0; offset += rollbackChunkSize) {
        const batch = db.batch()
        if (offset === 0) batch.set(db.doc(`roles/${roleId}`), originalRole)
        const chunk = rollbackItems.slice(offset, offset + rollbackChunkSize)
        chunk.forEach((item) => {
          if (item.previousAuthorization) batch.set(item.authorizationRef, item.previousAuthorization)
          else batch.delete(item.authorizationRef)
        })
        await batch.commit()
        if (!rollbackItems.length) break
      }
    } catch {
      throw new HttpsError('internal', 'Custom Role mutation failed and rollback also failed. Manual authorization repair is required.')
    }
    throw new HttpsError('aborted', 'Custom Role mutation failed; all committed changes were rolled back.')
  }

  return { affectedUserCount: plans.length }
}

async function createCustomRole(actor, data, db = adminDb) {
  const payload = normalizeRolePayload(data)
  requirePermission(actor, 'roles.create')
  const baseId = generateRoleId(payload.name)
  if (SYSTEM_ROLE_SET.has(baseId)) invalidArgument('System Role IDs cannot be used as Custom Role IDs.')
  const candidateRole = { id: baseId, type: 'CUSTOM', status: 'active', permissions: payload.permissions }
  requireCanManageCustomRole(actor, candidateRole, 'create')

  let roleId
  await db.runTransaction(async (transaction) => {
    for (let index = 1; index <= 1000; index += 1) {
      const candidateId = roleIdCandidate(baseId, index)
      if (SYSTEM_ROLE_SET.has(candidateId)) invalidArgument('System Role IDs cannot be used as Custom Role IDs.')
      const roleRef = db.doc(`roles/${candidateId}`)
      const snapshot = await transaction.get(roleRef)
      if (!snapshot.exists) {
        const now = Timestamp.now()
        transaction.set(roleRef, {
          id: candidateId,
          name: payload.name,
          description: payload.description,
          type: 'CUSTOM',
          status: 'active',
          permissions: payload.permissions,
          createdBy: actor.uid,
          createdAt: now,
          updatedAt: now,
        })
        roleId = candidateId
        return
      }
    }
    throw new HttpsError('resource-exhausted', 'Unable to generate a unique Custom Role ID.')
  })
  return { ok: true, operation: 'createCustomRole', roleId }
}

async function updateCustomRole(actor, data, db = adminDb) {
  const payload = normalizeRolePayload(data, { includeRoleId: true })
  requirePermission(actor, 'roles.update')
  const current = await readRole(payload.roleId, db)
  const nextRole = {
    ...current,
    name: payload.name,
    description: payload.description,
    permissions: payload.permissions,
    updatedAt: Timestamp.now(),
  }
  requireCanManageCustomRole(actor, nextRole, 'update')
  const affectedUsers = await getAffectedUsers(payload.roleId, db)
  const result = await commitRoleAndAuthorizations(payload.roleId, current, nextRole, affectedUsers, db)
  return { ok: true, operation: 'updateCustomRole', roleId: payload.roleId, ...result }
}

async function setCustomRoleStatus(actor, data, status, operation, db = adminDb) {
  const payload = normalizeRoleReferencePayload(data)
  requirePermission(actor, 'roles.disable')
  const current = await readRole(payload.roleId, db)
  requireCanManageCustomRole(actor, current, 'disable')
  const nextRole = { ...current, status, updatedAt: Timestamp.now() }
  const affectedUsers = await getAffectedUsers(payload.roleId, db)
  const result = await commitRoleAndAuthorizations(payload.roleId, current, nextRole, affectedUsers, db)
  return { ok: true, operation, roleId: payload.roleId, ...result }
}

async function deleteCustomRole(actor, data, db = adminDb) {
  const payload = normalizeRoleReferencePayload(data)
  requirePermission(actor, 'roles.delete')
  const current = await readRole(payload.roleId, db)
  requireCanManageCustomRole(actor, current, 'delete')
  await db.runTransaction(async (transaction) => {
    const roleRef = db.doc(`roles/${payload.roleId}`)
    const roleSnapshot = await transaction.get(roleRef)
    const freshRole = roleFromSnapshot(payload.roleId, roleSnapshot)
    requireCanManageCustomRole(actor, freshRole, 'delete')
    const assigned = await transaction.get(
      db.collection('users').where('customRoles', 'array-contains', payload.roleId).limit(1),
    )
    if (!assigned.empty) failedPrecondition('Cannot delete a Custom Role that is still assigned to a user.')
    transaction.delete(roleRef)
  })
  return { ok: true, operation: 'deleteCustomRole', roleId: payload.roleId }
}

async function readTargetAuth(targetUid) {
  try {
    return await adminAuth.getUser(targetUid)
  } catch {
    notFound('The target Firebase Authentication user was not found.')
  }
}

function assertTargetNotRoot(targetUid, targetProfile, targetAuth) {
  if (targetProfile.systemRole === SYSTEM_ROLES.ROOT_ADMIN
    || targetAuth.customClaims?.systemRole === SYSTEM_ROLES.ROOT_ADMIN) {
    throw new HttpsError('permission-denied', 'ROOT_ADMIN profiles are protected from Custom Role mutation.')
  }
  if (!targetUid || targetProfile.uid !== targetUid) failedPrecondition('The target user profile is inconsistent.')
}

async function mutateAssignment(actor, data, operation, db = adminDb) {
  const payload = normalizeAssignmentPayload(data)
  const action = operation === 'assignCustomRole' ? 'assign' : 'revoke'
  requirePermission(actor, `roles.${action}`)
  const role = await readRole(payload.roleId, db)
  if (operation === 'assignCustomRole' && role.status !== 'active') {
    failedPrecondition('Disabled Custom Roles cannot be assigned.')
  }
  requireCanManageCustomRole(actor, role, action)
  const targetAuth = await readTargetAuth(payload.targetUid)
  const initialTargetProfile = await readProfile(payload.targetUid, db)
  assertTargetNotRoot(payload.targetUid, initialTargetProfile, targetAuth)

  const result = await db.runTransaction(async (transaction) => {
    const targetRef = db.doc(`users/${payload.targetUid}`)
    const authorizationRef = db.doc(`userAuthorizations/${payload.targetUid}`)
    const roleRef = db.doc(`roles/${payload.roleId}`)
    const targetSnapshot = await transaction.get(targetRef)
    const authorizationSnapshot = await transaction.get(authorizationRef)
    const roleSnapshot = await transaction.get(roleRef)
    if (!targetSnapshot.exists) notFound('The target user profile was not found.')
    const profile = targetSnapshot.data()
    const freshRole = roleFromSnapshot(payload.roleId, roleSnapshot)
    if (operation === 'assignCustomRole' && freshRole.status !== 'active') {
      failedPrecondition('Disabled Custom Roles cannot be assigned.')
    }
    requireCanManageCustomRole(actor, freshRole, action)
    if (profile.systemRole === SYSTEM_ROLES.ROOT_ADMIN) {
      throw new HttpsError('permission-denied', 'ROOT_ADMIN profiles are protected from Custom Role mutation.')
    }
    const currentRoles = Array.isArray(profile.customRoles) ? [...new Set(profile.customRoles)] : []
    if (operation === 'assignCustomRole' && currentRoles.includes(payload.roleId)) {
      alreadyExists('The Custom Role is already assigned to this user.')
    }
    if (operation === 'revokeCustomRole' && !currentRoles.includes(payload.roleId)) {
      failedPrecondition('The Custom Role is not assigned to this user.')
    }
    const nextRoles = operation === 'assignCustomRole'
      ? [...currentRoles, payload.roleId]
      : currentRoles.filter((roleId) => roleId !== payload.roleId)
    const roleIds = [...new Set(nextRoles)]
    const roleSnapshots = await Promise.all(roleIds.map((roleId) => transaction.get(db.doc(`roles/${roleId}`))))
    const roleMap = Object.fromEntries(roleSnapshots.map(validatedRoleEntry).filter(Boolean))
    if (operation === 'assignCustomRole') roleMap[payload.roleId] = freshRole
    const currentAuthorization = authorizationSnapshot.exists ? authorizationSnapshot.data() : null
    const authorization = buildAuthorizationData(
      { uid: payload.targetUid, ...profile, customRoles: roleIds },
      roleMap,
      currentAuthorization,
    )
    const now = Timestamp.now()
    transaction.set(targetRef, { customRoles: roleIds, updatedAt: now }, { merge: true })
    transaction.set(authorizationRef, authorization)
    return { authorizationVersion: authorization.version }
  })

  return {
    ok: true,
    operation,
    roleId: payload.roleId,
    targetUid: payload.targetUid,
    ...result,
  }
}

async function invokeTrusted(request, handler) {
  const actor = await getTrustedActor(request)
  try {
    return await handler(actor, request?.data || {})
  } catch (error) {
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'Trusted Custom Role mutation failed.')
  }
}

module.exports = {
  createCustomRole,
  updateCustomRole,
  disableCustomRole: (actor, data, db) => setCustomRoleStatus(actor, data, 'disabled', 'disableCustomRole', db),
  enableCustomRole: (actor, data, db) => setCustomRoleStatus(actor, data, 'active', 'enableCustomRole', db),
  deleteCustomRole,
  assignCustomRole: (actor, data, db) => mutateAssignment(actor, data, 'assignCustomRole', db),
  revokeCustomRole: (actor, data, db) => mutateAssignment(actor, data, 'revokeCustomRole', db),
  invokeTrusted,
}
