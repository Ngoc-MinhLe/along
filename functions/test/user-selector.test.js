const assert = require('node:assert/strict')
const { HttpsError } = require('firebase-functions/v2/https')
const { listUsers, normalizeUserListPayload } = require('../src/user-service')

function snapshot(id, data) {
  return { id, exists: true, data: () => data }
}

function makeDb(docs) {
  const query = {
    where() { return query },
    orderBy() { return query },
    startAt() { return query },
    endAt() { return query },
    startAfter() { return query },
    limit() { return query },
    async get() { return { docs } },
  }
  return { collection() { return query } }
}

function actor(permissions = ['users.read']) {
  return { uid: 'actor', authorization: { permissions } }
}

assert.deepEqual(normalizeUserListPayload({}), {
  query: '', status: null, systemRole: null, customRoleId: null, pageSize: 25, cursor: null,
})
assert.throws(() => normalizeUserListPayload({ pageSize: 51 }), (error) => error instanceof HttpsError && error.code === 'invalid-argument')
assert.throws(() => normalizeUserListPayload({ actorUid: 'forged' }), (error) => error instanceof HttpsError && error.code === 'invalid-argument')
assert.throws(() => normalizeUserListPayload({ cursor: 'forged' }), (error) => error instanceof HttpsError && error.code === 'invalid-argument')

;(async () => {
  const result = await listUsers(actor(), { query: 'ann', pageSize: 2 }, makeDb([
    snapshot('user-1', { uid: 'user-1', email: 'ann@example.test', displayName: 'Ann', status: 'active', systemRole: 'USER', customRoles: ['reader'], secret: 'must-not-leak' }),
    snapshot('user-2', { uid: 'user-2', email: 'anne@example.test', displayName: 'Anne', status: 'active', systemRole: 'EDITOR', customRoles: [] }),
    snapshot('user-3', { uid: 'user-3', email: 'ann3@example.test', displayName: 'Ann Three', status: 'active', systemRole: 'USER', customRoles: [] }),
  ]))
  assert.equal(result.items.length, 2)
  assert.equal(result.hasMore, true)
  assert.equal(typeof result.nextCursor, 'string')
  assert.equal(result.items[0].id, 'user-1')
  assert.equal(Object.prototype.hasOwnProperty.call(result.items[0], 'secret'), false)

  await assert.rejects(
    () => listUsers(actor([]), {}, makeDb([])),
    (error) => error instanceof HttpsError && error.code === 'permission-denied',
  )
  await assert.rejects(
    () => listUsers(actor(), { actorUid: 'forged' }, makeDb([])),
    (error) => error instanceof HttpsError && error.code === 'invalid-argument',
  )

  console.log('User selector unit test PASS: bounded page size, server-side query boundary, safe projection and forged actor rejection verified.')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
