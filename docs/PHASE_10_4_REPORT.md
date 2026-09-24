# Phase 10.4 — Admin Resource Selection UX

## Status

**COMPLETED locally / checkpoint before deployment.** No Firebase, Vercel or production-data operation was performed. No commit or push was performed.

## Scope and audit result

The existing admin and News screens were audited for technical identifiers. User selection already used the existing trusted user list/search flow. Custom Role assignment already used a role list and did not expose a raw Role ID field. News management had raw inputs for article ID, category ID, resource ID and principal ID; these were replaced with selectors backed by trusted read callables.

The existing News backend supports article/category resources and USER/GROUP ACL principals. No new group-membership, VIP-entitlement or subscription model was introduced. Unsupported principal/resource models were not faked in the UI.

## Implementation

### Trusted backend reads

Added bounded selector reads in `functions/src/news-service.js` and exports in `functions/src/news-functions.js` / `functions/src/index.js`:

- `listNewsManagement`
- `getNewsManagementArticle`
- `listNewsCategories`
- `listNewsUsers`
- `listNewsGroups`

These use the existing trusted actor/auth path and existing RBAC permissions. Payloads do not accept `actorUid`, roles, permissions, effective permissions or delegation scope. Results are minimal selector metadata; article content is returned only by the explicit management-article read used for editing.

### Frontend selectors

- Added `src/components/SearchableSelect.jsx`, a dependency-free searchable selector.
- Added selector service wrappers in `src/services/news.js`.
- Updated `NewsManagementPage.jsx` to select articles, categories, users and groups instead of manually entering technical IDs.
- Updated `NewsListPage.jsx` to select an active category instead of typing a category ID.
- Added selector styling in `src/styles/admin.css`.
- Existing mutation calls remain Callable Functions; no News direct Firestore write was added.

### Tests and documentation

- Added `functions/test/news-selector.test.js`.
- Added `scripts/resource-selector-test.mjs` and the `test:resource-selectors` script.
- Extended the News frontend source checks.
- Updated `docs/PROJECT_STATUS.md` and `docs/NEXT_PHASE_ROADMAP.md`.

## Security review

- Actor identity continues to come from Firebase Auth on the backend.
- Existing RBAC/permission checks are reused; no second authorization or materialization engine was created.
- Client-supplied actor/role/permission authority is not accepted by selector APIs.
- Existing Callable mutations remain the only News mutation path.
- Technical IDs remain authoritative in Callable payloads, but are selected from server-returned records.
- Firestore Rules were not changed.
- Module 1, RBAC, authorization materialization and production data were not changed.

## Known limitations

- Selector APIs are intentionally bounded to the first 50 matching/ordered records. Cursor pagination and debounced server-side search are not yet implemented.
- The current Admin Users user/role list behavior remains the existing implementation; this phase did not redesign its backend pagination.
- Browser E2E/manual browser verification was not run in this phase.
- VIP entitlement, group membership management and subscription workflows remain future work.

## Validation

All requested checks passed:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:functions:news:emulator`
- `npm run test:functions:emulator`
- `npm run test:policy-conformance`
- `npm run test:permission-explanation`
- `npm run test:rbac`
- `npm run test:authorization`
- `npm run test:frontend-rbac`
- `npm run test:frontend-news`
- `npm run test:resource-selectors`
- `npm run test:system-role-tool`
- `npm run test:rules` — 81 assertions PASS
- `npm run build`
- `git diff --check`

The production build retains the existing Vite bundle-size warning; it is not a build failure.

## Production and Git checkpoint

- Firebase Functions: not deployed by this phase.
- Firestore Rules/indexes: not deployed or changed by this phase.
- Vercel: not deployed by this phase.
- Production data: unchanged.
- Git: no commit and no push.
- Next proposed phase: **Phase 10.5 — Audit & Security Event Foundation**.
