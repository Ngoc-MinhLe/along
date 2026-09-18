import { useRef, useState } from 'react'
import { importCalendarRows } from '../services/calendarImports'
import { parseCalendarWorkbook } from '../services/excel'

export default function CalendarImportPanel({ onImported }) {
  const inputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    setError('')
    setParsed(null)
    setSelectedFile(file || null)
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) {
      setError('Chỉ chấp nhận file có phần mở rộng .xlsx.')
      return
    }
    setStatus('reading')
    try {
      setParsed(await parseCalendarWorkbook(file))
      setStatus('ready')
    } catch (parseError) {
      setStatus('idle')
      setError(parseError.message)
    }
  }

  async function handleImport() {
    if (!parsed) return
    setError('')
    setStatus('importing')
    setProgress({ done: 0, total: parsed.validRows.length })
    try {
      const result = await importCalendarRows(parsed, (done, total) => setProgress({ done, total }))
      setStatus('success')
      onImported?.(result)
    } catch (importError) {
      setStatus('ready')
      setError(importError.message)
    }
  }

  const isImporting = status === 'importing'
  return (
    <section className="import-card">
      <div className="card-heading"><div><p className="eyebrow">ADMIN</p><h3>Import Excel</h3><p>Chọn workbook để kiểm tra cấu trúc và xem preview trước khi ghi vào Firestore.</p></div><span className="card-icon">⇧</span></div>
      <div className="import-actions">
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} hidden />
        <button className="secondary-button" onClick={() => inputRef.current?.click()} disabled={isImporting}>Chọn file .xlsx</button>
        <span className="file-name">{selectedFile?.name || 'Chưa chọn file'}</span>
      </div>
      {status === 'reading' && <p className="inline-status">Đang đọc và kiểm tra workbook…</p>}
      {error && <p className="error-message">{error}</p>}
      {parsed && <div className="preview-area">
        <div className="preview-stats"><span><strong>{parsed.sheetName}</strong> sheet</span><span><strong>{parsed.rows.length}</strong> dòng dữ liệu</span><span><strong>{parsed.columns.length}</strong> cột</span><span><strong>{parsed.validRows.length}</strong> hợp lệ</span><span><strong>{parsed.skippedRows}</strong> bỏ qua</span></div>
        <div className="column-list"><strong>Các cột:</strong> {parsed.columns.map((column) => <span key={column.key}>{column.label}</span>)}</div>
        {parsed.warnings.length > 0 && <div className="warning-box"><strong>Cảnh báo validation</strong>{parsed.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}
        <div className="table-scroll"><table><thead><tr>{parsed.columns.slice(0, 8).map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{parsed.previewRows.slice(0, 5).map((row) => <tr key={row.sourceRowNumber}>{parsed.columns.slice(0, 8).map((column) => <td key={column.key}>{String(row.values[column.index] ?? '')}</td>)}</tr>)}</tbody></table></div>
        <button className="primary-button" onClick={handleImport} disabled={isImporting || !parsed.validRows.length}>{isImporting ? `Đang import ${progress.done}/${progress.total}` : 'XÁC NHẬN IMPORT'}</button>
        {isImporting && <progress className="import-progress" value={progress.done} max={progress.total} />}
        {status === 'success' && <p className="success-message">Import thành công. Batch mới đã sẵn sàng để tra cứu.</p>}
      </div>}
    </section>
  )
}
