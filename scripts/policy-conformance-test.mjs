import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { PERMISSION_VALUES } from '../src/services/rbac/permissions.js'
import {
  CUSTOM_ROLE_FORBIDDEN_PERMISSIONS as FRONTEND_FORBIDDEN_PERMISSIONS,
  ROLE_PERMISSIONS as FRONTEND_ROLE_PERMISSIONS,
  canManageRole,
  getEffectivePermissions,
} from '../src/services/rbac/policy.js'
import { ROLE_HIERARCHY, SYSTEM_ROLES } from '../src/services/rbac/roles.js'

const require = createRequire(import.meta.url)
const backendPolicy = require('../functions/src/policy.js')

function sorted(values) {
  return [...values].sort()
}

function actor(systemRole, permissions) {
  const uid = systemRole.toLowerCase() + '-actor'
  return {
    uid,
    profile: { uid, systemRole, status: 'active', customRoles: [] },
    claims: { systemRole },
    authorization: { systemRole, customRoles: [], permissions, version: 1 },
  }
}

function canDelegate(permissions, role, action = 'assign') {
  return backendPolicy.DELEGATION_ACTIONS.includes(action)
    && backendPolicy.isDelegationWithinScope(permissions, role.permissions)
    && permissions.includes('roles.' + action)
}

const expectedRoles = Object.values(SYSTEM_ROLES)
assert.deepEqual(sorted(expectedRoles), sorted(Object.values(backendPolicy.SYSTEM_ROLES)))
assert.deepEqual(ROLE_HIERARCHY, backendPolicy.ROLE_HIERARCHY)
assert.deepEqual(sorted(PERMISSION_VALUES), sorted(backendPolicy.PERMISSIONS))
assert.deepEqual(sorted(FRONTEND_FORBIDDEN_PERMISSIONS), sorted(backendPolicy.CUSTOM_ROLE_FORBIDDEN_PERMISSIONS))

for (const role of expectedRoles) {
  assert.deepEqual(
    sorted(FRONTEND_ROLE_PERMISSIONS[role]),
    sorted(backendPolicy.ROLE_PERMISSIONS[role]),
    'System Role permissions drifted for ' + role,
  )
}

const rules = await readFile('firestore.rules', 'utf8')
const authSource = await readFile('functions/src/auth.js', 'utf8')
assert.match(authSource, /function canDelegateCustomRole/)
assert.match(authSource, /isDelegationWithinScope\(actor\.authorization\.permissions, role\.permissions\)/)
const customPermissionBlock = rules.match(/function isCustomPermission\(permission\)\s*\{[\s\S]*?return permission in \[([\s\S]*?)\]\s*;/)
assert.ok(customPermissionBlock, 'Firestore Rules custom permission catalog was not found')
const rulesCustomPermissions = [...customPermissionBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
const expectedCustomPermissions = backendPolicy.PERMISSIONS
  .filter((permission) => !backendPolicy.FORBIDDEN_CUSTOM_PERMISSION_SET.has(permission))
assert.deepEqual(
  sorted(rulesCustomPermissions),
  sorted(expectedCustomPermissions),
  'Firestore Rules custom permission catalog drifted from backend policy',
)

const systemRoleBlock = rules.match(/function isSystemRoleId\(roleId\)\s*\{[\s\S]*?return ([\s\S]*?);\s*\}/)
assert.ok(systemRoleBlock, 'Firestore Rules System Role catalog was not found')
const rulesSystemRoles = [...systemRoleBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
assert.deepEqual(sorted(rulesSystemRoles), sorted(expectedRoles), 'Firestore Rules System Role catalog drifted')

const newsRole = {
  id: 'NEWS_EDITOR',
  type: 'CUSTOM',
  status: 'active',
  permissions: ['news.create', 'news.publish'],
}
const adminPermissions = backendPolicy.ROLE_PERMISSIONS.ADMIN
assert.equal(canDelegate(adminPermissions, newsRole, 'assign'), true)
assert.equal(canManageRole({ claims: { systemRole: SYSTEM_ROLES.ADMIN } }, newsRole, 'assign'), true)
assert.equal(getEffectivePermissions(
  { systemRole: SYSTEM_ROLES.USER, customRoles: ['NEWS_EDITOR'] },
  { NEWS_EDITOR: newsRole },
).includes('news.publish'), true)

// Having the business permission is not delegation authority.
assert.equal(canDelegate(['news.create'], newsRole, 'assign'), false)
assert.equal(canDelegate(['roles.assign'], newsRole, 'assign'), false)
assert.equal(canDelegate(['news.create'], newsRole, 'assign'), false)

// Delegation is limited to the actor's effective permission scope.
const examRole = {
  ...newsRole,
  id: 'EXAM_EDITOR',
  permissions: ['quiz.exam.publish'],
}
assert.equal(canDelegate(adminPermissions, examRole, 'assign'), false)
assert.equal(canDelegate(backendPolicy.ROLE_PERMISSIONS.SUPER_ADMIN, newsRole, 'assign'), true)

// ROOT is still the highest trust boundary, but malformed/forbidden roles are
// rejected by the helper before the Root shortcut can apply.
const root = actor(SYSTEM_ROLES.ROOT_ADMIN, backendPolicy.ROLE_PERMISSIONS.ROOT_ADMIN)
assert.equal(canDelegate(root.authorization.permissions, newsRole, 'assign'), true)
assert.equal(canDelegate(root.authorization.permissions, { ...newsRole, permissions: ['roles.assign'] }, 'assign'), false)
assert.equal(canDelegate(root.authorization.permissions, newsRole, 'update'), false)

// Server-side System Role boundary is independent from permission count.
assert.equal(backendPolicy.ASSIGNABLE_SYSTEM_ROLES.includes(SYSTEM_ROLES.ROOT_ADMIN), false)
assert.equal(backendPolicy.ASSIGNABLE_SYSTEM_ROLES.includes(SYSTEM_ROLES.SUPER_ADMIN), true)

console.log('Policy conformance PASS: frontend/backend catalogs, role matrix, Firestore Rules allowlist, effective permissions, delegation scope and Root/System Role boundaries agree.')
