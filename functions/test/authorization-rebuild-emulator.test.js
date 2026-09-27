const assert = require('node:assert/strict')
const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'along-authorization-rebuild-audit'
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const FUNCTIONS_BASE_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`
const PASSWORD = 'TestPassword123!'
const NEWS_RESTORE = 'news.restore'
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
  if (systemRole === 'ADMIN') return ['calendar.search', 'calendar.export', 'users.read', 'roles.read']
  if (systemRole === 'EDITOR') return ['calendar.search', 'calendar.export', 'news.read']
  return ['calendar.search', 'calendar.export']
}

async function createAccount(uid, systemRole = 'USER', { customRoles = [], status = 'active' } = {}) {
  const now = Timestamp.now()
  await auth.createUser({ uid, email: `${uid}@example.test`, password: PASSWORD })
  await auth.setCustomUserClaims(uid, systemRole === 'USER' ? {} : { systemRole, roleVersion: 1 })
  await db.doc(`users/${uid}`).set({ uid, email: `${uid}@example.test`, displayName: uid, photoURL: '', systemRole, status, customRoles, createdAt: now, updatedAt: now, lastLoginAt: now })
  await db.doc(`userAuthorizations/${uid}`).set({ uid, systemRole, customRoles, permissions: rolePermissions(systemRole), version: 1, updatedAt: now })
}

async function signIn(uid) {
  const response = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: PASSWORD, returnSecureToken: true }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(JSON.stringify(body))
  return body.idToken
}

async function call(name, token, data = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${name}`, { method: 'POST', headers, body: JSON.stringify({ data }) })
  const body = await response.json()
  if (body.error) {
    const error = new Error(body.error.message)
    error.code = String(body.error.status || body.error.code).toLowerCase().replace(/_/g, '-')
    throw error
  }
  return body.result
}

async function denied(operation, code) {
  await assert.rejects(operation, (error) => error.code === code)
}

async function main() {
  await createAccount('rebuild-root', 'ROOT_ADMIN')
  await createAccount('rebuild-super-a', 'SUPER_ADMIN')
  await createAccount('rebuild-super-b', 'SUPER_ADMIN')
  await createAccount('rebuild-admin', 'ADMIN')
  await createAccount('rebuild-editor', 'EDITOR')
  await createAccount('rebuild-user', 'USER')
  await createAccount('rebuild-custom-user', 'USER', { customRoles: ['CALENDAR_ROLE'] })
  await db.doc('roles/CALENDAR_ROLE').set({ id: 'CALENDAR_ROLE', name: 'Calendar', description: '', type: 'CUSTOM', status: 'active', permissions: ['calendar.search'], createdBy: 'rebuild-root', createdAt: Timestamp.now(), updatedAt: Timestamp.now() })
  await db.doc('systemConfig/root').set({ rootUid: 'rebuild-root', version: 1, updatedAt: Timestamp.now() })

  const rootToken = await signIn('rebuild-root')
  const userToken = await signIn('rebuild-user')
  const adminToken = await signIn('rebuild-admin')
  const editorToken = await signIn('rebuild-editor')
  const superToken = await signIn('rebuild-super-a')

  await denied(() => call('rebuildProtectedSystemRoleAuthorizations'), 'unauthenticated')
  await denied(() => call('rebuildProtectedSystemRoleAuthorizations', userToken), 'permission-denied')
  await denied(() => call('rebuildProtectedSystemRoleAuthorizations', adminToken), 'permission-denied')
  await denied(() => call('rebuildProtectedSystemRoleAuthorizations', editorToken), 'permission-denied')
  await denied(() => call('rebuildProtectedSystemRoleAuthorizations', superToken), 'permission-denied')
  for (const forgedPayload of [
    { targetUid: 'rebuild-super-a' },
    { actorUid: 'rebuild-super-a' },
    { permissions: ['news.restore'] },
    { systemRole: 'ROOT_ADMIN' },
  ]) {
    await denied(() => call('rebuildProtectedSystemRoleAuthorizations', rootToken, forgedPayload), 'invalid-argument')
  }

  const before = await Promise.all(['rebuild-root', 'rebuild-super-a', 'rebuild-super-b'].map((uid) => db.doc(`userAuthorizations/${uid}`).get()))
  const result = await call('rebuildProtectedSystemRoleAuthorizations', rootToken)
  assert.equal(result.ok, true)
  assert.equal(result.affectedUserCount, 3)
  assert.equal(result.updatedUserCount, 3)
  assert.equal(result.unchangedUserCount, 0)

  for (const uid of ['rebuild-root', 'rebuild-super-a', 'rebuild-super-b']) {
    const authorization = (await db.doc(`userAuthorizations/${uid}`).get()).data()
    assert.equal(authorization.systemRole === 'ROOT_ADMIN' || authorization.systemRole === 'SUPER_ADMIN', true)
    assert.equal(authorization.permissions.includes(NEWS_RESTORE), true)
  }
  assert.equal((await db.doc('userAuthorizations/rebuild-admin').get()).data().permissions.includes(NEWS_RESTORE), false)
  assert.equal((await db.doc('userAuthorizations/rebuild-editor').get()).data().permissions.includes(NEWS_RESTORE), false)
  assert.equal((await db.doc('userAuthorizations/rebuild-user').get()).data().permissions.includes(NEWS_RESTORE), false)
  assert.equal((await db.doc('userAuthorizations/rebuild-custom-user').get()).data().permissions.includes(NEWS_RESTORE), false)

  const afterFirst = await Promise.all(['rebuild-root', 'rebuild-super-a', 'rebuild-super-b'].map((uid) => db.doc(`userAuthorizations/${uid}`).get()))
  const second = await call('rebuildProtectedSystemRoleAuthorizations', rootToken)
  assert.equal(second.updatedUserCount, 0)
  assert.equal(second.unchangedUserCount, 3)
  const afterSecond = await Promise.all(['rebuild-root', 'rebuild-super-a', 'rebuild-super-b'].map((uid) => db.doc(`userAuthorizations/${uid}`).get()))
  assert.deepEqual(afterSecond.map((snapshot) => snapshot.data().version), afterFirst.map((snapshot) => snapshot.data().version))
  assert.equal(before.every((snapshot) => !snapshot.data().permissions.includes(NEWS_RESTORE)), true)
  const auditEvents = (await db.collection('auditEvents').where('action', '==', 'AUTHORIZATION_REBUILT').get()).docs.map((snapshot) => snapshot.data())
  assert.ok(auditEvents.some((event) => event.result === 'SUCCESS' && event.actorUid === 'rebuild-root'))
  assert.ok(auditEvents.some((event) => event.result === 'DENIED' && event.actorUid === 'rebuild-user'))

  console.log('Authorization rebuild emulator test PASS: ROOT-only backend-controlled scope, payload rejection, policy materialization, lower-role denial, additive safety, audit, and idempotency verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
