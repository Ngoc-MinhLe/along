import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import CalendarImportPanel from '../components/CalendarImportPanel'
import { listCalendarImports, searchCalendarEntries } from '../services/calendarImports'

const PAGE_SIZE = 25
const formatTimestamp = (value) => {
  if (!value) return 'Đang cập nhật'
  const date = value.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? 'Đang cập nhật' : date.toLocaleString('vi-VN')
}

export default function CalendarLookupPage() {
  const [imports, setImports] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [filters, setFilters] = useState({})
  const [rows, setRows] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function loadImports() {
    try {
      const result = await listCalendarImports()
      const completed = result.filter((item) => item.status === 'completed')
      setImports(completed)
      setSelectedId((current) => current || completed[0]?.id || '')
    } catch (error) { setMessage(error.message) }
  }

  useEffect(() => { loadImports() }, [])
  const selectedImport = imports.find((item) => item.id === selectedId)
  const filterFields = useMemo(() => selectedImport?.columns?.filter((column) => selectedImport.filterOptions?.[column.key]?.length) || [], [selectedImport])
  const dateField = selectedImport?.columns?.find((column) => column.label === 'Dương lịch')

  async function search(reset = true) {
    if (!selectedId) return
    setLoading(true); setMessage('')
    try {
      const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
      if (dateField) {
        cleanFilters.__rangeKey = dateField.key
        cleanFilters.__rangeStart = filters.__rangeStart === '' ? '' : (filters.__rangeStart ? Number(filters.__rangeStart) || filters.__rangeStart : '')
        cleanFilters.__rangeEnd = filters.__rangeEnd === '' ? '' : (filters.__rangeEnd ? Number(filters.__rangeEnd) || filters.__rangeEnd : '')
      }
      const result = await searchCalendarEntries({ importId: selectedId, filters: cleanFilters, cursor: reset ? null : cursor, pageSize: PAGE_SIZE })
      setRows((current) => reset ? result.rows : [...current, ...result.rows])
      setCursor(result.cursor); setHasMore(result.hasMore)
    } catch (error) { setMessage(error.message) } finally { setLoading(false) }
  }

  function exportResults() {
    if (!selectedImport || !rows.length) return
    const sheet = XLSX.utils.json_to_sheet(rows.map((row) => row.sourceFields))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Ket qua tra cuu')
    XLSX.writeFile(workbook, `ket-qua-tra-cuu-${selectedImport.importId}.xlsx`)
  }

  function clearFilters() { setFilters({}); setRows([]); setCursor(null); setHasMore(false) }
  function handleImportDone() { setRows([]); setCursor(null); loadImports() }

  return (
    <section className="page-section">
      <div className="page-title-row"><div><p className="eyebrow">MODULE 1</p><h2>Tra cứu lịch</h2><p className="lead">Import workbook theo cấu trúc thực tế, chọn batch dữ liệu và tra cứu trực tiếp từ Firestore.</p></div><span className="phase-badge">Đang hoạt động</span></div>
      <CalendarImportPanel onImported={handleImportDone} />
      <section className="lookup-card">
        <div className="card-heading"><div><p className="eyebrow">FIRESTORE</p><h3>Tìm kiếm dữ liệu lịch</h3></div><button className="secondary-button" onClick={exportResults} disabled={!rows.length}>Xuất kết quả ra Excel</button></div>
        <div className="filter-grid">
          <label>Bộ dữ liệu<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setRows([]); setCursor(null) }}><option value="">-- Chọn lần import --</option>{imports.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {item.recordCount} dòng · {formatTimestamp(item.createdAt)}</option>)}</select></label>
          {dateField && <><label>Từ ngày<input type="text" placeholder="Giá trị Dương lịch" value={filters.__rangeStart || ''} onChange={(event) => setFilters((current) => ({ ...current, __rangeStart: event.target.value }))} /></label><label>Đến ngày<input type="text" placeholder="Giá trị Dương lịch" value={filters.__rangeEnd || ''} onChange={(event) => setFilters((current) => ({ ...current, __rangeEnd: event.target.value }))} /></label></>}
          {filterFields.map((field) => <label key={field.key}>{field.label}<select value={filters[field.key] || ''} onChange={(event) => setFilters((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Tất cả</option>{selectedImport.filterOptions[field.key].map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}</select></label>)}
        </div>
        <div className="filter-actions"><button className="primary-button" onClick={() => search(true)} disabled={!selectedId || loading}>{loading ? 'Đang tìm…' : 'Tìm kiếm'}</button><button className="link-button" onClick={clearFilters}>Xóa bộ lọc</button></div>
        {message && <p className="error-message">{message}</p>}
        {!selectedId && <div className="empty-state"><span>⌕</span><h3>Chưa chọn bộ dữ liệu</h3><p>Hãy import và xác nhận một workbook, sau đó chọn batch để bắt đầu tra cứu.</p></div>}
        {selectedId && <><div className="result-summary">Hiển thị <strong>{rows.length}</strong> bản ghi trong phiên tra cứu.</div><div className="table-scroll result-table"><table><thead><tr>{(selectedImport?.columns || []).slice(0, 8).map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{(selectedImport?.columns || []).slice(0, 8).map((column) => <td key={column.key}>{String(row.sourceFields?.[column.label] ?? '')}</td>)}</tr>)}</tbody></table>{!rows.length && !loading && <p className="muted-text table-empty">Chưa có kết quả. Chọn bộ lọc và bấm Tìm kiếm.</p>}</div>{hasMore && <button className="secondary-button load-more" onClick={() => search(false)} disabled={loading}>Tải thêm</button>}</>}
      </section>
    </section>
  )
}
