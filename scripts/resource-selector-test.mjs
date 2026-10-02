import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { includesNormalizedText, normalizeSearchText } from '../src/utils/searchText.js'
import { buildCategoryBreadcrumb, getCategoryPath } from '../src/utils/categoryTree.js'

const files = {
  component: await readFile('src/components/SearchableSelect.jsx', 'utf8'),
  management: await readFile('src/pages/NewsManagementPage.jsx', 'utf8'),
  list: await readFile('src/pages/NewsListPage.jsx', 'utf8'),
  newsService: await readFile('src/services/news.js', 'utf8'),
  users: await readFile('src/pages/AdminUsersPage.jsx', 'utf8'),
}

assert.match(files.component, /search|placeholder|onChange/)
assert.match(files.component, /normalizeSearchText/)
for (const selector of ['listNewsManagement', 'getNewsManagementArticle', 'listNewsCategories', 'listNewsUsers', 'listNewsGroups']) {
  assert.match(files.newsService, new RegExp(`callNewsFunction\\('${selector}'`), `Missing selector callable: ${selector}`)
}
assert.match(files.management, /SearchableSelect/)
assert.match(files.list, /SearchableSelect/)
assert.doesNotMatch(files.management, /<input[^>]*(articleId|categoryId|resourceId|principalId)/)
assert.doesNotMatch(files.list, /<input[^>]*categoryId/)
assert.match(files.users, /placeholder=/)
assert.doesNotMatch(files.management, /actorUid|effectivePermissions|delegationScope|updateDoc|setDoc|deleteDoc/)
assert.match(files.management, /categoryParentOptions/)
assert.match(files.management, /categoryDescendantIds/)
assert.match(files.management, /listNewsCategoryTree\(\{ query: categoryTreeSearch/)
assert.equal(normalizeSearchText('  Huyền   Không  '), 'huyen khong')
assert.equal(normalizeSearchText('PHÒNG THỦY'), 'phong thuy')
assert.equal(normalizeSearchText('TEST'), 'test')
assert.equal(normalizeSearchText(''), '')
assert.equal(includesNormalizedText('Test 2', ' te '), true)
assert.equal(includesNormalizedText('Phong thủy', 'phong thuy'), true)
assert.equal(includesNormalizedText('Huyền không', 'huyen'), true)
assert.equal(includesNormalizedText('TEST', 'xyz'), false)

const categories = [
  { id: 'a', name: 'Huyền không' },
  { id: 'b', name: 'Cơ bản', parentId: 'a' },
  { id: 'c', name: 'Nhà ở', parentId: 'b' },
]
assert.equal(buildCategoryBreadcrumb('a', categories), 'Huyền không')
assert.equal(buildCategoryBreadcrumb('c', categories), 'Huyền không › Cơ bản › Nhà ở')
assert.equal(getCategoryPath('missing', categories).length, 0)
assert.equal(buildCategoryBreadcrumb('orphan', [{ id: 'orphan', name: 'Orphan', parentId: 'missing' }]), 'Orphan')
assert.equal(buildCategoryBreadcrumb('root-undefined', [{ id: 'root-undefined', name: 'Root' }]), 'Root')
assert.equal(buildCategoryBreadcrumb('root-null', [{ id: 'root-null', name: 'Root', parentId: null }]), 'Root')
assert.equal(buildCategoryBreadcrumb('cycle-a', [{ id: 'cycle-a', name: 'A', parentId: 'cycle-b' }, { id: 'cycle-b', name: 'B', parentId: 'cycle-a' }]), 'B › A')
assert.equal(buildCategoryBreadcrumb('child', [{ id: 'child', name: 'Child', parentId: 'parent' }]), 'Child')
assert.equal(buildCategoryBreadcrumb('child', [{ id: 'parent', name: 'Parent' }, { id: 'child', name: 'Child', parentId: 'parent' }]), 'Parent › Child')
assert.match(files.component, /getDescription/)
assert.match(files.management, /categoryBreadcrumb/)
assert.match(files.list, /buildCategoryBreadcrumb/)

console.log('Resource selector test PASS: ID fields use selection UX and News mutations remain Callable-only.')
