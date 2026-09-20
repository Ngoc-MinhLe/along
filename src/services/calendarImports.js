import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase/client'

const IMPORTS = 'calendarImports'
const MAX_DOCUMENTS_PER_BATCH = 200
const MAX_BATCH_BYTES = 6 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 900 * 1024

export function requireFirestore() {
  if (!db) throw new Error('Firebase chưa được cấu hình. Hãy kiểm tra file .env và bật Firestore trong Firebase Console.')
  return db
}

export async function listCalendarImports() {
  const snapshot = await getDocs(query(collection(requireFirestore(), IMPORTS), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function importCalendarRows(parsed, onProgress) {
  const database = requireFirestore()
  const importRef = doc(collection(database, IMPORTS))
  const importId = importRef.id
  const metadata = {
    importId,
    fileName: parsed.fileName,
    sheetName: parsed.sheetName,
    status: 'importing',
    createdAt: serverTimestamp(),
    completedAt: null,
    recordCount: parsed.validRows.length,
    skippedCount: parsed.skippedRows,
    columnCount: parsed.columns.length,
    columns: parsed.columns.map(({ label, key }) => ({ label, key })),
    filterOptions: parsed.filterOptions,
    warnings: parsed.warnings,
    validationReport: parsed.validationReport,
  }
  try {
    await setDoc(importRef, metadata)

    let batchRows = []
    let batchBytes = 0
    let batchNumber = 0
    let committedRows = 0

    const commitCurrentBatch = async () => {
      if (!batchRows.length) return
      batchNumber += 1
      const batch = writeBatch(database)
      batchRows.forEach(({ entryRef, payload }) => batch.set(entryRef, payload))
      try {
        await batch.commit()
      } catch (error) {
        const firstRow = batchRows[0].payload.sourceRowNumber
        const lastRow = batchRows[batchRows.length - 1].payload.sourceRowNumber
        throw new Error(`Firestore import batch ${batchNumber} thất bại (Excel row ${firstRow}-${lastRow}, ${batchRows.length} documents): ${error.message}`)
      }
      committedRows += batchRows.length
      onProgress?.(committedRows, parsed.validRows.length)
      batchRows = []
      batchBytes = 0
    }

    for (const row of parsed.validRows) {
      const payload = {
        importId,
        sourceRowNumber: row.sourceRowNumber,
        sourceFields: row.sourceFields,
        search: row.search,
        range: row.range,
      }
      const documentBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength
      if (documentBytes > MAX_DOCUMENT_BYTES) {
        throw new Error(`Document Excel row ${row.sourceRowNumber} quá lớn (${documentBytes} bytes, giới hạn an toàn ${MAX_DOCUMENT_BYTES} bytes). Không thể import document này.`)
      }

      const exceedsBatchLimit = batchRows.length >= MAX_DOCUMENTS_PER_BATCH || (batchRows.length > 0 && batchBytes + documentBytes > MAX_BATCH_BYTES)
      if (exceedsBatchLimit) await commitCurrentBatch()

      batchRows.push({ entryRef: doc(collection(importRef, 'entries')), payload })
      batchBytes += documentBytes
    }
    await commitCurrentBatch()
    await setDoc(importRef, { status: 'completed', completedAt: serverTimestamp() }, { merge: true })
    return { importId, ...metadata, status: 'completed' }
  } catch (error) {
    await setDoc(importRef, { status: 'failed', errorMessage: error.message }, { merge: true })
    throw error
  }
}

function makeCalendarQuery(importId, filters, cursor, pageSize) {
  const entries = collection(requireFirestore(), IMPORTS, importId, 'entries')
  const constraints = []
  Object.entries(filters).forEach(([key, value]) => {
    if (key.startsWith('__')) return
    if (value !== '' && value !== undefined && value !== null) constraints.push(where(`search.${key}`, '==', String(value)))
  })
  if (filters.__rangeKey) {
    if (filters.__rangeStart !== '') constraints.push(where(`range.${filters.__rangeKey}`, '>=', filters.__rangeStart))
    if (filters.__rangeEnd !== '') constraints.push(where(`range.${filters.__rangeKey}`, '<=', filters.__rangeEnd))
    // Firestore requires the inequality field to be the first orderBy field.
    constraints.push(orderBy(`range.${filters.__rangeKey}`, 'asc'))
  }
  constraints.push(orderBy('__name__'))
  constraints.push(limit(pageSize))
  if (cursor) constraints.push(startAfter(cursor))
  return query(entries, ...constraints)
}

function makeFallbackQuery(importId, filters, cursor, pageSize) {
  const entries = collection(requireFirestore(), IMPORTS, importId, 'entries')
  const constraints = []
  if (filters.__rangeKey) {
    if (filters.__rangeStart !== '') constraints.push(where(`range.${filters.__rangeKey}`, '>=', filters.__rangeStart))
    if (filters.__rangeEnd !== '') constraints.push(where(`range.${filters.__rangeKey}`, '<=', filters.__rangeEnd))
    constraints.push(orderBy(`range.${filters.__rangeKey}`, 'asc'))
  } else {
    constraints.push(orderBy('__name__'))
  }
  constraints.push(limit(pageSize))
  if (cursor) constraints.push(startAfter(cursor))
  return query(entries, ...constraints)
}

function applyClientFilters(rows, filters) {
  return rows.filter((row) => Object.entries(filters).every(([key, value]) => {
    if (key.startsWith('__') || value === '' || value === undefined || value === null) return true
    return String(row.search?.[key]) === String(value)
  }))
}

function isMissingCompositeIndex(error) {
  return error?.code === 'failed-precondition' && /index/i.test(error.message || '')
}

async function searchWithoutCompositeIndex({ importId, filters, pageSize }) {
  const rows = []
  let cursor = null
  let hasMore = true
  while (hasMore) {
    const snapshot = await getDocs(makeFallbackQuery(importId, filters, cursor, pageSize))
    rows.push(...snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    hasMore = snapshot.size === pageSize
    cursor = snapshot.docs.at(-1) || null
  }
  return { rows: applyClientFilters(rows, filters), cursor: null, hasMore: false }
}

export async function searchCalendarEntries({ importId, filters = {}, cursor = null, pageSize = 25 }) {
  try {
    const snapshot = await getDocs(makeCalendarQuery(importId, filters, cursor, pageSize))
    return {
      rows: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      cursor: snapshot.docs.at(-1) || null,
      hasMore: snapshot.size === pageSize,
    }
  } catch (error) {
    if (!isMissingCompositeIndex(error)) throw error
    return searchWithoutCompositeIndex({ importId, filters, pageSize: Math.max(pageSize, 200) })
  }
}
