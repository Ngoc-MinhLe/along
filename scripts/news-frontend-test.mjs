import fs from 'node:fs'
import assert from 'node:assert/strict'
import { makeSlug } from '../src/utils/slug.js'

const service = fs.readFileSync('src/services/news.js', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const management = fs.readFileSync('src/pages/NewsManagementPage.jsx', 'utf8')

for (const functionName of [
  'listNews', 'getNewsArticle', 'createNewsArticle', 'updateNewsArticle',
  'publishNewsArticle', 'unpublishNewsArticle', 'setNewsAccessPolicy',
  'createNewsCategory', 'updateNewsCategory', 'deleteNewsCategory',
  'setNewsAclEntry', 'removeNewsAclEntry', 'listNewsManagement',
  'getNewsManagementArticle', 'listNewsCategories', 'listNewsUsers', 'listNewsGroups',
]) assert.match(service, new RegExp(`callNewsFunction\\('${functionName}'`), `Missing News callable: ${functionName}`)

assert.match(app, /path="\/tin-tuc" element={<NewsListPage \/>}/)
assert.match(app, /path="\/tin-tuc\/:articleId" element={<NewsArticlePage \/>}/)
assert.match(app, /path="news" element={<PermissionGate any=/)
assert.match(fs.readFileSync('src/layouts/AdminLayout.jsx', 'utf8'), /PERMISSIONS\.NEWS_CREATE/)
assert.doesNotMatch(service, /actorUid|systemRole|permissions|updateDoc|setDoc|deleteDoc/)
assert.doesNotMatch(management, /actorUid|updateDoc|setDoc|deleteDoc|contentEntitlements|newsGroups\/.*members/)
assert.doesNotMatch(management, /<input[^>]*(articleId|categoryId|resourceId|principalId)/)
assert.match(management, /SearchableSelect/)
assert.match(fs.readFileSync('src/pages/NewsListPage.jsx', 'utf8'), /SearchableSelect/)
for (const workflowLabel of ['Lưu nháp', 'Xem trước', 'Đăng bài', 'Danh sách bài viết', 'Lưu thay đổi', 'Hủy', 'Đang chỉnh sửa']) assert.match(management, new RegExp(workflowLabel))
assert.match(management, /draftArticle/)
assert.match(management, /setNewsAccessPolicy/)
assert.match(management, /onClick=\{\(\) => selectArticle\(item\.id\)\}/)
assert.match(management, /getNewsManagementArticle\(articleId\)/)
assert.match(management, /articleId: selected\.articleId \|\| selected\.id \|\| articleId/)
assert.match(management, /if \(!nextArticle\.articleId\) throw/)
assert.match(management, /ref=\{editorRef\}/)
assert.match(management, /editingLoading/)
assert.match(management, /editingError/)
assert.match(management, /friendlyArticleLoadError/)
assert.doesNotMatch(service, /deleteNewsArticle/)
assert.doesNotMatch(management, /Firebase Storage|thumbnailUrl|<input[^>]*ảnh/i)
assert.match(management, /listNewsManagement\(\{ query: articleSearch\.trim\(\), limit: 20 \}\)/)
assert.match(management, /setTimeout\(async \(\) =>/)
assert.doesNotMatch(management, /listNewsManagement\(\{ limit: 50 \}\)/)
for (const mode of ['PUBLIC', 'VIP', 'SPECIAL', 'INHERIT']) assert.match(management, new RegExp(`value="${mode}"`))
assert.equal(makeSlug('Tin tức Hải Phòng'), 'tin-tuc-hai-phong')
assert.equal(makeSlug('Thông báo'), 'thong-bao')
assert.equal(makeSlug('Hoạt động nhà trường'), 'hoat-dong-nha-truong')
assert.match(management, /categorySlugEdited/)
assert.match(service, /if \(typeof slug === 'string' && slug\.trim\(\)\) payload\.slug/)

console.log('News frontend test PASS: callable service, routes, permission guard and no direct News mutation verified.')
