const assert = require('node:assert/strict')
const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { PERMISSIONS } = require('../src/auth')

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'along-membership-audit'
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
  await Promise.all([
    createAccount('membership-root', 'ROOT_ADMIN'),
    createAccount('membership-super', 'SUPER_ADMIN'),
    createAccount('membership-admin', 'ADMIN'),
    createAccount('membership-editor', 'EDITOR'),
    createAccount('membership-user', 'USER'),
    createAccount('membership-target', 'USER'),
  ])
  await db.doc('membershipTiers/vip1').set({ name: 'VIP 1', level: 1, active: true, description: 'Tier 1' })
  await db.doc('membershipTiers/vip10').set({ name: 'VIP 10', level: 10, active: true, description: 'Tier 10' })
  await db.doc('membershipTiers/disabled').set({ name: 'Disabled', level: 2, active: false })

  const [rootToken, superToken, adminToken, editorToken, userToken] = await Promise.all([
    signIn('membership-root'), signIn('membership-super'), signIn('membership-admin'),
    signIn('membership-editor'), signIn('membership-user'),
  ])

  const tiers = await call('listMembershipTiers', userToken, {})
  assert.deepEqual(tiers.items.map((item) => item.id), ['vip1', 'vip10'])
  assert.equal(tiers.items.find((item) => item.id === 'vip10').level, 10)
  assert.equal(tiers.items.some((item) => item.id === 'disabled'), false)
  await denied(() => call('listMembershipTiers', null, {}), 'unauthenticated')
  await denied(() => call('listMemberships', null, {}), 'unauthenticated')
  for (const token of [userToken, editorToken, adminToken]) {
    await denied(() => call('listMemberships', token, {}), 'permission-denied')
  }
  await denied(() => call('listMemberships', superToken, { actorUid: 'forged' }), 'invalid-argument')
  const emptyMemberships = await call('listMemberships', rootToken, { limit: 1 })
  assert.deepEqual(emptyMemberships.items, [])
  assert.equal(emptyMemberships.hasMore, false)

  const createPayload = {
    userId: 'membership-target',
    tierId: 'vip10',
    startsAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: null,
  }
  await denied(() => call('createManualMembership', null, createPayload), 'unauthenticated')
  for (const token of [userToken, editorToken, adminToken]) {
    await denied(() => call('createManualMembership', token, createPayload), 'permission-denied')
  }
  await denied(() => call('createManualMembership', superToken, { ...createPayload, actorUid: 'forged' }), 'invalid-argument')
  await denied(() => call('createManualMembership', superToken, { ...createPayload, userId: 'missing-user' }), 'not-found')
  await denied(() => call('createManualMembership', superToken, { ...createPayload, tierId: 'missing-tier' }), 'failed-precondition')
  await denied(() => call('createManualMembership', superToken, { ...createPayload, tierId: 'disabled' }), 'failed-precondition')
  await denied(() => call('createManualMembership', superToken, { ...createPayload, expiresAt: 'not-a-date' }), 'invalid-argument')

  const created = await call('createManualMembership', superToken, createPayload)
  assert.equal(created.status, 'ACTIVE')
  assert.equal(created.tierId, 'vip10')
  const membershipRef = db.doc(`memberships/${created.membershipId}`)
  const membershipSnapshot = await membershipRef.get()
  assert.equal(membershipSnapshot.exists, true)
  assert.equal(membershipSnapshot.data().userId, 'membership-target')
  assert.equal(membershipSnapshot.data().tierId, 'vip10')
  assert.equal(membershipSnapshot.data().source, 'MANUAL')
  assert.equal(Object.hasOwn(membershipSnapshot.data(), 'level'), false)
  assert.equal(membershipSnapshot.data().assignedBy, 'membership-super')

  const listed = await call('listMemberships', superToken, { limit: 1 })
  assert.equal(listed.items.length, 1)
  assert.equal(listed.items[0].membershipId, created.membershipId)
  assert.equal(listed.items[0].tier.level, 10)
  assert.equal(listed.items[0].user.uid, 'membership-target')
  assert.equal(Object.hasOwn(listed.items[0], 'permissions'), false)
  const targetHistory = await call('getUserMemberships', rootToken, { userId: 'membership-target' })
  assert.equal(targetHistory.items.length, 1)
  assert.equal(targetHistory.items[0].membershipId, created.membershipId)
  await denied(() => call('getUserMemberships', adminToken, { userId: 'membership-target' }), 'permission-denied')
  await denied(() => call('getUserMemberships', superToken, { userId: 'membership-target', actorUid: 'forged' }), 'invalid-argument')

  await denied(() => call('createManualMembership', rootToken, createPayload), 'already-exists')
  await denied(() => call('revokeMembership', userToken, { membershipId: created.membershipId }), 'permission-denied')
  const revoked = await call('revokeMembership', rootToken, { membershipId: created.membershipId })
  assert.equal(revoked.status, 'REVOKED')
  const afterRevoke = await membershipRef.get()
  assert.equal(afterRevoke.exists, true)
  assert.equal(afterRevoke.data().status, 'REVOKED')
  await denied(() => call('revokeMembership', rootToken, { membershipId: created.membershipId }), 'failed-precondition')

  const auditSnapshot = await db.collection('auditEvents').where('targetUid', '==', 'membership-target').get()
  const actions = auditSnapshot.docs.map((item) => item.data().action)
  assert.equal(actions.includes('MEMBERSHIP_CREATED'), true)
  assert.equal(actions.includes('MEMBERSHIP_REVOKED'), true)
  assert.equal(auditSnapshot.docs.every((item) => item.data().actorUid !== 'forged'), true)

  console.log('Membership emulator test PASS: tier listing, trusted manager boundary, dynamic VIP10, validation, single ACTIVE invariant, revoke history and audit verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
