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
const BATCH_SIZE = 400

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
  }
  await setDoc(importRef, metadata)

  try {
    for (let start = 0; start < parsed.validRows.length; start += BATCH_SIZE) {
      const chunk = parsed.validRows.slice(start, start + BATCH_SIZE)
      const batch = writeBatch(database)
      chunk.forEach((row) => {
        const entryRef = doc(collection(importRef, 'entries'))
        batch.set(entryRef, {
          importId,
          sourceRowNumber: row.sourceRowNumber,
          sourceFields: row.sourceFields,
          search: row.search,
          range: row.range,
        })
      })
      await batch.commit()
      onProgress?.(Math.min(start + chunk.length, parsed.validRows.length), parsed.validRows.length)
    }
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
  }
  constraints.push(orderBy('__name__'))
  constraints.push(limit(pageSize))
  if (cursor) constraints.push(startAfter(cursor))
  return query(entries, ...constraints)
}

export async function searchCalendarEntries({ importId, filters = {}, cursor = null, pageSize = 25 }) {
  const snapshot = await getDocs(makeCalendarQuery(importId, filters, cursor, pageSize))
  return {
    rows: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    cursor: snapshot.docs.at(-1) || null,
    hasMore: snapshot.size === pageSize,
  }
}
