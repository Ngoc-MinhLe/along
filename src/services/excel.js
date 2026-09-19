import * as XLSX from 'xlsx'

export const CALENDAR_SHEET_NAME = 'LỊCH'
export const REQUIRED_HEADERS = []

const normalizeHeader = (value) => String(value ?? '')

function normalizeCell(value) {
  if (value instanceof Date) return value.toISOString()
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
  }).filter((row) => row.values.some((value) => String(value).trim() !== ''))

  if (!rows.length) {
    throw new Error(`Sheet “${CALENDAR_SHEET_NAME}” có header nhưng không có dữ liệu bên dưới header.`)
  }

  const uniqueCounts = columns.map((column) => new Set(rows.map((row) => String(row.values[column.index] ?? '')).filter(Boolean)).size)
  const filterOptions = columns.reduce((result, column) => {
    const values = [...new Set(rows.map((row) => row.values[column.index]).filter((value) => value !== ''))]
    if (values.length && values.length <= 200) result[column.key] = values
    return result
  }, {})

  return {
    fileName: file.name,
    sheetName: CALENDAR_SHEET_NAME,
    columns,
    rows,
    validRows: rows,
    skippedRows: 0,
    warnings: [],
    filterOptions,
    columnStats: columns.map((column) => ({ ...column, uniqueCount: uniqueCounts[column.index] })),
    previewRows: rows.slice(0, 8),
  }
}
