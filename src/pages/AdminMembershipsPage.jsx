import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncSearchSelect from '../components/AsyncSearchSelect'
import CursorPagination from '../components/CursorPagination'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import { listUsersPage } from '../services/rbac/firestore'
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
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedTier, setSelectedTier] = useState(null)
  const [selectedTierFilter, setSelectedTierFilter] = useState(null)
  const [selectedHistory, setSelectedHistory] = useState([])
  const [form, setForm] = useState({ userId: '', tierId: '', startsAt: emptyDateValue(), expiresAt: '' })
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState(null)
  const [page, setPage] = useState(1)
  const [pageCursors, setPageCursors] = useState([null])
  const [statusFilter, setStatusFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [historyCursor, setHistoryCursor] = useState(null)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageCursors, setHistoryPageCursors] = useState([null])

  const tierMap = useMemo(() => Object.fromEntries(tiers.map((tier) => [tier.id, tier])), [tiers])
  const formTier = selectedTier || tiers.find((tier) => tier.id === form.tierId || tier.tierId === form.tierId) || null

  async function loadData(cursor = null, targetPage = 1) {
    setLoading(true); setError('')
    try {
      const [membershipResult, tierResult] = await Promise.all([
        listMemberships({ limit: PAGE_LIMIT, cursor, status: statusFilter, tierId: tierFilter }),
        listMembershipTiers(),
      ])
      setMemberships(membershipResult.items || [])
      setHasMore(Boolean(membershipResult.hasMore))
      setNextCursor(membershipResult.nextCursor || null)
      setPage(targetPage)
      setPageCursors((current) => { const next = current.slice(0, targetPage); next[targetPage] = membershipResult.nextCursor || null; return next })
      setTiers(tierResult.items || [])
      setForm((current) => ({ ...current, tierId: current.tierId || tierResult.items?.[0]?.id || '' }))
    } catch (loadError) {
      setError(loadError.message || 'Không thể tải dữ liệu Membership.')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData(null, 1) }, [statusFilter, tierFilter])

  const searchUsers = useCallback((query) => listUsersPage({ query, status: 'active', pageSize: 20 }), [])
  const searchTiers = useCallback((query) => listMembershipTiers({ query, limit: 20 }), [])

  function selectTier(tierId, tierOption = null) {
    setForm((current) => ({ ...current, tierId }))
    setSelectedTier(tierOption)
  }

  function selectTierFilter(tierId, tierOption = null) {
    setTierFilter(tierId)
    setSelectedTierFilter(tierOption)
  }

  async function selectUser(userId, userOption = null, cursor = null, targetPage = 1) {
    setSelectedUserId(userId); setSelectedUser(userOption); setForm((current) => ({ ...current, userId })); setHistoryCursor(cursor); setHistoryPage(targetPage)
    if (!cursor) setHistoryPageCursors([null])
    if (!userId) { setSelectedHistory([]); setHistoryHasMore(false); return }
    setHistoryLoading(true); setError('')
    try {
      const result = await getUserMemberships(userId, { limit: PAGE_LIMIT, cursor })
      setSelectedHistory(result.items || []); setHistoryCursor(result.nextCursor || null); setHistoryHasMore(Boolean(result.hasMore)); setHistoryPageCursors((current) => { const next = current.slice(0, targetPage); next[targetPage] = result.nextCursor || null; return next })
    } catch (loadError) {
      setError(loadError.message || 'Không thể tải lịch sử Membership.'); setSelectedHistory([])
    } finally { setHistoryLoading(false) }
  }

  async function handleCreate(event) {
    event.preventDefault()
    if (!canAssign) return setError(`Bạn không có quyền ${PERMISSIONS.MEMBERSHIP_ASSIGN}.`)
    const startsAt = toIso(form.startsAt); const expiresAt = toIso(form.expiresAt)
    if (!form.userId || !form.tierId || !startsAt) return setError('Vui lòng chọn tài khoản, Membership Tier và ngày bắt đầu hợp lệ.')
    if (form.expiresAt && !expiresAt) return setError('Ngày hết hạn không hợp lệ.')
    setBusy(true); setError(''); setMessage('')
    try {
      await createManualMembership({ userId: form.userId, tierId: form.tierId, startsAt, expiresAt })
      await loadData(null, 1); await selectUser(form.userId, selectedUser)
      setMessage('Đã cấp Membership thủ công.')
    } catch (mutationError) { setError(mutationError.message || 'Không thể cấp Membership.') } finally { setBusy(false) }
  }

  async function handleRevoke(membership) {
    if (!canRevoke || membership.status !== 'ACTIVE') return
    if (!window.confirm(`Thu hồi Membership ${membership.tier?.name || membership.tierId}?`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      await revokeMembership(membership.membershipId || membership.id)
      await loadData(null, 1); if (selectedUserId) await selectUser(selectedUserId, selectedUser)
      setMessage('Đã thu hồi Membership. Lịch sử vẫn được giữ lại.')
    } catch (mutationError) { setError(mutationError.message || 'Không thể thu hồi Membership.') } finally { setBusy(false) }
  }

  return <section className="admin-memberships-page">
    <div className="admin-card">
      <div className="admin-section-heading"><div><h3>Quản lý Membership</h3><p>Cấp, theo dõi và thu hồi quyền lợi Membership qua backend tin cậy. Đây không phải là System Role.</p></div><span className="admin-readonly">{memberships.length}{hasMore ? '+' : ''} bản ghi</span></div>
      {error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status">{message}</p>}
      <p className="admin-muted">Danh sách được tải theo từng trang, không tải toàn bộ Membership hoặc user về trình duyệt.</p>
    </div>

    {canAssign && <form className="admin-card membership-form" onSubmit={handleCreate}>
      <h3>Cấp Membership thủ công</h3><p className="admin-muted">Chọn tài khoản, cấp Membership và thời gian hiệu lực. Mỗi tài khoản chỉ có tối đa một Membership đang hiệu lực.</p>
      <div className="membership-form-grid">
        <AsyncSearchSelect label="Tài khoản nhận Membership" value={form.userId} selectedOption={selectedUser} onChange={(value, option) => selectUser(value, option)} loadOptions={searchUsers} getLabel={(user) => user.displayName || user.email || user.id} getMeta={(user) => user.email || user.id} placeholder="Tìm người dùng..." helperText="Nhập ít nhất 2 ký tự để tìm kiếm. Kết quả được tải theo từng trang." disabled={busy} />
        <AsyncSearchSelect label="Membership Tier" value={form.tierId} selectedOption={formTier} onChange={selectTier} loadOptions={searchTiers} getLabel={(tier) => tier.name || tier.id} getMeta={(tier) => `Level ${tier.level}${tier.description ? ` · ${tier.description}` : ''}`} placeholder="Tìm Membership Tier..." helperText="Tìm theo tên hoặc level; dữ liệu được tìm trên server." minQueryLength={1} disabled={busy} />
        <label>Bắt đầu hiệu lực<input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} disabled={busy} /></label>
        <label>Kết thúc hiệu lực <span className="membership-optional">(tùy chọn)</span><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} disabled={busy} /></label>
      </div>
      {formTier && <div className="membership-tier-summary" aria-live="polite"><strong>Thông tin Membership Tier đã chọn</strong><div className="membership-tier-summary-grid"><span>Tên Tier<strong>{formTier.name}</strong></span><span>Level<strong>{formTier.level}</strong></span><span>Mô tả<strong>{formTier.description || 'Chưa có mô tả.'}</strong></span></div><small className="admin-field-help">Level là cấp số dùng để so sánh quyền truy cập nội dung; đây không phải System Role hay Permission.</small></div>}
      <button type="submit" className="admin-primary-button" disabled={busy || !form.tierId || !form.userId}>{busy ? 'Đang xử lý…' : 'Cấp Membership'}</button>
    </form>}

    <div className="admin-card membership-table-card">
      <div className="admin-section-heading"><div><h3>Danh sách Membership đã cấp</h3><p>Filter và phân trang được xử lý ở backend.</p></div><div className="membership-list-filters"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tất cả trạng thái</option><option value="ACTIVE">Đang hiệu lực</option><option value="REVOKED">Đã thu hồi</option><option value="EXPIRED">Đã hết hạn</option></select><AsyncSearchSelect label="Lọc theo Tier" value={tierFilter} selectedOption={selectedTierFilter} onChange={selectTierFilter} loadOptions={searchTiers} getLabel={(tier) => tier.name || tier.id} getMeta={(tier) => `Level ${tier.level}`} placeholder="Tìm Tier..." helperText="Tìm Tier trên server để lọc Membership." minQueryLength={1} /></div></div>
      {loading ? <p className="admin-muted">Đang tải Membership…</p> : !memberships.length ? <p className="admin-muted">Chưa có Membership phù hợp.</p> : <div className="membership-table-scroll"><table className="membership-table"><thead><tr><th>Tài khoản</th><th>Membership</th><th>Trạng thái</th><th>Bắt đầu</th><th>Kết thúc</th><th>Nguồn cấp</th><th>Người cấp</th><th>Thao tác</th></tr></thead><tbody>{memberships.map((membership) => <tr key={membership.membershipId}><td><strong>{membership.user?.displayName || membership.userId}</strong><small>{membership.user?.email || membership.userId}</small></td><td>{membership.tier?.name || tierMap[membership.tierId]?.name || membership.tierId}<small>Cấp {membership.tier?.level ?? tierMap[membership.tierId]?.level ?? '—'}</small></td><td><span className={`membership-status ${membership.status}`}>{membershipStatusLabel(membership.status)}</span></td><td>{formatDate(membership.startsAt)}</td><td>{formatDate(membership.expiresAt)}</td><td>{membership.source || '—'}</td><td>{membership.assignedBy || '—'}</td><td>{canRevoke && membership.status === 'ACTIVE' ? <button type="button" className="admin-danger-button" onClick={() => handleRevoke(membership)} disabled={busy}>Thu hồi</button> : <span className="admin-muted">—</span>}</td></tr>)}</tbody></table></div>}
      <CursorPagination page={page} hasMore={hasMore} loading={loading} rangeLabel={`Hiển thị ${(page - 1) * PAGE_LIMIT + 1}–${(page - 1) * PAGE_LIMIT + memberships.length}${hasMore ? '+' : ''}`} onPrevious={() => loadData(pageCursors[Math.max(0, page - 2)] || null, page - 1)} onNext={() => loadData(nextCursor, page + 1)} />
    </div>

    <div className="admin-card membership-history-card">
      <h3>Lịch sử Membership theo tài khoản</h3><p className="admin-muted">Tìm tài khoản để xem Membership đang hiệu lực và lịch sử đã thu hồi/hết hạn.</p>
      <AsyncSearchSelect label="Tài khoản cần xem lịch sử" value={selectedUserId} selectedOption={selectedUser} onChange={(value, option) => selectUser(value, option)} loadOptions={searchUsers} getLabel={(user) => user.displayName || user.email || user.id} getMeta={(user) => user.email || user.id} placeholder="Tìm người dùng..." helperText="Không tải toàn bộ danh sách user về trình duyệt." disabled={historyLoading} />
      {historyLoading ? <p className="admin-muted">Đang tải lịch sử…</p> : selectedUserId && !selectedHistory.length ? <p className="admin-muted">Tài khoản này chưa có Membership.</p> : selectedHistory.map((membership) => <div className="membership-history-row" key={membership.membershipId}><strong>{membership.tier?.name || membership.tierId}</strong><span>{membershipStatusLabel(membership.status)} · {formatDate(membership.startsAt)} → {formatDate(membership.expiresAt)}</span></div>)}
      {selectedUserId && <CursorPagination page={historyPage} hasMore={historyHasMore} loading={historyLoading} rangeLabel={`Lịch sử Membership · trang ${historyPage}`} onPrevious={() => selectUser(selectedUserId, selectedUser, historyPageCursors[Math.max(0, historyPage - 2)] || null, historyPage - 1)} onNext={() => selectUser(selectedUserId, selectedUser, historyCursor, historyPage + 1)} />}
    </div>
  </section>
}
