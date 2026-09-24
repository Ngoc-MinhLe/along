const assert = require('node:assert/strict')
const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'along-functions-audit'
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const FUNCTIONS_BASE_URL = 'http://127.0.0.1:5001/' + PROJECT_ID + '/us-central1'
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
  if (systemRole === 'EDITOR') {
    return [
      'calendar.search', 'calendar.export',
      'news.read', 'news.create', 'news.update', 'news.delete', 'news.publish',
      'quiz.question.read', 'quiz.question.create', 'quiz.question.update', 'quiz.question.delete',
    ]
  }
  return ['calendar.search', 'calendar.export']
}

function profile(uid, systemRole = 'USER', status = 'active') {
  const now = Timestamp.now()
  return {
    uid,
    email: uid + '@example.test',
    displayName: uid,
    photoURL: '',
    systemRole,
    status,
    customRoles: [],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  }
}

async function createAccount(uid, systemRole = 'USER', status = 'active') {
  await auth.createUser({ uid, email: uid + '@example.test', password: PASSWORD })
  await auth.setCustomUserClaims(uid, systemRole === 'USER' ? {} : { systemRole, roleVersion: 1 })
  await db.doc('users/' + uid).set(profile(uid, systemRole, status))
  await db.doc('userAuthorizations/' + uid).set({
    uid,
    systemRole,
    customRoles: [],
    permissions: rolePermissions(systemRole),
    version: 1,
    updatedAt: Timestamp.now(),
  })
}

async function signIn(uid) {
  const response = await fetch(AUTH_EMULATOR_URL + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: uid + '@example.test', password: PASSWORD, returnSecureToken: true }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error('Auth emulator sign-in failed: ' + JSON.stringify(body))
  return body.idToken
}

function normalizeErrorCode(code) {
  return String(code || '').toLowerCase().replace(/_/g, '-')
}

async function call(functionName, token, data) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = 'Bearer ' + token
  const response = await fetch(FUNCTIONS_BASE_URL + '/' + functionName, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  })
  const body = await response.json()
  if (body.error) {
    const error = new Error(body.error.message || 'Callable failed')
    error.code = normalizeErrorCode(body.error.status || body.error.code)
    throw error
  }
  if (!response.ok) throw new Error('Callable HTTP ' + response.status + ': ' + JSON.stringify(body))
  return body.result
}

async function denied(operation, expectedCode) {
  let error
  try {
    await operation()
  } catch (caught) {
    error = caught
  }
  assert.ok(error, 'Expected operation to be denied.')
  if (expectedCode) assert.equal(error.code, expectedCode)
}

async function readState(uid) {
  const [authUser, profileSnapshot, authorizationSnapshot] = await Promise.all([
    auth.getUser(uid),
    db.doc('users/' + uid).get(),
    db.doc('userAuthorizations/' + uid).get(),
  ])
  return {
    claims: authUser.customClaims || {},
    profile: profileSnapshot.data(),
    authorization: authorizationSnapshot.data(),
  }
}

async function main() {
  await createAccount('root-role-test', 'ROOT_ADMIN')
  await createAccount('super-role-test', 'SUPER_ADMIN')
  await createAccount('admin-role-test', 'ADMIN')
  await createAccount('user-role-test', 'USER')
  await createAccount('editor-role-target', 'USER')
  await createAccount('admin-role-target', 'USER')
  await createAccount('super-role-target', 'USER')
  await createAccount('inactive-role-target', 'USER', 'suspended')
  await createAccount('disabled-auth-target', 'USER')
  await auth.updateUser('disabled-auth-target', { disabled: true })
  await db.doc('systemConfig/root').set({ rootUid: 'root-role-test', version: 1, updatedAt: Timestamp.now() })

  const rootToken = await signIn('root-role-test')
  const adminToken = await signIn('admin-role-test')
  const userToken = await signIn('user-role-test')

  const transitions = [
    ['editor-role-target', 'EDITOR'],
    ['admin-role-target', 'ADMIN'],
    ['super-role-target', 'SUPER_ADMIN'],
  ]
  for (const [targetUid, targetSystemRole] of transitions) {
    const result = await call('setSystemRole', rootToken, { targetUid, targetSystemRole })
    assert.equal(result.ok, true)
    assert.equal(result.systemRole, targetSystemRole)
    const state = await readState(targetUid)
    assert.equal(state.profile.systemRole, targetSystemRole)
    assert.equal(state.claims.systemRole, targetSystemRole)
    assert.equal(state.authorization.systemRole, targetSystemRole)
  }
  const userResult = await call('setSystemRole', rootToken, {
    targetUid: 'editor-role-target',
    targetSystemRole: 'USER',
  })
  assert.equal(userResult.systemRole, 'USER')
  const userState = await readState('editor-role-target')
  assert.equal(userState.profile.systemRole, 'USER')
  assert.equal(userState.claims.systemRole, 'USER')
  assert.equal(userState.authorization.systemRole, 'USER')

  await denied(() => call('setSystemRole', rootToken, { targetUid: 'user-role-test', targetSystemRole: 'USER', actorUid: 'root-role-test' }), 'invalid-argument')
  await denied(() => call('setSystemRole', rootToken, { targetUid: 'user-role-test', targetSystemRole: 'ADMIN', permissions: ['users.delete'] }), 'invalid-argument')
  await denied(() => call('setSystemRole', rootToken, { targetUid: 'user-role-test', targetSystemRole: 'ADMIN', claims: { systemRole: 'ROOT_ADMIN' } }), 'invalid-argument')
  await denied(() => call('setSystemRole', rootToken, { targetUid: 'user-role-test', targetSystemRole: 'ROOT_ADMIN' }), 'invalid-argument')
  await denied(() => call('setSystemRole', rootToken, { targetUid: 'root-role-test', targetSystemRole: 'ADMIN' }), 'permission-denied')
  await denied(() => call('setSystemRole', rootToken, { targetUid: 'missing-role-target', targetSystemRole: 'ADMIN' }), 'not-found')
  await denied(() => call('setSystemRole', rootToken, { targetUid: 'inactive-role-target', targetSystemRole: 'ADMIN' }), 'failed-precondition')
  await denied(() => call('setSystemRole', rootToken, { targetUid: 'disabled-auth-target', targetSystemRole: 'ADMIN' }), 'failed-precondition')
  await denied(() => call('setSystemRole', adminToken, { targetUid: 'user-role-test', targetSystemRole: 'ADMIN' }), 'permission-denied')
  await denied(() => call('setSystemRole', userToken, { targetUid: 'user-role-test', targetSystemRole: 'ADMIN' }), 'permission-denied')

  const auditEvents = (await db.collection('auditEvents').get()).docs.map((snapshot) => snapshot.data())
  assert.ok(auditEvents.some((event) => event.action === 'SYSTEM_ROLE_CHANGED'
    && event.result === 'SUCCESS'
    && event.actorUid === 'root-role-test'
    && event.targetUid === 'admin-role-target'
    && event.metadata?.targetSystemRole === 'ADMIN'))
  assert.ok(auditEvents.some((event) => event.action === 'SYSTEM_ROLE_CHANGED'
    && event.result === 'DENIED'
    && event.actorUid === 'admin-role-test'))
  assert.ok(auditEvents.some((event) => event.action === 'SYSTEM_ROLE_CHANGED'
    && event.result === 'DENIED'
    && event.actorUid === 'user-role-test'))
  assert.equal(auditEvents.some((event) => Object.hasOwn(event, 'permissions')
    || Object.hasOwn(event, 'claims')), false)

  console.log('System Role emulator test PASS: ROOT transitions, ROOT protection, payload validation, non-ROOT denial and target validation verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
