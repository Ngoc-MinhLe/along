import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  rolesPage: await readFile('src/pages/AdminRolesPage.jsx', 'utf8'),
  usersPage: await readFile('src/pages/AdminUsersPage.jsx', 'utf8'),
  firestoreService: await readFile('src/services/rbac/firestore.js', 'utf8'),
  functionsService: await readFile('src/services/rbac/functions.js', 'utf8'),
}

for (const functionName of [
  'createCustomRole',
  'updateCustomRole',
  'disableCustomRole',
  'enableCustomRole',
  'deleteCustomRole',
  'assignCustomRole',
  'revokeCustomRole',
]) {
  assert.match(files.functionsService, new RegExp(`callFunction\\('${functionName}'`), `${functionName} must use Callable Functions`)
}

assert.match(files.rolesPage, /services\/rbac\/functions/)
assert.match(files.usersPage, /services\/rbac\/functions/)
assert.doesNotMatch(files.rolesPage, /(?:createCustomRole|updateCustomRole|setCustomRoleStatus|removeCustomRole|deleteCustomRole|assignCustomRole|revokeCustomRole).*from ['"]\.\.\/services\/rbac\/firestore['"]$/m)
assert.doesNotMatch(files.usersPage, /(?:createCustomRole|updateCustomRole|setCustomRoleStatus|removeCustomRole|deleteCustomRole|assignCustomRole|revokeCustomRole).*from ['"]\.\.\/services\/rbac\/firestore['"]$/m)
assert.doesNotMatch(files.firestoreService, /addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction/)
assert.doesNotMatch(files.firestoreService, /collection\(requireDb\(\), ['"]roles['"]\).*\.where/)

console.log('Frontend RBAC mutation audit PASS: all seven Custom Role mutations use the Callable Functions service; RBAC Firestore service is read-only.')
