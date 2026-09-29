const crypto = require('node:crypto')
const { Timestamp } = require('firebase-admin/firestore')
const { HttpsError } = require('firebase-functions/v2/https')
const { adminDb } = require('./admin')

const AUDIT_RESULTS = Object.freeze({ SUCCESS: 'SUCCESS', DENIED: 'DENIED', FAILED: 'FAILED' })

// Keep this catalog limited to mutations that actually exist in the application.
const AUDIT_ACTIONS = Object.freeze({
  SYSTEM_ROLE_CHANGED: 'SYSTEM_ROLE_CHANGED',
  USER_PROFILE_UPDATED: 'USER_PROFILE_UPDATED',
  CUSTOM_ROLE_ASSIGNED: 'CUSTOM_ROLE_ASSIGNED',
  CUSTOM_ROLE_REVOKED: 'CUSTOM_ROLE_REVOKED',
  CUSTOM_ROLE_CREATED: 'CUSTOM_ROLE_CREATED',
  CUSTOM_ROLE_UPDATED: 'CUSTOM_ROLE_UPDATED',
  CUSTOM_ROLE_DISABLED: 'CUSTOM_ROLE_DISABLED',
  CUSTOM_ROLE_ENABLED: 'CUSTOM_ROLE_ENABLED',
  CUSTOM_ROLE_DELETED: 'CUSTOM_ROLE_DELETED',
  NEWS_ARTICLE_CREATED: 'NEWS_ARTICLE_CREATED',
  NEWS_ARTICLE_UPDATED: 'NEWS_ARTICLE_UPDATED',
  NEWS_ARTICLE_ARCHIVED: 'NEWS_ARTICLE_ARCHIVED',
  NEWS_ARTICLE_UNARCHIVED: 'NEWS_ARTICLE_UNARCHIVED',
  NEWS_PUBLISHED: 'NEWS_PUBLISHED',
  NEWS_UNPUBLISHED: 'NEWS_UNPUBLISHED',
  NEWS_ACCESS_POLICY_CHANGED: 'NEWS_ACCESS_POLICY_CHANGED',
  NEWS_CATEGORY_CREATED: 'NEWS_CATEGORY_CREATED',
  NEWS_CATEGORY_UPDATED: 'NEWS_CATEGORY_UPDATED',
  NEWS_CATEGORY_DELETED: 'NEWS_CATEGORY_DELETED',
  NEWS_ACL_CHANGED: 'NEWS_ACL_CHANGED',
  AUTHORIZATION_REBUILT: 'AUTHORIZATION_REBUILT',
  MEMBERSHIP_CREATED: 'MEMBERSHIP_CREATED',
  MEMBERSHIP_REVOKED: 'MEMBERSHIP_REVOKED',
  MEMBERSHIP_TIER_CREATED: 'MEMBERSHIP_TIER_CREATED',
  MEMBERSHIP_TIER_UPDATED: 'MEMBERSHIP_TIER_UPDATED',
  MEMBERSHIP_TIER_DEACTIVATED: 'MEMBERSHIP_TIER_DEACTIVATED',
})

const OPERATION_ACTIONS = Object.freeze({
  setSystemRole: AUDIT_ACTIONS.SYSTEM_ROLE_CHANGED,
  updateUserProfile: AUDIT_ACTIONS.USER_PROFILE_UPDATED,
  createCustomRole: AUDIT_ACTIONS.CUSTOM_ROLE_CREATED,
  updateCustomRole: AUDIT_ACTIONS.CUSTOM_ROLE_UPDATED,
  disableCustomRole: AUDIT_ACTIONS.CUSTOM_ROLE_DISABLED,
  enableCustomRole: AUDIT_ACTIONS.CUSTOM_ROLE_ENABLED,
  deleteCustomRole: AUDIT_ACTIONS.CUSTOM_ROLE_DELETED,
  assignCustomRole: AUDIT_ACTIONS.CUSTOM_ROLE_ASSIGNED,
  revokeCustomRole: AUDIT_ACTIONS.CUSTOM_ROLE_REVOKED,
  createNewsArticle: AUDIT_ACTIONS.NEWS_ARTICLE_CREATED,
  updateNewsArticle: AUDIT_ACTIONS.NEWS_ARTICLE_UPDATED,
  archiveNewsArticle: AUDIT_ACTIONS.NEWS_ARTICLE_ARCHIVED,
  unarchiveNewsArticle: AUDIT_ACTIONS.NEWS_ARTICLE_UNARCHIVED,
  publishNewsArticle: AUDIT_ACTIONS.NEWS_PUBLISHED,
  unpublishNewsArticle: AUDIT_ACTIONS.NEWS_UNPUBLISHED,
  setNewsAccessPolicy: AUDIT_ACTIONS.NEWS_ACCESS_POLICY_CHANGED,
  createNewsCategory: AUDIT_ACTIONS.NEWS_CATEGORY_CREATED,
  updateNewsCategory: AUDIT_ACTIONS.NEWS_CATEGORY_UPDATED,
  deleteNewsCategory: AUDIT_ACTIONS.NEWS_CATEGORY_DELETED,
  setNewsAclEntry: AUDIT_ACTIONS.NEWS_ACL_CHANGED,
  removeNewsAclEntry: AUDIT_ACTIONS.NEWS_ACL_CHANGED,
  rebuildProtectedSystemRoleAuthorizations: AUDIT_ACTIONS.AUTHORIZATION_REBUILT,
  createManualMembership: AUDIT_ACTIONS.MEMBERSHIP_CREATED,
  revokeMembership: AUDIT_ACTIONS.MEMBERSHIP_REVOKED,
  createMembershipTier: AUDIT_ACTIONS.MEMBERSHIP_TIER_CREATED,
  updateMembershipTier: AUDIT_ACTIONS.MEMBERSHIP_TIER_UPDATED,
  deactivateMembershipTier: AUDIT_ACTIONS.MEMBERSHIP_TIER_DEACTIVATED,
})

const DENIED_ERROR_CODES = new Set([
  'unauthenticated',
  'permission-denied',
  'invalid-argument',
  'not-found',
  'already-exists',
  'failed-precondition',
])

function safeId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined
}

function reasonCode(error) {
  const code = String(error?.code || 'internal').split('/').pop()
  return code.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase().slice(0, 64) || 'INTERNAL'
}

function operationContext(operation, data = {}, result = {}) {
  const targetUid = safeId(data.targetUid) || safeId(data.userId) || safeId(result.targetUid) || safeId(result.userId)
  const roleId = safeId(data.roleId) || safeId(data.customRoleId) || safeId(result.roleId)
  const articleId = safeId(data.articleId) || safeId(result.articleId)
  const categoryId = safeId(data.categoryId) || safeId(result.categoryId)
  const membershipId = safeId(data.membershipId) || safeId(result.membershipId)
  const tierId = safeId(data.tierId) || safeId(result.tierId)
  const resourceId = safeId(data.resourceId) || safeId(result.resourceId)
  const resourceType = operation.includes('News') ? 'NEWS'
    : operation.includes('CustomRole') ? 'CUSTOM_ROLE'
      : operation.includes('Membership') ? 'MEMBERSHIP' : 'USER'
  const resourceIdValue = membershipId || tierId || roleId || articleId || categoryId || resourceId || targetUid
  const metadata = {}

  if (operation === 'setSystemRole' && safeId(data.targetSystemRole)) metadata.targetSystemRole = data.targetSystemRole
  if (operation === 'setSystemRole' && safeId(result.previousSystemRole)) metadata.previousSystemRole = result.previousSystemRole
  if (Number.isSafeInteger(result.affectedUserCount)) metadata.affectedUserCount = result.affectedUserCount
  if (Number.isSafeInteger(result.updatedUserCount)) metadata.updatedUserCount = result.updatedUserCount
  if (Number.isSafeInteger(result.unchangedUserCount)) metadata.unchangedUserCount = result.unchangedUserCount
  if (operation === 'setNewsAclEntry' || operation === 'removeNewsAclEntry') {
    if (safeId(data.scope)) metadata.scope = data.scope
    if (safeId(data.principalType)) metadata.principalType = data.principalType
    if (safeId(data.principalId)) metadata.principalId = data.principalId
  }

  return {
    action: OPERATION_ACTIONS[operation],
    resourceType,
    resourceId: resourceIdValue,
    ...(targetUid ? { targetUid } : {}),
    metadata,
  }
}

function assertAuditActor(actor) {
  const actorUid = safeId(actor?.uid)
  const actorSystemRole = safeId(actor?.profile?.systemRole || actor?.authorization?.systemRole)
  if (!actorUid || !actorSystemRole) {
    throw new HttpsError('internal', 'A trusted audit actor could not be determined.')
  }
  return { actorUid, actorSystemRole }
}

async function writeAuditEvent({ actor, operation, data, result, outcome, error, correlationId }, db = adminDb) {
  const action = OPERATION_ACTIONS[operation]
  if (!action) throw new HttpsError('internal', 'The mutation has no audit action catalog entry.')
  const trustedActor = assertAuditActor(actor)
  const context = operationContext(operation, data, result)
  const eventRef = db.collection('auditEvents').doc()
  const event = {
    eventId: eventRef.id,
    occurredAt: Timestamp.now(),
    ...trustedActor,
    action,
    resourceType: context.resourceType,
    result: outcome,
    source: 'callable',
    correlationId,
    ...(context.resourceId ? { resourceId: context.resourceId } : {}),
    ...(context.targetUid ? { targetUid: context.targetUid } : {}),
    ...(Object.keys(context.metadata).length ? { metadata: context.metadata } : {}),
    ...(error ? { reasonCode: reasonCode(error) } : {}),
  }
  await eventRef.create(event)
  return { eventId: eventRef.id }
}

function isDeniedError(error) {
  return DENIED_ERROR_CODES.has(String(error?.code || '').split('/').pop())
}

async function invokeAudited(request, handler, operation, db = adminDb, getActor) {
  const actorLoader = getActor || require('./auth').getTrustedActor
  const actor = await actorLoader(request)
  const data = request?.data || {}
  const correlationId = crypto.randomUUID()
  let result
  try {
    result = await handler(actor, data)
  } catch (error) {
    try {
      await writeAuditEvent({
        actor,
        operation,
        data,
        result: {},
        outcome: isDeniedError(error) ? AUDIT_RESULTS.DENIED : AUDIT_RESULTS.FAILED,
        error,
        correlationId,
      }, db)
    } catch {
      throw new HttpsError('internal', 'The operation failed and its audit event could not be recorded.')
    }
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'Trusted mutation failed.')
  }

  try {
    await writeAuditEvent({
      actor,
      operation,
      data,
      result,
      outcome: AUDIT_RESULTS.SUCCESS,
      correlationId,
    }, db)
  } catch {
    // Never return a success response when the required audit event was not recorded.
    throw new HttpsError('internal', 'The mutation completed but its audit event could not be recorded.')
  }
  return result
}

function createAuditQuery(db = adminDb, { actorUid, targetUid, action, resourceType, startAt, endAt, limit = 50 } = {}) {
  let query = db.collection('auditEvents')
  if (safeId(actorUid)) query = query.where('actorUid', '==', actorUid)
  if (safeId(targetUid)) query = query.where('targetUid', '==', targetUid)
  if (safeId(action)) query = query.where('action', '==', action)
  if (safeId(resourceType)) query = query.where('resourceType', '==', resourceType)
  if (startAt) query = query.where('occurredAt', '>=', startAt)
  if (endAt) query = query.where('occurredAt', '<=', endAt)
  return query.orderBy('occurredAt', 'desc').limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
}

module.exports = {
  AUDIT_ACTIONS,
  AUDIT_RESULTS,
  OPERATION_ACTIONS,
  createAuditQuery,
  operationContext,
  writeAuditEvent,
  invokeAudited,
}
