import { authorizeRootOperator } from './lib/system-role-admin.mjs'
import { materializeAllUserAuthorizations } from './lib/authorization-admin.mjs'
import { confirmTrustedMutation } from './lib/cli-confirm.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

async function main() {
  if (args.some((argument) => argument !== '--dry-run')) throw new Error('Usage: npm run rbac:rebuild-all-authorizations -- [--dry-run]')
  await authorizeRootOperator()
  console.log('[INFO] ROOT authorization: PASS')
  const preview = await materializeAllUserAuthorizations({ dryRun: true })
  const changed = preview.filter((result) => result.plan.needsWrite)
  console.log(`[INFO] Users: ${preview.length}; inconsistent/missing authorizations: ${changed.length}.`)
  if (!changed.length) {
    console.log('[SUCCESS] All authorizations are consistent.')
    return
  }
  if (dryRun) {
    console.log('[SUCCESS] Dry run completed. No Firebase data was changed.')
    return
  }

  await confirmTrustedMutation(`Rebuild ${changed.length} authorization documents?`)
  const results = await materializeAllUserAuthorizations({
    onProgress(done, total, result) { console.log(`[INFO] ${done}/${total} ${result.uid}: ${result.status}`) },
  })
  console.log(`[SUCCESS] Authorization rebuild completed for ${results.length} users.`)
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`)
  process.exitCode = 1
})
