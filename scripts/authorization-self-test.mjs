import assert from 'node:assert/strict'
import { buildAuthorizationPlan } from './lib/authorization-core.mjs'
import { PERMISSIONS, PERMISSION_VALUES } from '../src/services/rbac/permissions.js'

const roles = {
  CALENDAR_OPERATOR: { id: 'CALENDAR_OPERATOR', type: 'CUSTOM', status: 'active', permissions: [PERMISSIONS.CALENDAR_IMPORT, PERMISSIONS.CALENDAR_IMPORT] },
  DISABLED_OPERATOR: { id: 'DISABLED_OPERATOR', type: 'CUSTOM', status: 'disabled', permissions: [PERMISSIONS.CALENDAR_IMPORT] },
  INVALID_ROLE: { id: 'INVALID_ROLE', type: 'CUSTOM', status: 'active', permissions: ['unknown.permission'] },
}

const baseProfile = { uid: 'user-1', systemRole: 'USER', customRoles: [] }
const base = buildAuthorizationPlan({ uid: 'user-1', profile: baseProfile, roleMap: roles })
assert.deepEqual(base.permissions, [PERMISSIONS.CALENDAR_EXPORT, PERMISSIONS.CALENDAR_SEARCH].sort())
assert.equal(base.version, 1)

const assigned = buildAuthorizationPlan({
  uid: 'user-1',
  profile: { ...baseProfile, customRoles: ['CALENDAR_OPERATOR'] },
  roleMap: roles,
  currentAuthorization: { ...base, permissions: base.permissions },
})
assert.equal(assigned.permissions.includes(PERMISSIONS.CALENDAR_IMPORT), true)
assert.equal(assigned.permissions.filter((permission) => permission === PERMISSIONS.CALENDAR_IMPORT).length, 1)
assert.equal(assigned.version, 2)

const revoked = buildAuthorizationPlan({
  uid: 'user-1',
  profile: baseProfile,
  roleMap: roles,
  currentAuthorization: { ...assigned },
})
assert.equal(revoked.permissions.includes(PERMISSIONS.CALENDAR_IMPORT), false)

const disabled = buildAuthorizationPlan({
  uid: 'user-1',
  profile: { ...baseProfile, customRoles: ['DISABLED_OPERATOR'] },
  roleMap: roles,
})
assert.equal(disabled.permissions.includes(PERMISSIONS.CALENDAR_IMPORT), false)

const invalid = buildAuthorizationPlan({
  uid: 'user-1',
  profile: { ...baseProfile, customRoles: ['INVALID_ROLE'] },
  roleMap: roles,
})
assert.equal(invalid.permissions.includes('unknown.permission'), false)

const enabledAfterRoleUpdate = buildAuthorizationPlan({
  uid: 'user-1',
  profile: { ...baseProfile, customRoles: ['CALENDAR_OPERATOR'] },
  roleMap: { ...roles, CALENDAR_OPERATOR: { ...roles.CALENDAR_OPERATOR, permissions: [PERMISSIONS.CALENDAR_IMPORT, PERMISSIONS.USERS_READ] } },
  currentAuthorization: { ...assigned },
})
assert.equal(enabledAfterRoleUpdate.permissions.includes(PERMISSIONS.USERS_READ), true)
assert.equal(enabledAfterRoleUpdate.needsWrite, true)

const root = buildAuthorizationPlan({ uid: 'root-1', profile: { uid: 'root-1', systemRole: 'ROOT_ADMIN', customRoles: [] } })
assert.deepEqual(root.permissions, [...PERMISSION_VALUES].sort())

const consistent = buildAuthorizationPlan({
  uid: 'user-1',
  profile: baseProfile,
  roleMap: roles,
  currentAuthorization: { uid: 'user-1', systemRole: 'USER', customRoles: [], permissions: base.permissions, version: 7 },
})
assert.equal(consistent.needsWrite, false)
assert.equal(consistent.version, 7)

const duplicateStoredPermission = buildAuthorizationPlan({
  uid: 'user-1',
  profile: baseProfile,
  roleMap: roles,
  currentAuthorization: {
    uid: 'user-1',
    systemRole: 'USER',
    customRoles: [],
    permissions: [...base.permissions, base.permissions[0]],
    version: 7,
  },
})
assert.equal(duplicateStoredPermission.needsWrite, true)
assert.equal(duplicateStoredPermission.version, 8)

const invalidStoredVersion = buildAuthorizationPlan({
  uid: 'user-1',
  profile: baseProfile,
  roleMap: roles,
  currentAuthorization: {
    uid: 'user-1',
    systemRole: 'USER',
    customRoles: [],
    permissions: base.permissions,
    version: '7',
  },
})
assert.equal(invalidStoredVersion.needsWrite, true)
assert.equal(invalidStoredVersion.version, 1)

console.log('Authorization materialization self-test PASS: assign, revoke, disable, role update, deduplication, invalid permission exclusion, ROOT and canonical consistency.')
