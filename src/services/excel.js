import * as XLSX from 'xlsx'

export const CALENDAR_SHEET_NAME = 'LỊCH'
export const REQUIRED_HEADERS = ['Dương lịch', 'Lịch âm', 'Giờ TT']

const normalizeHeader = (value) => String(value ?? '').trim()

function normalizeCell(value) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value.trim()
  return value ?? ''
}

function comparableValue(value) {
  if (typeof value === 'number') return value
  const text = String(value ?? '').trim()
  if (!text) return ''
  const numeric = Number(text.replace(',', '.'))
  return Number.isFinite(numeric) && /^[-+]?\d+(?:[.,]\d+)?$/.test(text) ? numeric : text
}

function getHeaderKey(index) {
  return `f${index}`
}

export async function parseCalendarWorkbook(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true })

  if (!workbook.SheetNames.includes(CALENDAR_SHEET_NAME)) {
    throw new Error(`Không tìm thấy sheet bắt buộc “${CALENDAR_SHEET_NAME}”. Các sheet hiện có: ${workbook.SheetNames.join(', ') || 'không có'}.`)
  }

  const sheet = workbook.Sheets[CALENDAR_SHEET_NAME]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false })
  const headerRow = (matrix[0] || []).map(normalizeHeader)
  const duplicateHeaders = headerRow.filter((header, index) => header && headerRow.indexOf(header) !== index)
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerRow.includes(header))

  if (!headerRow.length || missingHeaders.length) {
    throw new Error(`Cấu trúc sheet không phù hợp. Thiếu cột bắt buộc: ${missingHeaders.join(', ') || 'dòng header'}.`)
  }
  if (duplicateHeaders.length) {
    throw new Error(`Header bị trùng: ${[...new Set(duplicateHeaders)].join(', ')}.`)
  }

  const columns = headerRow.map((label, index) => ({ label: label || `Cột ${index + 1}`, index, key: getHeaderKey(index) }))
  const rows = matrix.slice(1).map((row, rowIndex) => {
    const values = columns.map(({ index }) => normalizeCell(row[index]))
    const sourceFields = Object.fromEntries(columns.map((column, index) => [column.label, values[index]]))
    return {
      sourceRowNumber: rowIndex + 2,
      sourceFields,
      search: Object.fromEntries(values.map((value, index) => [getHeaderKey(index), value === '' ? '' : String(value)])),
      range: Object.fromEntries(values.map((value, index) => [getHeaderKey(index), comparableValue(value)])),
      values,
    }
  }).filter((row) => row.values.some((value) => value !== ''))

  const warnings = []
  const requiredIndexes = REQUIRED_HEADERS.map((header) => headerRow.indexOf(header))
  const blankRequiredRows = rows.filter((row) => requiredIndexes.some((index) => row.values[index] === '')).length
  if (blankRequiredRows) warnings.push(`${blankRequiredRows} dòng thiếu ít nhất một cột bắt buộc.`)

  const uniqueCounts = columns.map((column) => new Set(rows.map((row) => String(row.values[column.index] ?? '')).filter(Boolean)).size)
  const filterOptions = columns.reduce((result, column) => {
    const values = [...new Set(rows.map((row) => row.values[column.index]).filter((value) => value !== ''))]
    if (values.length && values.length <= 200) result[column.key] = values
    return result
  }, {})

  const validRows = rows.filter((row) => requiredIndexes.every((index) => row.values[index] !== ''))
  const skippedRows = rows.length - validRows.length
  if (!validRows.length) warnings.push('Không có bản ghi hợp lệ sau khi kiểm tra các cột bắt buộc.')
  if (skippedRows) warnings.push(`${skippedRows} dòng sẽ được bỏ qua khi import.`)
  if (duplicateHeaders.length) warnings.push('Header có giá trị trùng.')

  return {
    fileName: file.name,
    sheetName: CALENDAR_SHEET_NAME,
    columns,
    rows,
    validRows,
    skippedRows,
    warnings,
    filterOptions,
    columnStats: columns.map((column) => ({ ...column, uniqueCount: uniqueCounts[column.index] })),
    previewRows: rows.slice(0, 8),
  }
}
