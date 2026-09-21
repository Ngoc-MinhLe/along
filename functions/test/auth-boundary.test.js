const assert = require('node:assert/strict')
const { HttpsError } = require('firebase-functions/v2/https')
const {
  assertNoClientActorUid,
  requireAuthenticatedRequest,
} = require('../src/auth')
const { buildHealthResponse } = require('../src/health')

assert.throws(
  () => requireAuthenticatedRequest({ data: {} }),
  (error) => error instanceof HttpsError && error.code === 'unauthenticated',
)

assert.throws(
  () => requireAuthenticatedRequest({ auth: { uid: 'user-1', token: {} }, data: { actorUid: 'forged' } }),
  (error) => error instanceof HttpsError && error.code === 'invalid-argument',
)

const actor = requireAuthenticatedRequest({
  auth: { uid: 'user-1', token: { systemRole: 'ROOT_ADMIN' } },
  data: {},
})
assert.equal(actor.uid, 'user-1')
assert.equal(actor.token.systemRole, 'ROOT_ADMIN')

const health = buildHealthResponse({
  uid: 'user-1',
  authorization: { version: 4, systemRole: 'ROOT_ADMIN', permissions: ['users.delete'] },
})
assert.deepEqual(health, {
  ok: true,
  authenticated: true,
  actorUid: 'user-1',
  authorizationPresent: true,
  authorizationVersion: 4,
})
assert.equal(Object.prototype.hasOwnProperty.call(health, 'permissions'), false)
assert.equal(Object.prototype.hasOwnProperty.call(health, 'token'), false)

assert.doesNotThrow(() => assertNoClientActorUid({}))

console.log('Functions auth boundary self-test PASS: guest denied, authenticated actor derived from Auth, forged actorUid rejected, health response minimized.')
