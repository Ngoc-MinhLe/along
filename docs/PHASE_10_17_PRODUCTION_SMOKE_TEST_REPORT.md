# PHASE 10.17 — Production Smoke Test & Admin Search UX Verification

Date: 2026-10-02

## A. Executive result

**PASS WITH LIMITATIONS — READY FOR FINAL AUDIT**

The repository-side audit confirms bounded, server-side selector queries and the expected RBAC/callable boundaries. Production browser verification could not be completed because this environment has no browser automation/session connector and cannot reach the production host. No source code, production data, Rules, indexes, or deployments were changed.

## B. Browser availability

- Browser automation: **NOT AVAILABLE**.
- Authenticated ROOT_ADMIN production session: **NOT AVAILABLE**.
- Production HTTP route probe: **NOT AVAILABLE**; requests to `https://lichvannien-phi.vercel.app` failed with “Unable to connect to the remote server” from this environment.
- Therefore the following were not claimed as observed: visual layout, console/network output, keyboard interaction in a live browser, authenticated selector responses, and production response sizes.

## C. Selector matrix

| Area | Selector | Search | Bounded | Pagination/Cursor | Result |
|---|---|---|---|---|---|
| Membership | User | Server-side `displayName` prefix or `email` prefix | Yes, `pageSize` capped; UI requests 20 | Backend cursor supported | PASS by source/test |
| Membership | Tier | Server-side name prefix or exact numeric level | Yes, limit capped; UI requests 20 | Backend cursor supported | PASS by source/test |
| News | Article | Server-side title prefix, then safe title/slug filtering | Yes, limit 20 | Cursor supported by `listNewsManagement` | PASS by source/test |
| News | Category | Server-side name prefix, then safe name/description filtering | Yes, limit 20 | Cursor supported | PASS by source/test |
| News | User | Server-side display name/email prefix | Yes, limit 20 | Cursor supported | PASS by source/test |
| News | Group | Server-side name prefix | Yes, limit 20 | Cursor supported | PASS by source/test |
| News ACL | User | Reuses server-side News user selector | Yes, limit 20 | Cursor contract available | PASS by source/test |
| News ACL | Group | Reuses server-side News group selector | Yes, limit 20 | Cursor contract available | PASS by source/test |
| Custom Role | User/Role | User list and Custom Role name prefix queries | Yes, page size capped | Cursor supported | PASS by source/test |

Implementation evidence:

- `src/components/AsyncSearchSelect.jsx`: 300 ms debounce, minimum query length, loading/error/empty states, clear action, keyboard navigation and unique ARIA result IDs.
- `src/components/SearchableSelect.jsx`: delegates to the async selector when `loadOptions` is supplied; local filtering remains only for already bounded option arrays.
- `functions/src/user-service.js`: bounded `limit(pageSize + 1)` with cursor support.
- `functions/src/custom-role-service.js`: bounded Custom Role query with name prefix and cursor support.
- `functions/src/membership-service.js`: bounded tier query with name prefix/exact level and cursor support.
- `functions/src/news-service.js`: bounded article/category/user/group queries with cursor support.
- `scripts/admin-scalability-test.mjs`: verifies bounded queries, cursor pagination and async selector usage.

Search contract classification: **prefix/range search**, not full-text search. The backend uses `startAt(query)`/`endAt(query + `\\uf8ff`)` on an indexed field, with limited lower-case post-filtering. It is not a token search engine and was not changed in this phase. True case-insensitive search for every legacy record is not proven without normalized search fields/backfill.

Known non-blocking limitation: the Calendar import selector remains a bounded legacy/native selector over a page rather than an async searchable selector. `src/services/calendarImports.js` still limits the read; it does not fetch the full collection.

## D. Production findings

| Finding | Classification | Evidence |
|---|---|---|
| Production data mutation during this phase | PASS | No authenticated production call, Admin SDK write, or mutation command was run. |
| Firebase/Vercel/Rules/index deployment | PASS | No deployment command was run. |
| Selector source contracts | PASS | Backend and frontend source inspection plus scalability/frontend tests. |
| Live authenticated production selectors | NOT AVAILABLE | No browser automation/session and production host unreachable from this environment. |
| Large production dataset behavior | NOT PROVEN | No 10,000-record production fixture was created or required. |
| Existing bundle-size warning | WARNING | `npm run build` reports a minified JS chunk above 500 kB; unrelated to selector correctness and not changed here. |

No blocker was found in the repository implementation for Phase 10.16 selector behavior. The live production checks remain a manual verification item.

## E. Console/network findings

- Application console errors: **NOT AVAILABLE**; no browser DevTools connector is available.
- Selector request payload/response size: **NOT AVAILABLE** for the same reason.
- Firestore/Functions production errors: **NOT AVAILABLE**; no production callable was invoked.
- `onboarding.js` or external-extension errors: **UNRELATED/UNCONFIRMED**; no browser evidence was available and no repository source establishes it as an application dependency.

## F. Regression results

| Check | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS |
| `npm run test:functions:membership:emulator` | PASS in Phase 10.16 safe-emulator verification; no source changes since |
| `npm run test:functions:membership-tier:emulator` | PASS in Phase 10.16 safe-emulator verification; no source changes since |
| `npm run test:functions:news:emulator` | PASS in Phase 10.16 safe-emulator verification; no source changes since |
| `npm run test:functions:system-role:emulator` | PASS in Phase 10.16 safe-emulator verification; no source changes since |
| `npm run test:functions:authorization-rebuild:emulator` | PASS in Phase 10.16 safe-emulator verification; no source changes since |
| `npm run test:authorization` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:policy-conformance` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-membership` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:admin-scalability` | PASS |
| `npm run test:rules` | PASS — 84 assertions, executed with temporary Firebase CLI home and local JDK 21 |
| `npm run build` | PASS; existing Vite bundle-size warning |
| `git diff --check` | PASS; only normal LF→CRLF warnings |

The emulator verification used temporary audit project IDs and local emulators. It did not write production data. Firebase CLI authentication/network warnings for those local audit IDs were non-fatal and did not change the test result.

## G. Production safety

- Membership production data changed: **NO**.
- Membership Tier production data changed: **NO**.
- News production data changed: **NO**.
- `userAuthorizations`/RBAC changed: **NO**.
- Firestore Rules changed or deployed: **NO**.
- Firestore indexes deployed: **NO**.
- Firebase deployment: **NO**.
- Vercel deployment: **NO**.
- Commit: **NO**.
- Push: **NO**.

The working tree already contained changes from earlier Phases 10.12–10.16. This phase added only this report and did not reset, discard, stage, commit, or alter those existing changes.

## H. Recommendation

**PASS WITH LIMITATIONS — READY FOR FINAL AUDIT**

Recommended next action is a manual authenticated browser smoke test against the production URL using the existing ROOT_ADMIN session. Verify each selector’s visible search, debounce/loading, empty/error, clear and keyboard behavior, and inspect Network payloads to confirm bounded callable responses. Do not create production test data merely to perform this check.

## Final status

`PHASE 10.17: PASS WITH LIMITATIONS`

`BROWSER: NOT AVAILABLE`

`PRODUCTION DATA CHANGE: NO`

`DEPLOY: NO`

`COMMIT: NO`

`PUSH: NO`
