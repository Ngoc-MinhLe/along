# PHASE 10.14 — PRODUCTION READINESS REVIEW FOR PHASE 10.12/10.13

Date: 2026-10-02

## 1. Executive conclusion

**PHASE 10.14 STATUS: READY FOR DEPLOYMENT**

The Phase 10.12 scalability implementation and Phase 10.13 selector audit are
locally validated. No deployment, production read, production write, Rules
change, commit, or push was performed by this review.

The deployment checkpoint must still be executed separately. The current
working tree contains the uncommitted Phase 10.12 implementation and related
reports; it is not production code until the approved Git/Vercel workflow is
completed.

## 2. Repository and Git state

- Branch: `main`
- HEAD: `46669482101f17463d94415f51b3697e3543c8cc`
- HEAD message: `feat: finalize membership tier and news access`
- Working tree: modified/untracked files are present.
- No files were staged, committed, reset, reverted, or discarded.
- No `.env`, private key, Firebase credential, token, or generated build output
  is present in the reported working-tree set.

### Change classification

The current diff is consistent with the Phase 10.12 implementation plus its
documentation and Phase 10.13 audit report:

- Backend/query configuration: `functions/src/user-service.js`,
  `functions/src/user-functions.js`, `functions/src/custom-role-service.js`,
  `functions/src/custom-role-functions.js`, `functions/src/membership-service.js`,
  `functions/src/news-service.js`, `functions/src/index.js`,
  `firestore.indexes.json`, and `functions/package.json`.
- Frontend/services: `src/components/AsyncSearchSelect.jsx`,
  `src/components/CursorPagination.jsx`, the Admin Users, Memberships,
  Membership Tiers, Roles, News Management and Calendar pages, the related
  services, and `src/styles/admin.css`.
- Tests/scripts/configuration: selector/scalability tests and the corresponding
  npm scripts.
- Documentation: `docs/PHASE_10_12_ADMIN_SCALABILITY_AUDIT.md`,
  `docs/PHASE_10_12_IMPLEMENTATION_REPORT.md`,
  `docs/PHASE_10_13_ADMIN_SELECTOR_AUDIT.md`, plus existing status/roadmap
  edits already present in the working tree.

No unrelated source change was identified during this review. `firestore.rules`
has no diff.

## 3. Frontend scalability review

The reviewed high-risk Admin paths now use bounded server-side reads:

| Area | Current path | Result |
|---|---|---|
| Users | `listUsersPage` → `listUsers`, filters, opaque cursor | PASS |
| Membership user/history selection | `AsyncSearchSelect` → bounded `listUsers` | PASS |
| Membership list/history | bounded `listMemberships` / `getUserMemberships` + cursor | PASS |
| Membership tiers | bounded `listMembershipTiers` + cursor | PASS |
| Custom Roles | `listCustomRolesPage` + cursor | PASS |
| News management | server title/status/category query + cursor | PASS |
| News ACL USER/GROUP | debounced `AsyncSearchSelect` callables | PASS |
| Calendar import history | bounded cursor pagination | PASS |

No audited Admin path loads an entire Users, Memberships, Custom Roles or News
collection into the browser. No direct client write to News, Membership,
`userAuthorizations`, role assignment, or RBAC documents was introduced.

Known bounded-selector limitations remain:

- News ARTICLE resource selectors search only the current management page.
- Category, tier, and the Admin Users Custom Role filter use explicit bounded
  lists (50/25/50 respectively).
- Browser E2E was not available in this environment.

These are documented follow-ups, not an authorization bypass or an unbounded
read. Existing Calendar import writes remain a Module 1 workflow and were not
expanded by this phase.

## 4. Backend functions requiring deployment

The following nine callable Functions changed or gained the read contract
required by Phase 10.12 and are the only Functions in this review's deployment
scope:

| Function | Source | Frontend caller | Server-side boundary | Query/index dependency |
|---|---|---|---|---|
| `listCustomRoles` | `custom-role-service.js`, `custom-role-functions.js` | Admin Roles, Users role filter | `roles.read` | roles status/order and filter indexes |
| `listUsers` | `user-service.js`, `user-functions.js` | Admin Users, Memberships | `users.read` | users status/role/custom-role/search indexes |
| `listMembershipTiers` | `membership-service.js`, existing membership export | Membership pages | membership read/manager policy | `membershipTiers.level + __name__` |
| `listMemberships` | `membership-service.js` | Admin Memberships | `membership.read` | status/tier/createdAt combinations |
| `getUserMemberships` | `membership-service.js` | Admin Membership history | `membership.read` | user/status/tier + createdAt combinations |
| `listNewsManagement` | `news-service.js` | Admin News | existing News management permissions | News status/category/title/updatedAt combinations |
| `listNewsCategories` | `news-service.js` | Public and Admin News | public active read; disabled list requires News management permission | category active/name and query indexes |
| `listNewsUsers` | `news-service.js` | News ACL USER picker | `news.update` | active/search indexes |
| `listNewsGroups` | `news-service.js` | News ACL GROUP picker | `news.update` | active/name/search indexes |

The exports were checked in `functions/src/index.js`. No mutation contract,
permission catalog, authorization materialization, Membership schema, News
evaluator, or Firestore Rules change is part of this deployment scope.

### Exact no-deploy command for the Functions checkpoint

This command was **not run** in Phase 10.14:

```bash
firebase deploy --only functions:listCustomRoles,functions:listUsers,functions:listMembershipTiers,functions:listMemberships,functions:getUserMemberships,functions:listNewsManagement,functions:listNewsCategories,functions:listNewsUsers,functions:listNewsGroups --project along-6e1ce
```

## 5. Firestore index review

`firestore.indexes.json` currently contains **36** composite index entries.
The baseline at HEAD contains **3** entries. Comparison by exact index
definition reports **34 additions and 1 removed baseline entry**, resulting in
36 current entries. The current collection-group distribution is:

| Collection group | Current indexes |
|---|---:|
| `membershipTiers` | 1 |
| `memberships` | 8 |
| `newsArticles` | 10 |
| `newsCategories` | 2 |
| `newsGroups` | 1 |
| `roles` | 2 |
| `users` | 12 |
| **Total** | **36** |

The added definitions support the new bounded filters, ordering, cursor
pagination and prefix-query shapes. The index file is source configuration
only at this checkpoint; indexes were not deployed.

### Exact no-deploy command for the index checkpoint

```bash
firebase deploy --only firestore:indexes --project along-6e1ce
```

It should be executed before relying on the new production query shapes. It is
not a Rules deployment.

## 6. Security and architecture review

PASS findings:

- Authorization remains server-side through the existing trusted actor and
  permission helpers.
- Client payloads do not supply actor authority, role, permission,
  authorization, or Membership level for authorization decisions.
- New list callables validate filters, page sizes, and opaque cursors at the
  backend boundary.
- Returned user/role/news selector data is bounded and excludes tokens,
  credentials, claims and full authorization documents.
- Existing Callable-only mutation paths remain intact.
- No second RBAC, effective-permission, Membership or News authorization
  engine was introduced.
- `firestore.rules` is unchanged and was not deployed.
- ROOT/SUPER boundaries, custom-role policy, `userAuthorizations`, News ACL,
  access policy, and Membership canonical schema remain unchanged.

## 7. Dependency and rollout graph

```text
firestore.indexes.json
        ↓
affected bounded read callables
        ↓
Git commit/push
        ↓
Git-connected Vercel frontend deployment
```

Recommended controlled order after approval:

1. Deploy the current Firestore indexes.
2. Deploy the nine affected Functions.
3. Commit/push the reviewed frontend and documentation through the normal Git
   workflow so Vercel can build the matching frontend.
4. Perform read-only/browser smoke checks for Users, Memberships, Roles, News
   selectors and Calendar import history.

Do not release the frontend ahead of the backend/index configuration.

## 8. Rollback and production safety

- Functions rollback: redeploy the previously approved Function source/version
  for only the affected callable(s), after preserving the current source and
  deployment metadata.
- Frontend rollback: revert the Git-connected deployment to the previous known
  good commit through the repository/Vercel workflow.
- Index rollback: remove only unused index definitions in a separately reviewed
  index change; do not alter Rules as a rollback shortcut.
- No migration or backfill is required for Phase 10.12/10.13.
- No production tier, membership, user, role, authorization, News or audit
  data should be created or changed for deployment verification.

## 9. Validation results

| Command | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS |
| `npm run test:functions:emulator` | PASS |
| `npm run test:functions:membership:emulator` | PASS |
| `npm run test:functions:membership-tier:emulator` | PASS |
| `npm run test:functions:news:emulator` | PASS |
| `npm run test:functions:system-role:emulator` | PASS |
| `npm run test:functions:authorization-rebuild:emulator` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:policy-conformance` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-membership` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:scalability` | NOT AVAILABLE — no such npm script |
| `npm run test:admin-scalability` | PASS — repository's equivalent script |
| `npm run test:rules` | PASS — 84 assertions, isolated temporary CLI home with available JDK 21 |
| `npm run build` | PASS — Vite emits an existing >500 kB bundle warning |
| `git diff --check` | PASS |

The emulator commands used local projects and local emulators. Firebase CLI
printed expected environment warnings about network metadata, ADC/non-emulated
services and emulator shutdown sockets; no production mutation was performed.

## 10. Production readiness decision

**READY FOR DEPLOYMENT**

Approved deployment scope for a later, separately authorized step:

- Firebase Functions: the nine callables listed in Section 4.
- Firestore indexes: current `firestore.indexes.json` (36 entries).
- Firestore Rules: **NO DEPLOY**.
- Hosting/Vercel CLI: **NO DEPLOY**.
- Frontend: release only through the existing Git-connected Vercel workflow
  after commit/push approval.
- Production data migration: **NONE**.

Current phase result:

```text
PRODUCTION READINESS: READY FOR DEPLOYMENT
SOURCE CODE CHANGED BY THIS REVIEW: NO
PRODUCTION DATA CHANGED: NO
FIREBASE DEPLOY: NO
VERCEL DEPLOY: NO
COMMIT: NO
PUSH: NO
```
