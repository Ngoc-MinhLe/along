import { authorizeRootOperator, findTarget } from './lib/system-role-admin.mjs'
import { checkAllUserAuthorizations, planUserAuthorization } from './lib/authorization-admin.mjs'

const args = process.argv.slice(2)
const identifier = args[0]

async function main() {
  if (args.length > 1 || identifier?.startsWith('--')) throw new Error('Usage: npm run rbac:check-authorization -- [uid-or-email]')
  await authorizeRootOperator()
  console.log('[INFO] ROOT authorization: PASS')

  if (identifier) {
    const target = await findTarget(identifier)
    const plan = await planUserAuthorization(target.authUser.uid)
    console.log(`[${plan.needsWrite ? 'INCONSISTENT' : 'CONSISTENT'}] ${target.authUser.uid} permissions=${plan.permissions.length} version=${plan.currentVersion}`)
    if (plan.needsWrite) process.exitCode = 2
    return
  }

  const results = await checkAllUserAuthorizations()
  const inconsistent = results.filter((result) => result.plan.needsWrite)
  results.forEach((result) => console.log(`[${result.plan.needsWrite ? 'INCONSISTENT' : 'CONSISTENT'}] ${result.uid} permissions=${result.plan.permissions.length} version=${result.plan.currentVersion}`))
  console.log(`[INFO] Users: ${results.length}; inconsistent: ${inconsistent.length}.`)
  if (inconsistent.length) process.exitCode = 2
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`)
  process.exitCode = 1
})
