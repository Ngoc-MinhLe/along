import assert from 'node:assert/strict'
import {
  buildSystemRolePlan,
  executeSystemRolePlan,
  validateRootAuthorization,
} from './lib/system-role-core.mjs'

const ROOT_UID = 'root-test-uid'
const TARGET_UID = 'target-test-uid'

function profile(overrides = {}) {
  return {
    uid: TARGET_UID,
    systemRole: 'USER',
    status: 'active',
    customRoles: ['CONTENT_MANAGER'],
    displayName: 'Target',
    ...overrides,
  }
}

function plan(overrides = {}) {
  return buildSystemRolePlan({
    rootUid: ROOT_UID,
    targetUid: TARGET_UID,
    targetProfile: profile(),
    targetClaims: { systemRole: 'USER', roleVersion: 1, otherClaim: 'abc' },
    requestedRole: 'ADMIN',
    ...overrides,
  })
}

validateRootAuthorization({
  rootUid: ROOT_UID,
  actorUid: ROOT_UID,
  actorClaims: { systemRole: 'ROOT_ADMIN' },
  rootProfile: { uid: ROOT_UID, systemRole: 'ROOT_ADMIN' },
  rootAuthClaims: { systemRole: 'ROOT_ADMIN' },
  rootCount: 1,
})
assert.throws(() => validateRootAuthorization({
  rootUid: ROOT_UID,
  actorUid: 'impostor-uid',
  actorClaims: { systemRole: 'ROOT_ADMIN' },
  rootProfile: { uid: ROOT_UID, systemRole: 'ROOT_ADMIN' },
  rootAuthClaims: { systemRole: 'ROOT_ADMIN' },
  rootCount: 1,
}), /operator is not the current ROOT/)
assert.throws(() => validateRootAuthorization({
  rootUid: ROOT_UID,
  actorUid: ROOT_UID,
  actorClaims: { systemRole: 'ROOT_ADMIN' },
  rootProfile: { uid: ROOT_UID, systemRole: 'ROOT_ADMIN' },
  rootAuthClaims: { systemRole: 'ROOT_ADMIN' },
  rootCount: 2,
}), /exactly one ROOT profile/)

// 1. Valid role.
assert.equal(plan().requestedRole, 'ADMIN')

// 2. Invalid role.
assert.throws(() => plan({ requestedRole: 'ROOT_ADMIN' }), /Invalid system role/)
assert.throws(() => plan({ requestedRole: 'OWNER' }), /Invalid system role/)

// 3. ROOT target.
assert.throws(() => plan({ targetUid: ROOT_UID, targetProfile: profile({ uid: ROOT_UID, systemRole: 'ROOT_ADMIN' }) }), /Target is ROOT/)

// 4. Nonexistent target.
assert.throws(() => plan({ targetProfile: null }), /Target not found/)

// 5. Same role.
const sameRolePlan = plan({
  targetProfile: profile({ systemRole: 'ADMIN' }),
  targetClaims: { systemRole: 'ADMIN', roleVersion: 2 },
})
assert.equal(sameRolePlan.noChange, true)

// 6. roleVersion increment.
assert.equal(plan().nextRoleVersion, 2)

// 7. Preserve unrelated claims.
assert.equal(plan().nextClaims.otherClaim, 'abc')

// 8-9. The plan does not mutate customRoles or status and only exposes a role patch.
const originalProfile = profile()
plan({ targetProfile: originalProfile })
assert.deepEqual(originalProfile.customRoles, ['CONTENT_MANAGER'])
assert.equal(originalProfile.status, 'active')

// 10. Dry-run performs no mutation.
const dryRunCalls = { claims: 0, profile: 0, read: 0 }
const dryRunResult = await executeSystemRolePlan(plan(), {
  setClaims: async () => { dryRunCalls.claims += 1 },
  updateProfile: async () => { dryRunCalls.profile += 1 },
  readState: async () => { dryRunCalls.read += 1 },
}, { dryRun: true })
assert.equal(dryRunResult.status, 'dry-run')
assert.deepEqual(dryRunCalls, { claims: 0, profile: 0, read: 0 })

// 11. Idempotency performs no mutation.
const idempotentCalls = { claims: 0, profile: 0, read: 0 }
const idempotentResult = await executeSystemRolePlan(sameRolePlan, {
  setClaims: async () => { idempotentCalls.claims += 1 },
  updateProfile: async () => { idempotentCalls.profile += 1 },
  readState: async () => { idempotentCalls.read += 1 },
})
assert.equal(idempotentResult.status, 'no-change')
assert.deepEqual(idempotentCalls, { claims: 0, profile: 0, read: 0 })

// 12. Firestore failure rolls Custom Claims back to their exact old value.
const claimsHistory = []
await assert.rejects(
  executeSystemRolePlan(plan(), {
    setClaims: async (claims) => { claimsHistory.push({ ...claims }) },
    updateProfile: async () => { throw new Error('simulated write failure') },
    readState: async () => { throw new Error('must not verify after failed write') },
  }),
  /Firestore update failed/,
)
assert.deepEqual(claimsHistory, [
  { systemRole: 'ADMIN', roleVersion: 2, otherClaim: 'abc' },
  { systemRole: 'USER', roleVersion: 1, otherClaim: 'abc' },
])

let rollbackAttempt = 0
await assert.rejects(
  executeSystemRolePlan(plan(), {
    setClaims: async () => {
      rollbackAttempt += 1
      if (rollbackAttempt === 2) throw new Error('simulated rollback failure')
    },
    updateProfile: async () => { throw new Error('simulated write failure') },
    readState: async () => ({ claims: {}, profileRole: 'USER' }),
  }),
  /CRITICAL INCONSISTENCY/,
)

// A successful path verifies both systems.
let storedClaims = { systemRole: 'USER', roleVersion: 1, otherClaim: 'abc' }
let storedRole = 'USER'
const successResult = await executeSystemRolePlan(plan(), {
  setClaims: async (claims) => { storedClaims = { ...claims } },
  updateProfile: async (role) => { storedRole = role },
  readState: async () => ({ claims: storedClaims, profileRole: storedRole }),
})
assert.equal(successResult.status, 'changed')
assert.equal(storedRole, 'ADMIN')
assert.equal(storedClaims.systemRole, 'ADMIN')
assert.equal(storedClaims.roleVersion, 2)

console.log('Trusted System Role tool self-test PASS (validation, authorization, preservation, dry-run, idempotency, rollback, verification).')
