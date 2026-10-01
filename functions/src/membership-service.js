const { HttpsError } = require('firebase-functions/v2/https')
const { Timestamp } = require('firebase-admin/firestore')
const { adminAuth, adminDb } = require('./admin')
const {
  getTrustedActor,
  hasSystemRole,
  requirePermission,
} = require('./auth')
const { invokeAudited } = require('./audit')

const MEMBERSHIP_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', REVOKED: 'REVOKED' })
const MEMBERSHIP_SOURCES = Object.freeze({ MANUAL: 'MANUAL', PAYMENT: 'PAYMENT' })
const TIER_STATUSES = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' })
const MAX_ID_LENGTH = 128
const MAX_TIER_NAME_LENGTH = 160
const MAX_TIER_DESCRIPTION_LENGTH = 2000
const DEFAULT_LIST_LIMIT = 25
const MAX_LIST_LIMIT = 100

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message)
}

function failedPrecondition(message) {
  throw new HttpsError('failed-precondition', message)
}

function notFound(message) {
  throw new HttpsError('not-found', message)
}

function alreadyExists(message) {
  throw new HttpsError('already-exists', message)
}

function assertObject(value, message = 'Request payload must be an object.') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalidArgument(message)
}

function assertAllowedKeys(data, allowed) {
  assertObject(data)
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(data).find((key) => !allowedSet.has(key))
  if (unknown) invalidArgument(`Unsupported request field: ${unknown}.`)
}

function normalizeId(value, fieldName) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_ID_LENGTH) {
    invalidArgument(`${fieldName} must be a non-empty string.`)
  }
  return value.trim()
}

function normalizeTierId(value) {
  const tierId = normalizeId(value, 'tierId')
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(tierId)) {
    invalidArgument('tierId must contain only letters, numbers, hyphens, or underscores.')
  }
  return tierId
}

function normalizeTierFields(data) {
  if (typeof data?.name !== 'string' || !data.name.trim() || data.name.trim().length > MAX_TIER_NAME_LENGTH) {
    invalidArgument(`name must be a non-empty string up to ${MAX_TIER_NAME_LENGTH} characters.`)
  }
  if (!Number.isSafeInteger(data?.level) || data.level < 1) {
    invalidArgument('level must be a positive integer.')
  }
  if (data?.description !== undefined && typeof data.description !== 'string') {
    invalidArgument('description must be a string.')
  }
  const description = typeof data?.description === 'string' ? data.description.trim() : ''
  if (description.length > MAX_TIER_DESCRIPTION_LENGTH) {
    invalidArgument(`description must be no longer than ${MAX_TIER_DESCRIPTION_LENGTH} characters.`)
  }
  return { name: data.name.trim(), level: data.level, description }
}

function normalizeTierCreatePayload(data) {
  assertAllowedKeys(data || {}, ['tierId', 'name', 'level', 'description'])
  return { tierId: normalizeTierId(data?.tierId), ...normalizeTierFields(data) }
}

function normalizeTierUpdatePayload(data) {
  assertAllowedKeys(data || {}, ['tierId', 'name', 'level', 'description'])
  return { tierId: normalizeTierId(data?.tierId), ...normalizeTierFields(data) }
}

function normalizeTierDeactivatePayload(data) {
  assertAllowedKeys(data || {}, ['tierId'])
  return { tierId: normalizeTierId(data?.tierId) }
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' && value.trim()) {
    const millis = Date.parse(value)
    return Number.isFinite(millis) ? millis : null
  }
  return null
}

function normalizeTimestamp(value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) invalidArgument(`${fieldName} is required.`)
    return null
  }
  const millis = timestampMillis(value)
  if (!Number.isFinite(millis)) invalidArgument(`${fieldName} must be a valid timestamp.`)
  return Timestamp.fromMillis(millis)
}

function normalizeCreatePayload(data) {
  assertAllowedKeys(data || {}, ['userId', 'tierId', 'startsAt', 'expiresAt'])
  const userId = normalizeId(data?.userId, 'userId')
  const tierId = normalizeId(data?.tierId, 'tierId')
  const startsAt = normalizeTimestamp(data?.startsAt, 'startsAt', { required: true })
  const expiresAt = normalizeTimestamp(data?.expiresAt, 'expiresAt')
  if (expiresAt && expiresAt.toMillis() <= startsAt.toMillis()) {
    invalidArgument('expiresAt must be later than startsAt.')
  }
  return { userId, tierId, startsAt, expiresAt }
}

function normalizeRevokePayload(data) {
  assertAllowedKeys(data || {}, ['membershipId'])
  return { membershipId: normalizeId(data?.membershipId, 'membershipId') }
}

function normalizeListPayload(data, { requireUserId = false } = {}) {
  assertAllowedKeys(data || {}, requireUserId ? ['userId', 'limit'] : ['limit'])
  const userId = requireUserId ? normalizeId(data?.userId, 'userId') : null
  const limit = data?.limit === undefined ? DEFAULT_LIST_LIMIT : data.limit
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    invalidArgument(`limit must be an integer from 1 to ${MAX_LIST_LIMIT}.`)
  }
  return { userId, limit }
}

function normalizeTier(tierId, data) {
  if (!data || typeof data !== 'object'
    || data.tierId !== tierId
    || typeof data.name !== 'string'
    || !data.name.trim()
    || !Number.isSafeInteger(data.level)
    || data.level < 1
    || !Object.values(TIER_STATUSES).includes(data.status)
    || (data.active !== undefined && data.active !== (data.status === TIER_STATUSES.ACTIVE))) {
    return null
  }
  return {
    id: tierId,
    tierId,
    name: data.name.trim(),
    level: data.level,
    status: data.status,
    active: data.status === TIER_STATUSES.ACTIVE,
    description: typeof data.description === 'string' ? data.description : null,
  }
}

function normalizeMembership(membershipId, data) {
  if (!data || typeof data !== 'object'
    || typeof data.userId !== 'string'
    || typeof data.tierId !== 'string'
    || !Object.values(MEMBERSHIP_STATUSES).includes(data.status)
    || !Object.values(MEMBERSHIP_SOURCES).includes(data.source)) return null
  const startsAt = normalizeStoredTimestamp(data.startsAt)
  const expiresAt = data.expiresAt == null ? null : normalizeStoredTimestamp(data.expiresAt)
  if (!startsAt || (data.expiresAt != null && !expiresAt)) return null
  return {
    id: membershipId,
    userId: data.userId,
    tierId: data.tierId,
    status: data.status,
    startsAt,
    expiresAt,
    source: data.source,
  }
}

function serializeMembership(membership, profile = null, tier = null) {
  return {
    id: membership.id,
    membershipId: membership.id,
    userId: membership.userId,
    user: profile ? {
      uid: membership.userId,
      email: typeof profile.email === 'string' ? profile.email : '',
      displayName: typeof profile.displayName === 'string' ? profile.displayName : '',
      status: typeof profile.status === 'string' ? profile.status : 'active',
    } : null,
    tier: tier ? {
      id: tier.id,
      name: tier.name,
      level: tier.level,
    } : {
      id: membership.tierId,
      name: membership.tierId,
      level: null,
    },
    tierId: membership.tierId,
    status: membership.status,
    startsAt: membership.startsAt.toDate().toISOString(),
    expiresAt: membership.expiresAt ? membership.expiresAt.toDate().toISOString() : null,
    source: membership.source,
    assignedBy: typeof membership.assignedBy === 'string' ? membership.assignedBy : null,
    createdAt: membership.createdAt ? membership.createdAt.toDate().toISOString() : null,
  }
}

function normalizeStoredMembership(membershipId, data) {
  const membership = normalizeMembership(membershipId, data)
  if (!membership) return null
  return {
    ...membership,
    assignedBy: typeof data.assignedBy === 'string' ? data.assignedBy : null,
    createdAt: normalizeStoredTimestamp(data.createdAt),
  }
}

async function serializeMembershipDocuments(documents, db = adminDb) {
  const memberships = documents
    .map((snapshot) => normalizeStoredMembership(snapshot.id, snapshot.data()))
    .filter(Boolean)
  const userIds = [...new Set(memberships.map((item) => item.userId))]
  const tierIds = [...new Set(memberships.map((item) => item.tierId))]
  const [profiles, tiers] = await Promise.all([
    Promise.all(userIds.map(async (userId) => [userId, (await db.doc(`users/${userId}`).get()).data()])),
    Promise.all(tierIds.map(async (tierId) => {
      const snapshot = await db.doc(`membershipTiers/${tierId}`).get()
      return [tierId, snapshot.exists ? normalizeTier(tierId, snapshot.data()) : null]
    })),
  ])
  const profileMap = new Map(profiles)
  const tierMap = new Map(tiers)
  return memberships.map((item) => serializeMembership(item, profileMap.get(item.userId) || null, tierMap.get(item.tierId) || null))
}

function normalizeStoredTimestamp(value) {
  const millis = timestampMillis(value)
  return Number.isFinite(millis) ? Timestamp.fromMillis(millis) : null
}

function isMembershipEffective(membership, now = Date.now()) {
  if (!membership || membership.status !== MEMBERSHIP_STATUSES.ACTIVE) return false
  if (membership.startsAt.toMillis() > now) return false
  return !membership.expiresAt || membership.expiresAt.toMillis() > now
}

async function readActiveMembership(userId, db = adminDb) {
  const snapshot = await db.collection('memberships').where('userId', '==', userId).get()
  const active = snapshot.docs
    .map((item) => normalizeMembership(item.id, item.data()))
    .filter((item) => item?.status === MEMBERSHIP_STATUSES.ACTIVE)
  if (active.length > 1) failedPrecondition('The user has more than one ACTIVE membership.')
  return active[0] || null
}

async function getActiveMembership(userId, db = adminDb, now = Date.now()) {
  const membership = await readActiveMembership(userId, db)
  return isMembershipEffective(membership, now) ? membership : null
}

async function resolveEffectiveMembership(userId, db = adminDb, now = Date.now()) {
  const membership = await getActiveMembership(userId, db, now)
  if (!membership) return null
  const tierSnapshot = await db.doc(`membershipTiers/${membership.tierId}`).get()
  const tier = tierSnapshot.exists ? normalizeTier(membership.tierId, tierSnapshot.data()) : null
  if (!tier || tier.status !== TIER_STATUSES.ACTIVE) return null
  return { membership, tier, level: tier.level }
}

async function readTargetUser(userId, db = adminDb, auth = adminAuth) {
  const profileSnapshot = await db.doc(`users/${userId}`).get()
  if (!profileSnapshot.exists) notFound('The target user profile was not found.')
  const profile = profileSnapshot.data()
  if (!profile || profile.uid !== userId || profile.status !== 'active') {
    failedPrecondition('The target user profile is invalid or inactive.')
  }
  try {
    const userRecord = await auth.getUser(userId)
    if (userRecord.disabled) failedPrecondition('The target Firebase Authentication user is disabled.')
  } catch {
    notFound('The target Firebase Authentication user was not found.')
  }
  return profile
}

function requireMembershipManager(actor, permission) {
  const isManager = hasSystemRole(actor, 'ROOT_ADMIN') || hasSystemRole(actor, 'SUPER_ADMIN')
  if (!isManager) throw new HttpsError('permission-denied', 'Only ROOT_ADMIN or SUPER_ADMIN may manage memberships.')
  requirePermission(actor, permission)
}

async function listMembershipTiers(actor, data, db = adminDb) {
  assertAllowedKeys(data || {}, ['includeInactive'])
  if (data?.includeInactive !== undefined && typeof data.includeInactive !== 'boolean') {
    invalidArgument('includeInactive must be a boolean.')
  }
  const includeInactive = data?.includeInactive === true
  if (includeInactive) requireMembershipManager(actor, 'membership.read')
  const snapshot = await db.collection('membershipTiers').get()
  const items = snapshot.docs
    .map((item) => normalizeTier(item.id, item.data()))
    .filter(Boolean)
    .filter((item) => includeInactive || item.status === TIER_STATUSES.ACTIVE)
    .sort((left, right) => left.level - right.level || left.id.localeCompare(right.id))
    .map(({ id, tierId, name, level, status, active, description }) => ({ id, tierId, name, level, status, active, description }))
  return { ok: true, items }
}

async function createMembershipTier(actor, data, db = adminDb) {
  const payload = normalizeTierCreatePayload(data)
  requireMembershipManager(actor, 'membership.update')
  const ref = db.doc(`membershipTiers/${payload.tierId}`)
  const now = Timestamp.now()
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists) alreadyExists('The Membership tier already exists.')
    transaction.create(ref, {
      tierId: payload.tierId,
      name: payload.name,
      level: payload.level,
      status: TIER_STATUSES.ACTIVE,
      description: payload.description,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.uid,
      updatedBy: actor.uid,
    })
  })
  return {
    ok: true,
    operation: 'createMembershipTier',
    tierId: payload.tierId,
    name: payload.name,
    level: payload.level,
    status: TIER_STATUSES.ACTIVE,
  }
}

async function updateMembershipTier(actor, data, db = adminDb) {
  const payload = normalizeTierUpdatePayload(data)
  requireMembershipManager(actor, 'membership.update')
  const ref = db.doc(`membershipTiers/${payload.tierId}`)
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) notFound('The Membership tier was not found.')
    const tier = normalizeTier(payload.tierId, snapshot.data())
    if (!tier) failedPrecondition('The Membership tier is invalid.')
    const now = Timestamp.now()
    transaction.update(ref, {
      name: payload.name,
      level: payload.level,
      description: payload.description,
      updatedAt: now,
      updatedBy: actor.uid,
    })
    return { status: tier.status }
  })
  return {
    ok: true,
    operation: 'updateMembershipTier',
    tierId: payload.tierId,
    name: payload.name,
    level: payload.level,
    status: result.status,
  }
}

async function deactivateMembershipTier(actor, data, db = adminDb) {
  const payload = normalizeTierDeactivatePayload(data)
  requireMembershipManager(actor, 'membership.update')
  const ref = db.doc(`membershipTiers/${payload.tierId}`)
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) notFound('The Membership tier was not found.')
    const tier = normalizeTier(payload.tierId, snapshot.data())
    if (!tier) failedPrecondition('The Membership tier is invalid.')
    if (tier.status === TIER_STATUSES.INACTIVE) {
      return { status: TIER_STATUSES.INACTIVE, changed: false }
    }
    const now = Timestamp.now()
    transaction.update(ref, {
      status: TIER_STATUSES.INACTIVE,
      updatedAt: now,
      updatedBy: actor.uid,
    })
    return { status: TIER_STATUSES.INACTIVE, changed: true }
  })
  return {
    ok: true,
    operation: 'deactivateMembershipTier',
    tierId: payload.tierId,
    status: result.status,
    changed: result.changed,
  }
}

async function listMemberships(actor, data, db = adminDb) {
  const payload = normalizeListPayload(data)
  requireMembershipManager(actor, 'membership.read')
  const snapshot = await db.collection('memberships').orderBy('createdAt', 'desc').limit(payload.limit + 1).get()
  const hasMore = snapshot.docs.length > payload.limit
  const items = await serializeMembershipDocuments(snapshot.docs.slice(0, payload.limit), db)
  return { ok: true, items, hasMore, limit: payload.limit }
}

async function getUserMemberships(actor, data, db = adminDb) {
  const payload = normalizeListPayload(data, { requireUserId: true })
  requireMembershipManager(actor, 'membership.read')
  const snapshot = await db.collection('memberships')
    .where('userId', '==', payload.userId)
    .orderBy('createdAt', 'desc')
    .limit(payload.limit + 1)
    .get()
  const hasMore = snapshot.docs.length > payload.limit
  const items = await serializeMembershipDocuments(snapshot.docs.slice(0, payload.limit), db)
  return { ok: true, userId: payload.userId, items, hasMore, limit: payload.limit }
}

async function createManualMembership(actor, data, db = adminDb) {
  const payload = normalizeCreatePayload(data)
  requireMembershipManager(actor, 'membership.assign')
  await readTargetUser(payload.userId, db)

  const membership = await db.runTransaction(async (transaction) => {
    const targetRef = db.doc(`users/${payload.userId}`)
    const tierRef = db.doc(`membershipTiers/${payload.tierId}`)
    const membershipsQuery = db.collection('memberships').where('userId', '==', payload.userId)
    const [targetSnapshot, tierSnapshot, membershipSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(tierRef),
      transaction.get(membershipsQuery),
    ])
    if (!targetSnapshot.exists) notFound('The target user profile was not found.')
    const target = targetSnapshot.data()
    if (!target || target.uid !== payload.userId || target.status !== 'active') {
      failedPrecondition('The target user profile is invalid or inactive.')
    }
    const tier = tierSnapshot.exists ? normalizeTier(payload.tierId, tierSnapshot.data()) : null
    if (!tier || tier.status !== TIER_STATUSES.ACTIVE) failedPrecondition('The membership tier was not found or is inactive.')
    const active = membershipSnapshot.docs
      .map((item) => normalizeMembership(item.id, item.data()))
      .find((item) => item?.status === MEMBERSHIP_STATUSES.ACTIVE)
    if (active) alreadyExists('The target user already has an ACTIVE membership.')

    const ref = db.collection('memberships').doc()
    const now = Timestamp.now()
    const value = {
      userId: payload.userId,
      tierId: payload.tierId,
      status: MEMBERSHIP_STATUSES.ACTIVE,
      startsAt: payload.startsAt,
      expiresAt: payload.expiresAt,
      source: MEMBERSHIP_SOURCES.MANUAL,
      assignedBy: actor.uid,
      createdAt: now,
      updatedAt: now,
      ...(payload.expiresAt ? {} : {}),
    }
    transaction.create(ref, value)
    return { ...value, id: ref.id }
  })

  return {
    ok: true,
    operation: 'createManualMembership',
    membershipId: membership.id,
    userId: membership.userId,
    tierId: membership.tierId,
    status: membership.status,
  }
}

async function revokeMembership(actor, data, db = adminDb) {
  const payload = normalizeRevokePayload(data)
  requireMembershipManager(actor, 'membership.revoke')
  const result = await db.runTransaction(async (transaction) => {
    const ref = db.doc(`memberships/${payload.membershipId}`)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) notFound('The membership was not found.')
    const membership = normalizeMembership(payload.membershipId, snapshot.data())
    if (!membership) failedPrecondition('The membership is invalid.')
    if (membership.status !== MEMBERSHIP_STATUSES.ACTIVE) {
      failedPrecondition('Only an ACTIVE membership can be revoked.')
    }
    const now = Timestamp.now()
    transaction.update(ref, { status: MEMBERSHIP_STATUSES.REVOKED, updatedAt: now })
    return { userId: membership.userId, tierId: membership.tierId, status: MEMBERSHIP_STATUSES.REVOKED }
  })
  return { ok: true, operation: 'revokeMembership', membershipId: payload.membershipId, ...result }
}

async function invokeMembershipRead(request, handler) {
  const actor = await getTrustedActor(request)
  return handler(actor, request?.data || {})
}

async function invokeMembershipMutation(request, handler, operation) {
  return invokeAudited(request, handler, operation)
}

module.exports = {
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_SOURCES,
  TIER_STATUSES,
  normalizeTier,
  normalizeTierCreatePayload,
  normalizeTierUpdatePayload,
  normalizeTierDeactivatePayload,
  normalizeMembership,
  normalizeCreatePayload,
  normalizeRevokePayload,
  normalizeListPayload,
  isMembershipEffective,
  getActiveMembership,
  resolveEffectiveMembership,
  listMembershipTiers,
  createMembershipTier,
  updateMembershipTier,
  deactivateMembershipTier,
  listMemberships,
  getUserMemberships,
  createManualMembership,
  revokeMembership,
  invokeMembershipRead,
  invokeMembershipMutation,
}
