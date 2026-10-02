const assert = require('node:assert/strict')
const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { PERMISSIONS } = require('../src/auth')

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'along-membership-tier-audit'
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const FUNCTIONS_BASE_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`
const PASSWORD = 'TestPassword123!'
const now = Timestamp.now()
const app = getApps()[0] || initializeApp({ projectId: PROJECT_ID })
const auth = getAuth(app)
const db = getFirestore(app)

function profile(uid, systemRole = 'USER') {
  return {
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    photoURL: '',
    systemRole,
    status: 'active',
    customRoles: [],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  }
}

async function createAccount(uid, systemRole = 'USER') {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: PASSWORD })
  await auth.setCustomUserClaims(uid, { systemRole, roleVersion: 1 })
  await db.doc(`users/${uid}`).set(profile(uid, systemRole))
  const permissions = systemRole === 'ROOT_ADMIN' || systemRole === 'SUPER_ADMIN'
    ? [...PERMISSIONS]
    : ['calendar.search', 'calendar.export']
  await db.doc(`userAuthorizations/${uid}`).set({
    uid,
    systemRole,
    customRoles: [],
    permissions,
    version: 1,
    updatedAt: now,
  })
}

async function signIn(uid) {
  const response = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: PASSWORD, returnSecureToken: true }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Auth emulator sign-in failed: ${JSON.stringify(body)}`)
  return body.idToken
}

function errorCode(body, response) {
  return String(body?.error?.status || body?.error?.code || (response.status === 401 ? 'unauthenticated' : 'callable-error'))
    .toLowerCase().replace(/_/g, '-')
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
    error.code = errorCode(body, response)
    throw error
  }
  if (!response.ok) throw new Error(`Callable HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body.result
}

async function denied(action, code) {
  let error
  try { await action() } catch (caught) { error = caught }
  assert.ok(error, 'Expected callable to be denied.')
  assert.equal(error.code, code, error.message)
}

async function main() {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
    'This test must only run with Firestore and Auth emulators.')
  await Promise.all([
    createAccount('tier-root', 'ROOT_ADMIN'),
    createAccount('tier-super', 'SUPER_ADMIN'),
    createAccount('tier-admin', 'ADMIN'),
    createAccount('tier-editor', 'EDITOR'),
    createAccount('tier-user', 'USER'),
  ])

  const [rootToken, superToken, adminToken, editorToken, userToken] = await Promise.all([
    signIn('tier-root'), signIn('tier-super'), signIn('tier-admin'),
    signIn('tier-editor'), signIn('tier-user'),
  ])

  await denied(() => call('createMembershipTier', null, { tierId: 'gold', name: 'Gold', level: 10 }), 'unauthenticated')
  for (const token of [userToken, editorToken, adminToken]) {
    await denied(() => call('createMembershipTier', token, { tierId: 'gold', name: 'Gold', level: 10 }), 'permission-denied')
  }
  await denied(() => call('createMembershipTier', superToken, { tierId: 'gold', name: 'Gold', level: 10, actorUid: 'forged' }), 'invalid-argument')
  await denied(() => call('createMembershipTier', rootToken, { tierId: 'bad id', name: 'Bad', level: 1 }), 'invalid-argument')
  await denied(() => call('createMembershipTier', rootToken, { tierId: 'bad-level', name: 'Bad', level: 0 }), 'invalid-argument')
  await denied(() => call('createMembershipTier', rootToken, { tierId: 'bad-status', name: 'Bad', level: 1, status: 'active' }), 'invalid-argument')

  const created = await call('createMembershipTier', superToken, {
    tierId: 'gold', name: 'Gold', level: 10, description: 'Dynamic tier',
  })
  assert.equal(created.tierId, 'gold')
  assert.equal(created.status, 'active')
  const tierRef = db.doc('membershipTiers/gold')
  const createdSnapshot = await tierRef.get()
  const createdData = createdSnapshot.data()
  assert.equal(createdData.tierId, 'gold')
  assert.equal(createdData.level, 10)
  assert.equal(createdData.status, 'active')
  assert.equal(createdData.createdBy, 'tier-super')
  assert.equal(Object.hasOwn(createdData, 'active'), false)

  await denied(() => call('createMembershipTier', rootToken, { tierId: 'gold', name: 'Duplicate', level: 11 }), 'already-exists')

  const updated = await call('updateMembershipTier', rootToken, {
    tierId: 'gold', name: 'Gold Plus', level: 15, description: 'Updated tier',
  })
  assert.equal(updated.tierId, 'gold')
  assert.equal(updated.level, 15)
  const updatedData = (await tierRef.get()).data()
  assert.equal(updatedData.name, 'Gold Plus')
  assert.equal(updatedData.level, 15)
  assert.equal(updatedData.createdBy, 'tier-super')
  assert.equal(updatedData.tierId, 'gold')

  await denied(() => call('updateMembershipTier', adminToken, { tierId: 'gold', name: 'Nope', level: 20 }), 'permission-denied')
  const allTiers = await call('listMembershipTiers', rootToken, { includeInactive: true })
  assert.equal(allTiers.items.find((item) => item.id === 'gold').level, 15)
  await denied(() => call('listMembershipTiers', userToken, { includeInactive: true }), 'permission-denied')

  const deactivated = await call('deactivateMembershipTier', superToken, { tierId: 'gold' })
  assert.equal(deactivated.status, 'inactive')
  assert.equal(deactivated.changed, true)
  assert.equal((await tierRef.get()).data().status, 'inactive')
  const idempotent = await call('deactivateMembershipTier', rootToken, { tierId: 'gold' })
  assert.equal(idempotent.changed, false)
  const activeOnly = await call('listMembershipTiers', rootToken, {})
  assert.deepEqual(activeOnly.items, [])
  const inactiveVisible = await call('listMembershipTiers', rootToken, { includeInactive: true })
  assert.equal(inactiveVisible.items[0].status, 'inactive')

  const auditSnapshot = await db.collection('auditEvents').where('resourceId', '==', 'gold').get()
  const actions = auditSnapshot.docs.map((item) => item.data().action)
  assert.equal(actions.includes('MEMBERSHIP_TIER_CREATED'), true)
  assert.equal(actions.includes('MEMBERSHIP_TIER_UPDATED'), true)
  assert.equal(actions.includes('MEMBERSHIP_TIER_DEACTIVATED'), true)
  assert.equal(auditSnapshot.docs.every((item) => item.data().actorUid !== 'forged'), true)

  // The production selector sends query, not just includeInactive/limit/cursor.
  // Free must never be a fallback result for a VIP prefix.
  for (const [tierId, name, level] of [
    ['free', 'Free', 1], ['vip-upper', 'VIP One', 2], ['vip-title', 'Vip Two', 3],
    ['vip-lower', 'vip Three', 4], ['vip-same-name', 'VIP One', 5],
    ['gold-active', 'GOLD', 10], ['platinum', 'Platinum', 20],
  ]) {
    await call('createMembershipTier', rootToken, { tierId, name, level })
  }
  for (const [query, expected] of [
    ['vip', ['vip-upper', 'vip-title', 'vip-lower', 'vip-same-name']],
    ['VIP', ['vip-upper', 'vip-title', 'vip-lower', 'vip-same-name']],
    ['gold', ['gold-active']], ['platinum', ['platinum']],
  ]) {
    const result = await call('listMembershipTiers', rootToken, { query, limit: 20, includeInactive: false })
    assert.deepEqual(result.items.map((item) => item.id).sort(), expected.sort())
    assert.equal(result.items.some((item) => item.id === 'free'), false)
  }
  const ids = []
  let cursor = null
  for (let page = 0; page < 10; page += 1) {
    const result = await call('listMembershipTiers', rootToken, { query: 'vip', limit: 1, ...(cursor ? { cursor } : {}) })
    assert.ok(result.items.length <= 1)
    ids.push(...result.items.map((item) => item.id))
    if (!result.hasMore) break
    assert.ok(result.nextCursor && result.nextCursor !== cursor)
    cursor = result.nextCursor
  }
  assert.equal(ids.length, 4)
  assert.equal(new Set(ids).size, 4, 'Union pagination must neither skip nor duplicate tiers.')
  const numeric = await call('listMembershipTiers', rootToken, { query: '20', limit: 20 })
  assert.deepEqual(numeric.items.map((item) => item.id), ['platinum'])
  await denied(() => call('listMembershipTiers', null, { query: 'vip' }), 'unauthenticated')
  await denied(() => call('listMembershipTiers', rootToken, { query: 'vip', actorUid: 'forged' }), 'invalid-argument')
  for (const token of [userToken, editorToken, adminToken]) {
    await denied(() => call('listMembershipTiers', token, { query: 'vip', includeInactive: true }), 'permission-denied')
  }
  const publicTiers = await call('listMembershipTiers', userToken, { query: 'vip' })
  assert.equal(publicTiers.items.length, 4, 'Existing authenticated active-tier read policy is preserved.')

  console.log('Membership tier emulator test PASS: mutations/audit, query contract, vip/VIP/gold/platinum, bounded union pagination, no Free fallback and security verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
