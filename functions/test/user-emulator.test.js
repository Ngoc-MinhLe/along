const assert = require('node:assert/strict')
const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'along-user-audit'
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const FUNCTIONS_BASE_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`
const PASSWORD = 'TestPassword123!'
const app = getApps()[0] || initializeApp({ projectId: PROJECT_ID })
const auth = getAuth(app)
const db = getFirestore(app)

function profile(uid, systemRole) {
  const now = Timestamp.now()
  return {
    uid, email: `${uid}@example.test`, displayName: uid, photoURL: '', systemRole,
    status: 'active', customRoles: [], createdAt: now, updatedAt: now, lastLoginAt: now,
  }
}

function permissions(systemRole) {
  return systemRole === 'SUPER_ADMIN'
    ? ['users.read', 'users.update', 'roles.read', 'calendar.search', 'calendar.export']
    : ['calendar.search', 'calendar.export']
}

async function createAccount(uid, systemRole) {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: PASSWORD })
  await auth.setCustomUserClaims(uid, systemRole === 'USER' ? {} : { systemRole, roleVersion: 1 })
  await db.doc(`users/${uid}`).set(profile(uid, systemRole))
  await db.doc(`userAuthorizations/${uid}`).set({
    uid, systemRole, customRoles: [], permissions: permissions(systemRole), version: 1, updatedAt: Timestamp.now(),
  })
}

async function signIn(uid) {
  const response = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: PASSWORD, returnSecureToken: true }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Auth emulator sign-in failed: ${JSON.stringify(body)}`)
  return body.idToken
}

async function call(functionName, token, data) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST', headers, body: JSON.stringify({ data }),
  })
  const body = await response.json()
  if (body.error) {
    const error = new Error(body.error.message || 'Callable failed')
    error.code = String(body.error.status || body.error.code || '').toLowerCase().replace(/_/g, '-')
    throw error
  }
  return body.result
}

async function main() {
  await createAccount('profile-admin', 'SUPER_ADMIN')
  await createAccount('profile-user', 'USER')
  const adminToken = await signIn('profile-admin')
  const userToken = await signIn('profile-user')

  const result = await call('updateUserProfile', adminToken, {
    targetUid: 'profile-user', displayName: 'Updated by trusted callable',
  })
  assert.equal(result.ok, true)
  const successEvents = (await db.collection('auditEvents').get()).docs.map((item) => item.data())
  assert.equal(successEvents.length, 1)
  assert.equal(successEvents[0].actorUid, 'profile-admin')
  assert.equal(successEvents[0].action, 'USER_PROFILE_UPDATED')
  assert.equal(successEvents[0].result, 'SUCCESS')
  assert.equal(successEvents[0].targetUid, 'profile-user')

  let deniedError
  try {
    await call('updateUserProfile', userToken, { targetUid: 'profile-user', displayName: 'Escalation attempt' })
  } catch (error) {
    deniedError = error
  }
  assert.equal(deniedError.code, 'permission-denied')
  const deniedEvents = (await db.collection('auditEvents').get()).docs.map((item) => item.data())
  const denied = deniedEvents.find((item) => item.actorUid === 'profile-user' && item.result === 'DENIED')
  assert.ok(denied)
  assert.equal(denied.action, 'USER_PROFILE_UPDATED')

  console.log('User audit emulator test PASS: profile SUCCESS and unauthorized DENIED events verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
