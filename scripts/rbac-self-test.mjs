import assert from 'node:assert/strict'
import {
  canAssignSystemRole,
  canManageRole,
  getEffectivePermissions,
  hasPermission,
  validateCustomRole,
} from '../src/services/rbac/policy.js'
import { PERMISSIONS } from '../src/services/rbac/permissions.js'
import { SYSTEM_ROLES } from '../src/services/rbac/roles.js'

const roleMap = {
  CONTENT_MANAGER: {
    id: 'CONTENT_MANAGER',
    type: 'CUSTOM',
    status: 'active',
    permissions: [PERMISSIONS.NEWS_READ, PERMISSIONS.NEWS_UPDATE],
  },
  DISABLED_ROLE: {
    id: 'DISABLED_ROLE',
    type: 'CUSTOM',
    status: 'disabled',
    permissions: [PERMISSIONS.NEWS_DELETE],
  },
}

const user = { systemRole: SYSTEM_ROLES.USER, customRoles: ['CONTENT_MANAGER', 'DISABLED_ROLE'] }
const root = { claims: { systemRole: SYSTEM_ROLES.ROOT_ADMIN } }
const admin = { claims: { systemRole: SYSTEM_ROLES.ADMIN } }

assert.equal(hasPermission(user, PERMISSIONS.CALENDAR_SEARCH, roleMap), true)
assert.equal(hasPermission(user, PERMISSIONS.NEWS_READ, roleMap), true)
assert.equal(hasPermission(user, PERMISSIONS.NEWS_DELETE, roleMap), false)
assert.equal(getEffectivePermissions(root, roleMap).includes(PERMISSIONS.ROLES_CREATE), true)
assert.equal(canAssignSystemRole(root, SYSTEM_ROLES.ADMIN), true)
assert.equal(canAssignSystemRole(admin, SYSTEM_ROLES.ROOT_ADMIN), false)
assert.equal(canAssignSystemRole(admin, SYSTEM_ROLES.USER, SYSTEM_ROLES.SUPER_ADMIN), false)
assert.equal(canManageRole(root, roleMap.CONTENT_MANAGER, 'update', roleMap), true)
assert.equal(validateCustomRole({ id: 'ROOT_ADMIN', type: 'CUSTOM', status: 'active', permissions: [] }).length > 0, true)
assert.equal(validateCustomRole({ id: 'BAD_ROLE', type: 'CUSTOM', status: 'active', permissions: ['unknown.permission'] }).length > 0, true)
assert.equal(validateCustomRole({ id: 'ROLE_MANAGER', type: 'CUSTOM', status: 'active', permissions: [PERMISSIONS.ROLES_ASSIGN] }).length > 0, true)
assert.equal(getEffectivePermissions(user, { ...roleMap, BAD_ROLE: { type: 'CUSTOM', status: 'active', permissions: ['unknown.permission'] } }).includes('unknown.permission'), false)

console.log('RBAC self-test PASS: system roles, custom role union, disabled role exclusion, hierarchy and validation.')
