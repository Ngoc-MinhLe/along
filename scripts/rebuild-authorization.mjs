import { authorizeRootOperator, findTarget } from './lib/system-role-admin.mjs'
import { materializeUserAuthorization, planUserAuthorization } from './lib/authorization-admin.mjs'
import { confirmTrustedMutation } from './lib/cli-confirm.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const unknown = args.filter((argument) => argument.startsWith('--') && argument !== '--dry-run')
const identifier = args.find((argument) => !argument.startsWith('--'))

async function main() {
  if (!identifier || unknown.length) throw new Error('Usage: npm run rbac:rebuild-authorization -- <uid-or-email> [--dry-run]')
  await authorizeRootOperator()
  console.log('[INFO] ROOT authorization: PASS')
  const target = await findTarget(identifier)
  const plan = await planUserAuthorization(target.authUser.uid)
  console.log(`[INFO] Target: ${target.authUser.email || target.authUser.uid}`)
  console.log(`[INFO] Permissions: ${plan.permissions.length}; version ${plan.currentVersion} -> ${plan.version}`)

  if (!plan.needsWrite) {
    console.log('[SUCCESS] Authorization is already consistent.')
    return
  }
  if (dryRun) {
    console.log('[SUCCESS] Dry run completed. No Firebase data was changed.')
    return
  }

  await confirmTrustedMutation(`Rebuild userAuthorizations/${target.authUser.uid} with ${plan.permissions.length} permissions?`)
  const result = await materializeUserAuthorization(target.authUser.uid)
  if (result.status !== 'updated') throw new Error(`Unexpected materialization status: ${result.status}.`)
  console.log(`[SUCCESS] Rebuilt userAuthorizations/${target.authUser.uid} at version ${result.plan.version}.`)
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`)
  process.exitCode = 1
})
