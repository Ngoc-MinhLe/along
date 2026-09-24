const assert = require('node:assert/strict')
const { HttpsError } = require('firebase-functions/v2/https')
const { updateUserProfile } = require('../src/user-service')

function snapshot(data) {
  return { exists: data !== null, data: () => data }
}

function makeFixture({ actorPermissions = ['users.update'], targetProfile = {}, targetAuth = {}, rootUid = null, transactionError = null } = {}) {
  const documents = {
    'users/target-user': {
      uid: 'target-user',
      displayName: 'Old Name',
      photoURL: 'https://old.example/avatar.png',
      systemRole: 'USER',
      status: 'active',
      customRoles: [],
      createdAt: 'created',
      ...targetProfile,
    },
    'systemConfig/root': rootUid ? { rootUid } : null,
  }
  const authUser = {
    uid: 'target-user',
    disabled: false,
    displayName: 'Old Name',
    photoURL: 'https://old.example/avatar.png',
    customClaims: { systemRole: 'USER' },
    ...targetAuth,
  }
  const authUpdates = []
  const db = {
    doc(path) {
      return {
        path,
        get: async () => snapshot(Object.prototype.hasOwnProperty.call(documents, path) ? documents[path] : null),
        set: async (data) => { documents[path] = data },
      }
    },
    runTransaction: async (callback) => {
      if (transactionError) throw transactionError
      const transaction = {
        get: async (ref) => snapshot(documents[ref.path] || null),
        update: (ref, fields) => { documents[ref.path] = { ...documents[ref.path], ...fields } },
      }
      return callback(transaction)
    },
  }
  const auth = {
    getUser: async (uid) => {
      assert.equal(uid, 'target-user')
      return { ...authUser }
    },
    updateUser: async (uid, fields) => {
      assert.equal(uid, 'target-user')
      authUpdates.push({ ...fields })
      Object.assign(authUser, fields)
      return { ...authUser }
    },
  }
  const actor = {
    uid: 'admin-actor',
    profile: { uid: 'admin-actor', systemRole: 'SUPER_ADMIN', status: 'active', customRoles: [] },
    claims: { systemRole: 'SUPER_ADMIN' },
    authorization: { uid: 'admin-actor', systemRole: 'SUPER_ADMIN', customRoles: [], permissions: actorPermissions, version: 1 },
  }
  return { actor, db, auth, documents, authUpdates }
}

async function main() {
  const fixture = makeFixture()
  const result = await updateUserProfile(fixture.actor, {
    targetUid: 'target-user',
    displayName: 'Updated Name',
    photoURL: 'https://new.example/avatar.png',
  }, fixture.db, fixture.auth)
  assert.deepEqual(result, {
    ok: true,
    operation: 'updateUserProfile',
    targetUid: 'target-user',
    updatedFields: ['displayName', 'photoURL'],
  })
  assert.equal(fixture.documents['users/target-user'].displayName, 'Updated Name')
  assert.equal(fixture.authUpdates.length, 1)
  assert.equal(fixture.authUpdates[0].displayName, 'Updated Name')

  const deniedActor = makeFixture({ actorPermissions: ['users.read'] })
  await assert.rejects(
    () => updateUserProfile(deniedActor.actor, { targetUid: 'target-user', displayName: 'Nope' }, deniedActor.db, deniedActor.auth),
    (error) => error instanceof HttpsError && error.code === 'permission-denied',
  )

  const forgedPayload = makeFixture()
  await assert.rejects(
    () => updateUserProfile(forgedPayload.actor, { targetUid: 'target-user', displayName: 'Nope', actorUid: 'forged' }, forgedPayload.db, forgedPayload.auth),
    (error) => error instanceof HttpsError && error.code === 'invalid-argument',
  )

  const rootTarget = makeFixture({
    targetProfile: { systemRole: 'ROOT_ADMIN' },
    targetAuth: { customClaims: { systemRole: 'ROOT_ADMIN' } },
    rootUid: 'target-user',
  })
  await assert.rejects(
    () => updateUserProfile(rootTarget.actor, { targetUid: 'target-user', displayName: 'Nope' }, rootTarget.db, rootTarget.auth),
    (error) => error instanceof HttpsError && error.code === 'permission-denied',
  )

  const inactiveTarget = makeFixture({ targetProfile: { status: 'suspended' } })
  await assert.rejects(
    () => updateUserProfile(inactiveTarget.actor, { targetUid: 'target-user', displayName: 'Nope' }, inactiveTarget.db, inactiveTarget.auth),
    (error) => error instanceof HttpsError && error.code === 'failed-precondition',
  )

  const rollback = makeFixture({ transactionError: new Error('simulated Firestore failure') })
  await assert.rejects(
    () => updateUserProfile(rollback.actor, { targetUid: 'target-user', displayName: 'Rollback Name' }, rollback.db, rollback.auth),
    (error) => error instanceof HttpsError && error.code === 'internal',
  )
  assert.deepEqual(rollback.authUpdates.map((item) => item.displayName), ['Rollback Name', 'Old Name'])
  assert.equal(rollback.documents['users/target-user'].displayName, 'Old Name')

  console.log('User Management unit test PASS: users.update authorization, payload allowlist, ROOT/inactive protection and Auth/Firestore rollback verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
