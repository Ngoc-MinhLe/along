const assert = require('node:assert/strict')
const { assertProtectedProfileConsistency } = require('../src/authorization-rebuild-service')

function assertFailed(operation) {
  assert.throws(operation, (error) => error?.code === 'failed-precondition')
}

const basePlan = {
  uid: 'protected-user',
  status: 'active',
  systemRole: 'ROOT_ADMIN',
  customRoles: [],
}

assert.deepEqual(
  assertProtectedProfileConsistency(basePlan, { uid: basePlan.uid, status: 'active', systemRole: 'ROOT_ADMIN' }),
  [],
)
assert.deepEqual(
  assertProtectedProfileConsistency(basePlan, { ...basePlan, customRoles: [] }),
  [],
)
assert.deepEqual(
  assertProtectedProfileConsistency(
    { ...basePlan, customRoles: ['ROLE_A'] },
    { ...basePlan, customRoles: ['ROLE_A', 'ROLE_A'] },
  ),
  ['ROLE_A'],
)
assert.deepEqual(
  assertProtectedProfileConsistency(
    { ...basePlan, customRoles: ['ROLE_A'] },
    { ...basePlan, customRoles: ['ROLE_A'] },
  ),
  ['ROLE_A'],
)

for (const malformed of [null, 'ROLE_A', { id: 'ROLE_A' }, [''] , [null]]) {
  assertFailed(() => assertProtectedProfileConsistency(basePlan, { ...basePlan, customRoles: malformed }))
}

assertFailed(() => assertProtectedProfileConsistency(basePlan, { ...basePlan, uid: 'other-user' }))
assertFailed(() => assertProtectedProfileConsistency(basePlan, { ...basePlan, status: 'suspended' }))
assertFailed(() => assertProtectedProfileConsistency(basePlan, { ...basePlan, systemRole: 'SUPER_ADMIN' }))
assertFailed(() => assertProtectedProfileConsistency(basePlan, { ...basePlan, customRoles: ['ROLE_A'] }))

console.log('Authorization rebuild consistency unit test PASS: missing customRoles normalizes to [], valid roles remain consistent, malformed data and protected identity/security changes fail closed.')
