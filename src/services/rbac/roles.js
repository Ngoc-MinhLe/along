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

// Display metadata only. This does not participate in role authorization.
export const SYSTEM_ROLE_METADATA = Object.freeze({
  [SYSTEM_ROLES.USER]: {
    key: SYSTEM_ROLES.USER,
    name: 'Người dùng',
    description: 'Vai trò cơ bản, chỉ có các quyền nền tảng được policy cấp.',
  },
  [SYSTEM_ROLES.EDITOR]: {
    key: SYSTEM_ROLES.EDITOR,
    name: 'Biên tập viên',
    description: 'Có thể thực hiện các nghiệp vụ nội dung được policy cho phép.',
  },
  [SYSTEM_ROLES.ADMIN]: {
    key: SYSTEM_ROLES.ADMIN,
    name: 'Quản trị viên',
    description: 'Quản trị trong phạm vi permission được cấp; không được thay đổi System Role.',
  },
  [SYSTEM_ROLES.SUPER_ADMIN]: {
    key: SYSTEM_ROLES.SUPER_ADMIN,
    name: 'Quản trị cấp cao',
    description: 'Có tập permission rộng nhưng không vượt qua Root trust boundary.',
  },
  [SYSTEM_ROLES.ROOT_ADMIN]: {
    key: SYSTEM_ROLES.ROOT_ADMIN,
    name: 'Quản trị tối cao',
    description: 'Vai trò cao nhất, được phép thực hiện thao tác quản trị System Role theo policy.',
  },
})

export function getSystemRoleMetadata(role) {
  return SYSTEM_ROLE_METADATA[role] || {
    key: role,
    name: role || 'Unknown Role',
    description: 'System Role không có trong hierarchy hiện tại.',
  }
}

export function isSystemRole(value) {
  return ROLE_HIERARCHY.includes(value)
}

export function hasMinimumRole(currentRole, requiredRole) {
  return ROLE_HIERARCHY.indexOf(currentRole) >= ROLE_HIERARCHY.indexOf(requiredRole)
}
