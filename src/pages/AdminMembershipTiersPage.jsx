import { useEffect, useState } from 'react'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import {
  createMembershipTier,
  deactivateMembershipTier,
  listMembershipTiers,
  updateMembershipTier,
} from '../services/membership'

const EMPTY_FORM = Object.freeze({ tierId: '', name: '', level: '1', description: '' })

function toForm(tier) {
  return {
    tierId: tier?.id || tier?.tierId || '',
    name: tier?.name || '',
    level: String(tier?.level || 1),
    description: tier?.description || '',
  }
}

export default function AdminMembershipTiersPage() {
  const { hasPermission } = usePermissions()
  const canManage = hasPermission(PERMISSIONS.MEMBERSHIP_UPDATE)
  const [tiers, setTiers] = useState([])
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingTierId, setEditingTierId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadTiers() {
    setLoading(true)
    setError('')
    try {
      const result = await listMembershipTiers({ includeInactive: true })
      setTiers(result.items || [])
    } catch (loadError) {
      setError(loadError.message || 'Không thể tải danh sách Membership tier.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTiers() }, [])

  function resetForm() {
    setForm({ ...EMPTY_FORM })
    setEditingTierId('')
  }

  function beginEdit(tier) {
    setForm(toForm(tier))
    setEditingTierId(tier.id || tier.tierId)
    setError('')
    setMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canManage) {
      setError(`Bạn không có quyền ${PERMISSIONS.MEMBERSHIP_UPDATE}.`)
      return
    }
    const level = Number(form.level)
    if ((!editingTierId && !form.tierId.trim()) || !form.name.trim() || !Number.isSafeInteger(level) || level < 1) {
      setError('Vui lòng nhập tier ID, tên tier và level là số nguyên dương.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (editingTierId) {
        await updateMembershipTier({ tierId: editingTierId, name: form.name, level, description: form.description })
        setMessage('Đã cập nhật Membership tier.')
      } else {
        await createMembershipTier({ tierId: form.tierId, name: form.name, level, description: form.description })
        setMessage('Đã tạo Membership tier.')
      }
      resetForm()
      await loadTiers()
    } catch (mutationError) {
      setError(mutationError.message || 'Không thể lưu Membership tier.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeactivate(tier) {
    if (!canManage || tier.status !== 'active') return
    if (!window.confirm(`Vô hiệu hóa tier ${tier.name}? Tier đã dùng sẽ không bị xóa khỏi lịch sử.`)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await deactivateMembershipTier(tier.id || tier.tierId)
      await loadTiers()
      setMessage('Đã vô hiệu hóa Membership tier.')
    } catch (mutationError) {
      setError(mutationError.message || 'Không thể vô hiệu hóa Membership tier.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="admin-membership-tiers-page">
    <div className="admin-card">
      <div className="admin-section-heading">
        <div><h3>Quản lý Membership tier</h3><p>Tier được lưu động trên backend; level không phải System Role hoặc Permission.</p></div>
        <span className="admin-readonly">{tiers.length} tier</span>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p className="admin-success" role="status">{message}</p>}
    </div>

    {canManage && <form className="admin-card membership-tier-form" onSubmit={handleSubmit}>
      <div className="admin-section-heading"><div><h3>{editingTierId ? 'Sửa Membership tier' : 'Tạo Membership tier'}</h3><p>{editingTierId ? 'Tier ID không thể thay đổi sau khi tạo.' : 'Không giới hạn level tối đa cố định; server sẽ kiểm tra schema.'}</p></div></div>
      <div className="membership-form-grid">
        <label>Tier ID<input value={form.tierId} onChange={(event) => setForm({ ...form, tierId: event.target.value })} disabled={busy || Boolean(editingTierId)} maxLength={128} required /></label>
        <label>Tên tier<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={busy} maxLength={160} required /></label>
        <label>Level<input type="number" min="1" step="1" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} disabled={busy} required /></label>
        <label>Mô tả<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} disabled={busy} maxLength={2000} rows={3} /></label>
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-primary-button" disabled={busy}>{busy ? 'Đang xử lý…' : editingTierId ? 'Lưu thay đổi' : 'Tạo tier'}</button>
        {editingTierId && <button type="button" className="admin-secondary-button" onClick={resetForm} disabled={busy}>Hủy</button>}
      </div>
    </form>}

    <div className="admin-card membership-tier-list-card">
      <div className="admin-section-heading"><div><h3>Danh sách tier</h3><p>Tier inactive vẫn được giữ để bảo toàn lịch sử Membership.</p></div></div>
      {loading ? <p className="admin-muted">Đang tải tier…</p> : !tiers.length ? <p className="admin-muted">Chưa có Membership tier. Hãy tạo tier đầu tiên.</p> : <div className="membership-tier-table-scroll"><table className="membership-tier-table"><thead><tr><th>Tier ID</th><th>Tên</th><th>Level</th><th>Trạng thái</th><th>Mô tả</th><th>Thao tác</th></tr></thead><tbody>{tiers.map((tier) => <tr key={tier.id || tier.tierId}><td><code>{tier.id || tier.tierId}</code></td><td><strong>{tier.name}</strong></td><td>{tier.level}</td><td><span className={`membership-status ${tier.status}`}>{tier.status}</span></td><td>{tier.description || '—'}</td><td><div className="admin-row-actions"><button type="button" className="admin-secondary-button" onClick={() => beginEdit(tier)} disabled={busy}>Sửa</button>{tier.status === 'active' && <button type="button" className="admin-danger-button" onClick={() => handleDeactivate(tier)} disabled={busy}>Vô hiệu hóa</button>}</div></td></tr>)}</tbody></table></div>}
    </div>
  </section>
}
