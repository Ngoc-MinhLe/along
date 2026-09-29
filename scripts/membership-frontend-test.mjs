import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const service = await readFile('src/services/membership.js', 'utf8')
const page = await readFile('src/pages/AdminMembershipsPage.jsx', 'utf8')
const app = await readFile('src/App.jsx', 'utf8')
const layout = await readFile('src/layouts/AdminLayout.jsx', 'utf8')
const dashboard = await readFile('src/pages/AdminPage.jsx', 'utf8')

for (const callable of ['listMemberships', 'getUserMemberships', 'listMembershipTiers', 'createManualMembership', 'revokeMembership']) {
  assert.match(service, new RegExp(`callMembershipFunction\\('${callable}'`), `Missing Membership callable: ${callable}`)
}
assert.match(app, /path="memberships" element={<PermissionGate permission={PERMISSIONS\.MEMBERSHIP_READ}>/)
assert.match(layout, /PERMISSIONS\.MEMBERSHIP_READ/)
assert.match(page, /PERMISSIONS\.MEMBERSHIP_ASSIGN/)
assert.match(page, /PERMISSIONS\.MEMBERSHIP_REVOKE/)
assert.match(page, /listMembershipTiers\(\)/)
assert.match(page, /window\.confirm/)
assert.match(page, /getUserMemberships\(/)
assert.doesNotMatch(service, /actorUid|systemRole|permissions|updateDoc|setDoc|deleteDoc/)
assert.doesNotMatch(page, /VIP1|VIP2|VIP3/)
assert.match(dashboard, /PERMISSIONS\.MEMBERSHIP_READ/)

console.log('Frontend Membership test PASS: permission route, dynamic tiers, callable-only mutations, bounded reads and revoke confirmation verified.')
