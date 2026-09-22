import { Fragment, useEffect, useMemo, useState } from 'react'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS, PERMISSION_VALUES } from '../services/rbac/permissions'
import { CUSTOM_ROLE_FORBIDDEN_PERMISSIONS, ROLE_PERMISSIONS } from '../services/rbac/policy'
import { ROLE_HIERARCHY } from '../services/rbac/roles'
import { listCustomRoles, listUsers } from '../services/rbac/firestore'
import { createCustomRole, deleteCustomRole, disableCustomRole, enableCustomRole, updateCustomRole } from '../services/rbac/functions'
import { generateRoleId } from '../services/rbac/roleId'

const GROUP_LABELS = Object.freeze({
  users: 'Users',
  roles: 'Roles',
  calendar: 'Calendar',
  news: 'News',
  quiz: 'Quiz',
  approval: 'Approval',
  audit: 'Audit',
})

const PERMISSION_GROUPS = Object.freeze(PERMISSION_VALUES.reduce((groups, permission) => {
  const key = permission.split('.')[0]
  let group = groups.find((item) => item.key === key)
  if (!group) {
    group = { key, label: GROUP_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1), permissions: [] }
    groups.push(group)
  }
  group.permissions.push(permission)
  return groups
}, []))

const SYSTEM_ROLE_ORDER = Object.freeze([...ROLE_HIERARCHY].reverse())
const emptyForm = { name: '', description: '', permissions: [], status: 'active' }

function formatDate(value) {
  if (!value) return '—'
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN')
}

export default function AdminRolesPage() {
  const { hasPermission } = usePermissions()
  const canReadUsers = hasPermission(PERMISSIONS.USERS_READ)
  const canCreate = hasPermission(PERMISSIONS.ROLES_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.ROLES_UPDATE)
  const canDisable = hasPermission(PERMISSIONS.ROLES_DISABLE)
  const canDelete = hasPermission(PERMISSIONS.ROLES_DELETE)
  const [roles, setRoles] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [viewingRoleId, setViewingRoleId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [nextRoles, nextUsers] = await Promise.all([listCustomRoles(), canReadUsers ? listUsers() : Promise.resolve([])])
      setRoles(nextRoles)
      setUsers(nextUsers)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const assignedCounts = useMemo(() => users.reduce((counts, item) => {
    ;(item.customRoles || []).forEach((roleId) => { counts[roleId] = (counts[roleId] || 0) + 1 })
    return counts
  }, {}), [users])

  function openCreate() {
    if (!canCreate) return
    setEditingId('')
    setForm(emptyForm)
    setError('')
    setMessage('')
    setShowForm(true)
  }

  function openEdit(role) {
    if (!canUpdate) return
    setEditingId(role.id)
    setForm({ id: role.id, name: role.name || '', description: role.description || '', permissions: role.permissions || [], status: role.status })
    setError('')
    setMessage('')
    setShowForm(true)
  }

  function togglePermission(permission) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }))
  }

  async function saveRole(event) {
    event.preventDefault()
    const requiredPermission = editingId ? PERMISSIONS.ROLES_UPDATE : PERMISSIONS.ROLES_CREATE
    if (!hasPermission(requiredPermission)) {
      setError(`Bạn không có quyền ${requiredPermission}.`)
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      if (editingId) {
        await updateCustomRole({ roleId: editingId, name: form.name, description: form.description, permissions: form.permissions })
        await loadData()
        setMessage(`Đã cập nhật quyền của ${editingId}.`)
      } else {
        const created = await createCustomRole({ name: form.name, description: form.description, permissions: form.permissions })
        await loadData()
        setMessage(`Đã tạo Custom Role ${created.roleId}.`)
      }
      setShowForm(false)
      setEditingId('')
    } catch (saveError) {
      setError(saveError.code === 'permission-denied' ? 'Bạn không có quyền cập nhật Custom Role.' : saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(role) {
    if (!canDisable) {
      setError(`Bạn không có quyền ${PERMISSIONS.ROLES_DISABLE}.`)
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const nextStatus = role.status === 'active' ? 'disabled' : 'active'
      if (nextStatus === 'active') await enableCustomRole(role.id)
      else await disableCustomRole(role.id)
      await loadData()
      setMessage(`Đã ${nextStatus === 'active' ? 'enable' : 'disable'} ${role.id}.`)
    } catch (statusError) {
      setError(statusError.code === 'permission-denied' ? 'Bạn không có quyền thay đổi trạng thái Custom Role.' : statusError.message)
    } finally {
      setSaving(false)
    }
  }

  function requestDelete(role) {
    if (!canDelete) {
      setError(`Bạn không có quyền ${PERMISSIONS.ROLES_DELETE}.`)
      return
    }
    if (assignedCounts[role.id]) {
      setError('Role đang được gán cho người dùng, không thể xóa.')
      return
    }
    setDeleteTarget(role)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await deleteCustomRole(deleteTarget.id)
      await loadData()
      setViewingRoleId((current) => current === deleteTarget.id ? '' : current)
      setMessage(`Đã xóa Custom Role ${deleteTarget.id}.`)
      setDeleteTarget(null)
    } catch (deleteError) {
      setError(deleteError.code === 'permission-denied' ? 'Bạn không có quyền xóa Custom Role.' : deleteError.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="admin-roles-page">
    <section className="admin-card system-role-section">
      <div className="admin-section-heading"><div><h3>System Roles</h3><p>Hierarchy cố định. Tất cả System Role và permission tương ứng đều chỉ đọc.</p></div><span className="admin-readonly">READ ONLY</span></div>
      <div className="system-role-hierarchy">
        {SYSTEM_ROLE_ORDER.map((role, index) => <Fragment key={role}>
          <details className="system-role-card">
            <summary><div><strong>{role}</strong><small>Cấp {ROLE_HIERARCHY.indexOf(role) + 1}{index === 0 ? ' · Cao nhất' : ''}</small></div><div><span>{ROLE_PERMISSIONS[role]?.length || 0} quyền</span><small>System Role · Read only</small></div></summary>
            <PermissionCatalogView assignedPermissions={ROLE_PERMISSIONS[role] || []} showAll />
          </details>
          {index < SYSTEM_ROLE_ORDER.length - 1 && <div className="hierarchy-arrow" aria-hidden="true">↓</div>}
        </Fragment>)}
      </div>
    </section>

    <section className="admin-card custom-role-section">
      <div className="admin-section-heading"><div><h3>Custom Roles</h3><p>Custom Roles độc lập với hierarchy và chỉ nhận permission được policy cho phép.</p></div>{canCreate && <button className="admin-primary-button" type="button" onClick={openCreate}>+ Tạo Custom Role</button>}</div>
      {message && <p className="admin-success" role="status">{message}</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {showForm && <RoleForm form={form} editing={Boolean(editingId)} saving={saving} onChange={setForm} onTogglePermission={togglePermission} onSubmit={saveRole} onCancel={() => { setShowForm(false); setEditingId('') }} />}

      {loading && <p className="admin-muted">Đang tải Custom Roles…</p>}
      {!loading && <div className="custom-role-list">{roles.map((role) => {
        const assignedCount = assignedCounts[role.id] || 0
        const isViewing = viewingRoleId === role.id
        return <article className={`custom-role-card ${role.status === 'disabled' ? 'is-disabled' : ''}`} key={role.id}>
          <div className="custom-role-main">
            <div><div className="custom-role-title"><strong>{role.name}</strong><span className={`role-status-badge ${role.status}`}>{role.status}</span></div><code>{role.id}</code><p>{role.description || 'Không có mô tả'}</p><small>{(role.permissions || []).length} quyền · {assignedCount} người dùng</small></div>
            <div className="custom-role-meta"><span>Created by: {role.createdBy || '—'}</span><span>Created: {formatDate(role.createdAt)}</span><span>Updated: {formatDate(role.updatedAt)}</span></div>
          </div>
          <div className="admin-row-actions"><button type="button" onClick={() => setViewingRoleId(isViewing ? '' : role.id)}>{isViewing ? 'Ẩn quyền' : 'Xem quyền'}</button>{canUpdate && <button type="button" onClick={() => openEdit(role)}>Sửa quyền</button>}{canDisable && <button type="button" onClick={() => changeStatus(role)} disabled={saving}>{role.status === 'active' ? 'Disable' : 'Enable'}</button>}{canDelete && <button type="button" onClick={() => requestDelete(role)} disabled={Boolean(assignedCount) || saving}>Xóa</button>}</div>
          {assignedCount > 0 && <p className="role-delete-note">Role đang được gán cho người dùng, không thể xóa.</p>}
          {isViewing && <div className="custom-role-permission-view"><div><strong>{role.name}</strong><span>{(role.permissions || []).length} quyền</span></div><p>{role.description || 'Không có mô tả'}</p><PermissionCatalogView assignedPermissions={role.permissions || []} /></div>}
        </article>
      })}{!roles.length && <p className="admin-muted">Chưa có Custom Role.</p>}</div>}
    </section>

    {deleteTarget && <div className="role-modal-backdrop" role="presentation"><div className="role-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-role-title"><h3 id="delete-role-title">Xóa Custom Role?</h3><p>Role <strong>{deleteTarget.name}</strong> ({deleteTarget.id}) sẽ bị xóa. Thao tác này không thể hoàn tác.</p><div className="admin-form-actions"><button className="admin-secondary-button" type="button" onClick={() => setDeleteTarget(null)} disabled={saving}>Hủy</button><button className="admin-danger-button" type="button" onClick={confirmDelete} disabled={saving}>{saving ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div></div></div>}
  </div>
}

function PermissionCatalogView({ assignedPermissions, showAll = false }) {
  const assigned = new Set(assignedPermissions)
  const invalidPermissions = assignedPermissions.filter((permission) => !PERMISSION_VALUES.includes(permission))
  return <div className="role-permission-groups">
    {PERMISSION_GROUPS.map((group) => {
      const visible = showAll ? group.permissions : group.permissions.filter((permission) => assigned.has(permission))
      return <section key={group.key}><strong>{group.label}</strong>{visible.length
        ? <div>{visible.map((permission) => <span className={assigned.has(permission) ? 'permission-granted' : 'permission-missing'} key={permission}>{assigned.has(permission) ? '✓' : '×'} {permission}</span>)}</div>
        : <small>—</small>}</section>
    })}
    {invalidPermissions.length > 0 && <section className="invalid-permissions"><strong>Invalid · không có hiệu lực</strong><div>{invalidPermissions.map((permission) => <span key={permission}>× {permission}</span>)}</div></section>}
  </div>
}

function RoleForm({ form, editing, saving, onChange, onTogglePermission, onSubmit, onCancel }) {
  const generatedId = generateRoleId(form.name)
  return <form className="admin-role-form" onSubmit={onSubmit}>
    <div className="admin-form-grid"><label>Tên role<input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} required /></label><div className="generated-role-id"><span>Role ID kỹ thuật</span><code>{editing ? form.id : generatedId}</code><small>{editing ? 'Role ID không thể thay đổi.' : 'Được tự sinh từ tên và chống trùng khi lưu.'}</small></div></div>
    <label>Mô tả<textarea value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} rows="3" /></label>
    <fieldset><legend>Permissions</legend><p className="permission-help">Permission catalog cố định. Các quyền policy protected được hiển thị nhưng không thể chọn.</p><div className="permission-groups">{PERMISSION_GROUPS.map((group) => <div key={group.key}><strong>{group.label}</strong>{group.permissions.map((permission) => { const protectedPermission = CUSTOM_ROLE_FORBIDDEN_PERMISSIONS.includes(permission); return <label key={permission} className={protectedPermission ? 'permission-disabled' : ''}><input type="checkbox" checked={form.permissions.includes(permission)} disabled={protectedPermission} onChange={() => onTogglePermission(permission)} /><span>{permission}</span>{protectedPermission && <small>policy protected</small>}</label> })}</div>)}</div></fieldset>
    <div className="admin-form-actions"><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo role'}</button><button className="admin-secondary-button" type="button" onClick={onCancel} disabled={saving}>Hủy</button></div>
  </form>
}
