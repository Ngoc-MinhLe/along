import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Timestamp } from 'firebase-admin/firestore'
import { adminAuth, authorizeRootOperator, findTarget, readTargetState } from './lib/system-role-admin.mjs'
import { buildSystemRolePlan, executeSystemRolePlan } from './lib/system-role-core.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const positional = args.filter((arg) => !arg.startsWith('--'))
const [identifier, requestedRole] = positional

function info(message) {
  console.log(`[INFO] ${message}`)
}

async function confirmMutation(target, plan) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Confirmation required: mutation is denied in a non-interactive terminal. Use --dry-run for validation.')
  }
  console.log('')
  console.log(`Target: ${target.authUser.email || target.authUser.uid}`)
  console.log(`Current: ${plan.currentProfileRole}`)
  console.log(`New: ${plan.requestedRole}`)
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    const answer = (await prompt.question('Proceed? (yes/no) ')).trim().toLowerCase()
    if (answer !== 'yes') throw new Error('Confirmation declined. No mutation was performed.')
  } finally {
    prompt.close()
  }
}

async function main() {
  if (!identifier || !requestedRole) {
    throw new Error('Usage: npm run rbac:set-system-role -- <uid-or-email> <ROLE> [--dry-run]')
  }
  if (args.some((arg) => arg.startsWith('--') && arg !== '--dry-run')) {
    throw new Error('Unknown option. Only --dry-run is supported; there is no force/bypass flag.')
  }

  const { rootUid } = await authorizeRootOperator()
  info('ROOT authorization: PASS')

  const target = await findTarget(identifier)
  info(`Target found: ${target.authUser.email || '(no email)'} (${target.authUser.uid})`)

  const targetClaims = target.authUser.customClaims || {}
  const plan = buildSystemRolePlan({
    rootUid,
    targetUid: target.authUser.uid,
    targetProfile: target.profile,
    targetClaims,
    requestedRole,
  })

  info(`Current Firestore role: ${plan.currentProfileRole}`)
  info(`Current Claims role: ${plan.currentClaimsRole}`)
  info(`Requested role: ${plan.requestedRole}`)
  info(`Role version: ${plan.currentRoleVersion} -> ${plan.nextRoleVersion}`)
  info('Validation: PASS')

  if (plan.noChange) {
    console.log('[SUCCESS] No change required.')
    return
  }
  if (dryRun) {
    info(`DRY RUN planned claims update: ${plan.claimsNeedUpdate ? 'yes' : 'no'}`)
    info(`DRY RUN planned Firestore update: ${plan.profileNeedsUpdate ? 'yes' : 'no'}`)
    console.log('[SUCCESS] Dry run completed. No Firebase data was changed.')
    return
  }

  await confirmMutation(target, plan)
  const adapters = {
    async setClaims(claims) {
      info('Updating Custom Claims...')
      await adminAuth.setCustomUserClaims(target.authUser.uid, claims)
    },
    async updateProfile(systemRole) {
      info('Updating Firestore...')
      await target.profileRef.update({ systemRole, updatedAt: Timestamp.now() })
    },
    async readState() {
      info('Verifying consistency...')
      return readTargetState(target.authUser.uid)
    },
  }

  const result = await executeSystemRolePlan(plan, adapters)
  if (result.status !== 'changed') throw new Error(`Unexpected operation status: ${result.status}.`)
  console.log(`[SUCCESS] System Role changed ${plan.currentProfileRole} -> ${plan.requestedRole}`)
  console.log('[INFO] System Role đã cập nhật. User cần đăng xuất/đăng nhập lại hoặc refresh ID token để nhận Custom Claims mới.')
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`)
  process.exitCode = 1
})
