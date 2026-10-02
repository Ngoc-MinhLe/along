# PHASE 10.25 REPORT

## Root cause

Category search had two paths. The Category Tree uses the bounded server-side `listNewsCategoryTree` callable, while the News selectors use the bounded server-side `listNewsCategories` callable. The backend source already normalizes category search with Unicode NFD accent removal, lowercase matching, trimming, and bounded reads. The reusable frontend selector's local branch only used `toLowerCase()`, so it was not Vietnamese-diacritic-insensitive. Its default server-search helper text was also stored as mojibake in the source.

Production deployment state for `listNewsCategories` could not be re-read in this phase because Firebase CLI access is blocked by the local `firebase-tools.json` EPERM error. No production conclusion was inferred from that failed inspection. The source/contract review indicates that the next deployment review must verify that production `listNewsCategories` contains the current server-side normalization before any deployment is considered.

## Search behavior

- Added `normalizeSearchText()` for local selector matching: NFD accent removal, Vietnamese-aware lowercase, whitespace collapse, and trim.
- `SearchableSelect` now uses the normalizer for its local option list.
- Async category selectors continue to call `listNewsCategories` on the server; no unbounded client-side category scan was introduced.
- Category Tree continues to use `listNewsCategoryTree` and preserves matched-category parent context through the existing backend path.
- Parent selection remains bounded by the existing tree data and continues to exclude the current category and its descendants.

## UTF-8 issue

The default `SearchableSelect` server-search helper text contained mojibake. It now displays:

`Nhập từ khóa để tìm kiếm trên server.`

Original category names remain unchanged for display; normalization is used only for matching.

## Files changed

- `src/utils/searchText.js` — shared frontend search normalization helper.
- `src/components/SearchableSelect.jsx` — normalized local matching and corrected helper text.
- `functions/test/news-selector.test.js` — category search and Category Tree regression cases.
- `scripts/resource-selector-test.mjs` — normalization, selector, tree-context, and parent-filter assertions.

No Firebase Functions source, Firestore Rules, RBAC, authorization, Membership, ACL, or production data was changed.

## Tests

PASS:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:functions:emulator`
- `npm run test:functions:news:emulator`
- `npm run test:functions:membership:emulator`
- `npm run test:functions:system-role:emulator`
- `npm run test:functions:authorization-rebuild:emulator`
- `npm run test:authorization`
- `npm run test:rbac`
- `npm run test:policy-conformance`
- `npm run test:frontend-rbac`
- `npm run test:frontend-membership`
- `npm run test:frontend-news`
- `npm run test:resource-selectors`
- `npm run test:admin-scalability`
- `npm run test:system-role-tool`
- `npm run test:rules` using the existing local Firestore emulator cache and JDK 21 process configuration.
- `npm run build`
- `git diff --check`

The Rules test passed 84 assertions. The build completed with the existing bundle-size warning only.

## Regression Phase 10.20–10.24

The reviewed changes preserve user search, Membership/Tier selectors, News selectors, Category Tree behavior, arbitrary-depth parent relationships, and the Category mutation contract. No Category data migration or direct Firestore write was added.

## Production impact

- Production data changed: NO.
- Firebase deployment: NO.
- Vercel deployment: NO.
- Firestore Rules deployment: NO.
- Commit/push: NO.
- Production browser verification: NOT PERFORMED in this local phase.

## Deployment required

No deployment was performed. Before production verification, separately confirm the deployed version of `listNewsCategories`; if it does not contain the already-correct source normalization, the narrowly scoped next deployment would be that callable only. `listNewsCategoryTree` is not changed by this phase.
