# Phase 10.22 — Membership Tier selector 400: root cause and fix

Date: 2026-10-02. Project: `along-6e1ce`.

## Forensic evidence

The selector path is `AdminMembershipsPage.searchTiers` →
`src/services/membership.js:listMembershipTiers` → Firebase `httpsCallable`
→ `membership-functions.js` → `invokeMembershipRead` → trusted actor →
`membership-service.js:listMembershipTiers` → payload validation → Firestore.

The search payload reconstructed from the actual client implementation is:

```json
{ "includeInactive": false, "limit": 20, "query": "vip" }
```

Endpoint:
`https://us-central1-along-6e1ce.cloudfunctions.net/listMembershipTiers`.
No production browser session/HAR was available; this is a source trace, not
a claim of capturing the user's browser request.

Production metadata was read using the existing Firebase CLI login. The
deployed source ZIP was downloaded read-only by its exact generation and
`src/membership-service.js` inspected, not inferred from local code:

| Before deployment | Value |
|---|---|
| State | ACTIVE |
| Region/runtime | us-central1 / nodejs22 / Gen 2 |
| Revision | `listmembershiptiers-00004-neq` |
| Firebase source hash | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| Updated at | `2026-10-01T18:48:18.161956565Z` |
| Source generation | `1790880484049584` |

The **deployed** `normalizeTierListPayload` allows only
`['includeInactive', 'limit', 'cursor']`. Its shared `assertAllowedKeys`
throws `Unsupported request field: query.`. Its list implementation only
orders by level/document ID. Local Phase 10.16 source already accepts `query`.
Phase 10.15's deployment hash matches the deployed hash; Phase 10.21 deployed
only `listUsers`. This proves frontend/backend deployment contract drift,
not CORS, authentication failure, or a misnamed callable.

## Why typing VIP displayed Free

Before the fix, `loadData()` set `form.tierId` to the first tier returned by
`listMembershipTiers()` whenever no tier was selected. That read is ordered by
level, explaining selection of the lowest-level Free tier reported by the user.
`AsyncSearchSelect` keeps its text query separate from selected value; typing
`vip` did not change the selected ID. The rejected search therefore left the
Free selection and its summary intact. This was **not** the backend mapping
VIP to Free. Old result options could also survive a failed replacement search.

The page's search callback is memoized and the component debounces for 300 ms;
there is no explicit retry loop. Repeated searches can each produce a 400.
The exact cadence of the user's repeated requests was not captured in a browser.

## Scoped fix

- Remove automatic first-tier selection. An explicit result selection is required.
- Resolve the summary only for the currently selected ID.
- Opt in the assignment Tier selector to clear the previous selection when
  typing another query; other selector workflows retain their selection behavior.
- Clear stale options on query changes; cancel superseded requests; clear
  loading when the query is cleared/disabled; continue showing API errors.
- Keep the existing callable name and `query`/`limit`/`cursor` payload contract.
- Extend tier prefix search to original/lowercase/uppercase/title-case variants
  using a single Firestore OR query, ordered by name/document ID and limited to
  `limit + 1`. Firestore performs union deduplication; one document cursor covers
  all variants. No full-collection fallback, no client collection scan/backfill.
- Preserve numeric level search, no-query listing, active-tier filtering, safe
  projection, trusted actor validation and manager-only inactive-tier reads.

Common case variants are supported, not arbitrary mixed-case permutations,
accent removal, substring/full-text search, or a new normalized-name schema.
Existing bounded-page status filtering can return fewer items than the limit;
the API still exposes `hasMore`/cursor. The combobox does not add a new paging UI.

## Regression results before deployment

| Command | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS (includes tier/unit payload regression) |
| `npm run test:functions:membership:emulator` | PASS |
| `npm run test:functions:membership-tier:emulator` | PASS |
| `npm run test:functions:news:emulator` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:policy-conformance` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-membership` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:admin-scalability` | PASS |
| `npm run test:resource-selectors` | PASS |
| `npm run test:system-role-tool` | PASS |
| `npm run test:rules` | PASS, 84 assertions |
| `npm run build` | PASS, existing >500 kB chunk warning |
| `git diff --check` | PASS |

New emulator assertions cover `vip`, `VIP`, `gold`, `platinum`, numeric search,
equal-name tiers, limit-one cursor traversal without duplicates/omissions,
inactive filtering, guest denial, spoofed payload rejection and manager boundary.
Authenticated active-tier reads retain their existing policy; this is not a
new permission grant. All test mutations ran on emulators only.

Frontend regression executes the actual service serialization and component
handlers using a deterministic hook/timer harness: no default Free, correct
selected ID/details, selection preserved across refresh, replacement-query
clearing, visible error, stale-result exclusion, late-response cancellation,
and opt-in behavior not clearing other selectors. It is **not browser E2E**.
Two traversal defects in the new test harness were corrected before its final
passing run; no application workaround was introduced to make tests pass.

Java 21 was scoped to test processes. Firebase CLI sandbox config access needed
approved escalation. gcloud credentials could not refresh; no credential/account
was changed. The existing Firebase CLI session worked for read-only diagnostics.

## Production read-only query/index check

The same bounded OR/name/document-ID query was executed with existing operator
read credentials through Firestore REST, with limit 21 and metadata-only field
projection. `vip`, `VIP`, `gold`, `platinum` each returned HTTP 200 and one unique
document. This validates the production query/index path without creating data.
It does **not** prove authenticated browser/callable behavior.
No index deployment is required for this single-field range query.

## Deployment scope and checkpoint

All requested local regression checks passed. Deploy only:

```powershell
firebase deploy --only functions:listMembershipTiers --project along-6e1ce
```

Do not deploy Membership/Tier mutations, `listUsers`, News, Rules, indexes,
Hosting or Vercel. Firebase packages the Functions directory, including existing
Phase 10.20 files, but only the explicitly targeted read function is updated;
its runtime read path does not invoke `user-service.js`.

Deployment result: **PASS**. The exact command above completed with one
successful update operation and exit code 0.

| After deployment | Value |
|---|---|
| Function | `listMembershipTiers` |
| State | ACTIVE |
| Region/runtime | us-central1 / nodejs22 / Gen 2 |
| Revision | `listmembershiptiers-00005-qik` |
| Firebase source hash | `0325c9449cd004b2c6505b196f29f7e320056e3b` |
| Updated at | `2026-10-01T22:29:00.089558059Z` |
| Source generation | `1790893689048541` |
| Source file SHA256 | `49214762f018a3de1128b3688b8a3701aedd154c7261f05f0c74be3212b42250` |

The newly deployed ZIP's `src/membership-service.js` SHA256 matches the local
tested file exactly. Before/after inventories contain 40 functions; comparing
metadata with label keys normalized shows only `listMembershipTiers` changed
its deployment hash. No function was added or removed.

Post-deploy endpoint checks (no token):

- OPTIONS: HTTP 204; `Access-Control-Allow-Origin` exactly
  `https://lichvannien-phi.vercel.app`.
- POST with selector payload: HTTP 401, Firebase error `UNAUTHENTICATED`,
  `Authentication is required.`; same production origin header.

No authenticated production callable/browser smoke test was fabricated.
Frontend changes remain local for review/future Git-connected deployment;
do not claim the new no-default-Free UX is already live.

Rollback consideration: the previous revision is recorded above, but restoring
it would reintroduce query rejection. Any rollback requires explicit review;
do not weaken validation or fall back to collection scans.

## Files changed in this phase

- `functions/src/membership-service.js`
- `functions/test/membership-tier.test.js`
- `functions/test/membership-tier-emulator.test.js`
- `src/components/AsyncSearchSelect.jsx`
- `src/pages/AdminMembershipsPage.jsx`
- `scripts/membership-frontend-test.mjs`
- `scripts/membership-selector-regression-test.mjs` (new)
- `docs/PHASE_10_22_TIER_SELECTOR_FIX_REPORT.md` (new)

Pre-existing Phase 10.20/21 changes were preserved, not edited by this phase:
`functions/src/user-service.js`, `functions/test/user-selector.test.js`, and
the three `PHASE_10_20_USER_SEARCH_FIX_REPORT`, `PHASE_10_21_PRE_DEPLOY_REPORT`,
`PHASE_10_21_DEPLOYMENT_REPORT` documents.

## Safety and remaining manual verification

No RBAC/authorization/Rules/schema changes. No production data writes,
Membership creation, Tier creation, News mutation, or production fixtures.
No credential/token was requested from the user or printed. No commit/push.
Git remains intentionally dirty on `main`, HEAD
`7aa590a3e746b7989502b90bab128962ab5e2a4d`.

After backend deploy, use the existing ROOT/SUPER UI to search/select the four
terms and inspect `listMembershipTiers` responses without submitting a membership.
After a separately approved frontend release, verify initially no selected tier,
VIP selection shows VIP, changing the query clears the summary and disables
assignment until a new result is selected. Browser production verification is
NOT AVAILABLE in this environment; do not label the end-to-end UI fixed/verified
until this manual step and frontend deployment are complete.

## Final checkpoint

```text
ROOT CAUSE: CONFIRMED FROM DEPLOYED SOURCE + FRONTEND STATE FLOW
LOCAL FIX / REGRESSION: PASS
BACKEND DEPLOYMENT: PASS (listMembershipTiers only)
AUTHENTICATION BOUNDARY: PASS (401)
PRODUCTION QUERY / INDEX READ CHECK: PASS (HTTP 200 for all four terms)
AUTHENTICATED PRODUCTION BROWSER SMOKE: NOT AVAILABLE / PENDING MANUAL CHECK
FRONTEND UX DEPLOYMENT: PENDING REVIEW AND GIT-CONNECTED RELEASE
PRODUCTION BUSINESS DATA WRITE: NO
RULES / INDEX / HOSTING / VERCEL DEPLOY: NO
COMMIT / PUSH: NO
WORKING TREE: DIRTY INTENTIONALLY, INCLUDING PRESERVED PHASE 10.20/21 CHANGES
```
