import * as XLSX from 'xlsx'

export const CALENDAR_SHEET_NAME = 'LỊCH'
export const REQUIRED_HEADERS = []

const normalizeHeader = (value) => String(value ?? '')

function normalizeCell(value) {
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

function hasValue(value) {
  return value !== '' && value !== null && value !== undefined
}

function findSparseRowThreshold(rows) {
  const counts = [...new Set(rows.map((row) => row.values.filter(hasValue).length))].sort((a, b) => a - b)
  if (counts.length < 2) return 0

  let bestGap = null
  for (let index = 1; index < counts.length; index += 1) {
    const lower = counts[index - 1]
    const upper = counts[index]
    const relativeGap = (upper - lower) / Math.max(lower, 1)
    if (!bestGap || relativeGap > bestGap.relativeGap) bestGap = { lower, upper, relativeGap }
  }

  // Only split clearly different row shapes. Similar densities may be legitimate optional fields.
  if (!bestGap || bestGap.relativeGap <= 1) return 0
  return Math.floor((bestGap.lower + bestGap.upper) / 2)
}

export async function parseCalendarWorkbook(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true })

  if (!workbook.SheetNames.includes(CALENDAR_SHEET_NAME)) {
    throw new Error(`Không tìm thấy sheet bắt buộc “${CALENDAR_SHEET_NAME}”. Các sheet hiện có: ${workbook.SheetNames.join(', ') || 'không có'}.`)
  }

  const sheet = workbook.Sheets[CALENDAR_SHEET_NAME]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false })
  const headerRow = (matrix[0] || []).map(normalizeHeader)
  const hasHeader = headerRow.some((header) => header.trim() !== '')

  if (!hasHeader) {
    throw new Error(`Sheet “${CALENDAR_SHEET_NAME}” không có hàng header hợp lệ.`)
  }

  const duplicateHeaders = headerRow.filter((header, index) => header && headerRow.indexOf(header) !== index)
  if (duplicateHeaders.length) {
    throw new Error(`Header bị trùng: ${[...new Set(duplicateHeaders)].join(', ')}.`)
  }

  const columns = headerRow.map((label, index) => ({ label, index, key: getHeaderKey(index) }))
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
  }).filter((row) => row.values.some(hasValue))

  if (!rows.length) {
    throw new Error(`Sheet “${CALENDAR_SHEET_NAME}” có header nhưng không có dữ liệu bên dưới header.`)
  }

  const sparseRowThreshold = findSparseRowThreshold(rows)
  const validRows = sparseRowThreshold > 0
    ? rows.filter((row) => row.values.filter(hasValue).length > sparseRowThreshold)
    : rows
  const excludedRows = sparseRowThreshold > 0
    ? rows.filter((row) => row.values.filter(hasValue).length <= sparseRowThreshold)
    : []
  const skippedRows = excludedRows.length
  const warnings = skippedRows
    ? [`${skippedRows} dòng có cấu trúc thưa bất thường và được giữ riêng trong validation report, không đưa vào import.`]
    : []

  const uniqueCounts = columns.map((column) => new Set(validRows.map((row) => String(row.values[column.index] ?? '')).filter(Boolean)).size)
  const filterOptions = columns.reduce((result, column) => {
    const values = [...new Set(validRows.map((row) => row.values[column.index]).filter(hasValue))]
    if (values.length && values.length <= 200) result[column.key] = values
    return result
  }, {})

  return {
    fileName: file.name,
    sheetName: CALENDAR_SHEET_NAME,
    columns,
    rows: validRows,
    validRows,
    skippedRows,
    warnings,
    excludedRows,
    validationReport: {
      sourceRowCount: rows.length,
      importedRowCount: validRows.length,
      sparseRowThreshold,
      skippedRowNumbers: excludedRows.map((row) => row.sourceRowNumber),
    },
    filterOptions,
    columnStats: columns.map((column) => ({ ...column, uniqueCount: uniqueCounts[column.index] })),
    previewRows: validRows.slice(0, 8),
  }
}
