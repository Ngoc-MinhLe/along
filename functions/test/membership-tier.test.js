const assert = require('node:assert/strict')
const { HttpsError } = require('firebase-functions/v2/https')
const {
  normalizeTier,
  normalizeTierCreatePayload,
  normalizeTierUpdatePayload,
  normalizeTierDeactivatePayload,
} = require('../src/membership-service')

function throwsCode(callback, code) {
  assert.throws(callback, (error) => error instanceof HttpsError && error.code === code)
}

assert.deepEqual(normalizeTier('platinum', {
  tierId: 'platinum', name: 'PLATINUM', level: 10, status: 'active', description: 'Dynamic tier',
}), {
  id: 'platinum', tierId: 'platinum', name: 'PLATINUM', level: 10,
  status: 'active', active: true, description: 'Dynamic tier',
})
assert.equal(normalizeTier('invalid', { tierId: 'invalid', name: 'Invalid', level: 1, status: 'paused' }), null)
assert.equal(normalizeTier('invalid', { tierId: 'other', name: 'Invalid', level: 1, status: 'active' }), null)
assert.equal(normalizeTier('invalid', { tierId: 'invalid', name: '', level: 1, status: 'active' }), null)
assert.deepEqual(normalizeTierCreatePayload({ tierId: 'vip10', name: 'VIP 10', level: 10 }), {
  tierId: 'vip10', name: 'VIP 10', level: 10, description: '',
})
assert.deepEqual(normalizeTierUpdatePayload({ tierId: 'vip10', name: 'VIP 10+', level: 11, description: 'Updated' }), {
  tierId: 'vip10', name: 'VIP 10+', level: 11, description: 'Updated',
})
assert.deepEqual(normalizeTierDeactivatePayload({ tierId: 'vip10' }), { tierId: 'vip10' })
throwsCode(() => normalizeTierCreatePayload({ tierId: 'VIP 10', name: 'VIP', level: 10 }), 'invalid-argument')
throwsCode(() => normalizeTierCreatePayload({ tierId: 'vip', name: 'VIP', level: 0 }), 'invalid-argument')
throwsCode(() => normalizeTierCreatePayload({ tierId: 'vip', name: 'VIP', level: 1, status: 'active' }), 'invalid-argument')
throwsCode(() => normalizeTierUpdatePayload({ tierId: 'vip', name: 'VIP', level: Number.MAX_SAFE_INTEGER + 1 }), 'invalid-argument')

console.log('Membership tier unit test PASS: dynamic schema, immutable ID boundary, status and level validation verified.')
