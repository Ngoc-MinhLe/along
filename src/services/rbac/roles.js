export const SYSTEM_ROLES = Object.freeze({
  ROOT_ADMIN: 'ROOT_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  USER: 'USER',
})

export const ROLE_HIERARCHY = Object.freeze([
  SYSTEM_ROLES.USER,
  SYSTEM_ROLES.EDITOR,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.SUPER_ADMIN,
  SYSTEM_ROLES.ROOT_ADMIN,
])

export function isSystemRole(value) {
  return ROLE_HIERARCHY.includes(value)
}

export function hasMinimumRole(currentRole, requiredRole) {
  return ROLE_HIERARCHY.indexOf(currentRole) >= ROLE_HIERARCHY.indexOf(requiredRole)
}
