import { Timestamp } from 'firebase-admin/firestore'
import { adminDb, usersCollection } from './system-role-admin.mjs'
import { authorizationData, buildAuthorizationPlan } from './authorization-core.mjs'

export const authorizationsCollection = adminDb.collection('userAuthorizations')
const rolesCollection = adminDb.collection('roles')

function profileFromSnapshot(uid, snapshot) {
  if (!snapshot.exists) throw new Error(`users/${uid} does not exist.`)
  const profile = snapshot.data()
  if (profile.uid !== uid) throw new Error(`users/${uid}.uid is missing or inconsistent.`)
  return profile
}

export async function getAuthorizationRoleMap(roleIds = []) {
  const uniqueRoleIds = [...new Set(roleIds.filter((roleId) => typeof roleId === 'string' && roleId))]
  const snapshots = await Promise.all(uniqueRoleIds.map((roleId) => rolesCollection.doc(roleId).get()))
  return Object.fromEntries(snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => [snapshot.id, { id: snapshot.id, ...snapshot.data() }]))
}

export async function planUserAuthorization(uid, profileOverride = null) {
  const [profileSnapshot, authorizationSnapshot] = await Promise.all([
    profileOverride ? null : usersCollection.doc(uid).get(),
    authorizationsCollection.doc(uid).get(),
  ])
  const profile = profileOverride || profileFromSnapshot(uid, profileSnapshot)
  if (profile.uid !== uid) throw new Error(`users/${uid}.uid is missing or inconsistent.`)
  const roleMap = await getAuthorizationRoleMap(profile.customRoles || [])
  return buildAuthorizationPlan({
    uid,
    profile,
    roleMap,
    currentAuthorization: authorizationSnapshot.exists ? authorizationSnapshot.data() : null,
  })
}

export async function materializeUserAuthorization(uid, { dryRun = false } = {}) {
  const plan = await planUserAuthorization(uid)
  if (!plan.needsWrite || dryRun) return { plan, status: plan.needsWrite ? 'dry-run' : 'consistent' }
  await authorizationsCollection.doc(uid).set(authorizationData(plan, Timestamp.now()))
  return { plan, status: 'updated' }
}

export async function updateUserCustomRolesAndAuthorization(uid, customRoles) {
  const profileSnapshot = await usersCollection.doc(uid).get()
  const profile = profileFromSnapshot(uid, profileSnapshot)
  const nextProfile = { ...profile, customRoles: [...new Set(customRoles)] }
  const plan = await planUserAuthorization(uid, nextProfile)
  const batch = adminDb.batch()
  batch.set(usersCollection.doc(uid), { customRoles: nextProfile.customRoles, updatedAt: Timestamp.now() }, { merge: true })
  batch.set(authorizationsCollection.doc(uid), authorizationData(plan, Timestamp.now()))
  await batch.commit()
  return plan
}

export async function updateUserSystemRoleAndAuthorization(uid, systemRole) {
  const profileSnapshot = await usersCollection.doc(uid).get()
  const profile = profileFromSnapshot(uid, profileSnapshot)
  const nextProfile = { ...profile, systemRole }
  const plan = await planUserAuthorization(uid, nextProfile)
  const batch = adminDb.batch()
  batch.set(usersCollection.doc(uid), { systemRole, updatedAt: Timestamp.now() }, { merge: true })
  batch.set(authorizationsCollection.doc(uid), authorizationData(plan, Timestamp.now()))
  await batch.commit()
  return plan
}

export async function materializeUsersAssignedRole(roleId, { dryRun = false } = {}) {
  const snapshot = await usersCollection.where('customRoles', 'array-contains', roleId).get()
  const results = []
  for (const userSnapshot of snapshot.docs) {
    const result = await materializeUserAuthorization(userSnapshot.id, { dryRun })
    results.push({ uid: userSnapshot.id, ...result })
  }
  return results
}

export async function materializeAllUserAuthorizations({ dryRun = false, onProgress } = {}) {
  const snapshot = await usersCollection.get()
  const results = []
  for (let index = 0; index < snapshot.docs.length; index += 1) {
    const userSnapshot = snapshot.docs[index]
    const result = await materializeUserAuthorization(userSnapshot.id, { dryRun })
    results.push({ uid: userSnapshot.id, ...result })
    onProgress?.(index + 1, snapshot.docs.length, results.at(-1))
  }
  return results
}

export async function checkAllUserAuthorizations() {
  return materializeAllUserAuthorizations({ dryRun: true })
}
