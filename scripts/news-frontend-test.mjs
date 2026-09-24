import fs from 'node:fs'
import assert from 'node:assert/strict'

const service = fs.readFileSync('src/services/news.js', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const management = fs.readFileSync('src/pages/NewsManagementPage.jsx', 'utf8')

for (const functionName of [
  'listNews', 'getNewsArticle', 'createNewsArticle', 'updateNewsArticle',
  'publishNewsArticle', 'unpublishNewsArticle', 'setNewsAccessPolicy',
  'createNewsCategory', 'updateNewsCategory', 'deleteNewsCategory',
  'setNewsAclEntry', 'removeNewsAclEntry',
]) assert.match(service, new RegExp(`callNewsFunction\\('${functionName}'`), `Missing News callable: ${functionName}`)

assert.match(app, /path="\/tin-tuc" element={<NewsListPage \/>}/)
assert.match(app, /path="\/tin-tuc\/:articleId" element={<NewsArticlePage \/>}/)
assert.match(app, /path="news" element={<PermissionGate any=/)
assert.match(fs.readFileSync('src/layouts/AdminLayout.jsx', 'utf8'), /PERMISSIONS\.NEWS_CREATE/)
assert.doesNotMatch(service, /actorUid|systemRole|permissions|updateDoc|setDoc|deleteDoc/)
assert.doesNotMatch(management, /actorUid|updateDoc|setDoc|deleteDoc|contentEntitlements|newsGroups\/.*members/)
for (const mode of ['PUBLIC', 'VIP', 'SPECIAL', 'INHERIT']) assert.match(management, new RegExp(`value="${mode}"`))

console.log('News frontend test PASS: callable service, routes, permission guard and no direct News mutation verified.')
