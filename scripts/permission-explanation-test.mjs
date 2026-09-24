import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  getDelegationScope,
  getEffectivePermissions,
  getRoleDelegationPreview,
  ROLE_PERMISSIONS,
} from '../src/services/rbac/policy.js'
import {
  getPermissionMetadata,
  PERMISSION_METADATA,
  PERMISSION_VALUES,
  PERMISSIONS,
} from '../src/services/rbac/permissions.js'
import { getSystemRoleMetadata, ROLE_HIERARCHY, SYSTEM_ROLES } from '../src/services/rbac/roles.js'

for (const permission of PERMISSION_VALUES) {
  const metadata = getPermissionMetadata(permission)
  assert.equal(metadata.key, permission)
  assert.ok(metadata.name)
  assert.ok(metadata.description)
  assert.ok(metadata.category)
  assert.ok(metadata.riskLevel)
  assert.equal(typeof metadata.delegable, 'boolean')
}
assert.deepEqual(Object.keys(PERMISSION_METADATA).sort(), [...PERMISSION_VALUES].sort())

for (const role of ROLE_HIERARCHY) {
  const metadata = getSystemRoleMetadata(role)
  assert.equal(metadata.key, role)
  assert.ok(metadata.name)
  assert.ok(metadata.description)
  assert.ok(Array.isArray(ROLE_PERMISSIONS[role]))
}

const contentRole = {
  id: 'CONTENT_MANAGER',
  name: 'Content Manager',
  description: 'News editing',
  type: 'CUSTOM',
  status: 'active',
  permissions: [PERMISSIONS.NEWS_READ, PERMISSIONS.NEWS_CREATE, PERMISSIONS.NEWS_UPDATE],
}
const forbiddenRole = {
  ...contentRole,
  id: 'FORBIDDEN_ROLE',
  permissions: [PERMISSIONS.NEWS_READ, PERMISSIONS.ROLES_ASSIGN],
}
const examRole = {
  ...contentRole,
  id: 'EXAM_PUBLISHER',
  permissions: [PERMISSIONS.QUIZ_EXAM_PUBLISH],
}
const roleMap = {
  [contentRole.id]: contentRole,
  [forbiddenRole.id]: forbiddenRole,
  [examRole.id]: examRole,
}

const user = { systemRole: SYSTEM_ROLES.USER, customRoles: [contentRole.id] }
const admin = { systemRole: SYSTEM_ROLES.ADMIN, customRoles: [] }
const root = { claims: { systemRole: SYSTEM_ROLES.ROOT_ADMIN }, customRoles: [] }

assert.equal(getEffectivePermissions(user, roleMap).includes(PERMISSIONS.NEWS_CREATE), true)
assert.equal(getDelegationScope(user, roleMap).length, 0)
assert.equal(getRoleDelegationPreview(user, contentRole, roleMap).canDelegate, false)

const adminPreview = getRoleDelegationPreview(admin, contentRole, roleMap)
assert.equal(adminPreview.canDelegate, true)
assert.deepEqual(adminPreview.blockedPermissions, [])
assert.equal(adminPreview.permissionDetails.every((permission) => permission.allowed), true)

const adminExamPreview = getRoleDelegationPreview(admin, examRole, roleMap)
assert.equal(adminExamPreview.canDelegate, false)
assert.deepEqual(adminExamPreview.blockedPermissions, [PERMISSIONS.QUIZ_EXAM_PUBLISH])

const forbiddenPreview = getRoleDelegationPreview(root, forbiddenRole, roleMap)
assert.equal(forbiddenPreview.canDelegate, false)
assert.deepEqual(forbiddenPreview.forbiddenPermissions, [PERMISSIONS.ROLES_ASSIGN])
assert.equal(forbiddenPreview.permissionDetails.find((item) => item.key === PERMISSIONS.ROLES_ASSIGN).allowed, false)

const rootPreview = getRoleDelegationPreview(root, contentRole, roleMap)
assert.equal(rootPreview.canDelegate, true)
assert.deepEqual(rootPreview.blockedPermissions, [])

const disabledRole = { ...contentRole, id: 'DISABLED_ROLE', status: 'disabled' }
assert.equal(getRoleDelegationPreview(root, disabledRole, { ...roleMap, DISABLED_ROLE: disabledRole }).canDelegate, false)

const frontendUsers = await readFile('src/pages/AdminUsersPage.jsx', 'utf8')
const frontendRoles = await readFile('src/pages/AdminRolesPage.jsx', 'utf8')
assert.match(frontendUsers, /getRoleDelegationPreview/)
assert.match(frontendUsers, /PermissionExplanationList/)
assert.match(frontendRoles, /RoleDelegationNotice/)
assert.doesNotMatch(frontendUsers, /effectivePermissions.*callFunction|callFunction.*effectivePermissions/)

console.log('Permission explanation test PASS: catalog metadata, effective permissions, delegation scope, role preview and frontend wiring.')
