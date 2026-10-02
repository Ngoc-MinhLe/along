# PHASE 10.26 REPORT

## 1. Audit

Category data already contains `id`, `name`, `slug`, `status`, and `parentId`. Category Tree receives `parentId` through the existing `listNewsCategoryTree` callable and builds the hierarchy in `NewsManagementPage`.

The category selectors used `SearchableSelect`/`AsyncSearchSelect`, but displayed only the category name and status. The existing Category Tree context was therefore not reused by the selectors.

No backend or Firestore change was required. The management page merges the bounded Category Tree result with the currently loaded selector options to provide the parent lookup map without additional Firestore queries.

## 2. Implementation

Added `src/utils/categoryTree.js` with pure data helpers:

- `buildCategoryMap`
- `getCategoryPath`
- `buildCategoryBreadcrumb`

The helper supports:

- root categories;
- arbitrary depth;
- missing `parentId` or `parentId: null`;
- missing parents with safe fallback to the known category;
- circular data with a visited-set guard;
- Unicode category names without changing their display text.

`SearchableSelect` and `AsyncSearchSelect` now accept optional `getDescription`. Category selectors use it to display hierarchy context while preserving the existing label, value, selection, and server-search APIs.

## 3. Files changed

- `src/utils/categoryTree.js`
- `src/components/SearchableSelect.jsx`
- `src/components/AsyncSearchSelect.jsx`
- `src/pages/NewsManagementPage.jsx`
- `src/pages/NewsListPage.jsx`
- `src/styles/admin.css`
- `scripts/resource-selector-test.mjs`
- `docs/PHASE_10_26_REPORT.md`

The working tree also retains the pre-existing Phase 10.25 files and reports. No Phase 10.25 change was reset, reverted, or discarded.

## 4. UI behavior

For a root category:

```text
TEST
Chuyên mục gốc · Đang hoạt động
```

For a child category:

```text
Test 2
TEST › Test 2
Đang hoạt động
```

For deeper trees, the helper builds the complete known path, for example:

```text
Huyền không › Cơ bản › Nhà ở
```

Applied to:

- management category filter;
- create-article category selector;
- edit-article category selector;
- ACL category resource selector;
- category edit/delete selector;
- public News category selector.

The Category Tree indentation, expand/collapse, parent selection, descendant exclusion, search behavior, and callable contracts remain unchanged.

## 5. Tests

PASS:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:functions:news:emulator`
- `npm run test:frontend-news`
- `npm run test:resource-selectors`
- `npm run test:admin-scalability`
- `npm run test:authorization`
- `npm run test:rbac`
- `npm run test:policy-conformance`
- `npm run test:frontend-rbac`
- `npm run test:frontend-membership`
- `npm run test:system-role-tool`
- `npm run test:rules` — 84 assertions, run with JDK 21 and temporary Firebase CLI configuration
- `npm run build`
- `git diff --check`

The build retains the existing bundle-size warning only.

The helper regression coverage includes root, child, three levels, missing parent, circular data, undefined/null `parentId`, missing category, empty path, and Vietnamese Unicode names.

## 6. Production safety

- Production data: **NO CHANGE**
- Firebase deploy: **NO**
- Vercel deploy: **NO**
- Firestore Rules changed: **NO**
- RBAC changed: **NO**
- Authorization changed: **NO**
- Membership/ACL backend changed: **NO**
- Commit: **NO**
- Push: **NO**

## 7. Regression Phase 10.20–10.25

Preserved: YES.

- Unicode search normalization remains in use.
- Bounded server-side category search remains unchanged.
- Category Tree and `parentId` semantics remain unchanged.
- No direct Firestore mutation was added.
- Existing callable and Firestore Rules architecture remains unchanged.

## 8. Known limitations

Breadcrumbs are built from the category records already available to the page. On the management page, the existing bounded Category Tree result supplies the hierarchy context for users allowed to manage categories. If a selector is used with only a partial server result and its ancestors are not present in the available records, the helper safely shows the known category name rather than issuing N+1 reads or scanning production data. No backend contract or production migration was introduced to solve that edge case.

## 9. Git

- HEAD: `9b19f655fdab7d417e63d30f21fe00f519c2fee7`
- Commit: **NO**
- Push: **NO**
- Working tree: Phase 10.25 changes plus the Phase 10.26 files listed above
- `git diff --check`: PASS; only normal LF/CRLF conversion warnings were reported
