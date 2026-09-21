import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getEffectivePermissions } from '../services/rbac/policy'
import { assignCustomRole, listCustomRoles, listUsers, revokeCustomRole } from '../services/rbac/firestore'

function formatDate(value) {
  if (!value) return '—'
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN')
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [roleToAssign, setRoleToAssign] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [nextUsers, nextRoles] = await Promise.all([listUsers(), listCustomRoles()])
      setUsers(nextUsers)
      setRoles(nextRoles)
      setSelectedId((current) => nextUsers.some((item) => item.id === current) ? current : nextUsers[0]?.id || '')
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const selected = users.find((item) => item.id === selectedId) || null
  const roleMap = useMemo(() => Object.fromEntries(roles.map((role) => [role.id, role])), [roles])
  const effectivePermissions = selected
    ? getEffectivePermissions({ ...selected, customRoles: selected.customRoles || [] }, roleMap)
    : []
  const activeRoles = roles.filter((role) => role.status === 'active')
  const availableRoles = activeRoles.filter((role) => !(selected?.customRoles || []).includes(role.id))
  const isSelf = selected?.id === currentUser?.uid
  const isRootTarget = selected?.systemRole === 'ROOT_ADMIN'

  async function mutateCustomRole(action, roleId) {
    if (!selected || isSelf) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (action === 'assign') await assignCustomRole(selected.id, roleId)
      else await revokeCustomRole(selected.id, roleId)
      setMessage(action === 'assign' ? 'Đã gán Custom Role.' : 'Đã thu hồi Custom Role.')
      await loadData()
    } catch (mutationError) {
      setError(mutationError.code === 'permission-denied'
        ? 'Bạn không có quyền thay đổi Custom Role của người dùng này.'
        : mutationError.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="admin-user-layout">
    <div className="admin-card admin-user-list">
      <div className="admin-section-heading"><div><h3>Người dùng</h3><p>System Role đang ở chế độ chỉ đọc; Custom Role vẫn được quản lý theo policy hiện tại.</p></div></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p className="admin-success" role="status">{message}</p>}
      {loading
        ? <p className="admin-muted">Đang tải người dùng…</p>
        : <div className="admin-users-table">{users.map((item) => <button className={item.id === selectedId ? 'admin-user-row selected' : 'admin-user-row'} key={item.id} type="button" onClick={() => setSelectedId(item.id)}><strong>{item.displayName || 'Chưa có tên'}</strong><span>{item.email || item.id}</span><em>{item.systemRole || 'USER'}</em></button>)}</div>}
    </div>
    {selected && <UserDetail
      user={selected}
      roleMap={roleMap}
      effectivePermissions={effectivePermissions}
      activeRoles={availableRoles}
      roleToAssign={roleToAssign}
      setRoleToAssign={setRoleToAssign}
      onMutate={mutateCustomRole}
      busy={busy}
      isSelf={isSelf}
      isRootTarget={isRootTarget}
    />}
  </section>
}

function UserDetail({ user, roleMap, effectivePermissions, activeRoles, roleToAssign, setRoleToAssign, onMutate, busy, isSelf, isRootTarget }) {
  const systemRole = user.systemRole || 'USER'
  return <aside className="admin-card admin-user-detail">
    <div className="admin-section-heading"><div><h3>{user.displayName || 'Người dùng'}</h3><p>{user.email || 'Không có email'}</p></div><span className="admin-role-badge">{systemRole}</span></div>
    <dl className="admin-user-meta"><div><dt>UID</dt><dd>{user.id}</dd></div><div><dt>Status</dt><dd>{user.status || 'active'}</dd></div><div><dt>Created at</dt><dd>{formatDate(user.createdAt)}</dd></div><div><dt>Last login</dt><dd>{formatDate(user.lastLoginAt)}</dd></div><div><dt>Custom Roles</dt><dd>{(user.customRoles || []).length || 0}</dd></div></dl>

    <h4>System Role</h4>
    <div className={`system-role-readonly${isRootTarget ? ' system-role-locked' : ''}`}>
      <div><strong>{systemRole}</strong><small>{isRootTarget ? 'LOCKED · ROOT PROTECTED' : 'READ ONLY'}</small></div>
      <span>{isRootTarget
        ? 'ROOT_ADMIN không thể bị sửa, hạ quyền hoặc chuyển giao.'
        : 'System Role mutation requires trusted backend for claims synchronization.'}</span>
    </div>

    <h4>Custom Roles</h4>
    <div className="assigned-role-list">{(user.customRoles || []).map((roleId) => <span key={roleId}>{roleMap[roleId]?.name || roleId}<button type="button" onClick={() => onMutate('revoke', roleId)} disabled={busy || isSelf} aria-label={`Thu hồi ${roleId}`}>×</button></span>)}{!user.customRoles?.length && <small>Chưa có Custom Role.</small>}</div>
    <div className="assign-role-row"><select value={roleToAssign} onChange={(event) => setRoleToAssign(event.target.value)} disabled={busy || isSelf}><option value="">Chọn Custom Role active</option>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name} ({role.id})</option>)}</select><button className="admin-primary-button" type="button" onClick={() => { onMutate('assign', roleToAssign); setRoleToAssign('') }} disabled={!roleToAssign || busy || isSelf}>Gán role</button></div>
    {isSelf && <p className="admin-warning">Không thể tự gán hoặc thu hồi role cho chính tài khoản đang đăng nhập.</p>}

    <h4>Effective Permissions</h4>
    <div className="permission-grid">{effectivePermissions.map((permission) => <span key={permission}>{permission}</span>)}</div>
  </aside>
}
