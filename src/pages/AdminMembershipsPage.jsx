import { useEffect, useMemo, useState } from 'react'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import { listUsers } from '../services/rbac/firestore'
import { createManualMembership, getUserMemberships, listMemberships, listMembershipTiers, revokeMembership } from '../services/membership'

const PAGE_LIMIT = 25

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN')
}

function toIso(localValue) {
  if (!localValue) return null
  const date = new Date(localValue)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function emptyDateValue() {
  const date = new Date(Date.now() - (new Date().getTimezoneOffset() * 60_000))
  return date.toISOString().slice(0, 16)
}

function membershipStatusLabel(status) {
  return { ACTIVE: 'Đang hiệu lực', REVOKED: 'Đã thu hồi', EXPIRED: 'Đã hết hạn' }[status] || status
}

export default function AdminMembershipsPage() {
  const { hasPermission } = usePermissions()
  const canAssign = hasPermission(PERMISSIONS.MEMBERSHIP_ASSIGN)
  const canRevoke = hasPermission(PERMISSIONS.MEMBERSHIP_REVOKE)
  const [memberships, setMemberships] = useState([])
  const [tiers, setTiers] = useState([])
  const [users, setUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedHistory, setSelectedHistory] = useState([])
  const [form, setForm] = useState({ userId: '', tierId: '', startsAt: emptyDateValue(), expiresAt: '' })
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [hasMore, setHasMore] = useState(false)

  const userMap = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users])
  const tierMap = useMemo(() => Object.fromEntries(tiers.map((tier) => [tier.id, tier])), [tiers])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [membershipResult, tierResult, nextUsers] = await Promise.all([
        listMemberships({ limit: PAGE_LIMIT }),
        listMembershipTiers(),
        listUsers(),
      ])
      setMemberships(membershipResult.items || [])
      setHasMore(Boolean(membershipResult.hasMore))
      setTiers(tierResult.items || [])
      setUsers(nextUsers)
      setForm((current) => ({ ...current, tierId: current.tierId || tierResult.items?.[0]?.id || '' }))
    } catch (loadError) {
      setError(loadError.message || 'Không thể tải dữ liệu Membership.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function selectUser(userId) {
    setSelectedUserId(userId)
    if (!userId) {
      setSelectedHistory([])
      return
    }
    setHistoryLoading(true)
    setError('')
    try {
      const result = await getUserMemberships(userId, { limit: PAGE_LIMIT })
      setSelectedHistory(result.items || [])
    } catch (loadError) {
      setError(loadError.message || 'Không thể tải lịch sử Membership.')
      setSelectedHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    if (!canAssign) return setError('Bạn không có quyền cấp Membership.')
    const startsAt = toIso(form.startsAt)
    const expiresAt = toIso(form.expiresAt)
    if (!form.userId || !form.tierId || !startsAt) return setError('Vui lòng chọn tài khoản, Membership và ngày bắt đầu hợp lệ.')
    if (form.expiresAt && !expiresAt) return setError('Ngày hết hạn không hợp lệ.')
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await createManualMembership({ userId: form.userId, tierId: form.tierId, startsAt, expiresAt })
      await loadData()
      await selectUser(form.userId)
      setMessage('Đã cấp Membership thủ công.')
    } catch (mutationError) {
      setError(mutationError.message || 'Không thể cấp Membership.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(membership) {
    if (!canRevoke || membership.status !== 'ACTIVE') return
    if (!window.confirm(`Thu hồi Membership ${membership.tier?.name || membership.tierId} của ${membership.user?.email || membership.userId}?`)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await revokeMembership(membership.membershipId || membership.id)
      await loadData()
      if (selectedUserId) await selectUser(selectedUserId)
      setMessage('Đã thu hồi Membership. Lịch sử vẫn được giữ lại.')
    } catch (mutationError) {
      setError(mutationError.message || 'Không thể thu hồi Membership.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="admin-memberships-page">
    <div className="admin-card">
      <div className="admin-section-heading"><div><h3>Quản lý Membership</h3><p>Cấp, theo dõi và thu hồi quyền lợi Membership qua backend tin cậy. Đây không phải là System Role.</p></div><span className="admin-readonly">{memberships.length}{hasMore ? '+' : ''} bản ghi</span></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p className="admin-success" role="status">{message}</p>}
      <p className="admin-muted">Danh sách hiển thị tối đa {PAGE_LIMIT} bản ghi mỗi lần tải; không tải toàn bộ dữ liệu về trình duyệt.</p>
    </div>

    {canAssign && <form className="admin-card membership-form" onSubmit={handleCreate}>
      <h3>Cấp Membership thủ công</h3>
      <p className="admin-muted">Chọn tài khoản, cấp Membership và thời gian hiệu lực. Mỗi tài khoản chỉ có tối đa một Membership đang hiệu lực.</p>
      <div className="membership-form-grid">
        <label>Tài khoản nhận Membership<select value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} disabled={busy}><option value="">Chọn tài khoản</option>{users.filter((user) => (user.status || 'active') === 'active').map((user) => <option key={user.id} value={user.id}>{user.displayName || user.email || user.id} — {user.email || user.id}</option>)}</select><small className="admin-field-help">Tài khoản đang được cấp Membership.</small></label>
        <label>Membership<select value={form.tierId} onChange={(event) => setForm({ ...form, tierId: event.target.value })} disabled={busy}><option value="">Chọn Membership</option>{tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name} · cấp {tier.level}</option>)}</select><small className="admin-field-help">Chỉ chọn Membership đang hoạt động; cấp độ do hệ thống dùng để xác định quyền lợi.</small></label>
        <label>Bắt đầu hiệu lực<input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} disabled={busy} /><small className="admin-field-help">Thời điểm tài khoản bắt đầu được hưởng Membership.</small></label>
        <label>Kết thúc hiệu lực <span className="membership-optional">(tùy chọn)</span><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} disabled={busy} /><small className="admin-field-help">Để trống nếu Membership không có ngày hết hạn.</small></label>
      </div>
      <button type="submit" className="admin-primary-button" disabled={busy || !tiers.length}>{busy ? 'Đang xử lý…' : 'Cấp Membership'}</button>
    </form>}

    <div className="admin-card membership-table-card">
      <div className="admin-section-heading"><div><h3>Danh sách Membership đã cấp</h3><p>Cấp độ được lấy từ dữ liệu Membership tương ứng ở backend.</p></div></div>
      {loading ? <p className="admin-muted">Đang tải Membership…</p> : !memberships.length ? <p className="admin-muted">Chưa có Membership.</p> : <div className="membership-table-scroll"><table className="membership-table"><thead><tr><th>Tài khoản</th><th>Membership</th><th>Trạng thái</th><th>Bắt đầu</th><th>Kết thúc</th><th>Nguồn cấp</th><th>Người cấp</th><th>Thao tác</th></tr></thead><tbody>{memberships.map((membership) => <tr key={membership.membershipId}><td><strong>{membership.user?.displayName || userMap[membership.userId]?.displayName || membership.userId}</strong><small>{membership.user?.email || userMap[membership.userId]?.email || membership.userId}</small></td><td>{membership.tier?.name || tierMap[membership.tierId]?.name || membership.tierId}<small>Cấp {membership.tier?.level ?? tierMap[membership.tierId]?.level ?? '—'}</small></td><td><span className={`membership-status ${membership.status}`}>{membershipStatusLabel(membership.status)}</span></td><td>{formatDate(membership.startsAt)}</td><td>{formatDate(membership.expiresAt)}</td><td>{membership.source || '—'}</td><td>{membership.assignedBy || '—'}</td><td>{canRevoke && membership.status === 'ACTIVE' ? <button type="button" className="admin-danger-button" onClick={() => handleRevoke(membership)} disabled={busy}>Thu hồi</button> : <span className="admin-muted">—</span>}</td></tr>)}</tbody></table></div>}
    </div>

    <div className="admin-card membership-history-card">
      <h3>Lịch sử Membership theo tài khoản</h3>
      <p className="admin-muted">Chọn tài khoản để xem cả Membership đang hiệu lực và các Membership đã thu hồi hoặc hết hạn.</p>
      <label>Tài khoản cần xem lịch sử<select value={selectedUserId} onChange={(event) => selectUser(event.target.value)} disabled={historyLoading} aria-label="Chọn tài khoản xem lịch sử"><option value="">Chọn tài khoản</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName || user.email || user.id}</option>)}</select></label>
      {historyLoading ? <p className="admin-muted">Đang tải lịch sử…</p> : selectedUserId && !selectedHistory.length ? <p className="admin-muted">Tài khoản này chưa có Membership.</p> : selectedHistory.map((membership) => <div className="membership-history-row" key={membership.membershipId}><strong>{membership.tier?.name || membership.tierId}</strong><span>{membershipStatusLabel(membership.status)} · {formatDate(membership.startsAt)} → {formatDate(membership.expiresAt)}</span></div>)}
    </div>
  </section>
}
