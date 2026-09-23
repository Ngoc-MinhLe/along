import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS, PERMISSION_VALUES } from '../services/rbac/permissions'
import { canManageUserRole, getEffectivePermissions, getSystemRole, ROLE_PERMISSIONS } from '../services/rbac/policy'
import { ROLE_HIERARCHY, SYSTEM_ROLES } from '../services/rbac/roles'
import { listCustomRoles, listUsers } from '../services/rbac/firestore'
import { assignCustomRole, revokeCustomRole } from '../services/rbac/functions'

const PAGE_SIZE = 25
const STATUS_OPTIONS = ['active', 'suspended', 'deletion_requested', 'deleted']
const SORT_OPTIONS = [
  ['name', 'Name'],
  ['email', 'Email'],
  ['createdAt', 'Created At'],
  ['lastLoginAt', 'Last Login'],
  ['systemRole', 'System Role'],
]
const GROUP_LABELS = Object.freeze({ users: 'Users', roles: 'Roles', calendar: 'Calendar', news: 'News', quiz: 'Quiz', approval: 'Approval', audit: 'Audit' })

function formatDate(value) {
  if (!value) return '—'
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN')
}

function dateValue(value) {
  if (!value) return 0
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function initials(user) {
  return (user.displayName || user.email || user.uid || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function roleLabel(role) {
  return role?.name || role?.id || 'Unknown Role'
}

function permissionGroups(permissions) {
  return permissions.reduce((groups, permission) => {
    const key = permission.split('.')[0]
    const group = groups.find((item) => item.key === key)
    if (group) group.permissions.push(permission)
    else groups.push({ key, label: GROUP_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1), permissions: [permission] })
    return groups
  }, [])
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const { actor, hasPermission } = usePermissions()
  const canAssign = hasPermission(PERMISSIONS.ROLES_ASSIGN)
  const canRevoke = hasPermission(PERMISSIONS.ROLES_REVOKE)
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [roleToAssign, setRoleToAssign] = useState('')
  const [search, setSearch] = useState('')
  const [systemRoleFilter, setSystemRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [customRoleFilter, setCustomRoleFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revokeTarget, setRevokeTarget] = useState(null)

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [nextUsers, nextRoles] = await Promise.all([listUsers(), listCustomRoles()])
      setUsers(nextUsers)
      setRoles(nextRoles)
      setSelectedId((current) => nextUsers.some((item) => item.id === current) ? current : '')
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const roleMap = useMemo(() => Object.fromEntries(roles.map((role) => [role.id, role])), [roles])
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter((item) => {
      const searchable = [item.displayName, item.email, item.uid, item.id].filter(Boolean).join(' ').toLowerCase()
      const matchesSearch = !query || searchable.includes(query)
      const matchesSystemRole = !systemRoleFilter || getSystemRole(item) === systemRoleFilter
      const matchesStatus = !statusFilter || (item.status || 'active') === statusFilter
      const matchesCustomRole = !customRoleFilter || (item.customRoles || []).includes(customRoleFilter)
      return matchesSearch && matchesSystemRole && matchesStatus && matchesCustomRole
    }).sort((left, right) => {
      let comparison = 0
      if (sortBy === 'name') comparison = (left.displayName || '').localeCompare(right.displayName || '', 'vi')
      else if (sortBy === 'email') comparison = (left.email || '').localeCompare(right.email || '')
      else if (sortBy === 'systemRole') comparison = ROLE_HIERARCHY.indexOf(getSystemRole(left)) - ROLE_HIERARCHY.indexOf(getSystemRole(right))
      else comparison = dateValue(left[sortBy]) - dateValue(right[sortBy])
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [users, search, systemRoleFilter, statusFilter, customRoleFilter, sortBy, sortDirection])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const pageUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selected = users.find((item) => item.id === selectedId) || null
  const activeRoles = roles.filter((role) => role.status === 'active')
  const selectedAssignedRoles = selected?.customRoles || []
  const availableRoles = activeRoles.filter((role) => !selectedAssignedRoles.includes(role.id))

  function updateFilter(setter, value) {
    setter(value)
    setPage(1)
  }

  function selectUser(id) {
    setSelectedId(id)
    setRoleToAssign('')
    setError('')
    setMessage('')
  }

  async function mutateCustomRole(action, roleId) {
    const requiredPermission = action === 'assign' ? PERMISSIONS.ROLES_ASSIGN : PERMISSIONS.ROLES_REVOKE
    if (!hasPermission(requiredPermission)) {
      setError(`Bạn không có quyền ${requiredPermission}.`)
      return false
    }
    if (!selected || isProtectedTarget(selected, currentUser)) return false
    if (!canManageUserRole(actor, selected, roleId, roleMap, action)) {
      setError('Policy không cho phép thay đổi Custom Role này.')
      return false
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (action === 'assign') await assignCustomRole(selected.id, roleId)
      else await revokeCustomRole(selected.id, roleId)
      await loadData()
      setMessage(action === 'assign' ? 'Đã gán Custom Role.' : 'Đã thu hồi Custom Role.')
      return true
    } catch (mutationError) {
      setError(mutationError.code === 'permission-denied' ? 'Bạn không có quyền thay đổi Custom Role của người dùng này.' : mutationError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return
    const success = await mutateCustomRole('revoke', revokeTarget.roleId)
    if (success) setRevokeTarget(null)
  }

  return <section className="admin-users-page">
    <div className="admin-card admin-users-toolbar">
      <div className="admin-section-heading"><div><h3>Người dùng</h3><p>Quản lý hồ sơ, Custom Role và Effective Permissions. System Role chỉ đọc.</p></div><span className="admin-readonly">{filteredUsers.length} users</span></div>
      <div className="user-list-filters">
        <input value={search} onChange={(event) => updateFilter(setSearch, event.target.value)} placeholder="Tìm kiếm người dùng..." aria-label="Tìm kiếm người dùng" />
        <select value={systemRoleFilter} onChange={(event) => updateFilter(setSystemRoleFilter, event.target.value)} aria-label="Lọc System Role"><option value="">System Role: Tất cả</option>{[...ROLE_HIERARCHY].reverse().map((role) => <option key={role} value={role}>{role}</option>)}</select>
        <select value={statusFilter} onChange={(event) => updateFilter(setStatusFilter, event.target.value)} aria-label="Lọc trạng thái"><option value="">Status: Tất cả</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select>
        <select value={customRoleFilter} onChange={(event) => updateFilter(setCustomRoleFilter, event.target.value)} aria-label="Lọc Custom Role"><option value="">Custom Role: Tất cả</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name} ({role.status})</option>)}</select>
        <select value={sortBy} onChange={(event) => updateFilter(setSortBy, event.target.value)} aria-label="Sắp xếp"><option value="name">Sort: Name</option>{SORT_OPTIONS.slice(1).map(([value, label]) => <option key={value} value={value}>Sort: {label}</option>)}</select>
        <button type="button" className="admin-secondary-button sort-direction-button" onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')} aria-label="Đổi chiều sắp xếp">{sortDirection === 'asc' ? '↑' : '↓'}</button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p className="admin-success" role="status">{message}</p>}
    </div>

    <div className="admin-card user-table-card">
      {loading ? <p className="admin-muted">Đang tải người dùng…</p> : !users.length ? <p className="admin-muted">Chưa có người dùng.</p> : !filteredUsers.length ? <p className="admin-muted">Không tìm thấy người dùng phù hợp.</p> : <>
        <div className="user-table-scroll"><table className="user-management-table"><thead><tr><th>User</th><th>System Role</th><th>Custom Roles</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead><tbody>{pageUsers.map((item) => <UserRow key={item.id} user={item} roleMap={roleMap} onSelect={selectUser} />)}</tbody></table></div>
        <div className="user-pagination"><span>Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredUsers.length)} / {filteredUsers.length}</span><div><button type="button" className="admin-secondary-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Trước</button><span>Trang {page}/{totalPages}</span><button type="button" className="admin-secondary-button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Sau</button></div></div>
      </>}
    </div>

    {selected && <UserDrawer user={selected} roleMap={roleMap} activeRoles={availableRoles} roleToAssign={roleToAssign} setRoleToAssign={setRoleToAssign} currentUser={currentUser} busy={busy} canAssign={canAssign} canRevoke={canRevoke} onClose={() => setSelectedId('')} onAssign={() => { mutateCustomRole('assign', roleToAssign); setRoleToAssign('') }} onRevoke={(roleId) => setRevokeTarget({ user: selected, roleId })} />}
    {revokeTarget && <RevokeModal target={revokeTarget} roleMap={roleMap} busy={busy} onCancel={() => setRevokeTarget(null)} onConfirm={confirmRevoke} />}
  </section>
}

function UserRow({ user, roleMap, onSelect }) {
  const systemRole = getSystemRole(user)
  const isRoot = isRootUser(user)
  return <tr className="user-table-row" onClick={() => onSelect(user.id)}>
    <td><div className="user-table-identity">{user.photoURL ? <img src={user.photoURL} alt="" /> : <span className="user-avatar-fallback">{initials(user)}</span>}<div><strong>{user.displayName || 'Chưa có tên'}</strong><small>{user.email || user.id}</small></div></div></td>
    <td><span className={`system-role-badge ${isRoot ? 'root' : ''}`}>{systemRole}</span>{isRoot && <small className="root-protected-label">🔒 ROOT PROTECTED</small>}</td>
    <td><div className="table-role-badges">{(user.customRoles || []).length ? user.customRoles.map((roleId) => <span className={`custom-role-badge ${roleMap[roleId]?.status === 'disabled' ? 'disabled' : ''}`} key={roleId}>{roleMap[roleId]?.id || roleId}</span>) : <small>—</small>}</div></td>
    <td><span className={`user-status-badge ${user.status || 'active'}`}>{user.status || 'active'}</span></td>
    <td>{formatDate(user.lastLoginAt)}</td>
    <td><button type="button" className="admin-secondary-button" onClick={(event) => { event.stopPropagation(); onSelect(user.id) }}>Xem chi tiết</button></td>
  </tr>
}

function UserDrawer({ user, roleMap, activeRoles, roleToAssign, setRoleToAssign, currentUser, busy, canAssign, canRevoke, onClose, onAssign, onRevoke }) {
  const systemRole = getSystemRole(user)
  const trustedRoleManagement = false
  const rootTarget = isRootUser(user)
  const protectedTarget = isProtectedTarget(user, currentUser)
  const effectivePermissions = getEffectivePermissions(user, roleMap)
  const sourceMap = buildPermissionSources(user, roleMap)
  const assignedRoles = (user.customRoles || []).map((roleId) => ({ id: roleId, role: roleMap[roleId] })).filter(({ role }) => role)
  return <div className="user-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="user-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="user-detail-title">
      <div className="drawer-header"><div><h3 id="user-detail-title">Chi tiết người dùng</h3><p>{user.email || user.uid}</p></div><button type="button" className="drawer-close-button" onClick={onClose} aria-label="Đóng">×</button></div>
      <section className="drawer-section"><h4>Thông tin người dùng</h4><div className="drawer-profile-heading">{user.photoURL ? <img src={user.photoURL} alt="" /> : <span className="user-avatar-fallback large">{initials(user)}</span>}<div><strong>{user.displayName || 'Chưa có tên'}</strong><small>{user.email || '—'}</small></div></div><dl className="user-detail-meta"><div><dt>UID</dt><dd>{user.uid || user.id}</dd></div><div><dt>Status</dt><dd>{user.status || 'active'}</dd></div><div><dt>Created At</dt><dd>{formatDate(user.createdAt)}</dd></div><div><dt>Last Login</dt><dd>{formatDate(user.lastLoginAt)}</dd></div></dl></section>
      <section className="drawer-section"><h4>System Role</h4><div className={`drawer-system-role ${rootTarget ? 'root' : ''}`}><span className="system-role-badge">{systemRole}</span><strong>{rootTarget ? '🔒 ROOT PROTECTED' : 'READ ONLY'}</strong></div><p className="drawer-note">System Role và status không được chỉnh sửa trên browser.</p></section>
      <section className="drawer-section"><h4>Custom Roles</h4><div className="drawer-assigned-roles">{assignedRoles.length ? assignedRoles.map(({ id, role }) => <div className="drawer-role-item" key={id}><div><strong>{roleLabel(role)}</strong><span className={role.status === 'disabled' ? 'disabled-text' : ''}>{role.status} · {(role.permissions || []).length} quyền</span></div>{canRevoke && <button type="button" onClick={() => onRevoke(id)} disabled={busy || protectedTarget}>Thu hồi</button>}</div>) : <p className="admin-muted">Chưa có Custom Role.</p>}</div>{canAssign && <div className="drawer-assign-row"><select value={roleToAssign} onChange={(event) => setRoleToAssign(event.target.value)} disabled={busy || protectedTarget}><option value="">Chọn Custom Role active</option>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name} ({role.id})</option>)}</select><button type="button" className="admin-primary-button" onClick={onAssign} disabled={!roleToAssign || busy || protectedTarget}>+ Gán</button></div>}{!canAssign && !canRevoke && <p className="drawer-note">{trustedRoleManagement ? 'Gán/thu hồi role phải chạy qua trusted Admin SDK tool để đồng bộ authorization.' : 'Custom Roles chỉ đọc với tài khoản hiện tại.'}</p>}{protectedTarget && <p className="admin-warning">{rootTarget ? 'ROOT được bảo vệ, không thể quản lý Custom Role trên browser.' : 'Không thể tự thay đổi Custom Role của chính mình.'}</p>}</section>
      <section className="drawer-section"><h4>Effective Permissions <small>{effectivePermissions.length} quyền</small></h4>{effectivePermissions.length ? <div className="effective-permission-groups">{permissionGroups(effectivePermissions).map((group) => <div key={group.key}><strong>{group.label}</strong>{group.permissions.map((permission) => <div className="effective-permission-row" key={permission}><span>{permission}</span><div>{sourceMap[permission]?.system && <em className="permission-source system">SYSTEM</em>}{sourceMap[permission]?.custom?.map((roleId) => <em className="permission-source custom" key={roleId}>CUSTOM · {roleMap[roleId]?.id || roleId}</em>)}</div></div>)}</div>)}</div> : <p className="admin-muted">Không có quyền hiệu lực.</p>}</section>
    </aside>
  </div>
}

function RevokeModal({ target, roleMap, busy, onCancel, onConfirm }) {
  return <div className="role-modal-backdrop" role="presentation"><div className="role-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="revoke-role-title"><h3 id="revoke-role-title">Thu hồi Custom Role?</h3><p>Bạn có chắc muốn thu hồi Custom Role này?</p><dl className="revoke-summary"><div><dt>User</dt><dd>{target.user.email || target.user.uid}</dd></div><div><dt>Role</dt><dd>{roleLabel(roleMap[target.roleId])}</dd></div></dl><div className="admin-form-actions"><button className="admin-secondary-button" type="button" onClick={onCancel} disabled={busy}>Hủy</button><button className="admin-danger-button" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Đang thu hồi…' : 'Thu hồi'}</button></div></div></div>
}

function isRootUser(user) {
  return getSystemRole(user) === SYSTEM_ROLES.ROOT_ADMIN
}

function isProtectedTarget(user, currentUser) {
  return isRootUser(user) || user?.id === currentUser?.uid
}

function buildPermissionSources(user, roleMap) {
  const sourceMap = Object.fromEntries(PERMISSION_VALUES.map((permission) => [permission, { system: false, custom: [] }]))
  const systemRole = getSystemRole(user)
  ;(ROLE_PERMISSIONS[systemRole] || []).forEach((permission) => { if (sourceMap[permission]) sourceMap[permission].system = true })
  ;(user.customRoles || []).forEach((roleId) => {
    const role = roleMap[roleId]
    if (role?.type !== 'CUSTOM' || role.status !== 'active') return
    ;(role.permissions || []).filter((permission) => sourceMap[permission]).forEach((permission) => { sourceMap[permission].custom.push(roleId) })
  })
  return sourceMap
}
