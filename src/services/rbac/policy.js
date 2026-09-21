import { SYSTEM_ROLES } from './roles'
import { PERMISSIONS } from './permissions'

// This catalog is for UI and trusted-service policy composition only.
// Firestore Rules and Admin SDK remain the security boundary.
export const ROLE_PERMISSIONS = Object.freeze({
  [SYSTEM_ROLES.USER]: [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT],
  [SYSTEM_ROLES.EDITOR]: [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT],
  [SYSTEM_ROLES.ADMIN]: [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT, PERMISSIONS.CALENDAR_IMPORT],
  [SYSTEM_ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [SYSTEM_ROLES.ROOT_ADMIN]: Object.values(PERMISSIONS),
})

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false
}
