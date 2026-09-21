import { PERMISSION_VALUES, PERMISSIONS, isKnownPermission } from './permissions.js'
import { ROLE_HIERARCHY, SYSTEM_ROLES, hasMinimumRole, isSystemRole } from './roles.js'

const contentPermissions = [
  PERMISSIONS.NEWS_READ, PERMISSIONS.NEWS_CREATE, PERMISSIONS.NEWS_UPDATE,
  PERMISSIONS.NEWS_DELETE, PERMISSIONS.NEWS_PUBLISH,
  PERMISSIONS.QUIZ_QUESTION_READ, PERMISSIONS.QUIZ_QUESTION_CREATE,
  PERMISSIONS.QUIZ_QUESTION_UPDATE, PERMISSIONS.QUIZ_QUESTION_DELETE,
]

export const ROLE_PERMISSIONS = Object.freeze({
  [SYSTEM_ROLES.USER]: [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT],
  [SYSTEM_ROLES.EDITOR]: [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT, ...contentPermissions],
  [SYSTEM_ROLES.ADMIN]: [
    PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT, PERMISSIONS.CALENDAR_IMPORT,
    PERMISSIONS.USERS_READ, PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_ASSIGN, PERMISSIONS.ROLES_REVOKE,
    ...contentPermissions,
  ],
  [SYSTEM_ROLES.SUPER_ADMIN]: PERMISSION_VALUES,
  [SYSTEM_ROLES.ROOT_ADMIN]: PERMISSION_VALUES,
})

// Calendar lookup is intentionally public. Other capabilities always require
// an authenticated actor whose System Role/Custom Roles grant the permission.
export const PUBLIC_PERMISSIONS = Object.freeze([PERMISSIONS.CALENDAR_SEARCH])

export const CUSTOM_ROLE_SCHEMA = Object.freeze({ type: 'CUSTOM', statuses: ['active', 'disabled'] })
export const CUSTOM_ROLE_FORBIDDEN_PERMISSIONS = Object.freeze([
  PERMISSIONS.USERS_DELETE,
  PERMISSIONS.ROLES_CREATE,
  PERMISSIONS.ROLES_UPDATE,
  PERMISSIONS.ROLES_DISABLE,
  PERMISSIONS.ROLES_DELETE,
  PERMISSIONS.ROLES_ASSIGN,
  PERMISSIONS.ROLES_REVOKE,
])

export function getSystemRole(user) {
  return user?.claims?.systemRole || user?.systemRole || SYSTEM_ROLES.USER
}

export function getCustomRoleIds(user) {
  return Array.isArray(user?.customRoles) ? user.customRoles : []
}

export function getEffectiveRoles(user, roleMap = {}) {
  const systemRole = getSystemRole(user)
  const customRoles = getCustomRoleIds(user)
    .map((roleId) => roleMap[roleId])
    .filter((role) => role?.type === 'CUSTOM' && role.status === 'active')
  return { systemRole, customRoles }
}

export function getEffectivePermissions(user, roleMap = {}) {
  if (!user) return [...PUBLIC_PERMISSIONS]
  const { systemRole, customRoles } = getEffectiveRoles(user, roleMap)
  const permissions = new Set(ROLE_PERMISSIONS[systemRole] || ROLE_PERMISSIONS[SYSTEM_ROLES.USER])
  customRoles.forEach((role) => role.permissions
    ?.filter((permission) => isKnownPermission(permission))
    .forEach((permission) => permissions.add(permission)))
  return [...permissions]
}

export function hasPermission(user, permission, roleMap = {}) {
  return getEffectivePermissions(user, roleMap).includes(permission)
}

export function hasAnyPermission(user, permissions, roleMap = {}) {
  const effectivePermissions = new Set(getEffectivePermissions(user, roleMap))
  return permissions.some((permission) => effectivePermissions.has(permission))
}

export function hasAllPermissions(user, permissions, roleMap = {}) {
  const effectivePermissions = new Set(getEffectivePermissions(user, roleMap))
  return permissions.every((permission) => effectivePermissions.has(permission))
}

export function canManageRole(actor, targetRole, action = 'update', roleMap = {}) {
  const actorRole = getSystemRole(actor)
  if (actorRole === SYSTEM_ROLES.ROOT_ADMIN) return true
  if (!hasPermission(actor, `roles.${action}`, roleMap)) return false
  if (!targetRole || targetRole.type !== 'CUSTOM') return false
  return (targetRole.permissions || []).every((permission) => hasPermission(actor, permission, roleMap))
}

export function canAssignSystemRole(actor, targetRole, currentTargetRole = SYSTEM_ROLES.USER) {
  const actorRole = getSystemRole(actor)
  if (!isSystemRole(targetRole) || targetRole === SYSTEM_ROLES.ROOT_ADMIN) return false
  if (actorRole === SYSTEM_ROLES.ROOT_ADMIN) return true
  if (!isSystemRole(currentTargetRole) || currentTargetRole === SYSTEM_ROLES.ROOT_ADMIN) return false
  return hasMinimumRole(actorRole, currentTargetRole)
    && actorRole !== currentTargetRole
    && hasMinimumRole(actorRole, targetRole)
    && actorRole !== targetRole
}

export function validateCustomRole(role) {
  const errors = []
  if (!role?.id || !/^[A-Z][A-Z0-9_]{2,63}$/.test(role.id)) errors.push('Role ID phải là chữ in hoa, tối đa 64 ký tự.')
  if (isSystemRole(role?.id)) errors.push('Không thể tạo Custom Role trùng System Role.')
  if (role?.type !== 'CUSTOM') errors.push('Custom Role phải có type = CUSTOM.')
  if (!['active', 'disabled'].includes(role?.status)) errors.push('Status phải là active hoặc disabled.')
  if (!Array.isArray(role?.permissions)) errors.push('permissions phải là một mảng.')
  if (Array.isArray(role?.permissions)) {
    const invalid = role.permissions.filter((permission) => !isKnownPermission(permission))
    if (invalid.length) errors.push(`Permission không hợp lệ: ${invalid.join(', ')}`)
    const forbidden = role.permissions.filter((permission) => CUSTOM_ROLE_FORBIDDEN_PERMISSIONS.includes(permission))
    if (forbidden.length) errors.push(`Custom Role không được chứa permission quản trị nhạy cảm: ${forbidden.join(', ')}`)
  }
  return errors
}

export function canManageUserRole(actor, targetUser, targetRole, roleMap = {}, action = 'assign') {
  if (targetUser?.claims?.systemRole === SYSTEM_ROLES.ROOT_ADMIN || targetUser?.systemRole === SYSTEM_ROLES.ROOT_ADMIN) return false
  if (isSystemRole(targetRole)) return canAssignSystemRole(actor, targetRole, getSystemRole(targetUser))
  const role = roleMap[targetRole]
  const roleCanBeChanged = action === 'revoke' || role?.status === 'active'
  return Boolean(role && roleCanBeChanged && canManageRole(actor, role, action, roleMap))
}

export { ROLE_HIERARCHY }
