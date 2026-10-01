import {
  doc,
  getDoc,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db } from '../../firebase/client'
import { functions } from '../../firebase/client'

function requireDb() {
  if (!db) throw new Error('Firestore chưa được cấu hình.')
  return db
}

export async function listCustomRoles({ pageSize = 50, cursor = null, status = '', query = '' } = {}) {
  if (!functions) throw new Error('Firebase Functions chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh.')
  const callable = httpsCallable(functions, 'listCustomRoles')
  const response = await callable({ pageSize, ...(cursor ? { cursor } : {}), ...(status ? { status } : {}), ...(query.trim() ? { query: query.trim() } : {}) })
  return response.data?.items || []
}

export async function listCustomRolesPage({ pageSize = 50, cursor = null, status = '', query = '' } = {}) {
  if (!functions) throw new Error('Firebase Functions is not configured.')
  const callable = httpsCallable(functions, 'listCustomRoles')
  const response = await callable({ pageSize, ...(cursor ? { cursor } : {}), ...(status ? { status } : {}), ...(query.trim() ? { query: query.trim() } : {}) })
  return response.data
}

export async function getCustomRolesByIds(roleIds = []) {
  const database = requireDb()
  const uniqueRoleIds = [...new Set(roleIds.filter((roleId) => typeof roleId === 'string' && roleId))]
  const snapshots = await Promise.all(uniqueRoleIds.map((roleId) => getDoc(doc(database, 'roles', roleId))))
  return snapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
}

export async function listUsers() {
  const result = await listUsersPage({ pageSize: 50 })
  return result.items || []
}

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh.')
  return functions
}

export async function listUsersPage(payload = {}) {
  const callable = httpsCallable(requireFunctions(), 'listUsers')
  const response = await callable(payload)
  return response.data
}
