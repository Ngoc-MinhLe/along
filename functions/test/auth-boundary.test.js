const assert = require('node:assert/strict')
const { HttpsError } = require('firebase-functions/v2/https')
const {
  getTrustedActor,
  hasPermission,
  requirePermission,
  hasSystemRole,
  requireSystemRole,
  isRootActor,
  requireRootActor,
  requireAuthenticatedRequest,
} = require('../src/auth')
const { buildHealthResponse } = require('../src/health')

;(async () => {

function snapshot(data) {
  return {
    exists: data !== null,
    data: () => data,
  }
}

function makeDependencies({ uid = 'user-1', profile, authorization, claims = {}, rootLock = null, rootIds = [] }) {
  const documents = new Map([
    [`users/${uid}`, profile],
    [`userAuthorizations/${uid}`, authorization],
    ['systemConfig/root', rootLock],
  ])

  return {
    auth: {
      getUser: async (requestedUid) => ({ uid: requestedUid, customClaims: claims }),
    },
    db: {
      doc: (path) => ({ get: async () => snapshot(documents.has(path) ? documents.get(path) : null) }),
      collection: (collectionName) => ({
        where: (field, operator, value) => ({
          limit: (limitValue) => ({
            get: async () => {
              assert.equal(collectionName, 'users')
              assert.equal(field, 'systemRole')
              assert.equal(operator, '==')
              assert.equal(value, 'ROOT_ADMIN')
              const ids = rootIds.slice(0, limitValue)
              return { size: ids.length, docs: ids.map((id) => ({ id })) }
            },
          }),
        }),
      }),
    },
  }
}

function request(uid = 'user-1', data = {}) {
  return { data, auth: { uid, token: { sub: uid } } }
}

function userFixture(overrides = {}) {
  const profileOverride = Object.prototype.hasOwnProperty.call(overrides, 'profile')
    ? overrides.profile
    : undefined
  const profile = profileOverride === null
    ? null
    : {
      uid: 'user-1',
      systemRole: 'USER',
      status: 'active',
      customRoles: [],
      ...profileOverride,
    }
  const authorizationOverride = Object.prototype.hasOwnProperty.call(overrides, 'authorization')
    ? overrides.authorization
    : undefined
  const authorization = authorizationOverride === null
    ? null
    : {
      uid: 'user-1',
      systemRole: profile?.systemRole || 'USER',
      customRoles: profile?.customRoles || [],
      permissions: ['calendar.search', 'calendar.export'],
      version: 1,
      ...authorizationOverride,
    }
  return makeDependencies({
    profile,
    authorization,
    claims: overrides.claims || {},
    rootLock: overrides.rootLock || null,
    rootIds: overrides.rootIds || [],
  })
}

assert.throws(
  () => requireAuthenticatedRequest({ data: {} }),
  (error) => error instanceof HttpsError && error.code === 'unauthenticated',
)

assert.throws(
  () => requireAuthenticatedRequest({ auth: { uid: 'user-1', token: {} }, data: { actorUid: 'forged' } }),
  (error) => error instanceof HttpsError && error.code === 'invalid-argument',
)

const validDependencies = userFixture()
const actor = await getTrustedActor(request(), validDependencies)
assert.equal(actor.uid, 'user-1')
assert.equal(actor.profile.status, 'active')
assert.equal(actor.authorization.systemRole, 'USER')
assert.equal(hasPermission(actor, 'calendar.search'), true)
assert.equal(hasSystemRole(actor, 'USER'), true)
assert.equal(hasPermission(actor, 'permission.not-in-catalog'), false)
assert.throws(
  () => requirePermission(actor, 'permission.not-in-catalog'),
  (error) => error instanceof HttpsError && error.code === 'invalid-argument',
)
assert.doesNotThrow(() => requirePermission(actor, 'calendar.search'))
assert.doesNotThrow(() => requireSystemRole(actor, 'USER'))

await assert.rejects(
  () => getTrustedActor(request(), userFixture({ profile: null })),
  (error) => error instanceof HttpsError && error.code === 'permission-denied',
)

await assert.rejects(
  () => getTrustedActor(request(), userFixture({ profile: { status: 'suspended' } })),
  (error) => error instanceof HttpsError && error.code === 'permission-denied',
)

await assert.rejects(
  () => getTrustedActor(request(), userFixture({ authorization: null })),
  (error) => error instanceof HttpsError && error.code === 'permission-denied',
)

await assert.rejects(
  () => getTrustedActor(request(), userFixture({ authorization: { systemRole: 'ADMIN' } })),
  (error) => error instanceof HttpsError && error.code === 'permission-denied',
)

await assert.rejects(
  () => getTrustedActor(request(), userFixture({ authorization: { permissions: ['permission.not-in-catalog'] } })),
  (error) => error instanceof HttpsError && error.code === 'permission-denied',
)

await assert.rejects(
  () => getTrustedActor(request(), userFixture({ profile: { systemRole: 'ADMIN' }, authorization: { systemRole: 'ADMIN' } })),
  (error) => error instanceof HttpsError && error.code === 'permission-denied',
)

await assert.rejects(
  () => getTrustedActor(request(), userFixture({ claims: { systemRole: 'EDITOR' } })),
  (error) => error instanceof HttpsError && error.code === 'permission-denied',
)

const customRoleActor = await getTrustedActor(request(), userFixture({
  profile: { customRoles: ['CALENDAR_OPERATOR'] },
  authorization: { customRoles: ['CALENDAR_OPERATOR'], permissions: ['calendar.search', 'calendar.export', 'calendar.import'] },
}))
assert.deepEqual(customRoleActor.authorization.customRoles, ['CALENDAR_OPERATOR'])
assert.equal(hasPermission(customRoleActor, 'calendar.import'), true)

const rootDependencies = makeDependencies({
  uid: 'root-1',
  profile: { uid: 'root-1', systemRole: 'ROOT_ADMIN', status: 'active', customRoles: [] },
  authorization: {
    uid: 'root-1',
    systemRole: 'ROOT_ADMIN',
    customRoles: [],
    permissions: ['users.delete', 'roles.delete', 'calendar.import'],
    version: 1,
  },
  claims: { systemRole: 'ROOT_ADMIN', roleVersion: 1 },
  rootLock: { rootUid: 'root-1', version: 1 },
  rootIds: ['root-1'],
})
const rootActor = await getTrustedActor(request('root-1'), rootDependencies)
assert.equal(await isRootActor(rootActor, rootDependencies), true)
assert.doesNotThrow(() => requireSystemRole(rootActor, 'ROOT_ADMIN'))
await assert.doesNotReject(() => requireRootActor(rootActor, rootDependencies))

const duplicateRootDependencies = makeDependencies({
  uid: 'root-1',
  profile: { uid: 'root-1', systemRole: 'ROOT_ADMIN', status: 'active', customRoles: [] },
  authorization: { uid: 'root-1', systemRole: 'ROOT_ADMIN', customRoles: [], permissions: ['users.delete'], version: 1 },
  claims: { systemRole: 'ROOT_ADMIN' },
  rootLock: { rootUid: 'root-1' },
  rootIds: ['root-1', 'root-2'],
})
const duplicateRootActor = await getTrustedActor(request('root-1'), duplicateRootDependencies)
assert.equal(await isRootActor(duplicateRootActor, duplicateRootDependencies), false)
await assert.rejects(
  () => requireRootActor(duplicateRootActor, duplicateRootDependencies),
  (error) => error instanceof HttpsError && error.code === 'permission-denied',
)

const health = buildHealthResponse({
  uid: 'user-1',
  authorization: { version: 4, systemRole: 'ROOT_ADMIN', permissions: ['users.delete'] },
})
assert.deepEqual(health, {
  ok: true,
  authenticated: true,
  actorUid: 'user-1',
  authorizationPresent: true,
  authorizationVersion: 4,
})
assert.equal(Object.prototype.hasOwnProperty.call(health, 'permissions'), false)
assert.equal(Object.prototype.hasOwnProperty.call(health, 'token'), false)

console.log('Functions auth boundary self-test PASS: trusted profile, claims, authorization consistency, permission validation, forged actor rejection, and ROOT protection verified.')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
