import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayRemove, arrayUnion, deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore'

const PROJECT_ID = 'along-rules-audit'
const ROOT_UID = 'root-audit-uid'
const USER_UID = 'user-audit-uid'
const OTHER_UID = 'other-audit-uid'
const EDITOR_UID = 'editor-audit-uid'
const ADMIN_UID = 'admin-audit-uid'
const SUPER_ADMIN_UID = 'super-admin-audit-uid'
const [host = '127.0.0.1', port = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST || '').split(':')

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    host,
    port: Number(port),
    rules: readFileSync('firestore.rules', 'utf8'),
  },
})

const rootDb = testEnv.authenticatedContext(ROOT_UID, { systemRole: 'ROOT_ADMIN' }).firestore()
const userDb = testEnv.authenticatedContext(USER_UID, { systemRole: 'USER' }).firestore()
const otherDb = testEnv.authenticatedContext(OTHER_UID, { systemRole: 'USER' }).firestore()
const editorDb = testEnv.authenticatedContext(EDITOR_UID, { systemRole: 'EDITOR' }).firestore()
const adminDb = testEnv.authenticatedContext(ADMIN_UID, { systemRole: 'ADMIN' }).firestore()
const superAdminDb = testEnv.authenticatedContext(SUPER_ADMIN_UID, { systemRole: 'SUPER_ADMIN' }).firestore()
const guestDb = testEnv.unauthenticatedContext().firestore()
const now = Timestamp.now()
const results = []

function userData(uid, systemRole = 'USER') {
  return {
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    photoURL: '',
    systemRole,
    status: 'active',
    customRoles: [],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  }
}

function roleData(id, permissions = ['news.read']) {
  return {
    id,
    name: id,
    description: 'Security audit role',
    type: 'CUSTOM',
    status: 'active',
    permissions,
    createdBy: ROOT_UID,
    createdAt: now,
    updatedAt: now,
  }
}

async function allow(name, operation) {
  await assertSucceeds(operation)
  results.push(`ALLOW ${name}`)
}

async function deny(name, operation) {
  await assertFails(operation)
  results.push(`DENY  ${name}`)
}

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', ROOT_UID), userData(ROOT_UID, 'ROOT_ADMIN'))
    await setDoc(doc(db, 'users', USER_UID), userData(USER_UID))
    await setDoc(doc(db, 'users', OTHER_UID), userData(OTHER_UID))
    await setDoc(doc(db, 'users', EDITOR_UID), userData(EDITOR_UID, 'EDITOR'))
    await setDoc(doc(db, 'users', ADMIN_UID), userData(ADMIN_UID, 'ADMIN'))
    await setDoc(doc(db, 'users', SUPER_ADMIN_UID), userData(SUPER_ADMIN_UID, 'SUPER_ADMIN'))
    await setDoc(doc(db, 'roles', 'EXISTING_ROLE'), roleData('EXISTING_ROLE'))
    await setDoc(doc(db, 'systemConfig', 'root'), { rootUid: ROOT_UID, updatedAt: now })
  })

  await deny('CASE 1 USER tự thêm customRoles', updateDoc(doc(userDb, 'users', USER_UID), { customRoles: arrayUnion('EXISTING_ROLE'), updatedAt: now }))
  await deny('CASE 2 USER đổi systemRole thành ADMIN', updateDoc(doc(userDb, 'users', USER_UID), { systemRole: 'ADMIN', updatedAt: now }))
  await deny('CASE 3 USER đổi systemRole thành ROOT_ADMIN', updateDoc(doc(userDb, 'users', USER_UID), { systemRole: 'ROOT_ADMIN', updatedAt: now }))
  await deny('CASE 4 USER đổi status', updateDoc(doc(userDb, 'users', USER_UID), { status: 'suspended', updatedAt: now }))
  await deny('CASE 5 USER sửa customRoles user khác', updateDoc(doc(userDb, 'users', OTHER_UID), { customRoles: arrayUnion('EXISTING_ROLE'), updatedAt: now }))
  await deny('CASE 6 USER tạo role chứa users.delete', setDoc(doc(userDb, 'roles', 'DANGEROUS_ROLE'), roleData('DANGEROUS_ROLE', ['users.delete'])))
  await deny('CASE 6B ROOT cũng không thể tạo Custom Role chứa users.delete', setDoc(doc(rootDb, 'roles', 'DANGEROUS_ROOT_ROLE'), roleData('DANGEROUS_ROOT_ROLE', ['users.delete'])))
  await deny('CASE 7 USER tạo role ROOT_ADMIN', setDoc(doc(userDb, 'roles', 'ROOT_ADMIN'), roleData('ROOT_ADMIN')))
  await deny('CASE 7B ROOT không thể tạo Custom Role ROOT_ADMIN', setDoc(doc(rootDb, 'roles', 'ROOT_ADMIN'), roleData('ROOT_ADMIN')))
  await allow('CASE 8 ROOT tạo Custom Role hợp lệ', setDoc(doc(rootDb, 'roles', 'CONTENT_MANAGER'), roleData('CONTENT_MANAGER', ['news.read', 'news.update'])))
  await allow('CASE 9 ROOT gán Custom Role cho USER', updateDoc(doc(rootDb, 'users', USER_UID), { customRoles: arrayUnion('CONTENT_MANAGER'), updatedAt: Timestamp.now() }))
  await allow('CASE 10 ROOT thu hồi Custom Role', updateDoc(doc(rootDb, 'users', USER_UID), { customRoles: arrayRemove('CONTENT_MANAGER'), updatedAt: Timestamp.now() }))
  await deny('CASE 11 USER sửa role', updateDoc(doc(userDb, 'roles', 'EXISTING_ROLE'), { name: 'Hacked', updatedAt: Timestamp.now() }))
  await deny('CASE 12 USER xóa role', deleteDoc(doc(userDb, 'roles', 'EXISTING_ROLE')))
  await deny('CASE 13 ROOT đổi systemRole của USER', updateDoc(doc(rootDb, 'users', USER_UID), { systemRole: 'ADMIN', updatedAt: Timestamp.now() }))
  await deny('CASE 14 ROOT đổi systemRole chính ROOT', updateDoc(doc(rootDb, 'users', ROOT_UID), { systemRole: 'SUPER_ADMIN', updatedAt: Timestamp.now() }))
  await deny('CASE 15 client ghi systemConfig/root', updateDoc(doc(rootDb, 'systemConfig', 'root'), { rootUid: OTHER_UID, updatedAt: Timestamp.now() }))

  await allow('ROOT đọc users', getDoc(doc(rootDb, 'users', USER_UID)))
  await deny('GUEST đọc users', getDoc(doc(guestDb, 'users', USER_UID)))
  await deny('ROOT tự thêm customRoles cho chính mình', updateDoc(doc(rootDb, 'users', ROOT_UID), { customRoles: arrayUnion('CONTENT_MANAGER'), updatedAt: Timestamp.now() }))
  await deny('ROOT tạo permission ngoài catalog', setDoc(doc(rootDb, 'roles', 'UNKNOWN_PERMISSION'), roleData('UNKNOWN_PERMISSION', ['unknown.permission'])))
  await allow('ROOT disable Custom Role', updateDoc(doc(rootDb, 'roles', 'CONTENT_MANAGER'), { status: 'disabled', updatedAt: Timestamp.now() }))
  await allow('ROOT enable Custom Role', updateDoc(doc(rootDb, 'roles', 'CONTENT_MANAGER'), { status: 'active', updatedAt: Timestamp.now() }))
  await allow('ROOT xóa Custom Role', deleteDoc(doc(rootDb, 'roles', 'CONTENT_MANAGER')))

  // Phase 4B keeps browser-side System Role mutation disabled until a trusted
  // backend can synchronize both the profile and Firebase Custom Claims.
  await deny('4B.1 USER cannot change own System Role', updateDoc(doc(userDb, 'users', USER_UID), { systemRole: 'EDITOR', updatedAt: Timestamp.now() }))
  await deny('4B.2 USER cannot change another user System Role', updateDoc(doc(userDb, 'users', OTHER_UID), { systemRole: 'EDITOR', updatedAt: Timestamp.now() }))
  await deny('4B.3 EDITOR cannot change System Role', updateDoc(doc(editorDb, 'users', OTHER_UID), { systemRole: 'ADMIN', updatedAt: Timestamp.now() }))
  await deny('4B.4 ADMIN cannot change System Role', updateDoc(doc(adminDb, 'users', OTHER_UID), { systemRole: 'EDITOR', updatedAt: Timestamp.now() }))
  await deny('4B.5 SUPER_ADMIN cannot change System Role', updateDoc(doc(superAdminDb, 'users', OTHER_UID), { systemRole: 'ADMIN', updatedAt: Timestamp.now() }))
  await deny('4B.6 ROOT browser cannot assign EDITOR before claims sync backend', updateDoc(doc(rootDb, 'users', OTHER_UID), { systemRole: 'EDITOR', updatedAt: Timestamp.now() }))
  await deny('4B.7 ROOT browser cannot assign ADMIN before claims sync backend', updateDoc(doc(rootDb, 'users', OTHER_UID), { systemRole: 'ADMIN', updatedAt: Timestamp.now() }))
  await deny('4B.8 ROOT browser cannot assign SUPER_ADMIN before claims sync backend', updateDoc(doc(rootDb, 'users', OTHER_UID), { systemRole: 'SUPER_ADMIN', updatedAt: Timestamp.now() }))
  await deny('4B.9 ROOT cannot assign ROOT_ADMIN', updateDoc(doc(rootDb, 'users', OTHER_UID), { systemRole: 'ROOT_ADMIN', updatedAt: Timestamp.now() }))
  await deny('4B.10 ROOT document remains protected', updateDoc(doc(rootDb, 'users', ROOT_UID), { systemRole: 'ROOT_ADMIN', status: 'suspended', updatedAt: Timestamp.now() }))
  await deny('4B.11 ROOT cannot demote ROOT', updateDoc(doc(rootDb, 'users', ROOT_UID), { systemRole: 'USER', updatedAt: Timestamp.now() }))
  await deny('4B.12 Invalid System Role is denied', updateDoc(doc(rootDb, 'users', OTHER_UID), { systemRole: 'OWNER', updatedAt: Timestamp.now() }))
  await deny('4B.13 System Role mutation cannot modify customRoles', updateDoc(doc(rootDb, 'users', OTHER_UID), { systemRole: 'EDITOR', customRoles: ['EXISTING_ROLE'], updatedAt: Timestamp.now() }))
  await deny('4B.14 System Role mutation cannot modify status', updateDoc(doc(rootDb, 'users', OTHER_UID), { systemRole: 'EDITOR', status: 'suspended', updatedAt: Timestamp.now() }))
  await deny('4B.15 System Role mutation cannot modify uid', updateDoc(doc(rootDb, 'users', OTHER_UID), { uid: 'tampered-uid', systemRole: 'EDITOR', updatedAt: Timestamp.now() }))

  results.forEach((result) => console.log(result))
  console.log(`Firestore Rules security audit PASS (${results.length} assertions).`)
} finally {
  await testEnv.cleanup()
}
