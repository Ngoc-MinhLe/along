import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import {
  canManageRole,
  canManageUserRole,
  getEffectivePermissions,
  getSystemRole,
  validateCustomRole,
} from '../src/services/rbac/policy.js'
import { PERMISSION_VALUES } from '../src/services/rbac/permissions.js'
import { isSystemRole, SYSTEM_ROLES } from '../src/services/rbac/roles.js'

const projectId = process.env.FIREBASE_PROJECT_ID || 'along-6e1ce'
const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId })
const auth = getAuth(app)
const db = getFirestore(app)
const users = db.collection('users')
const roles = db.collection('roles')
const command = process.argv[2]

function option(name, fallback = '') {
  const value = process.argv.slice(3).find((arg) => arg.startsWith(`--${name}=`))
  return value ? value.slice(name.length + 3) : fallback
}

function requiredOption(name) {
  const value = option(name)
  if (!value) throw new Error(`Thiếu tham số --${name}=...`)
  return value
}

function permissionsOption() {
  return option('permissions').split(',').map((value) => value.trim()).filter(Boolean)
}

async function getRoleMap(roleIds = []) {
  const entries = await Promise.all(roleIds.map(async (roleId) => {
    const snapshot = await roles.doc(roleId).get()
    return snapshot.exists ? [roleId, { id: snapshot.id, ...snapshot.data() }] : null
  }))
  return Object.fromEntries(entries.filter(Boolean))
}

async function getActor() {
  const actorUid = process.env.RBAC_ACTOR_UID
  if (!actorUid) throw new Error('Thiếu RBAC_ACTOR_UID. Đây là UID của actor đang thực hiện trusted operation.')
  const authUser = await auth.getUser(actorUid)
  const profileSnapshot = await users.doc(actorUid).get()
  if (!profileSnapshot.exists) throw new Error('Actor chưa có users/{uid}.')
  const profile = profileSnapshot.data()
  const roleMap = await getRoleMap(profile.customRoles || [])
  const actor = { ...profile, uid: actorUid, claims: authUser.customClaims || {} }
  if (!getSystemRole(actor)) throw new Error('Actor chưa có systemRole hợp lệ.')
  return { actor, roleMap }
}

function assertValidRole(role) {
  const errors = validateCustomRole(role)
  if (errors.length) throw new Error(errors.join(' '))
  if (role.permissions.some((permission) => !PERMISSION_VALUES.includes(permission))) throw new Error('Role chứa permission ngoài catalog.')
}

function assertCanManage(actor, role, action, roleMap) {
  if (!canManageRole(actor, role, action, roleMap)) throw new Error(`Actor ${getSystemRole(actor)} không có quyền ${action} role này.`)
}

async function createRole(actor, roleMap) {
  const id = requiredOption('role-id')
  const role = {
    id,
    name: option('name', id),
    description: option('description'),
    type: 'CUSTOM',
    status: 'active',
    permissions: permissionsOption(),
  }
  assertValidRole(role)
  assertCanManage(actor, role, 'create', roleMap)
  const ref = roles.doc(id)
  if ((await ref.get()).exists) throw new Error(`Role ${id} đã tồn tại.`)
  const now = Timestamp.now()
  await ref.set({ ...role, createdAt: now, updatedAt: now, createdBy: actor.uid })
  console.log(`Created custom role ${id}`)
}

async function updateRole(actor, roleMap) {
  const id = requiredOption('role-id')
  const ref = roles.doc(id)
  const snapshot = await ref.get()
  if (!snapshot.exists) throw new Error(`Không tìm thấy role ${id}.`)
  const current = { id, ...snapshot.data() }
  if (current.type !== 'CUSTOM') throw new Error('Không thể sửa System Role.')
  const next = {
    ...current,
    name: option('name', current.name),
    description: option('description', current.description),
    permissions: process.argv.slice(3).some((arg) => arg.startsWith('--permissions=')) ? permissionsOption() : current.permissions,
    updatedAt: Timestamp.now(),
  }
  assertValidRole(next)
  assertCanManage(actor, next, 'update', roleMap)
  await ref.set({ name: next.name, description: next.description, permissions: next.permissions, updatedAt: next.updatedAt }, { merge: true })
  console.log(`Updated custom role ${id}`)
}

async function disableRole(actor, roleMap) {
  const id = requiredOption('role-id')
  const ref = roles.doc(id)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data().type !== 'CUSTOM') throw new Error('Chỉ được disable Custom Role tồn tại.')
  const role = { id, ...snapshot.data() }
  assertCanManage(actor, role, 'disable', roleMap)
  await ref.set({ status: 'disabled', updatedAt: Timestamp.now() }, { merge: true })
  console.log(`Disabled custom role ${id}`)
}

async function deleteRole(actor, roleMap) {
  const id = requiredOption('role-id')
  const ref = roles.doc(id)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data().type !== 'CUSTOM') throw new Error('Chỉ được xóa Custom Role tồn tại.')
  const role = { id, ...snapshot.data() }
  assertCanManage(actor, role, 'delete', roleMap)
  const assigned = await users.where('customRoles', 'array-contains', id).limit(1).get()
  if (!assigned.empty) throw new Error(`Role ${id} đang được gán; hãy revoke hoặc disable trước khi xóa.`)
  await ref.delete()
  console.log(`Deleted custom role ${id}`)
}

async function assignRole(actor, actorRoleMap) {
  const targetUid = requiredOption('uid')
  const roleId = requiredOption('role')
  const targetAuth = await auth.getUser(targetUid)
  const targetSnapshot = await users.doc(targetUid).get()
  if (!targetSnapshot.exists) throw new Error('Target chưa có users/{uid}.')
  const targetProfile = targetSnapshot.data()
  const roleMap = { ...actorRoleMap, ...(isSystemRole(roleId) ? {} : await getRoleMap([roleId])) }
  const target = { ...targetProfile, uid: targetUid, claims: targetAuth.customClaims || {} }
  if (!canManageUserRole(actor, target, roleId, roleMap)) throw new Error(`Actor ${getSystemRole(actor)} không được assign ${roleId}.`)

  const now = Timestamp.now()
  if (isSystemRole(roleId)) {
    const claims = { ...(targetAuth.customClaims || {}), systemRole: roleId, roleVersion: (targetAuth.customClaims?.roleVersion || 0) + 1 }
    await auth.setCustomUserClaims(targetUid, claims)
    await users.doc(targetUid).set({ systemRole: roleId, updatedAt: now }, { merge: true })
  } else {
    const customRoles = [...new Set([...(targetProfile.customRoles || []), roleId])]
    await users.doc(targetUid).set({ customRoles, updatedAt: now }, { merge: true })
  }
  console.log(`Assigned ${roleId} to ${targetUid}`)
}

async function revokeRole(actor, actorRoleMap) {
  const targetUid = requiredOption('uid')
  const roleId = requiredOption('role')
  const targetAuth = await auth.getUser(targetUid)
  const targetSnapshot = await users.doc(targetUid).get()
  if (!targetSnapshot.exists) throw new Error('Target chưa có users/{uid}.')
  const targetProfile = targetSnapshot.data()
  const target = { ...targetProfile, uid: targetUid, claims: targetAuth.customClaims || {} }
  if (target.claims.systemRole === SYSTEM_ROLES.ROOT_ADMIN || target.systemRole === SYSTEM_ROLES.ROOT_ADMIN) throw new Error('Không được revoke role của ROOT_ADMIN.')
  if (isSystemRole(roleId)) {
    if (!canManageUserRole(actor, target, roleId, actorRoleMap)) throw new Error(`Actor không được revoke ${roleId}.`)
    const claims = { ...(targetAuth.customClaims || {}), systemRole: SYSTEM_ROLES.USER, roleVersion: (targetAuth.customClaims?.roleVersion || 0) + 1 }
    await auth.setCustomUserClaims(targetUid, claims)
    await users.doc(targetUid).set({ systemRole: SYSTEM_ROLES.USER, updatedAt: Timestamp.now() }, { merge: true })
  } else {
    const role = (await roles.doc(roleId).get()).data()
    if (!role || !canManageRole(actor, { id: roleId, ...role }, 'assign', actorRoleMap)) throw new Error(`Actor không được revoke ${roleId}.`)
    await users.doc(targetUid).set({ customRoles: (targetProfile.customRoles || []).filter((id) => id !== roleId), updatedAt: Timestamp.now() }, { merge: true })
  }
  console.log(`Revoked ${roleId} from ${targetUid}`)
}

async function main() {
  const { actor, roleMap } = await getActor()
  if (command === 'create-role') return createRole(actor, roleMap)
  if (command === 'update-role') return updateRole(actor, roleMap)
  if (command === 'disable-role') return disableRole(actor, roleMap)
  if (command === 'delete-role') return deleteRole(actor, roleMap)
  if (command === 'assign-role') return assignRole(actor, roleMap)
  if (command === 'revoke-role') return revokeRole(actor, roleMap)
  throw new Error('Command không hợp lệ: create-role, update-role, disable-role, delete-role, assign-role, revoke-role')
}

main().catch((error) => {
  console.error(`RBAC operation thất bại: ${error.message}`)
  process.exitCode = 1
})
