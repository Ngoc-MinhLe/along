# PHASE 10.11F - MEMBERSHIP ADMINISTRATION & READ WORKFLOW REPORT

Date: 2026-09-29

## 1. Scope and result

Phase 10.11F is **COMPLETED locally; not deployed**. The implementation adds
trusted Membership administration/read workflow on the existing RBAC and
Callable architecture. It does not connect Membership to News access.

## 2. Implementation

Added read callables:

- `listMemberships({ limit })`
- `getUserMemberships({ userId, limit })`

Both derive the actor from Firebase Auth, require `membership.read` and the
existing ROOT_ADMIN/SUPER_ADMIN manager boundary, reject unknown payload
fields, and return bounded minimal data. The default limit is 25 and the
maximum is 100; `hasMore` indicates that additional records exist.

The existing callables remain unchanged in purpose:

- `listMembershipTiers({})`
- `createManualMembership({ userId, tierId, startsAt, expiresAt })`
- `revokeMembership({ membershipId })`

The Admin UI now exposes `/admin/memberships` only behind `membership.read`.
It supports dynamic tier selection, manual creation, bounded listing, per-user
history, confirmation before ACTIVE revoke, refresh, loading, empty, error and
success states. All mutations still use Callable Functions; no client direct
write was added.

## 3. Security review

- Actor UID is always taken from `request.auth.uid` through `getTrustedActor`.
- `actorUid`, roles, permissions, claims and tier level are not accepted from
  the frontend as authority.
- USER, EDITOR and ADMIN cannot use the admin read or mutation workflow.
- Target profiles and active tiers remain server-validated by the existing
  create workflow.
- Membership documents retain history; revoke is a status transition only.
- The one ACTIVE membership per user invariant is preserved.
- Tier level is resolved from `membershipTiers/{tierId}` and is not copied into
  canonical membership documents.
- `firestore.rules` was not changed; direct client writes remain denied by the
  current rules.
- News evaluator, entitlement semantics, group membership and payment remain
  out of scope.

## 4. Files changed for Phase 10.11F

Created:

- `functions/src/membership-functions.js` (existing Phase 10.11E file,
  extended with read exports)
- `src/pages/AdminMembershipsPage.jsx`
- `scripts/membership-frontend-test.mjs`
- `docs/PHASE_10_11F_REPORT.md`

Modified for this phase:

- `functions/src/membership-service.js`
- `functions/src/index.js`
- `functions/test/membership.test.js`
- `functions/test/membership-emulator.test.js`
- `src/services/membership.js`
- `src/App.jsx`
- `src/layouts/AdminLayout.jsx`
- `src/pages/AdminPage.jsx`
- `src/styles/admin.css`
- `firestore.indexes.json`
- `package.json`

Existing Phase 10.11E and architecture-document changes were preserved and
are still uncommitted in the working tree.

## 5. Test results

| Test | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS |
| `npm run test:functions:membership:emulator` | PASS |
| `npm run test:functions:emulator` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:policy-conformance` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-membership` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:system-role-tool` | PASS |
| `npm run test:rules` | PASS - 84 assertions |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Rules/emulator tests used a temporary Firebase CLI home and the installed JDK
21 because the default Firebase CLI config has the known EPERM issue. No
system configuration was changed.

## 6. Production safety

- Production data changed: **NO**.
- Firebase Functions deployed: **NO**.
- Firestore Rules changed/deployed: **NO**.
- Frontend deployed: **NO**.
- Commit: **NO**.
- Push: **NO**.

The new `memberships` composite index is local source configuration only; it
has not been deployed.

## 7. Known limitations and next checkpoint

- No production deployment or smoke test has been performed.
- No pagination cursor is implemented; reads are bounded and report
  `hasMore`.
- Membership is not yet connected to the News VIP evaluator.
- SPECIAL entitlement, group membership and payment workflows remain later
  phases.

Next checkpoint: an explicitly approved Membership production readiness and
deployment review.
