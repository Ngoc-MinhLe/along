const assert = require('node:assert/strict')
const {
  normalizeManagedAccessPolicy,
  normalizeArticleCreatePayload,
  normalizeArticleUpdatePayload,
  normalizeCategoryCreatePayload,
  normalizeAclPayload,
} = require('../src/news-mutation-service')

assert.deepEqual(normalizeManagedAccessPolicy({ mode: 'PUBLIC' }), {
  mode: 'PUBLIC',
  minVipLevel: null,
})
assert.deepEqual(normalizeManagedAccessPolicy({ mode: 'VIP', minVipLevel: 3 }), {
  mode: 'VIP',
  minVipLevel: 3,
})
assert.deepEqual(normalizeManagedAccessPolicy({ mode: 'INHERIT', inheritCategory: true }), {
  mode: 'INHERIT',
  inheritCategory: true,
})
assert.equal(normalizeArticleCreatePayload({
  title: 'Tin mới',
  content: 'Nội dung',
  accessPolicy: { mode: 'SPECIAL' },
}).slug, 'tin-moi')
assert.equal(normalizeArticleUpdatePayload({ articleId: 'ARTICLE_1', content: 'Updated' }).fields.content, 'Updated')
assert.equal(normalizeCategoryCreatePayload({
  name: 'VIP 1',
  defaultAccessPolicy: { mode: 'VIP', minVipLevel: 1 },
}).slug, 'vip-1')
assert.deepEqual(normalizeAclPayload({
  scope: 'ARTICLE',
  resourceId: 'ARTICLE_1',
  principalType: 'GROUP',
  principalId: 'GROUP_1',
}), {
  scope: 'ARTICLE',
  resourceId: 'ARTICLE_1',
  principalType: 'GROUP',
  principalId: 'GROUP_1',
})

function rejects(operation, expectedMessage) {
  assert.throws(operation, (error) => error.code === 'invalid-argument'
    && (!expectedMessage || error.message.includes(expectedMessage)))
}

rejects(() => normalizeManagedAccessPolicy({ mode: 'VIP', minVipLevel: 4 }), 'accessPolicy')
rejects(() => normalizeManagedAccessPolicy({ mode: 'PUBLIC', actorUid: 'forged' }), 'Unsupported')
rejects(() => normalizeArticleCreatePayload({
  title: 'Article', content: 'Content', accessPolicy: { mode: 'PUBLIC' }, status: 'published',
}), 'Unsupported')
rejects(() => normalizeAclPayload({
  scope: 'ARTICLE', resourceId: 'A', principalType: 'USER', principalId: 'A', effect: 'ALLOW',
}), 'Unsupported')

console.log('News mutation unit test PASS: payload allowlists, access policy, slug, category and ACL validation verified.')
