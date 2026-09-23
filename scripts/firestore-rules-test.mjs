import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { PERMISSION_VALUES, PERMISSIONS } from '../src/services/rbac/permissions.js'

const PROJECT_ID = 'along-rules-audit'
const ROOT_UID = 'root-audit-uid'
const USER_UID = 'user-audit-uid'
const OTHER_UID = 'other-audit-uid'
const EDITOR_UID = 'editor-audit-uid'
const ADMIN_UID = 'admin-audit-uid'
const SUPER_ADMIN_UID = 'super-admin-audit-uid'
const IMPORTER_UID = 'importer-audit-uid'
const DISABLED_OPERATOR_UID = 'disabled-operator-audit-uid'
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
const importerDb = testEnv.authenticatedContext(IMPORTER_UID, { systemRole: 'USER' }).firestore()
const disabledOperatorDb = testEnv.authenticatedContext(DISABLED_OPERATOR_UID, { systemRole: 'USER' }).firestore()
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

function authorizationData(uid, permissions, systemRole = 'USER', customRoles = []) {
  return { uid, permissions, systemRole, customRoles, version: 1, updatedAt: now }
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
    await setDoc(doc(db, 'users', IMPORTER_UID), userData(IMPORTER_UID))
    await setDoc(doc(db, 'users', DISABLED_OPERATOR_UID), userData(DISABLED_OPERATOR_UID))
    await setDoc(doc(db, 'roles', 'EXISTING_ROLE'), roleData('EXISTING_ROLE'))
    await setDoc(doc(db, 'roles', 'USER_ASSIGNED_ROLE'), roleData('USER_ASSIGNED_ROLE', ['calendar.import']))
    await setDoc(doc(db, 'roles', 'DISABLED_CONTENT_ROLE'), { ...roleData('DISABLED_CONTENT_ROLE'), status: 'disabled' })
    await updateDoc(doc(db, 'users', USER_UID), { customRoles: ['USER_ASSIGNED_ROLE'] })
    await setDoc(doc(db, 'calendarImports', 'PUBLIC_CALENDAR'), { status: 'completed', createdAt: now })
    await setDoc(doc(db, 'userAuthorizations', ROOT_UID), authorizationData(ROOT_UID, PERMISSION_VALUES, 'ROOT_ADMIN'))
    await setDoc(doc(db, 'userAuthorizations', SUPER_ADMIN_UID), authorizationData(SUPER_ADMIN_UID, PERMISSION_VALUES, 'SUPER_ADMIN'))
    await setDoc(doc(db, 'userAuthorizations', ADMIN_UID), authorizationData(ADMIN_UID, [
      PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT, PERMISSIONS.CALENDAR_IMPORT,
      PERMISSIONS.USERS_READ, PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_ASSIGN, PERMISSIONS.ROLES_REVOKE,
    ], 'ADMIN'))
    await setDoc(doc(db, 'userAuthorizations', EDITOR_UID), authorizationData(EDITOR_UID, [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT], 'EDITOR'))
    await setDoc(doc(db, 'userAuthorizations', USER_UID), authorizationData(USER_UID, [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT], 'USER', ['USER_ASSIGNED_ROLE']))
    await setDoc(doc(db, 'userAuthorizations', OTHER_UID), authorizationData(OTHER_UID, [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT]))
    await setDoc(doc(db, 'userAuthorizations', IMPORTER_UID), authorizationData(IMPORTER_UID, [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT, PERMISSIONS.CALENDAR_IMPORT], 'USER', ['CALENDAR_OPERATOR']))
    await setDoc(doc(db, 'userAuthorizations', DISABLED_OPERATOR_UID), authorizationData(DISABLED_OPERATOR_UID, [PERMISSIONS.CALENDAR_SEARCH, PERMISSIONS.CALENDAR_EXPORT], 'USER', ['DISABLED_OPERATOR']))
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
  await deny('CASE 9 ROOT browser cannot assign Custom Role; trusted tool required', updateDoc(doc(rootDb, 'users', USER_UID), { customRoles: arrayUnion('CONTENT_MANAGER'), updatedAt: Timestamp.now() }))
  await deny('CASE 10 ROOT browser cannot revoke Custom Role; trusted tool required', updateDoc(doc(rootDb, 'users', USER_UID), { customRoles: arrayRemove('CONTENT_MANAGER'), updatedAt: Timestamp.now() }))
  await deny('CASE 11 USER sửa role', updateDoc(doc(userDb, 'roles', 'EXISTING_ROLE'), { name: 'Hacked', updatedAt: Timestamp.now() }))
  await deny('CASE 12 USER xóa role', deleteDoc(doc(userDb, 'roles', 'EXISTING_ROLE')))
  await deny('CASE 13 ROOT đổi systemRole của USER', updateDoc(doc(rootDb, 'users', USER_UID), { systemRole: 'ADMIN', updatedAt: Timestamp.now() }))
  await deny('CASE 14 ROOT đổi systemRole chính ROOT', updateDoc(doc(rootDb, 'users', ROOT_UID), { systemRole: 'SUPER_ADMIN', updatedAt: Timestamp.now() }))
  await deny('CASE 15 client ghi systemConfig/root', updateDoc(doc(rootDb, 'systemConfig', 'root'), { rootUid: OTHER_UID, updatedAt: Timestamp.now() }))

  await allow('ROOT đọc users', getDoc(doc(rootDb, 'users', USER_UID)))
  await deny('GUEST đọc users', getDoc(doc(guestDb, 'users', USER_UID)))
  await deny('ROOT tự thêm customRoles cho chính mình', updateDoc(doc(rootDb, 'users', ROOT_UID), { customRoles: arrayUnion('CONTENT_MANAGER'), updatedAt: Timestamp.now() }))
  await deny('ROOT tạo permission ngoài catalog', setDoc(doc(rootDb, 'roles', 'UNKNOWN_PERMISSION'), roleData('UNKNOWN_PERMISSION', ['unknown.permission'])))
  await deny('ROOT browser cannot disable Custom Role; trusted propagation required', updateDoc(doc(rootDb, 'roles', 'CONTENT_MANAGER'), { status: 'disabled', updatedAt: Timestamp.now() }))
  await deny('ROOT browser cannot enable Custom Role; trusted propagation required', updateDoc(doc(rootDb, 'roles', 'DISABLED_CONTENT_ROLE'), { status: 'active', updatedAt: Timestamp.now() }))
  await deny('ROOT browser cannot delete Custom Role; trusted tool required', deleteDoc(doc(rootDb, 'roles', 'CONTENT_MANAGER')))

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

  // Calendar lookup stays public, while import writes require the materialized
  // calendar.import permission.
  await allow('6A.1 GUEST calendar.search can read public calendar data', getDoc(doc(guestDb, 'calendarImports', 'PUBLIC_CALENDAR')))
  await allow('6A.2 USER calendar.search can read public calendar data', getDoc(doc(userDb, 'calendarImports', 'PUBLIC_CALENDAR')))
  await deny('6A.3 USER without calendar.import cannot write calendar data', setDoc(doc(userDb, 'calendarImports', 'USER_IMPORT'), { status: 'importing' }))
  await allow('6A.4 ADMIN calendar.import can write calendar data', setDoc(doc(adminDb, 'calendarImports', 'ADMIN_IMPORT'), { status: 'importing' }))
  await allow('6A.5 ROOT calendar.import can write calendar data', setDoc(doc(rootDb, 'calendarImports', 'ROOT_IMPORT'), { status: 'importing' }))
  await allow('6B.1 USER with materialized calendar.import can write calendar data', setDoc(doc(importerDb, 'calendarImports', 'CUSTOM_ROLE_IMPORT'), { status: 'importing' }))
  await deny('6B.2 disabled role loses calendar.import after materialization', setDoc(doc(disabledOperatorDb, 'calendarImports', 'DISABLED_ROLE_IMPORT'), { status: 'importing' }))

  await deny('6A.6 USER without users.read cannot list users', getDocs(collection(userDb, 'users')))
  await allow('6A.7 ADMIN with users.read can list users', getDocs(collection(adminDb, 'users')))
  await deny('6A.8 USER without roles.read cannot list roles', getDocs(collection(userDb, 'roles')))
  await allow('6A.9 ADMIN with roles.read can list roles', getDocs(collection(adminDb, 'roles')))
  await allow('6A.10 USER can read only an assigned Custom Role definition', getDoc(doc(userDb, 'roles', 'USER_ASSIGNED_ROLE')))
  await deny('6A.11 USER cannot read an unassigned Custom Role definition', getDoc(doc(userDb, 'roles', 'EXISTING_ROLE')))

  await deny('6A.12 USER without roles.create cannot create role', setDoc(doc(userDb, 'roles', 'USER_CREATED_ROLE'), roleData('USER_CREATED_ROLE')))
  await deny('6A.13 USER without roles.update cannot update role', updateDoc(doc(userDb, 'roles', 'EXISTING_ROLE'), { description: 'tampered', updatedAt: Timestamp.now() }))
  await deny('6A.14 USER without roles.delete cannot delete role', deleteDoc(doc(userDb, 'roles', 'EXISTING_ROLE')))
  await deny('6A.15 USER without roles.assign cannot assign role', updateDoc(doc(userDb, 'users', OTHER_UID), { customRoles: arrayUnion('EXISTING_ROLE'), updatedAt: Timestamp.now() }))
  await deny('6A.16 USER without roles.revoke cannot revoke role', updateDoc(doc(userDb, 'users', OTHER_UID), { customRoles: arrayRemove('EXISTING_ROLE'), updatedAt: Timestamp.now() }))
  await deny('6A.17 client cannot mutate permission catalog', setDoc(doc(rootDb, 'permissions', 'calendar.import'), { status: 'active' }))
  await deny('6A.18 client cannot grant itself permission through customRoles', updateDoc(doc(userDb, 'users', USER_UID), { customRoles: arrayUnion('EXISTING_ROLE'), updatedAt: Timestamp.now() }))
  await deny('6A.19 ADMIN cannot mutate ROOT customRoles', updateDoc(doc(adminDb, 'users', ROOT_UID), { customRoles: arrayUnion('EXISTING_ROLE'), updatedAt: Timestamp.now() }))
  await deny('6A.20 ADMIN Custom Role assignment remains deny-by-default until Phase 6B', updateDoc(doc(adminDb, 'users', OTHER_UID), { customRoles: arrayUnion('EXISTING_ROLE'), updatedAt: Timestamp.now() }))
  await deny('6A.21 ADMIN without roles.create cannot create role', setDoc(doc(adminDb, 'roles', 'ADMIN_CREATED_ROLE'), roleData('ADMIN_CREATED_ROLE')))
  await allow('6A.22 SUPER_ADMIN with roles.create can create role', setDoc(doc(superAdminDb, 'roles', 'SUPER_CREATED_ROLE'), { ...roleData('SUPER_CREATED_ROLE'), createdBy: SUPER_ADMIN_UID }))
  await allow('6A.23 SUPER_ADMIN with roles.update can update role', updateDoc(doc(superAdminDb, 'roles', 'SUPER_CREATED_ROLE'), { description: 'updated', updatedAt: Timestamp.now() }))
  await deny('6A.24 SUPER_ADMIN browser delete requires trusted tool', deleteDoc(doc(superAdminDb, 'roles', 'SUPER_CREATED_ROLE')))
  await deny('6B.3 browser role permission update requires trusted propagation', updateDoc(doc(rootDb, 'roles', 'CONTENT_MANAGER'), { permissions: ['news.read'], updatedAt: Timestamp.now() }))
  await allow('6B.4 user can read own materialized authorization', getDoc(doc(userDb, 'userAuthorizations', USER_UID)))
  await deny('6B.5 guest cannot read user authorization', getDoc(doc(guestDb, 'userAuthorizations', USER_UID)))
  await deny('6B.6 user cannot read another authorization', getDoc(doc(userDb, 'userAuthorizations', OTHER_UID)))
  await deny('6B.7 client cannot create authorization', setDoc(doc(userDb, 'userAuthorizations', 'forged'), authorizationData('forged', [PERMISSIONS.CALENDAR_IMPORT])))
  await deny('6B.8 client cannot grant itself permission', updateDoc(doc(userDb, 'userAuthorizations', USER_UID), { permissions: arrayUnion(PERMISSIONS.CALENDAR_IMPORT), updatedAt: Timestamp.now() }))
  await deny('6B.9 ROOT browser cannot update authorization', updateDoc(doc(rootDb, 'userAuthorizations', USER_UID), { permissions: PERMISSION_VALUES, updatedAt: Timestamp.now() }))
  await deny('6B.10 ROOT browser cannot delete authorization', deleteDoc(doc(rootDb, 'userAuthorizations', USER_UID)))

  // Phase 8.1 News data is read through trusted callables. There is no direct
  // client read/write path for News articles, ACLs or entitlements.
  await deny('8.1 guest cannot directly read News article', getDoc(doc(guestDb, 'newsArticles', 'PUBLIC_ARTICLE')))
  await deny('8.1 user cannot directly read News article', getDoc(doc(userDb, 'newsArticles', 'PUBLIC_ARTICLE')))
  await deny('8.1 client cannot create News article', setDoc(doc(rootDb, 'newsArticles', 'CLIENT_WRITE'), { status: 'published' }))
  await deny('8.2 client cannot update News article', updateDoc(doc(rootDb, 'newsArticles', 'PUBLIC_ARTICLE'), { status: 'published' }))
  await deny('8.2 client cannot create News category', setDoc(doc(rootDb, 'newsCategories', 'CLIENT_WRITE'), { status: 'active' }))
  await deny('8.1 client cannot write News ACL', setDoc(doc(rootDb, 'newsArticles', 'PUBLIC_ARTICLE', 'acl', 'CLIENT_WRITE'), { effect: 'ALLOW' }))
  await deny('8.2 client cannot write News group membership', setDoc(doc(rootDb, 'newsGroups', 'GROUP', 'members', USER_UID), { status: 'active' }))
  await deny('8.1 client cannot write News entitlement', setDoc(doc(rootDb, 'contentEntitlements', USER_UID), { newsLevel: 3, status: 'active' }))

  results.forEach((result) => console.log(result))
  console.log(`Firestore Rules security audit PASS (${results.length} assertions).`)
} finally {
  await testEnv.cleanup()
}
