const SYSTEM_ROLES = Object.freeze({
  USER: 'USER',
  EDITOR: 'EDITOR',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  ROOT_ADMIN: 'ROOT_ADMIN',
})

const SYSTEM_ROLE_SET = new Set(Object.values(SYSTEM_ROLES))

const ROLE_HIERARCHY = Object.freeze([
  SYSTEM_ROLES.USER,
  SYSTEM_ROLES.EDITOR,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.SUPER_ADMIN,
  SYSTEM_ROLES.ROOT_ADMIN,
])

const PERMISSIONS = Object.freeze([
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'roles.read',
  'roles.create',
  'roles.update',
  'roles.disable',
  'roles.delete',
  'roles.assign',
  'roles.revoke',
  'calendar.search',
  'calendar.export',
  'calendar.import',
  'news.read',
  'news.create',
  'news.update',
  'news.delete',
  'news.publish',
  'quiz.question.read',
  'quiz.question.create',
  'quiz.question.update',
  'quiz.question.delete',
  'quiz.exam.create',
  'quiz.exam.update',
  'quiz.exam.publish',
  'quiz.exam.delete',
  'approval.create',
  'approval.review',
  'audit.read',
])

const PERMISSION_SET = new Set(PERMISSIONS)

const CUSTOM_ROLE_FORBIDDEN_PERMISSIONS = Object.freeze([
  'users.delete',
  'roles.create',
  'roles.update',
  'roles.disable',
  'roles.delete',
  'roles.assign',
  'roles.revoke',
])

const FORBIDDEN_CUSTOM_PERMISSION_SET = new Set(CUSTOM_ROLE_FORBIDDEN_PERMISSIONS)

const ROLE_PERMISSIONS = Object.freeze({
  USER: ['calendar.search', 'calendar.export'],
  EDITOR: [
    'calendar.search', 'calendar.export',
    'news.read', 'news.create', 'news.update', 'news.delete', 'news.publish',
    'quiz.question.read', 'quiz.question.create', 'quiz.question.update', 'quiz.question.delete',
  ],
  ADMIN: [
    'calendar.search', 'calendar.export', 'calendar.import',
    'users.read', 'roles.read', 'roles.assign', 'roles.revoke',
    'news.read', 'news.create', 'news.update', 'news.delete', 'news.publish',
    'quiz.question.read', 'quiz.question.create', 'quiz.question.update', 'quiz.question.delete',
  ],
  SUPER_ADMIN: PERMISSIONS,
  ROOT_ADMIN: PERMISSIONS,
})

const ASSIGNABLE_SYSTEM_ROLES = Object.freeze([
  SYSTEM_ROLES.USER,
  SYSTEM_ROLES.EDITOR,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.SUPER_ADMIN,
])

const DELEGATION_ACTIONS = Object.freeze(['assign', 'revoke'])

function isSystemRole(value) {
  return typeof value === 'string' && SYSTEM_ROLE_SET.has(value)
}

function isKnownPermission(value) {
  return typeof value === 'string' && PERMISSION_SET.has(value)
}

function isValidCustomRolePermission(value) {
  return isKnownPermission(value) && !FORBIDDEN_CUSTOM_PERMISSION_SET.has(value)
}

function isDelegationWithinScope(actorPermissions, targetPermissions) {
  if (!Array.isArray(actorPermissions) || !Array.isArray(targetPermissions)) return false
  if (!targetPermissions.every(isValidCustomRolePermission)) return false
  const actorPermissionSet = new Set(actorPermissions)
  return targetPermissions.every((permission) => actorPermissionSet.has(permission))
}

module.exports = {
  SYSTEM_ROLES,
  SYSTEM_ROLE_SET,
  ROLE_HIERARCHY,
  PERMISSIONS,
  PERMISSION_SET,
  CUSTOM_ROLE_FORBIDDEN_PERMISSIONS,
  FORBIDDEN_CUSTOM_PERMISSION_SET,
  ROLE_PERMISSIONS,
  ASSIGNABLE_SYSTEM_ROLES,
  DELEGATION_ACTIONS,
  isSystemRole,
  isKnownPermission,
  isValidCustomRolePermission,
  isDelegationWithinScope,
}
