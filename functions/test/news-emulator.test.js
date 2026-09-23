const assert = require('node:assert/strict')
const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { PERMISSIONS } = require('../src/auth')

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'along-news-audit'
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
const FUNCTIONS_BASE_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`
const PASSWORD = 'TestPassword123!'
const now = Timestamp.now()

const app = getApps()[0] || initializeApp({ projectId: PROJECT_ID })
const auth = getAuth(app)
const db = getFirestore(app)

function profile(uid, systemRole = 'USER') {
  return {
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    photoURL: '',
    systemRole,
    status: 'active',
    customRoles: [],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  }
}

async function createAccount(uid, permissions = [], systemRole = 'USER') {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: PASSWORD })
  await auth.setCustomUserClaims(uid, { systemRole, roleVersion: 1 })
  await db.doc(`users/${uid}`).set(profile(uid, systemRole))
  await db.doc(`userAuthorizations/${uid}`).set({
    uid,
    systemRole,
    customRoles: [],
    permissions: [...new Set(['calendar.search', 'calendar.export', ...permissions])],
    version: 1,
    updatedAt: now,
  })
}

async function signIn(uid) {
  const response = await fetch(`${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: PASSWORD, returnSecureToken: true }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`Auth emulator sign-in failed: ${JSON.stringify(body)}`)
  return body.idToken
}

function errorCode(body, response) {
  return String(body?.error?.status || body?.error?.code || (response.status === 401 ? 'unauthenticated' : 'callable-error'))
    .toLowerCase()
    .replace(/_/g, '-')
}

async function call(functionName, token, data) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  })
  const body = await response.json()
  if (body.error) {
    const error = new Error(body.error.message || 'Callable failed')
    error.code = errorCode(body, response)
    throw error
  }
  if (!response.ok) throw new Error(`Callable HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body.result
}

async function denied(operation, expectedCode = null) {
  let error
  try {
    await operation()
  } catch (caught) {
    error = caught
  }
  assert.ok(error, 'Expected News operation to be denied.')
  if (expectedCode) assert.equal(error.code, expectedCode, error.message)
}

function article(id, accessPolicy, extra = {}) {
  return {
    id,
    slug: id.toLowerCase(),
    title: id,
    excerpt: `Excerpt ${id}`,
    content: `Content ${id}`,
    contentFormat: 'MARKDOWN',
    categoryId: 'GENERAL',
    status: 'published',
    accessPolicy,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    ...extra,
  }
}

async function main() {
  await createAccount('news-vip1', ['news.read'])
  await createAccount('news-vip3', ['news.read'])
  await createAccount('news-special-user', ['news.read'])
  await createAccount('news-special-group', ['news.read'])
  await createAccount('news-no-read')
  await createAccount('news-editor', [
    'calendar.search', 'calendar.export', 'news.read', 'news.create', 'news.update', 'news.publish',
  ], 'EDITOR')
  await createAccount('news-admin', [
    'calendar.search', 'calendar.export', 'news.read', 'news.create', 'news.update', 'news.delete', 'news.publish',
  ], 'ADMIN')
  await createAccount('news-super', PERMISSIONS, 'SUPER_ADMIN')
  await createAccount('news-root', PERMISSIONS, 'ROOT_ADMIN')
  await createAccount('news-user-manager', ['news.read', 'news.update'])

  await db.doc('newsCategories/GENERAL').set({
    id: 'GENERAL',
    name: 'General',
    status: 'active',
    defaultAccessPolicy: { mode: 'PUBLIC' },
    createdAt: now,
    updatedAt: now,
  })
  await db.doc('newsCategories/SPECIAL_CATEGORY').set({
    id: 'SPECIAL_CATEGORY',
    name: 'Special',
    status: 'active',
    defaultAccessPolicy: { mode: 'SPECIAL' },
    createdAt: now,
    updatedAt: now,
  })

  await db.doc('newsArticles/PUBLIC_ARTICLE').set(article('PUBLIC_ARTICLE', { mode: 'PUBLIC' }))
  await db.doc('newsArticles/VIP1_ARTICLE').set(article('VIP1_ARTICLE', { mode: 'VIP', minVipLevel: 1 }))
  await db.doc('newsArticles/VIP2_ARTICLE').set(article('VIP2_ARTICLE', { mode: 'VIP', minVipLevel: 2 }))
  await db.doc('newsArticles/VIP3_ARTICLE').set(article('VIP3_ARTICLE', { mode: 'VIP', minVipLevel: 3 }))
  await db.doc('newsArticles/SPECIAL_USER_ARTICLE').set(article('SPECIAL_USER_ARTICLE', { mode: 'SPECIAL' }))
  await db.doc('newsArticles/SPECIAL_GROUP_ARTICLE').set(article('SPECIAL_GROUP_ARTICLE', { mode: 'INHERIT', inheritCategory: true }, { categoryId: 'SPECIAL_CATEGORY' }))
  await db.doc('newsArticles/DRAFT_ARTICLE').set(article('DRAFT_ARTICLE', { mode: 'PUBLIC' }, { status: 'draft' }))

  await db.doc('newsArticles/SPECIAL_USER_ARTICLE/acl/user-entry').set({
    principalType: 'USER', principalId: 'news-special-user', effect: 'ALLOW', createdAt: now,
  })
  await db.doc('newsCategories/SPECIAL_CATEGORY/acl/group-entry').set({
    principalType: 'GROUP', principalId: 'NEWS_GROUP', effect: 'ALLOW', createdAt: now,
  })
  await db.doc('newsGroups/NEWS_GROUP').set({ id: 'NEWS_GROUP', status: 'active', createdAt: now })
  await db.doc('newsGroups/NEWS_GROUP/members/news-special-group').set({
    uid: 'news-special-group', status: 'active', addedAt: now,
  })

  const vip1Token = await signIn('news-vip1')
  const vip3Token = await signIn('news-vip3')
  const specialUserToken = await signIn('news-special-user')
  const specialGroupToken = await signIn('news-special-group')
  const noReadToken = await signIn('news-no-read')
  const editorToken = await signIn('news-editor')
  const adminToken = await signIn('news-admin')
  const superToken = await signIn('news-super')
  const rootToken = await signIn('news-root')
  const userManagerToken = await signIn('news-user-manager')

  const guestPublic = await call('getNewsArticle', null, { articleId: 'PUBLIC_ARTICLE' })
  assert.equal(guestPublic.article.id, 'PUBLIC_ARTICLE')
  assert.equal(guestPublic.article.content, 'Content PUBLIC_ARTICLE')
  await denied(() => call('getNewsArticle', null, { articleId: 'VIP1_ARTICLE' }), 'not-found')
  await denied(() => call('getNewsArticle', null, { actorUid: 'forged', articleId: 'PUBLIC_ARTICLE' }), 'invalid-argument')

  const guestList = await call('listNews', null, { limit: 50 })
  assert.deepEqual(guestList.items.map((item) => item.id), ['PUBLIC_ARTICLE'])

  await db.doc('contentEntitlements/news-vip1').set({ uid: 'news-vip1', newsLevel: 1, status: 'active', startsAt: now })
  await db.doc('contentEntitlements/news-vip3').set({ uid: 'news-vip3', newsLevel: 3, status: 'active', startsAt: now })

  assert.equal((await call('getNewsArticle', vip1Token, { articleId: 'VIP1_ARTICLE' })).article.id, 'VIP1_ARTICLE')
  await denied(() => call('getNewsArticle', vip1Token, { articleId: 'VIP2_ARTICLE' }), 'not-found')
  assert.equal((await call('getNewsArticle', vip3Token, { articleId: 'VIP3_ARTICLE' })).article.id, 'VIP3_ARTICLE')
  await denied(() => call('getNewsArticle', noReadToken, { articleId: 'VIP1_ARTICLE' }), 'not-found')
  assert.equal((await call('getNewsArticle', noReadToken, { articleId: 'PUBLIC_ARTICLE' })).article.id, 'PUBLIC_ARTICLE')
  await db.doc('contentEntitlements/news-vip1').update({ uid: 'wrong-user' })
  await denied(() => call('getNewsArticle', vip1Token, { articleId: 'VIP1_ARTICLE' }), 'not-found')
  await db.doc('contentEntitlements/news-vip1').update({ uid: 'news-vip1' })

  assert.equal((await call('getNewsArticle', specialUserToken, { articleId: 'SPECIAL_USER_ARTICLE' })).article.id, 'SPECIAL_USER_ARTICLE')
  await denied(() => call('getNewsArticle', specialGroupToken, { articleId: 'SPECIAL_USER_ARTICLE' }), 'not-found')
  assert.equal((await call('getNewsArticle', specialGroupToken, { articleId: 'SPECIAL_GROUP_ARTICLE' })).article.id, 'SPECIAL_GROUP_ARTICLE')
  await denied(() => call('getNewsArticle', specialUserToken, { articleId: 'DRAFT_ARTICLE' }), 'not-found')

  const categoryList = await call('listNews', vip1Token, { categoryId: 'GENERAL', limit: 20 })
  assert.equal(categoryList.items.some((item) => item.id === 'PUBLIC_ARTICLE'), true)
  assert.equal(categoryList.items.some((item) => item.id === 'VIP1_ARTICLE'), true)
  assert.equal(categoryList.items.some((item) => item.id === 'VIP2_ARTICLE'), false)

  await denied(() => call('getNewsArticle', vip1Token, { articleId: 'PUBLIC_ARTICLE', role: 'ROOT_ADMIN' }), 'invalid-argument')

  // Phase 8.2 trusted mutations: draft lifecycle and public access.
  await denied(() => call('createNewsArticle', null, {
    title: 'Guest cannot create', content: 'x', accessPolicy: { mode: 'PUBLIC' },
  }), 'unauthenticated')
  await denied(() => call('createNewsArticle', noReadToken, {
    title: 'User cannot create', content: 'x', accessPolicy: { mode: 'PUBLIC' },
  }), 'permission-denied')
  await denied(() => call('createNewsArticle', editorToken, {
    actorUid: 'forged', title: 'Forged actor', content: 'x', accessPolicy: { mode: 'PUBLIC' },
  }), 'invalid-argument')
  await denied(() => call('createNewsArticle', editorToken, {
    title: 'Client status', content: 'x', status: 'published', accessPolicy: { mode: 'PUBLIC' },
  }), 'invalid-argument')

  const created = await call('createNewsArticle', editorToken, {
    title: 'Managed Article',
    excerpt: 'Managed excerpt',
    content: 'Managed content',
    contentFormat: 'MARKDOWN',
    accessPolicy: { mode: 'PUBLIC' },
  })
  assert.equal(created.status, 'draft')
  await denied(() => call('getNewsArticle', null, { articleId: created.articleId }), 'not-found')
  await call('updateNewsArticle', editorToken, {
    articleId: created.articleId, title: 'Updated Managed Article', content: 'Updated content',
  })
  await call('publishNewsArticle', editorToken, { articleId: created.articleId })
  assert.equal((await call('getNewsArticle', null, { articleId: created.articleId })).article.title, 'Updated Managed Article')
  await call('unpublishNewsArticle', editorToken, { articleId: created.articleId })
  await denied(() => call('getNewsArticle', null, { articleId: created.articleId }), 'not-found')

  // Access policy and VIP escalation are controlled by trusted permission and entitlement data.
  await denied(() => call('setNewsAccessPolicy', noReadToken, {
    articleId: 'PUBLIC_ARTICLE', accessPolicy: { mode: 'VIP', minVipLevel: 3 },
  }), 'permission-denied')
  await denied(() => call('setNewsAccessPolicy', editorToken, {
    articleId: 'PUBLIC_ARTICLE', accessPolicy: { mode: 'VIP', minVipLevel: 4 },
  }), 'invalid-argument')
  await call('setNewsAccessPolicy', editorToken, {
    articleId: created.articleId, accessPolicy: { mode: 'VIP', minVipLevel: 2 },
  })
  await call('publishNewsArticle', editorToken, { articleId: created.articleId })
  await db.doc('contentEntitlements/news-editor').set({ uid: 'news-editor', newsLevel: 1, status: 'active', startsAt: now })
  await denied(() => call('getNewsArticle', editorToken, { articleId: created.articleId }), 'not-found')
  await db.doc('contentEntitlements/news-editor').update({ newsLevel: 2 })
  assert.equal((await call('getNewsArticle', editorToken, { articleId: created.articleId })).article.id, created.articleId)

  // Category, article ACL and group ACL mutations are server-side only.
  const specialCategory = await call('createNewsCategory', superToken, {
    name: 'Managed Special', defaultAccessPolicy: { mode: 'SPECIAL' },
  })
  const specialArticle = await call('createNewsArticle', editorToken, {
    title: 'Managed Special Article', content: 'Special content', categoryId: specialCategory.categoryId,
    accessPolicy: { mode: 'SPECIAL' },
  })
  await call('publishNewsArticle', editorToken, { articleId: specialArticle.articleId })
  await denied(() => call('getNewsArticle', specialUserToken, { articleId: specialArticle.articleId }), 'not-found')
  const userAcl = await call('setNewsAclEntry', adminToken, {
    scope: 'ARTICLE', resourceId: specialArticle.articleId,
    principalType: 'USER', principalId: 'news-special-user',
  })
  assert.equal(typeof userAcl.aclId, 'string')
  assert.equal((await call('getNewsArticle', specialUserToken, { articleId: specialArticle.articleId })).article.id, specialArticle.articleId)
  await denied(() => call('setNewsAclEntry', userManagerToken, {
    scope: 'ARTICLE', resourceId: specialArticle.articleId,
    principalType: 'USER', principalId: 'news-user-manager',
  }), 'permission-denied')
  await denied(() => call('setNewsAclEntry', noReadToken, {
    scope: 'ARTICLE', resourceId: specialArticle.articleId,
    principalType: 'USER', principalId: 'news-no-read',
  }), 'permission-denied')
  await denied(() => call('setNewsAclEntry', adminToken, {
    scope: 'ARTICLE', resourceId: specialArticle.articleId,
    principalType: 'USER', principalId: 'news-special-user', effect: 'ALLOW',
  }), 'invalid-argument')
  await call('removeNewsAclEntry', adminToken, {
    scope: 'ARTICLE', resourceId: specialArticle.articleId,
    principalType: 'USER', principalId: 'news-special-user',
  })
  await denied(() => call('getNewsArticle', specialUserToken, { articleId: specialArticle.articleId }), 'not-found')

  await db.doc('newsGroups/MANAGED_GROUP').set({ id: 'MANAGED_GROUP', status: 'active', createdAt: now })
  await db.doc('newsGroups/MANAGED_GROUP/members/news-special-group').set({ uid: 'news-special-group', status: 'active', addedAt: now })
  await call('setNewsAclEntry', adminToken, {
    scope: 'CATEGORY', resourceId: specialCategory.categoryId,
    principalType: 'GROUP', principalId: 'MANAGED_GROUP',
  })
  const inheritedArticle = await call('createNewsArticle', editorToken, {
    title: 'Inherited Special Article', content: 'Inherited content', categoryId: specialCategory.categoryId,
    accessPolicy: { mode: 'INHERIT', inheritCategory: true },
  })
  await call('publishNewsArticle', editorToken, { articleId: inheritedArticle.articleId })
  assert.equal((await call('getNewsArticle', specialGroupToken, { articleId: inheritedArticle.articleId })).article.id, inheritedArticle.articleId)

  // Malformed ACL data is ignored by trusted reads and cannot grant access.
  await db.doc(`newsArticles/${specialArticle.articleId}/acl/malformed`).set({ effect: 'ALLOW', principalType: 'USER', principalId: 123 })
  await denied(() => call('getNewsArticle', specialGroupToken, { articleId: specialArticle.articleId }), 'not-found')

  await call('updateNewsCategory', rootToken, { categoryId: specialCategory.categoryId, description: 'Updated category' })
  await denied(() => call('deleteNewsCategory', adminToken, { categoryId: specialCategory.categoryId }), 'failed-precondition')
  await denied(() => call('setNewsAccessPolicy', noReadToken, {
    actorUid: 'forged', articleId: specialArticle.articleId, accessPolicy: { mode: 'PUBLIC' },
  }), 'invalid-argument')

  console.log('News trusted read/mutation emulator integration PASS: access policy, article lifecycle, category/ACL mutation, VIP escalation denial, malformed ACL denial, and server-side authorization verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
