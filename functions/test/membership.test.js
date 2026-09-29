const assert = require('node:assert/strict')
const { Timestamp } = require('firebase-admin/firestore')
const { HttpsError } = require('firebase-functions/v2/https')
const {
  normalizeTier,
  normalizeTierCreatePayload,
  normalizeTierUpdatePayload,
  normalizeTierDeactivatePayload,
  normalizeMembership,
  normalizeCreatePayload,
  normalizeRevokePayload,
  normalizeListPayload,
  isMembershipEffective,
} = require('../src/membership-service')

function throwsCode(callback, code) {
  assert.throws(callback, (error) => error instanceof HttpsError && error.code === code)
}

const now = Timestamp.now()
const later = Timestamp.fromMillis(now.toMillis() + 60_000)

assert.deepEqual(normalizeTier('vip10', {
  tierId: 'vip10', name: 'VIP 10', level: 10, status: 'active', description: 'High tier',
}), {
  id: 'vip10', tierId: 'vip10', name: 'VIP 10', level: 10, status: 'active', active: true, description: 'High tier',
})
assert.equal(normalizeTier('vip0', { tierId: 'vip0', name: 'VIP 0', level: 0, status: 'active' }), null)
assert.equal(normalizeTier('disabled', { tierId: 'disabled', name: 'Disabled', level: 1, status: 'inactive' }).active, false)
assert.equal(normalizeTier('mismatch', { tierId: 'other', name: 'Mismatch', level: 1, status: 'active' }), null)
assert.equal(normalizeTier('bad-status', { tierId: 'bad-status', name: 'Bad', level: 1, status: 'paused' }), null)
assert.equal(normalizeTier('bad-active', { tierId: 'bad-active', name: 'Bad', level: 1, status: 'active', active: false }), null)

assert.deepEqual(normalizeTierCreatePayload({ tierId: 'gold', name: 'Gold', level: 10, description: 'Paid tier' }), {
  tierId: 'gold', name: 'Gold', level: 10, description: 'Paid tier',
})
assert.deepEqual(normalizeTierUpdatePayload({ tierId: 'gold', name: 'Gold Plus', level: 11 }), {
  tierId: 'gold', name: 'Gold Plus', level: 11, description: '',
})
assert.deepEqual(normalizeTierDeactivatePayload({ tierId: 'gold' }), { tierId: 'gold' })
throwsCode(() => normalizeTierCreatePayload({ tierId: 'VIP 1', name: 'VIP', level: 1 }), 'invalid-argument')
throwsCode(() => normalizeTierCreatePayload({ tierId: 'vip', name: 'VIP', level: 0 }), 'invalid-argument')
throwsCode(() => normalizeTierCreatePayload({ tierId: 'vip', name: 'VIP', level: 1, status: 'active' }), 'invalid-argument')

const payload = normalizeCreatePayload({
  userId: 'target-user', tierId: 'vip10', startsAt: now, expiresAt: later,
})
assert.equal(payload.userId, 'target-user')
assert.equal(payload.tierId, 'vip10')
assert.equal(payload.startsAt.toMillis(), now.toMillis())
assert.equal(payload.expiresAt.toMillis(), later.toMillis())
throwsCode(() => normalizeCreatePayload({
  userId: 'target-user', tierId: 'vip1', startsAt: now, actorUid: 'forged',
}), 'invalid-argument')
throwsCode(() => normalizeCreatePayload({
  userId: 'target-user', tierId: 'vip1', startsAt: later, expiresAt: now,
}), 'invalid-argument')
throwsCode(() => normalizeCreatePayload({
  userId: 'target-user', tierId: 'vip1', startsAt: 'not-a-date',
}), 'invalid-argument')

const membership = normalizeMembership('membership-1', {
  userId: 'target-user', tierId: 'vip10', status: 'ACTIVE', source: 'MANUAL',
  startsAt: now, expiresAt: later,
})
assert.equal(membership.id, 'membership-1')
assert.equal(isMembershipEffective(membership, now.toMillis()), true)
assert.equal(isMembershipEffective(membership, later.toMillis()), false)
assert.equal(normalizeMembership('bad', { ...membership, status: 'BROKEN' }), null)
assert.deepEqual(normalizeRevokePayload({ membershipId: 'membership-1' }), { membershipId: 'membership-1' })
throwsCode(() => normalizeRevokePayload({ membershipId: 'membership-1', userId: 'forged' }), 'invalid-argument')
assert.deepEqual(normalizeListPayload({}), { userId: null, limit: 25 })
assert.deepEqual(normalizeListPayload({ userId: 'target-user', limit: 10 }, { requireUserId: true }), { userId: 'target-user', limit: 10 })
throwsCode(() => normalizeListPayload({ limit: 101 }), 'invalid-argument')
throwsCode(() => normalizeListPayload({ userId: 'target-user', actorUid: 'forged' }, { requireUserId: true }), 'invalid-argument')

console.log('Membership unit test PASS: dynamic tiers, schema validation, dates, expiration and payload boundary verified.')
