const assert = require('node:assert/strict')
const { setSystemRole } = require('../src/system-role-service')

function snapshot(data) {
  return { exists: data !== undefined, data: () => data }
}

function makeRollbackDependencies() {
  const documents = {
    'systemConfig/root': { rootUid: 'root-test' },
    'users/target-test': {
      uid: 'target-test',
      systemRole: 'USER',
      status: 'active',
      customRoles: [],
    },
    'userAuthorizations/target-test': {
      uid: 'target-test',
      systemRole: 'USER',
      customRoles: [],
      permissions: ['calendar.search', 'calendar.export'],
      version: 4,
    },
  }
  const db = {
    doc(path) {
      return {
        path,
        get: async () => snapshot(documents[path]),
      }
    },
    collection(name) {
      return {
        where(field, operator, value) {
          return {
            limit() {
              return {
                get: async () => ({
                  size: name === 'users' && field === 'systemRole' && operator === '==' && value === 'ROOT_ADMIN' ? 1 : 0,
                  docs: name === 'users' && field === 'systemRole' && operator === '==' && value === 'ROOT_ADMIN'
                    ? [{ id: 'root-test' }]
                    : [],
                }),
              }
            },
          }
        },
      }
    },
    runTransaction: async () => {
      throw new Error('simulated Firestore failure')
    },
  }
  const claimsHistory = []
  const auth = {
    async getUser(uid) {
      assert.equal(uid, 'target-test')
      return { uid, disabled: false, customClaims: { systemRole: 'USER', roleVersion: 4 } }
    },
    async setCustomUserClaims(uid, claims) {
      assert.equal(uid, 'target-test')
      claimsHistory.push({ ...claims })
    },
  }
  return { db, auth, documents, claimsHistory }
}

async function main() {
  const { db, auth, documents, claimsHistory } = makeRollbackDependencies()
  const actor = {
    uid: 'root-test',
    claims: { systemRole: 'ROOT_ADMIN' },
    profile: { uid: 'root-test', systemRole: 'ROOT_ADMIN', status: 'active', customRoles: [] },
    authorization: { uid: 'root-test', systemRole: 'ROOT_ADMIN', customRoles: [], permissions: [], version: 1 },
  }

  await assert.rejects(
    () => setSystemRole(actor, { targetUid: 'target-test', targetSystemRole: 'ADMIN' }, db, auth),
    (error) => error.code === 'internal',
  )
  assert.deepEqual(claimsHistory, [
    { systemRole: 'ADMIN', roleVersion: 5 },
    { systemRole: 'USER', roleVersion: 4 },
  ])
  assert.equal(documents['users/target-test'].systemRole, 'USER')
  assert.equal(documents['userAuthorizations/target-test'].systemRole, 'USER')
  console.log('System Role rollback unit test PASS: Custom Claims rollback executed after simulated Firestore failure.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
