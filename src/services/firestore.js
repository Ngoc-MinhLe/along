import { collection, getDocs, limit, query } from 'firebase/firestore'
import { db } from '../firebase/client'

export function requireFirestore() {
  if (!db) {
    throw new Error('Firebase chưa được cấu hình. Hãy tạo file .env từ .env.example.')
  }
  return db
}

// Service nền cho Module 1; chưa thực hiện import hoặc truy vấn dữ liệu thật.
export async function getCalendarPreview() {
  const database = requireFirestore()
  const snapshot = await getDocs(query(collection(database, 'calendarEntries'), limit(10)))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}
