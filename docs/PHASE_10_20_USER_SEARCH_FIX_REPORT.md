# PHASE 10.20 — GLOBAL ASYNC USER SEARCH FIX REPORT

Date: 2026-10-02

## 1. Root cause

The shared `listUsers` callable previously chose one field (`displayName` for a
query without `@`) and used a Firestore prefix range. Firestore string ranges
are case-sensitive. Production legacy profiles do not consistently contain a
normalized search field, so the query `long` did not match the stored
`displayName` `Long Vũ`, while the lowercase production record `minh le ngoc`
matched `minh`.

This was not an `AsyncSearchSelect` debounce, payload, permission, or frontend
state defect. The membership page already sent the user query through the
bounded `listUsers` callable.

## 2. Read-only production evidence

Read-only inspection confirmed:

- A production user is stored as `displayName: "Long Vũ"` without normalized
  name/email fields; `long` returned no match while `Long` returned the user.
- A separate record stored with lowercase `displayName: "minh le ngoc"`
  matched `minh`.
- A title-case `Minh Lê Ngọc` record matched `Minh`, while `MINH` did not
  match the lowercase record.
- Existing user documents contain the legacy `displayName`/`email` fields and
  do not require a production backfill for this fix.

No production document was written, updated, deleted, or backfilled.

## 3. Fix

### Backend

`functions/src/user-service.js` now:

- normalizes query text to Unicode NFC without stripping Vietnamese accents;
- searches a bounded set of original, lowercase, uppercase, and capitalized
  variants;
- searches both `displayName` and `email` for general queries, and email for
  email-shaped queries;
- executes bounded Firestore prefix streams, preserving existing status,
  system-role, and custom-role filters;
- merges and deduplicates results server-side by user ID;
- returns only the existing safe user projection;
- uses a versioned multi-stream cursor for search pagination;
- keeps each internal stream bounded to at most 50 documents and never scans
  the complete `users` collection.

The empty-query path keeps the existing single ordered page contract. Existing
Firestore composite indexes for `displayName`/`email` and the current filters
remain sufficient; no index or Rules change was made.

### Regression coverage

`functions/test/user-selector.test.js` now covers:

- `long`, `Long`, and `LONG` matching a legacy `Long Vũ` record;
- `minh`, `Minh`, and `MINH` matching legacy case variants;
- email-prefix search;
- bounded internal limits and no unbounded collection read;
- versioned cursor generation/validation;
- existing permission, payload allowlist, projection, and forged-actor tests.

## 4. Security and compatibility review

- Actor and `users.read` authorization remain server-side and unchanged.
- The client still sends only the search/list payload and cannot provide an
  actor, role, permission, or authorization document.
- No direct Firestore write was introduced.
- Existing bounded pagination and filters remain in the callable boundary.
- Firestore Rules, RBAC policy, permission catalog, News, Membership, and
  authorization materialization were not changed.
- No normalized fields are written automatically; legacy data is handled at
  read time only.

## 5. Known limitations

- Search remains prefix search. Accent folding/diacritic removal was not added,
  so a query without the stored accent is not treated as a different search
  contract.
- The compatibility strategy covers the common original/lower/upper/title
  case forms without introducing a full-text search service. Arbitrary mixed
  casing beyond those forms is not a promise of this phase.
- The multi-stream compatibility path performs a bounded fan-out (maximum
  eight streams); this is deliberately bounded but more expensive than a
  single normalized-field query. A future normalized-field migration or search
  index can reduce that cost without changing the callable security boundary.
- Browser-level production E2E was not run in this phase. Verification is
  based on source inspection, read-only production evidence, unit tests, local
  emulator tests, Rules tests, and build validation.

## 6. Test results

PASS:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:functions:user:emulator`
- `npm run test:functions:emulator`
- `npm run test:functions:membership:emulator`
- `npm run test:functions:membership-tier:emulator`
- `npm run test:functions:news:emulator`
- `npm run test:functions:system-role:emulator`
- `npm run test:functions:authorization-rebuild:emulator`
- `npm run test:authorization`
- `npm run test:rbac`
- `npm run test:policy-conformance`
- `npm run test:frontend-rbac`
- `npm run test:frontend-membership`
- `npm run test:frontend-news`
- `npm run test:system-role-tool`
- `npm run test:admin-scalability`
- `npm run test:rules` — 84 assertions
- `npm run build`
- `git diff --check`

The build retained the existing Vite warning about the main JavaScript chunk
being larger than 500 kB; this is unrelated to Phase 10.20.

## 7. Scope and safety

- Code change: YES — shared user search service and regression test only.
- Firestore Rules change: NO.
- Production data change: NO.
- Firebase/Vercel deployment: NO.
- Commit/push: NO.

## 8. Final status

`PHASE 10.20: PASS WITH LIMITATIONS`

The reported `long`/`Long Vũ` failure is fixed without a production backfill
or collection scan. The remaining limitations are documented contract choices,
not authorization or data-integrity blockers.
