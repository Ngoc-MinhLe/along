import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'along-6e1ce'
const ROOT_ADMIN_UID = process.env.ROOT_ADMIN_UID

if (!ROOT_ADMIN_UID) {
  throw new Error('Thiếu ROOT_ADMIN_UID. Hãy đặt biến môi trường local trước khi chạy script.')
}

const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
const auth = getAuth(app)
const db = getFirestore(app)
const usersCollection = db.collection('users')
const targetRef = usersCollection.doc(ROOT_ADMIN_UID)
const rootLockRef = db.doc('systemConfig/root')

async function bootstrapRoot() {
  const authUser = await auth.getUser(ROOT_ADMIN_UID)
  const result = await db.runTransaction(async (transaction) => {
    const lockSnapshot = await transaction.get(rootLockRef)
    const targetSnapshot = await transaction.get(targetRef)
    const rootsSnapshot = await transaction.get(usersCollection.where('systemRole', '==', 'ROOT_ADMIN').limit(2))
    const existingRoot = rootsSnapshot.docs[0]
    const lockedUid = lockSnapshot.exists ? lockSnapshot.data().rootUid : null

    if (lockedUid && lockedUid !== ROOT_ADMIN_UID) throw new Error(`Đã tồn tại root lock cho UID khác: ${lockedUid}. Dừng, không tự thay ROOT.`)
    if (existingRoot && existingRoot.id !== ROOT_ADMIN_UID) throw new Error(`Đã tồn tại ROOT_ADMIN khác: ${existingRoot.id}. Dừng, không tạo ROOT thứ hai.`)

    const existingProfile = targetSnapshot.exists ? targetSnapshot.data() : {}
    const now = Timestamp.now()
    const profile = {
      uid: ROOT_ADMIN_UID,
      email: authUser.email || existingProfile.email || '',
      displayName: authUser.displayName || existingProfile.displayName || '',
      photoURL: authUser.photoURL || existingProfile.photoURL || '',
      systemRole: 'ROOT_ADMIN',
      status: existingProfile.status || 'active',
      createdAt: existingProfile.createdAt || now,
      updatedAt: now,
      lastLoginAt: existingProfile.lastLoginAt || now,
    }

    transaction.set(rootLockRef, { rootUid: ROOT_ADMIN_UID, updatedAt: now, version: 1 }, { merge: true })
    transaction.set(targetRef, profile, { merge: true })
    return { existed: targetSnapshot.exists }
  })

  const currentClaims = authUser.customClaims || {}
  await auth.setCustomUserClaims(ROOT_ADMIN_UID, { ...currentClaims, systemRole: 'ROOT_ADMIN', roleVersion: 1 })

  const verifiedUser = await auth.getUser(ROOT_ADMIN_UID)
  const verifiedProfile = await targetRef.get()
  const rootCount = await usersCollection.where('systemRole', '==', 'ROOT_ADMIN').get()
  if (rootCount.size !== 1 || rootCount.docs[0].id !== ROOT_ADMIN_UID) throw new Error(`Kiểm tra sau bootstrap thất bại: số ROOT hiện tại là ${rootCount.size}.`)
  if (verifiedUser.customClaims?.systemRole !== 'ROOT_ADMIN') throw new Error('Kiểm tra Custom Claims thất bại.')
  if (verifiedProfile.data()?.systemRole !== 'ROOT_ADMIN') throw new Error('Kiểm tra users/{uid}.systemRole thất bại.')

  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    rootUid: ROOT_ADMIN_UID,
    profileExisted: result.existed,
    rootCount: rootCount.size,
    claims: verifiedUser.customClaims,
    profile: { systemRole: verifiedProfile.data()?.systemRole, status: verifiedProfile.data()?.status },
  }, null, 2))
}

bootstrapRoot().catch((error) => {
  console.error(`Bootstrap ROOT thất bại: ${error.message}`)
  process.exitCode = 1
})
