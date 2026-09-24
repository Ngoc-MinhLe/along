import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  component: await readFile('src/components/SearchableSelect.jsx', 'utf8'),
  management: await readFile('src/pages/NewsManagementPage.jsx', 'utf8'),
  list: await readFile('src/pages/NewsListPage.jsx', 'utf8'),
  newsService: await readFile('src/services/news.js', 'utf8'),
  users: await readFile('src/pages/AdminUsersPage.jsx', 'utf8'),
}

assert.match(files.component, /search|placeholder|onChange/)
for (const selector of ['listNewsManagement', 'getNewsManagementArticle', 'listNewsCategories', 'listNewsUsers', 'listNewsGroups']) {
  assert.match(files.newsService, new RegExp(`callNewsFunction\\('${selector}'`), `Missing selector callable: ${selector}`)
}
assert.match(files.management, /SearchableSelect/)
assert.match(files.list, /SearchableSelect/)
assert.doesNotMatch(files.management, /<input[^>]*(articleId|categoryId|resourceId|principalId)/)
assert.doesNotMatch(files.list, /<input[^>]*categoryId/)
assert.match(files.users, /placeholder=/)
assert.doesNotMatch(files.management, /actorUid|effectivePermissions|delegationScope|updateDoc|setDoc|deleteDoc/)

console.log('Resource selector test PASS: ID fields use selection UX and News mutations remain Callable-only.')
