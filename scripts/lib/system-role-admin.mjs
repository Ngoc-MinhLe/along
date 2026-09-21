import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { SYSTEM_ROLES } from '../../src/services/rbac/roles.js'
import { claimsSystemRole, validateRootAuthorization } from './system-role-core.mjs'

const projectId = process.env.FIREBASE_PROJECT_ID || 'along-6e1ce'
const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId })

export const adminAuth = getAuth(app)
export const adminDb = getFirestore(app)
export const usersCollection = adminDb.collection('users')

export async function findTarget(identifier) {
  if (!identifier) throw new Error('Target not found: UID or email is required.')
  let authUser
  try {
    authUser = identifier.includes('@')
      ? await adminAuth.getUserByEmail(identifier)
      : await adminAuth.getUser(identifier)
  } catch (error) {
    if (error.code === 'auth/user-not-found') throw new Error(`Target not found: ${identifier}.`)
    throw error
  }

  const profileSnapshot = await usersCollection.doc(authUser.uid).get()
  if (!profileSnapshot.exists) throw new Error(`Target not found: users/${authUser.uid} does not exist.`)
  return { authUser, profile: profileSnapshot.data(), profileRef: profileSnapshot.ref }
}

export async function authorizeRootOperator() {
  const rootToken = process.env.RBAC_ROOT_ID_TOKEN
  if (!rootToken) throw new Error('Authorization failed: set RBAC_ROOT_ID_TOKEN to a fresh Firebase ID token for the current ROOT. Do not store it in the repository.')

  const lockSnapshot = await adminDb.doc('systemConfig/root').get()
  const rootUid = lockSnapshot.exists ? lockSnapshot.data()?.rootUid : ''
  if (!rootUid) throw new Error('Authorization failed: systemConfig/root.rootUid is missing.')

  let decodedToken
  try {
    decodedToken = await adminAuth.verifyIdToken(rootToken, true)
  } catch (error) {
    throw new Error(`Authorization failed: ROOT ID token is invalid, expired, or revoked (${error.code || error.message}).`)
  }

  const [rootAuthUser, rootProfileSnapshot, rootProfiles] = await Promise.all([
    adminAuth.getUser(rootUid),
    usersCollection.doc(rootUid).get(),
    usersCollection.where('systemRole', '==', SYSTEM_ROLES.ROOT_ADMIN).limit(2).get(),
  ])

  validateRootAuthorization({
    rootUid,
    actorUid: decodedToken.uid,
    actorClaims: decodedToken,
    rootProfile: rootProfileSnapshot.exists ? rootProfileSnapshot.data() : null,
    rootAuthClaims: rootAuthUser.customClaims || {},
    rootCount: rootProfiles.size,
  })

  return { rootUid, actorUid: decodedToken.uid }
}

export async function readTargetState(targetUid) {
  const [authUser, profileSnapshot] = await Promise.all([
    adminAuth.getUser(targetUid),
    usersCollection.doc(targetUid).get(),
  ])
  if (!profileSnapshot.exists) throw new Error(`Verification failed: users/${targetUid} no longer exists.`)
  return {
    claims: authUser.customClaims || {},
    profileRole: profileSnapshot.data()?.systemRole,
    claimsRole: claimsSystemRole(authUser.customClaims || {}),
  }
}
