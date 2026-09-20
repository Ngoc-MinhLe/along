import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import CalendarImportPanel from '../components/CalendarImportPanel'
import { listCalendarImports, searchCalendarEntries } from '../services/calendarImports'

const PAGE_SIZE = 25
const BASIC_FILTERS = ['AL-Ng', 'AL-T']
const RESULT_COLUMNS = ['Dương lịch', 'AL-Ng', 'AL-T', 'AL-T-Chi', 'AL-T-Can', 'Ngày-60', 'Ngày-Can', 'Giờ TT', 'Giờ Chi', 'Giờ can', 'Nạp Âm', 'GT', 'Thân', 'Mệnh']
const GROUP_DEFINITIONS = [
  { label: 'Lịch', fields: ['Dương lịch', 'AL-Ng', 'AL-T', 'AL-T-Chi', 'AL-T-Can', 'Tháng-60', 'AL-N-60', 'AL-N-60-Can', 'Ngày-60', 'Ngày-Can'] },
  { label: 'Giờ', fields: ['Giờ TT', 'Giờ Chi', 'Giờ can'] },
  { label: 'Thông tin cơ bản', fields: ['Nạp Âm', 'GT', 'Thân', 'Mệnh', 'Phụ', 'Phúc', 'Điền', 'Quan', 'Nô', 'Di', 'Tật', 'Tài', 'Tử', 'Phu', 'Huynh', 'Cục', 'Mệnh-60', 'Nối TV'] },
  { label: '14 chính tinh', fields: ['Tử Vi', 'Liêm Trinh', 'Thiên Đồng', 'Vũ Khúc', 'Thái Dương', 'Thiên Cơ', 'Thiên Phủ', 'Thái Âm', 'Tham Lang', 'Cự Môn', 'Thiên Tướng', 'Thiên Lương', 'Thất Sát', 'Phá Quân'] },
]

function formatTimestamp(value) {
  if (!value) return 'Đang cập nhật'
  const date = value.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? 'Đang cập nhật' : date.toLocaleString('vi-VN')
}

function makeFilterGroups(columns) {
  const byLabel = new Map(columns.map((column) => [column.label, column]))
  const used = new Set()
  const groups = GROUP_DEFINITIONS.map((group) => ({
    label: group.label,
    columns: group.fields.map((field) => byLabel.get(field)).filter(Boolean),
  }))
  groups.forEach((group) => group.columns.forEach((column) => used.add(column.key)))
  const remaining = columns.filter((column) => !used.has(column.key))
  if (remaining.length) groups.push({ label: 'Phụ tinh và trường bổ sung', columns: remaining })
  return groups.filter((group) => group.columns.length)
}

function FilterValueControl({ column, value, options, onChange }) {
  if (options?.length) {
    return <select value={value || ''} onChange={(event) => onChange(event.target.value)}><option value="">Tất cả</option>{options.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select>
  }
  return <input type="text" value={value || ''} placeholder="Nhập giá trị" onChange={(event) => onChange(event.target.value)} />
}

export default function CalendarLookupPage() {
  const [imports, setImports] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [filters, setFilters] = useState({})
  const [activeAdvancedKeys, setActiveAdvancedKeys] = useState([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState(() => new Set(['Lịch']))
  const [criteriaSearch, setCriteriaSearch] = useState('')
  const [rows, setRows] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [detailRow, setDetailRow] = useState(null)

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
  const columns = selectedImport?.columns || []
  const filterGroups = useMemo(() => makeFilterGroups(columns), [columns])
  const dateField = columns.find((column) => column.label === 'Dương lịch')
  const basicFields = columns.filter((column) => BASIC_FILTERS.includes(column.label))
  const criteriaCandidates = columns.filter((column) => column.label.toLowerCase().includes(criteriaSearch.trim().toLowerCase()) && !activeAdvancedKeys.includes(column.key))
  const activeAdvancedColumns = columns.filter((column) => activeAdvancedKeys.includes(column.key))
  const resultColumns = RESULT_COLUMNS.map((label) => columns.find((column) => column.label === label)).filter(Boolean)

  async function search(reset = true) {
    if (!selectedId) return
    setLoading(true); setMessage('')
    try {
      const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
      if (dateField && (filters.__rangeStart || filters.__rangeEnd)) {
        cleanFilters.__rangeKey = dateField.key
        cleanFilters.__rangeStart = filters.__rangeStart === '' ? '' : (filters.__rangeStart ? Number(filters.__rangeStart) || filters.__rangeStart : '')
        cleanFilters.__rangeEnd = filters.__rangeEnd === '' ? '' : (filters.__rangeEnd ? Number(filters.__rangeEnd) || filters.__rangeEnd : '')
      }
      const result = await searchCalendarEntries({ importId: selectedId, filters: cleanFilters, cursor: reset ? null : cursor, pageSize: PAGE_SIZE })
      setRows((current) => reset ? result.rows : [...current, ...result.rows])
      setCursor(result.cursor); setHasMore(result.hasMore)
    } catch (error) { setMessage(error.message) } finally { setLoading(false) }
  }

  function setFilter(key, value) { setFilters((current) => ({ ...current, [key]: value })) }
  function addAdvancedField(key) { setActiveAdvancedKeys((current) => current.includes(key) ? current : [...current, key]) }
  function removeFilter(key) {
    setFilters((current) => { const next = { ...current }; delete next[key]; return next })
    setActiveAdvancedKeys((current) => current.filter((item) => item !== key))
  }
  function toggleGroup(label) {
    setOpenGroups((current) => { const next = new Set(current); if (next.has(label)) next.delete(label); else next.add(label); return next })
  }
  function clearFilters() { setFilters({}); setActiveAdvancedKeys([]); setRows([]); setCursor(null); setHasMore(false) }
  function handleImportDone() { setRows([]); setCursor(null); loadImports() }

  function exportResults() {
    if (!selectedImport || !rows.length) return
    const worksheetRows = [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => row.sourceFields?.[column.label] ?? ''))]
    const sheet = XLSX.utils.aoa_to_sheet(worksheetRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Ket qua tra cuu')
    XLSX.writeFile(workbook, `ket-qua-tra-cuu-${selectedImport.importId}.xlsx`)
  }

  function renderField(column) {
    return <div className="advanced-field" key={column.key}><label>{column.label}<FilterValueControl column={column} value={filters[column.key]} options={selectedImport?.filterOptions?.[column.key]} onChange={(value) => setFilter(column.key, value)} /></label>{filters[column.key] && <button className="field-remove" onClick={() => removeFilter(column.key)} aria-label={`Bỏ ${column.label}`}>×</button>}</div>
  }

  const activeChips = []
  if (filters.__rangeStart || filters.__rangeEnd) activeChips.push({ key: '__range', label: `Dương lịch: ${filters.__rangeStart || ''} → ${filters.__rangeEnd || ''}`, remove: () => { setFilter('__rangeStart', ''); setFilter('__rangeEnd', '') } })
  ;[...basicFields, ...activeAdvancedColumns].forEach((column) => { if (filters[column.key]) activeChips.push({ key: column.key, label: `${column.label}: ${filters[column.key]}`, remove: () => removeFilter(column.key) }) })

  return (
    <section className="page-section">
      <div className="page-title-row"><div><p className="eyebrow">MODULE 1</p><h2>Tra cứu lịch</h2><p className="lead">Chọn bộ dữ liệu và các tiêu chí cần thiết để tra cứu trực tiếp từ Firestore.</p></div><span className="phase-badge">Đang hoạt động</span></div>
      <CalendarImportPanel onImported={handleImportDone} />
      <section className="lookup-card">
        <div className="card-heading"><div><p className="eyebrow">FIRESTORE</p><h3>Tìm kiếm dữ liệu lịch</h3></div><button className="secondary-button" onClick={exportResults} disabled={!rows.length}>Xuất kết quả ra Excel</button></div>
        <div className="basic-filter-panel">
          <div className="filter-grid">
            <label>Bộ dữ liệu<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setRows([]); setCursor(null) }}><option value="">-- Chọn lần import --</option>{imports.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {item.recordCount} dòng · {formatTimestamp(item.createdAt)}</option>)}</select></label>
            {dateField && <><label>Từ ngày<input type="text" placeholder="Giá trị Dương lịch" value={filters.__rangeStart || ''} onChange={(event) => setFilter('__rangeStart', event.target.value)} /></label><label>Đến ngày<input type="text" placeholder="Giá trị Dương lịch" value={filters.__rangeEnd || ''} onChange={(event) => setFilter('__rangeEnd', event.target.value)} /></label></>}
            {basicFields.map((field) => <label key={field.key}>{field.label}<FilterValueControl column={field} value={filters[field.key]} options={selectedImport?.filterOptions?.[field.key]} onChange={(value) => setFilter(field.key, value)} /></label>)}
          </div>
          <div className="filter-actions"><button className="primary-button" onClick={() => search(true)} disabled={!selectedId || loading}>{loading ? 'Đang tìm…' : 'Tìm kiếm'}</button><button className="link-button" onClick={clearFilters}>Xóa bộ lọc</button><button className="advanced-toggle" onClick={() => setAdvancedOpen((current) => !current)}>⚙ Bộ lọc nâng cao <span>{advancedOpen ? '▲' : '▼'}</span></button></div>
        </div>

        {advancedOpen && <div className="advanced-panel">
          <div className="criteria-toolbar"><div><strong>Tiêu chí nâng cao</strong><p>Chọn trường cần lọc; các trường đang sử dụng được ưu tiên hiển thị.</p></div><div className="criteria-picker"><input type="search" placeholder="Tìm tiêu chí..." value={criteriaSearch} onChange={(event) => setCriteriaSearch(event.target.value)} /><select value="" onChange={(event) => { if (event.target.value) addAdvancedField(event.target.value) }}><option value="">Chọn tiêu chí</option>{criteriaCandidates.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></div></div>
          {activeAdvancedColumns.length > 0 && <div className="active-advanced"><div className="group-caption">Đang sử dụng</div>{activeAdvancedColumns.map(renderField)}</div>}
          <div className="filter-groups">{filterGroups.map((group) => <div className="filter-group" key={group.label}><button className="group-toggle" onClick={() => toggleGroup(group.label)}><span>{openGroups.has(group.label) ? '−' : '+'}</span><strong>{group.label}</strong><small>{group.columns.length} trường</small></button>{openGroups.has(group.label) && <div className="group-fields">{group.columns.map(renderField)}</div>}</div>)}</div>
        </div>}

        {message && <p className="error-message">{message}</p>}
        {activeChips.length > 0 && <div className="condition-summary"><strong>Điều kiện tra cứu:</strong><div className="condition-chips">{activeChips.map((chip) => <button key={chip.key} className="condition-chip" onClick={chip.remove}>{chip.label} <span>×</span></button>)}</div></div>}
        {!selectedId && <div className="empty-state"><span>⌕</span><h3>Chưa chọn bộ dữ liệu</h3><p>Hãy chọn một batch dữ liệu để bắt đầu tra cứu.</p></div>}
        {selectedId && <><div className="result-summary">Hiển thị <strong>{rows.length}</strong> bản ghi trong phiên tra cứu.</div><div className="table-scroll result-table"><table><thead><tr>{resultColumns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Chi tiết</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{resultColumns.map((column) => <td key={column.key}>{String(row.sourceFields?.[column.label] ?? '')}</td>)}<td><button className="detail-button" onClick={() => setDetailRow(row)}>Xem chi tiết</button></td></tr>)}</tbody></table>{!rows.length && !loading && <p className="muted-text table-empty">Chưa có kết quả. Chọn bộ lọc và bấm Tìm kiếm.</p>}</div>{hasMore && <button className="secondary-button load-more" onClick={() => search(false)} disabled={loading}>Tải thêm</button>}</>}
      </section>
      {detailRow && <div className="detail-backdrop" onClick={() => setDetailRow(null)}><div className="detail-panel" onClick={(event) => event.stopPropagation()}><div className="detail-header"><div><p className="eyebrow">BẢN GHI LỊCH</p><h3>Chi tiết đầy đủ</h3></div><button className="close-button" onClick={() => setDetailRow(null)}>×</button></div><div className="detail-grid">{columns.map((column) => <div className="detail-item" key={column.key}><span>{column.label}</span><strong>{String(detailRow.sourceFields?.[column.label] ?? '') || '—'}</strong></div>)}</div></div></div>}
    </section>
  )
}
