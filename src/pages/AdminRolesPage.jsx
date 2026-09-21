import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PERMISSION_VALUES } from '../services/rbac/permissions'
import { CUSTOM_ROLE_FORBIDDEN_PERMISSIONS, ROLE_PERMISSIONS } from '../services/rbac/policy'
import { SYSTEM_ROLES } from '../services/rbac/roles'
import { createCustomRole, listCustomRoles, listUsers, removeCustomRole, setCustomRoleStatus, updateCustomRole } from '../services/rbac/firestore'

const permissionGroups = [
  ['Users', 'users.'], ['Roles', 'roles.'], ['Calendar', 'calendar.'], ['News', 'news.'], ['Quiz', 'quiz.'], ['Approval', 'approval.'], ['Audit', 'audit.'],
]

const emptyForm = { id: '', name: '', description: '', permissions: [] }

function formatDate(value) {
  if (!value) return '—'
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN')
}

export default function AdminRolesPage() {
  const { user } = useAuth()
  const [roles, setRoles] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [nextRoles, nextUsers] = await Promise.all([listCustomRoles(), listUsers()])
      setRoles(nextRoles)
      setUsers(nextUsers)
    } catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const assignedCounts = useMemo(() => users.reduce((counts, item) => {
    ;(item.customRoles || []).forEach((roleId) => { counts[roleId] = (counts[roleId] || 0) + 1 })
    return counts
  }, {}), [users])

  function openCreate() { setEditingId(''); setForm(emptyForm); setError(''); setMessage(''); setShowForm(true) }
  function openEdit(role) { setEditingId(role.id); setForm({ id: role.id, name: role.name || '', description: role.description || '', permissions: role.permissions || [] }); setError(''); setMessage(''); setShowForm(true) }
  function togglePermission(permission) { setForm((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] })) }

  async function saveRole(event) {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    try {
      if (editingId) await updateCustomRole(editingId, form)
      else await createCustomRole(form, user.uid)
      setShowForm(false); setMessage(editingId ? 'Đã cập nhật Custom Role.' : 'Đã tạo Custom Role.'); await loadData()
    } catch (saveError) { setError(saveError.message) }
    finally { setSaving(false) }
  }

  async function changeStatus(role) {
    setError(''); setMessage('')
    try { await setCustomRoleStatus(role.id, role.status === 'active' ? 'disabled' : 'active'); setMessage('Đã cập nhật trạng thái role.'); await loadData() }
    catch (statusError) { setError(statusError.message) }
  }

  async function deleteRole(role) {
    if (assignedCounts[role.id]) { setError('Không thể xóa role đang được gán. Hãy thu hồi role hoặc disable role trước.'); return }
    if (!window.confirm(`Xóa Custom Role ${role.id}?`)) return
    setError(''); setMessage('')
    try { await removeCustomRole(role.id); setMessage('Đã xóa Custom Role.'); await loadData() }
    catch (deleteError) { setError(deleteError.message) }
  }

  return (
    <section className="admin-card">
      <div className="admin-section-heading"><div><h3>Custom Roles</h3><p>System Roles chỉ đọc. Custom Role được kiểm tra theo permission catalog và Firestore Rules.</p></div><button className="admin-primary-button" type="button" onClick={openCreate}>+ Tạo Custom Role</button></div>
      {message && <p className="admin-success" role="status">{message}</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {showForm && <RoleForm form={form} editing={Boolean(editingId)} saving={saving} onChange={setForm} onTogglePermission={togglePermission} onSubmit={saveRole} onCancel={() => setShowForm(false)} />}
      <div className="admin-role-table admin-role-table-wide">
        {Object.values(SYSTEM_ROLES).map((role) => <article key={role}><div><strong>{role}</strong><small>SYSTEM ROLE · READ ONLY</small></div><span>{ROLE_PERMISSIONS[role]?.length || 0} quyền</span></article>)}
        {loading && <p className="admin-muted">Đang tải Custom Roles…</p>}
        {!loading && roles.map((role) => <article key={role.id}><div><strong>{role.name} <em className="role-type-badge">CUSTOM ROLE</em></strong><small>{role.id} · {role.status} · {assignedCounts[role.id] || 0} user</small><span>{role.description || 'Không có mô tả'}</span><span>Created by: {role.createdBy || '—'} · Created: {formatDate(role.createdAt)} · Updated: {formatDate(role.updatedAt)}</span></div><div className="admin-row-actions"><button type="button" onClick={() => openEdit(role)}>Sửa</button><button type="button" onClick={() => changeStatus(role)}>{role.status === 'active' ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => deleteRole(role)} disabled={Boolean(assignedCounts[role.id])}>Xóa</button></div></article>)}
        {!loading && !roles.length && <p className="admin-muted">Chưa có Custom Role.</p>}
      </div>
    </section>
  )
}

function RoleForm({ form, editing, saving, onChange, onTogglePermission, onSubmit, onCancel }) {
  return <form className="admin-role-form" onSubmit={onSubmit}><div className="admin-form-grid"><label>Role ID<input value={form.id} disabled={editing} onChange={(event) => onChange({ ...form, id: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} required /></label><label>Tên role<input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} required /></label></div><label>Mô tả<textarea value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} rows="2" /></label><fieldset><legend>Permissions</legend><div className="permission-groups">{permissionGroups.map(([group, prefix]) => <div key={group}><strong>{group}</strong>{PERMISSION_VALUES.filter((permission) => permission.startsWith(prefix)).map((permission) => { const protectedPermission = CUSTOM_ROLE_FORBIDDEN_PERMISSIONS.includes(permission); return <label key={permission} className={protectedPermission ? 'permission-disabled' : ''}><input type="checkbox" checked={form.permissions.includes(permission)} disabled={protectedPermission} onChange={() => onTogglePermission(permission)} />{permission}{protectedPermission && <small>policy protected</small>}</label> })}</div>)}</div></fieldset><div className="admin-form-actions"><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo role'}</button><button className="admin-secondary-button" type="button" onClick={onCancel} disabled={saving}>Hủy</button></div></form>
}
