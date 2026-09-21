import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase/client'
import { validateCustomRole } from './policy'
import { generateRoleId, roleIdCandidate } from './roleId'

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

export async function createCustomRole(role, actorUid) {
  const baseId = generateRoleId(role.name)
  const errors = validateCustomRole({ ...role, id: baseId, type: 'CUSTOM', status: 'active' })
  if (!role.name?.trim()) errors.push('Tên role là bắt buộc.')
  if (errors.length) throw new Error(errors.join(' '))

  const database = requireDb()
  return runTransaction(database, async (transaction) => {
    for (let index = 1; index <= 1000; index += 1) {
      const id = roleIdCandidate(baseId, index)
      const roleRef = doc(database, 'roles', id)
      const snapshot = await transaction.get(roleRef)
      if (!snapshot.exists()) {
        transaction.set(roleRef, {
          id,
          name: role.name.trim(),
          description: role.description?.trim() || '',
          type: 'CUSTOM',
          status: 'active',
          permissions: role.permissions,
          createdBy: actorUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        return { id }
      }
    }
    throw new Error('Không thể tự sinh Role ID vì đã có quá nhiều ID trùng.')
  })
}

export async function updateCustomRole(roleId, changes) {
  const role = { id: roleId, type: 'CUSTOM', status: changes.status || 'active', permissions: changes.permissions || [] }
  const errors = validateCustomRole(role)
  if (!changes.name?.trim()) errors.push('Tên role là bắt buộc.')
  if (errors.length) throw new Error(errors.join(' '))
  await updateDoc(doc(requireDb(), 'roles', roleId), {
    name: changes.name.trim(),
    description: changes.description?.trim() || '',
    permissions: changes.permissions,
    updatedAt: serverTimestamp(),
  })
  return { id: roleId }
}

export function setCustomRoleStatus(roleId, status) {
  return updateDoc(doc(requireDb(), 'roles', roleId), { status, updatedAt: serverTimestamp() })
}

export function removeCustomRole(roleId) {
  return deleteDoc(doc(requireDb(), 'roles', roleId))
}

export function assignCustomRole(userId, roleId) {
  return updateDoc(doc(requireDb(), 'users', userId), { customRoles: arrayUnion(roleId), updatedAt: serverTimestamp() })
}

export function revokeCustomRole(userId, roleId) {
  return updateDoc(doc(requireDb(), 'users', userId), { customRoles: arrayRemove(roleId), updatedAt: serverTimestamp() })
}
