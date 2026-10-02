const { HttpsError } = require('firebase-functions/v2/https')
const { FieldPath, Timestamp } = require('firebase-admin/firestore')
const { adminAuth, adminDb } = require('./admin')
const { getTrustedActor, requirePermission, SYSTEM_ROLES } = require('./auth')
const { readProfile } = require('./custom-role-service')
const { invokeAudited } = require('./audit')

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message)
}

function failedPrecondition(message) {
  throw new HttpsError('failed-precondition', message)
}

function notFound(message) {
  throw new HttpsError('not-found', message)
}

function permissionDenied(message) {
  throw new HttpsError('permission-denied', message)
}

const DEFAULT_LIST_LIMIT = 25
const MAX_LIST_LIMIT = 50
const USER_LIST_FIELDS = new Set(['displayName', 'email'])
const MAX_SEARCH_STREAM_LIMIT = 50

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodeCursor(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 2048) invalidArgument('cursor is invalid.')
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (decoded?.version === 2 && Array.isArray(decoded.streams) && decoded.streams.length > 0
      && decoded.streams.length <= 8
      && decoded.streams.every((stream) => USER_LIST_FIELDS.has(stream.field)
        && typeof stream.variant === 'string' && stream.variant.length <= 120
        && typeof stream.value === 'string' && typeof stream.id === 'string' && stream.id)) {
      return decoded
    }
    if (!decoded || !USER_LIST_FIELDS.has(decoded.field) || typeof decoded.value !== 'string'
      || typeof decoded.id !== 'string' || !decoded.id) invalidArgument('cursor is invalid.')
    return decoded
  } catch {
    invalidArgument('cursor is invalid.')
  }
}

function normalizeUserListPayload(data) {
  const value = data || {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidArgument('Request payload must be an object.')
  const allowed = ['query', 'status', 'systemRole', 'customRoleId', 'pageSize', 'cursor']
  const unsupported = Object.keys(value).find((key) => !allowed.includes(key))
  if (unsupported) invalidArgument(`Unsupported request field: ${unsupported}.`)
  const query = value.query === undefined ? '' : value.query
  if (typeof query !== 'string' || query.trim().length > 120) invalidArgument('query must be a string with at most 120 characters.')
  const status = value.status === undefined || value.status === '' ? null : value.status
  if (status !== null && !['active', 'suspended', 'disabled', 'deletion_requested', 'deleted'].includes(status)) invalidArgument('status is invalid.')
  const systemRole = value.systemRole === undefined || value.systemRole === '' ? null : value.systemRole
  if (systemRole !== null && !Object.values(SYSTEM_ROLES).includes(systemRole)) invalidArgument('systemRole is invalid.')
  const customRoleId = value.customRoleId === undefined || value.customRoleId === '' ? null : value.customRoleId
  if (customRoleId !== null && (typeof customRoleId !== 'string' || customRoleId.length > 128)) invalidArgument('customRoleId is invalid.')
  const pageSize = value.pageSize === undefined ? DEFAULT_LIST_LIMIT : value.pageSize
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_LIST_LIMIT) {
    invalidArgument(`pageSize must be an integer from 1 to ${MAX_LIST_LIMIT}.`)
  }
  return { query: query.trim(), status, systemRole, customRoleId, pageSize, cursor: decodeCursor(value.cursor) }
}

function normalizeSearchText(value) {
  return value.normalize('NFC')
}

function uniqueSearchVariants(query) {
  const normalized = normalizeSearchText(query)
  const lower = normalized.toLocaleLowerCase('vi')
  const upper = normalized.toLocaleUpperCase('vi')
  const capitalized = normalized.length
    ? normalized.charAt(0).toLocaleUpperCase('vi') + normalized.slice(1).toLocaleLowerCase('vi')
    : normalized
  return [...new Set([normalized, lower, upper, capitalized].filter(Boolean))]
}

function buildSearchStreams(query) {
  const fields = query.includes('@') ? ['email'] : ['displayName', 'email']
  return fields.flatMap((field) => uniqueSearchVariants(query).map((variant) => ({
    field,
    variant,
    key: `${field}:${variant}`,
  })))
}

function buildUsersQuery(db, payload) {
  let userQuery = db.collection('users')
  if (payload.status) userQuery = userQuery.where('status', '==', payload.status)
  if (payload.systemRole) userQuery = userQuery.where('systemRole', '==', payload.systemRole)
  if (payload.customRoleId) userQuery = userQuery.where('customRoles', 'array-contains', payload.customRoleId)
  return userQuery
}

function projectUser(item) {
  const user = item.data()
  return {
    id: item.id,
    uid: user.uid === item.id ? item.id : null,
    email: typeof user.email === 'string' ? user.email : '',
    displayName: typeof user.displayName === 'string' ? user.displayName : '',
    photoURL: typeof user.photoURL === 'string' ? user.photoURL : '',
    status: user.status || 'active',
    systemRole: user.systemRole || SYSTEM_ROLES.USER,
    customRoles: Array.isArray(user.customRoles) ? user.customRoles : [],
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  }
}

function compareProjectedUsers(left, right) {
  const leftKey = normalizeSearchText(left.displayName || left.email || left.id).toLocaleLowerCase('vi')
  const rightKey = normalizeSearchText(right.displayName || right.email || right.id).toLocaleLowerCase('vi')
  return leftKey.localeCompare(rightKey, 'vi') || left.id.localeCompare(right.id)
}

function normalizePayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalidArgument('Request payload must be an object.')
  const unsupported = Object.keys(data).find((key) => !['targetUid', 'displayName', 'photoURL'].includes(key))
  if (unsupported) invalidArgument('Unsupported request field: ' + unsupported + '.')
  if (typeof data.targetUid !== 'string' || !data.targetUid.trim()) invalidArgument('targetUid is required.')
  const fields = {}
  for (const field of ['displayName', 'photoURL']) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue
    if (typeof data[field] !== 'string') invalidArgument(field + ' must be a string.')
    const value = data[field].trim()
    const maxLength = field === 'displayName' ? 200 : 2048
    if (value.length > maxLength) invalidArgument(field + ' is too long.')
    fields[field] = value
  }
  if (!Object.keys(fields).length) invalidArgument('At least one editable profile field is required.')
  return { targetUid: data.targetUid.trim(), fields }
}

async function readTargetAuth(targetUid, auth = adminAuth) {
  try {
    const target = await auth.getUser(targetUid)
    if (target.disabled) failedPrecondition('The target user is disabled in Firebase Authentication.')
    return target
  } catch (error) {
    if (error instanceof HttpsError) throw error
    if (error.code === 'auth/user-not-found') notFound('The target Firebase Authentication user was not found.')
    throw new HttpsError('internal', 'The target Firebase Authentication user could not be read.')
  }
}

async function assertTargetIsNotRoot(targetUid, profile, targetAuth, db = adminDb) {
  const rootLock = await db.doc('systemConfig/root').get()
  if (rootLock.exists && rootLock.data()?.rootUid === targetUid) {
    permissionDenied('The protected ROOT_ADMIN account cannot be changed.')
  }
  if (profile.systemRole === SYSTEM_ROLES.ROOT_ADMIN
    || targetAuth.customClaims?.systemRole === SYSTEM_ROLES.ROOT_ADMIN) {
    permissionDenied('ROOT_ADMIN accounts cannot be changed.')
  }
}

function sameSecurityState(left, right) {
  return left.systemRole === right.systemRole
    && left.status === right.status
    && JSON.stringify(left.customRoles || []) === JSON.stringify(right.customRoles || [])
}

async function updateUserProfile(actor, data, db = adminDb, auth = adminAuth) {
  const payload = normalizePayload(data)
  requirePermission(actor, 'users.update')

  const [profile, targetAuth] = await Promise.all([
    readProfile(payload.targetUid, db),
    readTargetAuth(payload.targetUid, auth),
  ])
  const targetClaimRole = targetAuth.customClaims?.systemRole
  if ((targetClaimRole !== undefined && targetClaimRole !== profile.systemRole)
    || (targetClaimRole === undefined && profile.systemRole !== SYSTEM_ROLES.USER)) {
    failedPrecondition('The target user Custom Claims and profile are inconsistent.')
  }
  await assertTargetIsNotRoot(payload.targetUid, profile, targetAuth, db)

  const previousAuthProfile = Object.fromEntries(
    Object.keys(payload.fields).map((field) => [field, targetAuth[field] ?? null]),
  )
  const nextAuthProfile = Object.fromEntries(
    Object.entries(payload.fields).map(([field, value]) => [
      field,
      (field === 'displayName' || field === 'photoURL') && value === '' ? null : value,
    ]),
  )
  let authApplied = false
  let firestoreApplied = false

  try {
    await auth.updateUser(payload.targetUid, nextAuthProfile)
    authApplied = true

    await db.runTransaction(async (transaction) => {
      const targetRef = db.doc(`users/${payload.targetUid}`)
      const targetSnapshot = await transaction.get(targetRef)
      if (!targetSnapshot.exists) notFound('The target user profile was not found.')
      const freshProfile = targetSnapshot.data()
      if (!sameSecurityState(freshProfile, profile)) {
        failedPrecondition('The target user security state changed while the mutation was in progress.')
      }
      transaction.update(targetRef, { ...payload.fields, updatedAt: Timestamp.now() })
    })
    firestoreApplied = true

    const [verifiedProfileSnapshot, verifiedAuth] = await Promise.all([
      db.doc(`users/${payload.targetUid}`).get(),
      auth.getUser(payload.targetUid),
    ])
    const verifiedProfile = verifiedProfileSnapshot.exists ? verifiedProfileSnapshot.data() : null
    const profileMatches = verifiedProfile
      && Object.entries(payload.fields).every(([field, value]) => verifiedProfile[field] === value)
    const authMatches = Object.entries(nextAuthProfile).every(([field, value]) => verifiedAuth[field] === value)
    if (!profileMatches || !authMatches || verifiedAuth.disabled) {
      failedPrecondition('User profile consistency verification failed.')
    }
  } catch (error) {
    const rollbackErrors = []
    if (firestoreApplied) {
      try {
        await db.doc(`users/${payload.targetUid}`).set({ ...profile, uid: payload.targetUid }, { merge: false })
      } catch (rollbackError) {
        rollbackErrors.push('Firestore rollback failed: ' + rollbackError.message)
      }
    }
    if (authApplied) {
      try {
        await auth.updateUser(payload.targetUid, previousAuthProfile)
      } catch (rollbackError) {
        rollbackErrors.push('Firebase Authentication rollback failed: ' + rollbackError.message)
      }
    }
    if (rollbackErrors.length) throw new HttpsError('internal', 'CRITICAL INCONSISTENCY: ' + rollbackErrors.join(' '))
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'User profile mutation failed; all changes were rolled back.')
  }

  return {
    ok: true,
    operation: 'updateUserProfile',
    targetUid: payload.targetUid,
    updatedFields: Object.keys(payload.fields),
  }
}

async function listUsers(actor, data, db = adminDb) {
  requirePermission(actor, 'users.read')
  const payload = normalizeUserListPayload(data)
  if (!payload.query) {
    const searchField = 'displayName'
    let userQuery = buildUsersQuery(db, payload)
      .orderBy(searchField).orderBy(FieldPath.documentId())
    if (payload.cursor && payload.cursor.version !== 2) {
      userQuery = userQuery.startAfter(payload.cursor.value, payload.cursor.id)
    }
    const snapshot = await userQuery.limit(payload.pageSize + 1).get()
    const docs = snapshot.docs.slice(0, payload.pageSize)
    const items = docs.map(projectUser).filter((user) => user.uid)
    const last = docs.at(-1)
    return {
      ok: true,
      items,
      hasMore: snapshot.docs.length > payload.pageSize,
      nextCursor: last ? encodeCursor({ field: searchField, value: String(last.data()?.[searchField] || ''), id: last.id }) : null,
      pageSize: payload.pageSize,
    }
  }

  // Firestore range queries are case-sensitive and the existing production
  // profiles do not all have normalized search fields. Search a small,
  // bounded set of Unicode-normalized case variants across both searchable
  // fields, then merge/dedupe on the server. This keeps legacy documents
  // searchable without a collection scan or a production backfill.
  const streams = buildSearchStreams(payload.query)
  const previousStates = new Map(
    (payload.cursor?.version === 2 ? payload.cursor.streams : [])
      .map((stream) => [`${stream.field}:${stream.variant}`, stream]),
  )
  const streamLimit = Math.min(
    MAX_SEARCH_STREAM_LIMIT,
    Math.max(payload.pageSize + 1, payload.pageSize * 2),
  )
  const streamResults = await Promise.all(streams.map(async (stream) => {
    let userQuery = buildUsersQuery(db, payload)
      .orderBy(stream.field).orderBy(FieldPath.documentId())
    const previous = previousStates.get(stream.key)
    if (previous) userQuery = userQuery.startAfter(previous.value, previous.id)
    else userQuery = userQuery.startAt(stream.variant)
    userQuery = userQuery.endAt(`${stream.variant}\uf8ff`)
    const snapshot = await userQuery.limit(streamLimit).get()
    return { stream, snapshot }
  }))

  const merged = new Map()
  for (const { stream, snapshot } of streamResults) {
    for (const item of snapshot.docs) {
      const user = projectUser(item)
      if (!user.uid) continue
      const source = { field: stream.field, variant: stream.variant, value: String(item.data()?.[stream.field] || ''), id: item.id }
      const existing = merged.get(user.id)
      if (existing) existing.sources.push(source)
      else merged.set(user.id, { user, sources: [source] })
    }
  }

  const ordered = [...merged.values()].sort((left, right) => compareProjectedUsers(left.user, right.user))
  const page = ordered.slice(0, payload.pageSize)
  const boundary = page.at(-1)?.user
  const nextStates = new Map(previousStates)
  if (boundary) {
    const boundaryKey = normalizeSearchText(boundary.displayName || boundary.email || boundary.id).toLocaleLowerCase('vi')
    for (const { stream, snapshot } of streamResults) {
      const eligible = snapshot.docs.map((item) => {
        const projected = projectUser(item)
        const key = normalizeSearchText(projected.displayName || projected.email || projected.id).toLocaleLowerCase('vi')
        return { item, key }
      }).filter(({ key }) => key <= boundaryKey)
      const last = eligible.at(-1)
      if (last) {
        nextStates.set(stream.key, {
          field: stream.field,
          variant: stream.variant,
          value: String(last.item.data()?.[stream.field] || ''),
          id: last.item.id,
        })
      }
    }
  }
  const hasMore = streamResults.some(({ snapshot }) => snapshot.docs.length >= streamLimit)
    || ordered.length > payload.pageSize
  return {
    ok: true,
    items: page.map(({ user }) => user),
    hasMore,
    nextCursor: hasMore ? encodeCursor({ version: 2, streams: [...nextStates.values()] }) : null,
    pageSize: payload.pageSize,
  }
}

async function invokeTrusted(request, handler, operation = 'updateUserProfile') {
  return invokeAudited(request, handler, operation)
}

async function invokeRead(request, handler) {
  const actor = await getTrustedActor(request)
  return handler(actor, request?.data || {})
}

module.exports = {
  normalizePayload,
  normalizeUserListPayload,
  listUsers,
  updateUserProfile,
  invokeTrusted,
  invokeRead,
}
