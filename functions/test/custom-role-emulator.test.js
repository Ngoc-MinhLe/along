const assert = require('node:assert/strict')
const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'along-functions-audit'
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const FUNCTIONS_BASE_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`
const PASSWORD = 'TestPassword123!'

const ALL_PERMISSIONS = [
  'users.read', 'users.create', 'users.update', 'users.delete',
  'roles.read', 'roles.create', 'roles.update', 'roles.disable', 'roles.delete', 'roles.assign', 'roles.revoke',
  'calendar.search', 'calendar.export', 'calendar.import',
  'news.read', 'news.create', 'news.update', 'news.delete', 'news.publish',
  'quiz.question.read', 'quiz.question.create', 'quiz.question.update', 'quiz.question.delete',
  'quiz.exam.create', 'quiz.exam.update', 'quiz.exam.publish', 'quiz.exam.delete',
  'approval.create', 'approval.review', 'audit.read',
]

const app = getApps()[0] || initializeApp({ projectId: PROJECT_ID })
const auth = getAuth(app)
const db = getFirestore(app)

function profile(uid, systemRole = 'USER', customRoles = []) {
  const now = Timestamp.now()
  return {
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    photoURL: '',
    systemRole,
    status: 'active',
    customRoles,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  }
}

function rolePermissions(systemRole) {
  if (systemRole === 'ROOT_ADMIN' || systemRole === 'SUPER_ADMIN') return ALL_PERMISSIONS
  if (systemRole === 'ADMIN') {
    return [
      'calendar.search', 'calendar.export', 'calendar.import',
      'users.read', 'roles.read', 'roles.assign', 'roles.revoke',
      'news.read', 'news.create', 'news.update', 'news.delete', 'news.publish',
      'quiz.question.read', 'quiz.question.create', 'quiz.question.update', 'quiz.question.delete',
    ]
  }
  return ['calendar.search', 'calendar.export']
}

async function createAccount(uid, systemRole, customRoles = []) {
  const email = `${uid}@example.test`
  await auth.createUser({ uid, email, password: PASSWORD })
  await auth.setCustomUserClaims(uid, { systemRole, roleVersion: 1 })
  await db.doc(`users/${uid}`).set(profile(uid, systemRole, customRoles))
  await db.doc(`userAuthorizations/${uid}`).set({
    uid,
    systemRole,
    customRoles,
    permissions: rolePermissions(systemRole),
    version: 1,
    updatedAt: Timestamp.now(),
  })
}

async function signIn(uid) {
  const response = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: PASSWORD, returnSecureToken: true }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Auth emulator sign-in failed for ${uid}: ${JSON.stringify(body)}`)
  return body.idToken
}

function normalizeErrorCode(code) {
  return String(code || '').toLowerCase().replace(/_/g, '-')
}

async function call(functionName, token, data) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  })
  const body = await response.json()
  if (body.error) {
    const error = new Error(body.error.message || 'Callable failed')
    error.code = normalizeErrorCode(
      body.error.status
      || body.error.code
      || (response.status === 401 ? 'unauthenticated' : 'callable-error'),
    )
    throw error
  }
  if (!response.ok) throw new Error(`Callable HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body.result
}

async function denied(operation, expectedCode) {
  let error
  try {
    await operation()
  } catch (caught) {
    error = caught
  }
  assert.ok(error, 'Expected callable operation to be denied.')
  if (expectedCode) assert.equal(error.code, expectedCode)
}

async function readUser(uid) {
  return (await db.doc(`users/${uid}`).get()).data()
}

async function readAuthorization(uid) {
  return (await db.doc(`userAuthorizations/${uid}`).get()).data()
}

async function main() {
  await createAccount('root-test', 'ROOT_ADMIN')
  await createAccount('super-test', 'SUPER_ADMIN')
  await createAccount('admin-test', 'ADMIN')
  await createAccount('user-test', 'USER')
  await createAccount('target-test', 'USER')
  await db.doc('systemConfig/root').set({ rootUid: 'root-test', version: 1, updatedAt: Timestamp.now() })

  const rootToken = await signIn('root-test')
  const superToken = await signIn('super-test')
  const adminToken = await signIn('admin-test')
  const userToken = await signIn('user-test')

  await denied(() => call('createCustomRole', null, { name: 'Guest Role', permissions: ['news.read'] }), 'unauthenticated')
  await denied(() => call('createCustomRole', userToken, { name: 'User Role', permissions: ['news.read'] }), 'permission-denied')
  await denied(() => call('createCustomRole', adminToken, { name: 'Admin Role', permissions: ['news.read'] }), 'permission-denied')
  await denied(() => call('createCustomRole', rootToken, { actorUid: 'forged', name: 'Forged Role', permissions: ['news.read'] }), 'invalid-argument')
  await denied(() => call('createCustomRole', rootToken, { name: 'Invalid Permission', permissions: ['not.in.catalog'] }), 'invalid-argument')
  await denied(() => call('createCustomRole', rootToken, { name: 'Forbidden Permission', permissions: ['roles.create'] }), 'permission-denied')
  await denied(() => call('createCustomRole', rootToken, { name: 'USER', permissions: ['news.read'] }), 'invalid-argument')
  await denied(() => call('createCustomRole', rootToken, { name: 'ROOT ADMIN', permissions: ['news.read'] }), 'invalid-argument')

  const created = await call('createCustomRole', rootToken, {
    name: 'Biên tập tin tức',
    description: 'Created through the trusted callable.',
    permissions: ['news.read'],
  })
  assert.equal(created.roleId, 'BIEN_TAP_TIN_TUC')
  const createdRole = (await db.doc(`roles/${created.roleId}`).get()).data()
  assert.equal(createdRole.createdBy, 'root-test')
  assert.equal(createdRole.type, 'CUSTOM')

  const rootAssigned = await call('assignCustomRole', rootToken, { targetUid: 'user-test', customRoleId: created.roleId })
  assert.equal(rootAssigned.targetUid, 'user-test')
  assert.equal((await readUser('user-test')).customRoles.includes(created.roleId), true)
  assert.equal((await readAuthorization('user-test')).customRoles.includes(created.roleId), true)
  assert.equal((await readAuthorization('user-test')).permissions.includes('news.read'), true)
  await call('revokeCustomRole', rootToken, { targetUid: 'user-test', customRoleId: created.roleId })

  await db.doc('roles/LEGACY_FORBIDDEN_ROLE').set({
    id: 'LEGACY_FORBIDDEN_ROLE',
    name: 'Legacy Forbidden Role',
    description: '',
    type: 'CUSTOM',
    status: 'active',
    permissions: ['roles.assign'],
    createdBy: 'root-test',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  await db.doc('users/user-test').set({ customRoles: ['LEGACY_FORBIDDEN_ROLE'] }, { merge: true })
  await db.doc('userAuthorizations/user-test').set({
    uid: 'user-test',
    systemRole: 'USER',
    customRoles: ['LEGACY_FORBIDDEN_ROLE'],
    permissions: rolePermissions('USER'),
    version: 2,
    updatedAt: Timestamp.now(),
  })
  const legacySafeAssignment = await call('assignCustomRole', rootToken, { targetUid: 'user-test', customRoleId: created.roleId })
  assert.equal(legacySafeAssignment.targetUid, 'user-test')
  const legacySafeAuthorization = await readAuthorization('user-test')
  assert.equal(legacySafeAuthorization.customRoles.includes('LEGACY_FORBIDDEN_ROLE'), true)
  assert.equal(legacySafeAuthorization.permissions.includes('roles.assign'), false)
  assert.equal(legacySafeAuthorization.permissions.includes('news.read'), true)
  await call('revokeCustomRole', rootToken, { targetUid: 'user-test', customRoleId: created.roleId })

  const superCreated = await call('createCustomRole', superToken, { name: 'Super Created', permissions: ['news.read'] })
  assert.equal(superCreated.roleId, 'SUPER_CREATED')

  await denied(() => call('updateCustomRole', rootToken, {
    roleId: created.roleId,
    name: 'Changed Role',
    description: '',
    permissions: ['news.read'],
    createdBy: 'forged',
  }), 'invalid-argument')
  await denied(() => call('updateCustomRole', rootToken, {
    roleId: 'USER', name: 'Invalid', description: '', permissions: ['news.read'],
  }), 'invalid-argument')

  const assigned = await call('assignCustomRole', adminToken, { targetUid: 'target-test', customRoleId: created.roleId })
  assert.equal(assigned.targetUid, 'target-test')
  assert.equal((await readUser('target-test')).customRoles.includes(created.roleId), true)
  assert.equal((await readAuthorization('target-test')).permissions.includes('news.read'), true)
  await denied(() => call('assignCustomRole', adminToken, { targetUid: 'target-test', customRoleId: created.roleId }), 'already-exists')
  await denied(() => call('assignCustomRole', rootToken, { targetUid: 'root-test', customRoleId: created.roleId }), 'permission-denied')
  await denied(() => call('assignCustomRole', userToken, { targetUid: 'user-test', customRoleId: created.roleId }), 'permission-denied')
  await denied(() => call('assignCustomRole', adminToken, { targetUid: 'missing-target', customRoleId: created.roleId }), 'not-found')
  await denied(() => call('assignCustomRole', adminToken, { targetUid: 'target-test', customRoleId: 'MISSING_ROLE' }), 'not-found')
  await denied(() => call('revokeCustomRole', adminToken, { targetUid: 'target-test', customRoleId: 'MISSING_ROLE' }), 'not-found')
  await denied(() => call('assignCustomRole', rootToken, { actorUid: 'forged', targetUid: 'target-test', customRoleId: created.roleId }), 'invalid-argument')
  await denied(() => call('assignCustomRole', rootToken, { targetUid: 'target-test', roleId: created.roleId }), 'invalid-argument')

  const updated = await call('updateCustomRole', rootToken, {
    roleId: created.roleId,
    name: 'Biên tập lịch và tin tức',
    description: 'Updated and materialized.',
    permissions: ['news.read', 'calendar.import'],
  })
  assert.equal(updated.affectedUserCount, 1)
  assert.equal((await readAuthorization('target-test')).permissions.includes('calendar.import'), true)

  const disabled = await call('disableCustomRole', rootToken, { roleId: created.roleId })
  assert.equal(disabled.affectedUserCount, 1)
  assert.equal((await readAuthorization('target-test')).permissions.includes('news.read'), false)
  await denied(() => call('assignCustomRole', adminToken, { targetUid: 'user-test', customRoleId: created.roleId }), 'failed-precondition')

  const enabled = await call('enableCustomRole', rootToken, { roleId: created.roleId })
  assert.equal(enabled.affectedUserCount, 1)
  assert.equal((await readAuthorization('target-test')).permissions.includes('calendar.import'), true)

  await denied(() => call('deleteCustomRole', rootToken, { roleId: created.roleId }), 'failed-precondition')
  const revoked = await call('revokeCustomRole', adminToken, { targetUid: 'target-test', customRoleId: created.roleId })
  assert.equal(revoked.targetUid, 'target-test')
  assert.equal((await readUser('target-test')).customRoles.includes(created.roleId), false)
  assert.equal((await readAuthorization('target-test')).permissions.includes('calendar.import'), false)
  await denied(() => call('revokeCustomRole', adminToken, { targetUid: 'target-test', customRoleId: created.roleId }), 'failed-precondition')

  const deleted = await call('deleteCustomRole', rootToken, { roleId: created.roleId })
  assert.equal(deleted.roleId, created.roleId)
  assert.equal((await db.doc(`roles/${created.roleId}`).get()).exists, false)

  const disabledRole = await call('createCustomRole', rootToken, { name: 'Disabled Assignment', permissions: ['news.read'] })
  await call('disableCustomRole', rootToken, { roleId: disabledRole.roleId })
  await denied(() => call('assignCustomRole', adminToken, { targetUid: 'target-test', customRoleId: disabledRole.roleId }), 'failed-precondition')

  const auditEvents = (await db.collection('auditEvents').get()).docs.map((snapshot) => snapshot.data())
  for (const action of [
    'CUSTOM_ROLE_CREATED', 'CUSTOM_ROLE_ASSIGNED', 'CUSTOM_ROLE_UPDATED',
    'CUSTOM_ROLE_DISABLED', 'CUSTOM_ROLE_ENABLED', 'CUSTOM_ROLE_REVOKED', 'CUSTOM_ROLE_DELETED',
  ]) {
    assert.ok(auditEvents.some((event) => event.action === action && event.result === 'SUCCESS'), action)
  }
  assert.ok(auditEvents.some((event) => event.action === 'CUSTOM_ROLE_ASSIGNED'
    && event.result === 'DENIED'
    && event.actorUid === 'user-test'))
  assert.equal(auditEvents.some((event) => Object.hasOwn(event, 'permissions')
    || Object.hasOwn(event, 'claims')), false)

  console.log('Custom Role callable emulator integration PASS: authentication, policy, validation, assignment, rebuild, disable/enable, rollback-safe workflow, and deletion guards verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
