const assert = require('node:assert/strict')
const {
  listNewsManagement,
  listNewsCategories,
  listNewsCategoryTree,
  listNewsUsers,
  listNewsGroups,
} = require('../src/news-service')

function actor(permissions = ['news.read', 'news.update', 'news.create', 'news.delete', 'news.publish']) {
  return { uid: 'actor', authorization: { permissions } }
}

function snapshot(id, data) {
  return { id, exists: true, data: () => data }
}

function queryFrom(docs) {
  const query = {
    where() { return query },
    orderBy() { return query },
    startAt() { return query },
    endAt() { return query },
    startAfter() { return query },
    limit() { return query },
    async get() { return { docs } },
  }
  return query
}

function dbFor(collections) {
  return {
    collection(name) { return queryFrom(collections[name] || []) },
  }
}

async function rejects(operation, code) {
  await assert.rejects(operation, (error) => error.code === code)
}

;(async () => {
  const db = dbFor({
    newsArticles: [snapshot('article-1', {
      id: 'article-1', title: 'News one', slug: 'news-one', status: 'draft',
      categoryId: 'category-1', accessPolicy: { mode: 'PUBLIC' },
    })],
    newsCategories: [snapshot('category-1', {
      name: 'General', description: 'General news', status: 'active', defaultAccessPolicy: { mode: 'PUBLIC' },
    }), snapshot('category-2', {
      name: 'Disabled', description: '', status: 'disabled', defaultAccessPolicy: { mode: 'PUBLIC' },
    }), snapshot('category-3', {
      name: 'Phong thủy', description: 'Phong thủy', status: 'active', parentId: null, defaultAccessPolicy: { mode: 'PUBLIC' },
    }), snapshot('category-4', {
      name: 'Phòng khách', description: '', status: 'active', parentId: 'category-3', defaultAccessPolicy: { mode: 'PUBLIC' },
    }), snapshot('category-5', {
      name: 'TEST', description: '', status: 'active', parentId: null, defaultAccessPolicy: { mode: 'PUBLIC' },
    }), snapshot('category-6', {
      name: 'Test 2', description: '', status: 'active', parentId: 'category-5', defaultAccessPolicy: { mode: 'PUBLIC' },
    }), snapshot('category-7', {
      name: 'Huyền không', description: '', status: 'active', parentId: null, defaultAccessPolicy: { mode: 'PUBLIC' },
    })],
    users: [snapshot('user-1', { uid: 'user-1', email: 'user@example.test', displayName: 'User One', status: 'active' })],
    newsGroups: [snapshot('group-1', { id: 'group-1', name: 'Editors', status: 'active' })],
  })

  const management = await listNewsManagement(actor(), {}, db)
  assert.equal(management.items[0].id, 'article-1')
  assert.equal(Object.prototype.hasOwnProperty.call(management.items[0], 'content'), false)
  await rejects(() => listNewsManagement(actor(['news.read']), { actorUid: 'forged' }, db), 'invalid-argument')
  await rejects(() => listNewsManagement(actor([]), {}, db), 'permission-denied')

  const publicCategories = await listNewsCategories(null, {}, db)
  assert.deepEqual(publicCategories.items.map((item) => item.id), ['category-1', 'category-3', 'category-4', 'category-5', 'category-6', 'category-7'])
  await rejects(() => listNewsCategories(actor(['news.read']), { includeDisabled: true }, db), 'permission-denied')
  const managedCategories = await listNewsCategories(actor(['news.update']), { includeDisabled: true }, db)
  assert.equal(managedCategories.items.length, 7)
  for (const [query, expected] of [
    ['te', ['category-5', 'category-6']],
    ['TE', ['category-5', 'category-6']],
    ['test', ['category-5', 'category-6']],
    ['TEST', ['category-5', 'category-6']],
    ['pho', ['category-3', 'category-4']],
    ['phong', ['category-3', 'category-4']],
    ['phong thuy', ['category-3']],
    ['huyen', ['category-7']],
    ['  HUYỀN   ', ['category-7']],
    ['', ['category-1', 'category-2', 'category-3', 'category-4', 'category-5', 'category-6', 'category-7']],
  ]) {
    const result = await listNewsCategories(actor(['news.update']), { query, includeDisabled: true }, db)
    assert.deepEqual(result.items.map((item) => item.id).sort(), expected.sort(), `Category search mismatch for ${query}`)
  }
  assert.deepEqual((await listNewsCategoryTree(actor(['news.update']), { query: 'PHONG', includeDisabled: true }, db)).items.map((item) => item.id).sort(), ['category-3', 'category-4'])
  assert.deepEqual((await listNewsCategoryTree(actor(['news.update']), { query: 'phong thuy', includeDisabled: true }, db)).items.map((item) => item.id).sort(), ['category-3'])
  assert.deepEqual((await listNewsCategoryTree(actor(['news.update']), { query: 'test', includeDisabled: true }, db)).items.map((item) => item.id).sort(), ['category-5', 'category-6'])
  assert.deepEqual((await listNewsCategoryTree(actor(['news.update']), { query: 'huyen', includeDisabled: true }, db)).items.map((item) => item.id).sort(), ['category-7'])
  await rejects(() => listNewsCategoryTree(actor(['news.read']), {}, db), 'permission-denied')

  const users = await listNewsUsers(actor(['news.update']), {}, db)
  assert.equal(users.items[0].uid, 'user-1')
  await rejects(() => listNewsUsers(actor(['news.read']), {}, db), 'permission-denied')
  const groups = await listNewsGroups(actor(['news.update']), {}, db)
  assert.equal(groups.items[0].id, 'group-1')

  console.log('News selector test PASS: server-side permission boundary, bounded metadata selectors and public category filtering verified.')
})().catch((error) => { console.error(error); process.exitCode = 1 })
