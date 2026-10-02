# PHASE 10.25 — FINAL REPORT

## 1. Source audit

The Phase 10.25 changes preserve the existing architecture:

- `listNewsCategories` remains a Firebase callable function (`onCall`).
- Frontend calls it through `httpsCallable`, not direct `fetch`.
- Category search remains bounded and server-side; it does not scan the full collection from the client.
- Search normalization removes Vietnamese diacritics, compares case-insensitively, trims whitespace, and supports substring matching.
- Category Tree, `parentId`, arbitrary depth, parent-context behavior, RBAC, ACL, Membership, and Firestore Rules were preserved.

Files in the Phase 10.25 working tree:

- `src/utils/searchText.js`
- `src/components/SearchableSelect.jsx`
- `functions/test/news-selector.test.js`
- `scripts/resource-selector-test.mjs`
- `docs/PHASE_10_25_REPORT.md`
- `docs/PHASE_10_25_PRODUCTION_DEPLOYMENT_REPORT.md`

## 2. Production root cause and deployment

Before deployment, production metadata showed `listNewsCategories` running the older hash:

`20e3e8bcf23943f7a615241aa4bdb80c761a8770`

The related category functions were already on the current deployment family. Only `listNewsCategories` required deployment.

Exact command executed:

```bash
firebase deploy --only functions:listNewsCategories --project along-6e1ce
```

Deployment result: **PASS**.

Production metadata after deployment:

| Function | State | Region | Runtime | Deployment hash |
|---|---|---|---|---|
| `listNewsCategories` | ACTIVE | `us-central1` | `nodejs22` / Gen 2 | `22e54fc30435cba487a22e0bbba078a615f09004` |

No other Function was deployed by this operation.

## 3. Production read-only verification

The callable endpoint was verified without an ID token and without mutation. Active category reads are intentionally public when `includeDisabled` is false.

Verified results from production `listNewsCategories`:

- `te` → `TEST`, `Test 2`
- `TE` → `TEST`, `Test 2`
- `pho` → `Phong thủy`
- `PHO` → `Phong thủy`
- `huyen` → `Huyền không`
- `HUYỀN` → `Huyền không` when sent as correctly UTF-8/Unicode-escaped JSON

The production CORS preflight returned:

- HTTP `204`
- `Access-Control-Allow-Origin: https://lichvannien-phi.vercel.app`
- method `POST`
- header `content-type`

This confirms the callable endpoint and production origin are compatible. The first direct PowerShell request containing literal Vietnamese characters returned no match because of the shell request encoding; a Unicode-escaped JSON request returned the expected result. This was a diagnostic transport issue, not a backend search failure.

Manual browser verification of `/admin/news` was not performed by the agent. The remaining browser check is to hard-refresh the page and verify the Category Tree and category selectors visually.

## 4. Tests

PASS before deployment:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:frontend-news`
- `npm run test:resource-selectors`
- `npm run test:admin-scalability`
- `npm run test:authorization`
- `npm run test:rbac`
- `npm run test:policy-conformance`
- `npm run test:frontend-rbac`
- `npm run test:frontend-membership`
- `npm run test:system-role-tool`
- `npm run test:rules` (JDK 21/local emulator cache)
- `npm run build`
- `git diff --check`

Additional emulator suites previously passed in this Phase workflow: News, Membership, System Role, Authorization Rebuild, and Functions emulator coverage. The build retains only the existing bundle-size warning.

## 5. Safety and scope

- Firebase Functions deployed: **only `listNewsCategories`**
- Firestore Rules deployed: **NO**
- Firestore indexes deployed: **NO**
- Hosting/Vercel deployed: **NO**
- Production category/news mutation: **NO**
- Membership/RBAC/authorization mutation: **NO**
- Production data changed: **NO**
- Commit: **NO**
- Push: **NO**

Phase 10.20–10.24 behavior was preserved. No source rollback, Rules change, authorization bypass, or new public HTTP API was introduced.

## 6. Git status

- Branch: `main`
- HEAD: `9b19f655fdab7d417e63d30f21fe00f519c2fee7`
- Working tree: contains only the Phase 10.25 source/tests/reports listed above
- `git diff --check`: PASS (only normal LF/CRLF conversion warnings)
- Commit/push: not performed

## 7. Final status

**PHASE 10.25: DEPLOYED / PASS WITH MANUAL BROWSER VERIFICATION PENDING**

The backend deployment and read-only production search checks passed. The only remaining check is a user-side browser refresh of `/admin/news`; no production data creation or mutation is required.
