const assert = require('node:assert/strict')
const { HttpsError } = require('firebase-functions/v2/https')
const { listUsers, normalizeUserListPayload } = require('../src/user-service')

function snapshot(id, data) {
  return { id, exists: true, data: () => data }
}

function makeDb(docs, calls = []) {
  const query = {
    where(...args) { calls.push({ type: 'where', args }); return query },
    orderBy(...args) { calls.push({ type: 'orderBy', args }); return query },
    startAt(...args) { calls.push({ type: 'startAt', args }); return query },
    endAt(...args) { calls.push({ type: 'endAt', args }); return query },
    startAfter(...args) { calls.push({ type: 'startAfter', args }); return query },
    limit(...args) { calls.push({ type: 'limit', args }); return query },
    async get() { return { docs } },
  }
  return { collection() { return query }, calls }
}

function makeSearchDb(docs, calls = []) {
  return {
    collection() {
      const state = { field: null, prefix: '' }
      const query = {
        where(...args) { calls.push({ type: 'where', args }); return query },
        orderBy(...args) {
          if (state.field === null) state.field = args[0]
          calls.push({ type: 'orderBy', args })
          return query
        },
        startAt(...args) { state.prefix = String(args[0]); calls.push({ type: 'startAt', args }); return query },
        endAt(...args) { calls.push({ type: 'endAt', args }); return query },
        startAfter(...args) { state.prefix = String(args[0]); calls.push({ type: 'startAfter', args }); return query },
        limit(...args) { calls.push({ type: 'limit', args }); return query },
        async get() {
          const matching = docs.filter((item) => String(item.data()?.[state.field] || '').startsWith(state.prefix))
          return { docs: matching }
        },
      }
      return query
    },
    calls,
  }
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

  const legacyDocs = [
    snapshot('long-user', {
      uid: 'long-user', email: 'vuch@example.test', displayName: 'Long Vũ', status: 'active', systemRole: 'USER',
    }),
    snapshot('minh-user', {
      uid: 'minh-user', email: 'minh@example.test', displayName: 'minh le ngoc', status: 'active', systemRole: 'USER',
    }),
    snapshot('gmail-user', {
      uid: 'gmail-user', email: 'gmail@example.test', displayName: 'Gmail User', status: 'active', systemRole: 'USER',
    }),
  ]
  const expectedSearchIds = {
    long: 'long-user', Long: 'long-user', LONG: 'long-user',
    minh: 'minh-user', Minh: 'minh-user', MINH: 'minh-user', gmail: 'gmail-user',
  }
  for (const query of Object.keys(expectedSearchIds)) {
    const calls = []
    const searchDb = makeSearchDb(legacyDocs, calls)
    const searchResult = await listUsers(actor(), { query, pageSize: 20 }, searchDb)
    assert.ok(searchResult.items.length >= 1, `expected a bounded search result for ${query}`)
    assert.ok(searchResult.items.some((item) => item.id === expectedSearchIds[query]), `expected the matching user for ${query}`)
    assert.ok(calls.some((call) => call.type === 'orderBy' && call.args[0] === 'displayName'))
    assert.ok(calls.some((call) => call.type === 'orderBy' && call.args[0] === 'email'))
    assert.ok(calls.filter((call) => call.type === 'limit').every((call) => call.args[0] <= 50))
  }

  const cursorCalls = []
  const cursorDb = makeDb(legacyDocs, cursorCalls)
  const cursorPage = await listUsers(actor(), { query: 'long', pageSize: 1 }, cursorDb)
  assert.equal(typeof cursorPage.nextCursor, 'string')
  const decodedCursor = normalizeUserListPayload({ cursor: cursorPage.nextCursor }).cursor
  assert.equal(decodedCursor.version, 2)
  assert.ok(decodedCursor.streams.length >= 1)
  assert.ok(cursorCalls.some((call) => call.type === 'startAt'))

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
