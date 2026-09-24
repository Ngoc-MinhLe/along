const assert = require('node:assert/strict')
const { HttpsError } = require('firebase-functions/v2/https')
const { AUDIT_ACTIONS, AUDIT_RESULTS, invokeAudited, writeAuditEvent } = require('../src/audit')

function makeDb() {
  const events = []
  return {
    events,
    collection(name) {
      assert.equal(name, 'auditEvents')
      return {
        doc() {
          const id = `event-${events.length + 1}`
          return {
            id,
            create: async (event) => events.push(event),
          }
        },
      }
    },
  }
}

const actor = {
  uid: 'trusted-actor',
  profile: { uid: 'trusted-actor', systemRole: 'ROOT_ADMIN' },
  authorization: { systemRole: 'ROOT_ADMIN' },
}

async function main() {
  const db = makeDb()
  const result = await invokeAudited(
    { auth: { uid: actor.uid }, data: { targetUid: 'target-user', actorUid: 'forged', permissions: ['secret'] } },
    async () => ({ ok: true, operation: 'updateUserProfile', targetUid: 'target-user' }),
    'updateUserProfile',
    db,
    async () => actor,
  )
  assert.equal(result.ok, true)
  assert.equal(db.events[0].result, AUDIT_RESULTS.SUCCESS)
  assert.equal(db.events[0].actorUid, 'trusted-actor')
  assert.equal(db.events[0].action, AUDIT_ACTIONS.USER_PROFILE_UPDATED)
  assert.equal(db.events[0].targetUid, 'target-user')
  assert.equal(Object.hasOwn(db.events[0], 'permissions'), false)
  assert.equal(Object.hasOwn(db.events[0], 'content'), false)

  await assert.rejects(
    () => invokeAudited(
      { auth: { uid: actor.uid }, data: { targetUid: 'target-user' } },
      async () => { throw new HttpsError('permission-denied', 'Denied') },
      'setSystemRole',
      db,
      async () => actor,
    ),
    (error) => error.code === 'permission-denied',
  )
  assert.equal(db.events[1].result, AUDIT_RESULTS.DENIED)
  assert.equal(db.events[1].reasonCode, 'PERMISSION_DENIED')

  await assert.rejects(
    () => invokeAudited(
      { auth: { uid: actor.uid }, data: { articleId: 'ARTICLE_1', content: 'must not be logged' } },
      async () => { throw new Error('simulated failure') },
      'updateNewsArticle',
      db,
      async () => actor,
    ),
    (error) => error.code === 'internal',
  )
  assert.equal(db.events[2].result, AUDIT_RESULTS.FAILED)
  assert.equal(db.events[2].action, AUDIT_ACTIONS.NEWS_ARTICLE_UPDATED)
  assert.equal(Object.hasOwn(db.events[2], 'content'), false)

  const directDb = makeDb()
  await writeAuditEvent({
    actor,
    operation: 'assignCustomRole',
    data: { targetUid: 'target-user', customRoleId: 'CONTENT_MANAGER', permissions: ['must.not.log'] },
    result: { targetUid: 'target-user', roleId: 'CONTENT_MANAGER' },
    outcome: AUDIT_RESULTS.SUCCESS,
    correlationId: 'test-correlation',
  }, directDb)
  assert.equal(directDb.events[0].action, AUDIT_ACTIONS.CUSTOM_ROLE_ASSIGNED)
  assert.equal(directDb.events[0].metadata, undefined)
  assert.equal(Object.hasOwn(directDb.events[0], 'permissions'), false)

  console.log('Audit unit test PASS: trusted actor, action catalog, SUCCESS/DENIED/FAILED semantics and sensitive-field exclusion verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
