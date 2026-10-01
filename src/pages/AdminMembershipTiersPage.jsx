import { useEffect, useMemo, useState } from 'react'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import {
  createMembershipTier,
  deactivateMembershipTier,
  listMembershipTiers,
  updateMembershipTier,
} from '../services/membership'

const EMPTY_FORM = Object.freeze({ name: '', level: '1', description: '' })

function normalizeTierIdPart(value) {
  const normalized = String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (character) => character === 'Đ' ? 'D' : 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')

  if (!normalized) return 'MEMBERSHIP_TIER'
  return /^[A-Z]/.test(normalized) ? normalized : `TIER_${normalized}`
}

export function generateMembershipTierId(name, tiers = []) {
  const base = normalizeTierIdPart(name).slice(0, 128)
  const used = new Set(tiers.map((tier) => tier.id || tier.tierId).filter(Boolean))
  if (!used.has(base)) return base

  let index = 2
  while (true) {
    const suffix = `_${index}`
    const candidate = `${base.slice(0, 128 - suffix.length).replace(/_+$/, '')}${suffix}`
    if (!used.has(candidate)) return candidate
    index += 1
  }
}

function toForm(tier) {
  return {
    name: tier?.name || '',
    level: String(tier?.level || 1),
    description: tier?.description || '',
  }
}

function statusLabel(status) {
  return status === 'active' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'
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

  const generatedTierId = useMemo(
    () => generateMembershipTierId(form.name, tiers.filter((tier) => (tier.id || tier.tierId) !== editingTierId)),
    [form.name, tiers, editingTierId],
  )

  async function loadTiers() {
    setLoading(true)
    setError('')
    try {
      const result = await listMembershipTiers({ includeInactive: true })
      setTiers(result.items || [])
    } catch (loadError) {
      setError(loadError.message || 'Không thể tải danh sách Membership.')
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
      setError('Bạn không có quyền quản lý Membership.')
      return
    }
    const level = Number(form.level)
    if (!form.name.trim() || !Number.isSafeInteger(level) || level < 1) {
      setError('Vui lòng nhập tên Membership và cấp độ là số nguyên dương.')
      return
    }
    const tierId = editingTierId || generatedTierId
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (editingTierId) {
        await updateMembershipTier({ tierId, name: form.name, level, description: form.description })
        setMessage('Đã cập nhật Membership.')
      } else {
        await createMembershipTier({ tierId, name: form.name, level, description: form.description })
        setMessage('Đã tạo Membership.')
      }
      resetForm()
      await loadTiers()
    } catch (mutationError) {
      setError(mutationError.message || 'Không thể lưu Membership.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeactivate(tier) {
    if (!canManage || tier.status !== 'active') return
    if (!window.confirm(`Vô hiệu hóa Membership ${tier.name}? Lịch sử đã sử dụng vẫn được giữ lại.`)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await deactivateMembershipTier(tier.id || tier.tierId)
      await loadTiers()
      setMessage('Đã vô hiệu hóa Membership.')
    } catch (mutationError) {
      setError(mutationError.message || 'Không thể vô hiệu hóa Membership.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="admin-membership-tiers-page">
    <div className="admin-card">
      <div className="admin-section-heading">
        <div><h3>Quản lý Membership</h3><p>Tạo các cấp Membership động như VIP 1, VIP 10, Gold hoặc Platinum. Cấp Membership không phải System Role hay Permission.</p></div>
        <span className="admin-readonly">{tiers.length} Membership</span>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p className="admin-success" role="status">{message}</p>}
    </div>

    {canManage && <form className="admin-card membership-tier-form" onSubmit={handleSubmit}>
      <div className="admin-section-heading"><div><h3>{editingTierId ? 'Sửa Membership' : 'Tạo Membership'}</h3><p>{editingTierId ? 'Mã kỹ thuật được giữ nguyên sau khi tạo và không thể đổi.' : 'Chỉ cần nhập tên, cấp độ và mô tả. Hệ thống sẽ tự tạo mã kỹ thuật.'}</p></div></div>
      <div className="membership-form-grid">
        <label>Tên Membership<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={busy} maxLength={160} required placeholder="Ví dụ: Gold hoặc VIP 10" /><small className="admin-field-help">Tên hiển thị cho quản trị viên và người dùng.</small></label>
        <div className="generated-membership-id"><span>Mã kỹ thuật</span><code>{editingTierId || generatedTierId}</code><small>{editingTierId ? 'Mã này là cố định để giữ liên kết dữ liệu.' : 'Tự tạo từ tên Membership; nếu trùng, hệ thống thêm hậu tố.'}</small></div>
        <label>Cấp độ Membership<input type="number" min="1" step="1" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} disabled={busy} required /><small className="admin-field-help">Số nguyên dương dùng để so sánh cấp truy cập. Không giới hạn tối đa cố định.</small></label>
        <label>Mô tả<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} disabled={busy} maxLength={2000} rows={3} placeholder="Ví dụ: Dành cho thành viên đã đăng ký gói Gold." /><small className="admin-field-help">Mô tả ngắn giúp quản trị viên biết Membership này dùng cho mục đích gì.</small></label>
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-primary-button" disabled={busy}>{busy ? 'Đang xử lý…' : editingTierId ? 'Lưu thay đổi' : 'Tạo Membership'}</button>
        {editingTierId && <button type="button" className="admin-secondary-button" onClick={resetForm} disabled={busy}>Hủy</button>}
      </div>
    </form>}

    <div className="admin-card membership-tier-list-card">
      <div className="admin-section-heading"><div><h3>Danh sách Membership</h3><p>Membership đã vô hiệu hóa vẫn được giữ để bảo toàn lịch sử cấp quyền.</p></div></div>
      {loading ? <p className="admin-muted">Đang tải Membership…</p> : !tiers.length ? <p className="admin-muted">Chưa có Membership. Hãy tạo Membership đầu tiên.</p> : <div className="membership-tier-table-scroll"><table className="membership-tier-table"><thead><tr><th>Mã kỹ thuật</th><th>Tên Membership</th><th>Cấp độ</th><th>Trạng thái</th><th>Mô tả</th><th>Thao tác</th></tr></thead><tbody>{tiers.map((tier) => <tr key={tier.id || tier.tierId}><td><code>{tier.id || tier.tierId}</code></td><td><strong>{tier.name}</strong></td><td>{tier.level}</td><td><span className={`membership-status ${tier.status}`}>{statusLabel(tier.status)}</span></td><td>{tier.description || '—'}</td><td><div className="admin-row-actions"><button type="button" className="admin-secondary-button" onClick={() => beginEdit(tier)} disabled={busy}>Sửa</button>{tier.status === 'active' && <button type="button" className="admin-danger-button" onClick={() => handleDeactivate(tier)} disabled={busy}>Vô hiệu hóa</button>}</div></td></tr>)}</tbody></table></div>}
    </div>
  </section>
}
