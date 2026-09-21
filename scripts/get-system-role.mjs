import { claimsSystemRole } from './lib/system-role-core.mjs'
import { findTarget } from './lib/system-role-admin.mjs'

async function main() {
  const [identifier, ...extra] = process.argv.slice(2)
  if (!identifier || extra.length) throw new Error('Usage: npm run rbac:get-system-role -- <uid-or-email>')

  const target = await findTarget(identifier)
  const claims = target.authUser.customClaims || {}
  const firestoreRole = target.profile.systemRole || '(missing)'
  const customClaimRole = claimsSystemRole(claims)
  const consistency = firestoreRole === customClaimRole ? 'PASS' : 'FAIL'

  console.log(`User: ${target.profile.displayName || '(no display name)'}`)
  console.log(`Email: ${target.authUser.email || target.profile.email || '(no email)'}`)
  console.log(`UID: ${target.authUser.uid}`)
  console.log('')
  console.log(`Firestore System Role: ${firestoreRole}`)
  console.log(`Custom Claim System Role: ${customClaimRole}`)
  console.log(`Role Version: ${Number.isSafeInteger(claims.roleVersion) ? claims.roleVersion : 0}`)
  console.log(`Status: ${target.profile.status || '(missing)'}`)
  console.log(`Consistency: ${consistency}`)

  if (consistency === 'FAIL') process.exitCode = 2
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`)
  process.exitCode = 1
})
