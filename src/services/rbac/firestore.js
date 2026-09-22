import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore'
import { db } from '../../firebase/client'

function requireDb() {
  if (!db) throw new Error('Firestore chưa được cấu hình.')
  return db
}

export async function listCustomRoles() {
  const snapshot = await getDocs(query(collection(requireDb(), 'roles'), orderBy('updatedAt', 'desc')))
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((role) => role.type === 'CUSTOM')
}

export async function getCustomRolesByIds(roleIds = []) {
  const database = requireDb()
  const uniqueRoleIds = [...new Set(roleIds.filter((roleId) => typeof roleId === 'string' && roleId))]
  const snapshots = await Promise.all(uniqueRoleIds.map((roleId) => getDoc(doc(database, 'roles', roleId))))
  return snapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
}

export async function listUsers() {
  const snapshot = await getDocs(collection(requireDb(), 'users'))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}
