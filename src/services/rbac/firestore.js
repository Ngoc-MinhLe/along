import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  arrayRemove,
  arrayUnion,
} from 'firebase/firestore'
import { db } from '../../firebase/client'
import { validateCustomRole } from './policy'

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

export async function listUsers() {
  const snapshot = await getDocs(collection(requireDb(), 'users'))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function createCustomRole(role, actorUid) {
  const errors = validateCustomRole(role)
  if (!role.name?.trim()) errors.push('Tên role là bắt buộc.')
  if (errors.length) throw new Error(errors.join(' '))
  await setDoc(doc(requireDb(), 'roles', role.id), {
    id: role.id,
    name: role.name.trim(),
    description: role.description?.trim() || '',
    type: 'CUSTOM',
    status: 'active',
    permissions: role.permissions,
    createdBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
