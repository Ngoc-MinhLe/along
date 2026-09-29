# PROJECT STATUS

## Authoritative Current Snapshot - Phase 10.11M ARCHITECTURE RECONCILIATION

- Phase 10.10: **COMPLETED and CLOSED**.
- Phase 10.11B–10.11D: **COMPLETED** as architecture/design checkpoints.
- Phase 10.11E–10.11F: **COMPLETED locally; not deployed**.
- Phase 10.11G: **BLOCKED at the historical review checkpoint** by a
  documentation/implementation schema mismatch.
- Phase 10.11J–10.11K: **LOCAL IMPLEMENTATION PASS; COMMITTED/PUSHED** for
  Membership Tier Administration. This does not mean the Membership Functions
  or frontend are deployed to production.
- Phase 10.11M: **COMPLETED — DOCUMENTATION-ONLY RECONCILIATION**.
- Canonical tier documents are stored at `membershipTiers/{tierId}` with
  `tierId` equal to the document ID, `name`, positive integer `level`,
  lower-case `status` (`active` or `inactive`), description and audit metadata.
  A stored `active` boolean and `sortOrder` are not part of the canonical
  schema; read responses may derive `active` from `status`.
- Canonical membership documents remain at `memberships/{membershipId}` and
  store `tierId` only; level is resolved from the tier document.
- Dynamic tier levels remain separate from System Roles, Custom Roles and
  `userAuthorizations`. News evaluator, `contentEntitlements`, Rules and RBAC
  hierarchy remain unchanged.
- Source implementation already matches this canonical contract. Phase 10.11M
  updated documentation only; no deployment or production data change occurred.
- Current phase: **Phase 10.11M — COMPLETED; checkpoint after documentation
  reconciliation**.
- Next checkpoint: rerun the Phase 10.11L deployment-readiness review against
  the reconciled contract. Deployment is not approved by this documentation
  update.

## Historical snapshot - Phase 10.11G MEMBERSHIP PRODUCTION READINESS

- Phase 10.10 - News Article Restore / Unarchive: **COMPLETED and CLOSED**.
- Phase 10.11B - VIP / Entitlement Architecture Discovery & Design:
  **COMPLETED - DESIGN ONLY**.
- Phase 10.11C - VIP Architecture Decisions:
  **COMPLETED - ARCHITECTURE DECISIONS ONLY**.
- Phase 10.11D - VIP / Entitlement Architecture Finalization:
  **COMPLETED - ARCHITECTURE FINALIZED**.
- Phase 10.11E - VIP Membership Implementation Foundation:
  **COMPLETED locally; not deployed**.
- Phase 10.11F - Membership Administration & Read Workflow:
  **COMPLETED locally; not deployed**.
- Phase 10.11G - Membership Production Readiness & Deployment Review:
  **COMPLETED - PRODUCTION READY (review only; not deployed)**.
- Dynamic `membershipTiers/{tierId}` and canonical
  `memberships/{membershipId}` backend foundations are implemented.
- Trusted callable functions implemented:
  `listMembershipTiers`, `listMemberships`, `getUserMemberships`,
  `createManualMembership`, and `revokeMembership`.
- Admin route `/admin/memberships` provides bounded membership listing,
  per-user history, dynamic tier selection, manual create, and ACTIVE revoke.
- Membership permissions were added to the synchronized backend/frontend
  catalog. They are not Custom Role grants; only ROOT_ADMIN and SUPER_ADMIN
  receive the management permissions through the existing system-role policy.
- Membership mutations use the trusted actor, validate target/tier/date data,
  enforce one ACTIVE membership per user, retain revoked history, and write
  `MEMBERSHIP_CREATED`/`MEMBERSHIP_REVOKED` audit events.
- News access evaluation, `contentEntitlements`, News Rules, News data,
  payment, SPECIAL entitlement, group membership, and migration were not
  changed in this phase.
- Firestore Rules were not changed. Production data was not changed. No
  deployment, commit, or push was performed.
- Phase 10.11G review confirms the five Membership callables and the
  `/admin/memberships` frontend are ready for a separately approved deploy.
  The Membership composite index must be deployed before per-user history
  queries are used in production. Rules do not require a deployment.
- Current phase: **Phase 10.11G - PRODUCTION READY; checkpoint before explicit
  deployment**.
- Next phase proposal: **Membership production deployment and controlled smoke
  test**, subject to explicit approval; News access integration, SPECIAL
  entitlement, group membership and payment remain later work.

## Authoritative Current Snapshot - Phase 10.11D ARCHITECTURE FINALIZED

- Phase 10.10 - News Article Restore / Unarchive: **COMPLETED and CLOSED**.
- Phase 10.11B - VIP / Entitlement Architecture Discovery & Design:
  **COMPLETED - DESIGN ONLY**.
- Phase 10.11C - VIP Architecture Decisions:
  **COMPLETED - ARCHITECTURE DECISIONS ONLY**.
- Phase 10.11D - VIP / Entitlement Architecture Finalization:
  **ARCHITECTURE FINALIZED - IMPLEMENTATION NOT STARTED**.
- Final architecture: `docs/PHASE_10_11D_ARCHITECTURE_FINAL.md`.
- Canonical membership uses `memberships/{membershipId}` with `tierId`; tier
  level is resolved from `membershipTiers/{tierId}`.
- `contentEntitlements/{uid}` remains legacy fallback; canonical SPECIAL
  grants use independent entitlement documents under `contentEntitlements`.
- Manual scope is limited to `listMembershipTiers`,
  `createManualMembership`, and `revokeMembership` in the next implementation.
- No source code, Rules, production data, migration or deployment changed.
- Current checkpoint: review the final architecture before implementation.

## Authoritative Current Snapshot - Phase 10.11C DECISIONS RECORDED

- Phase 10.10 - News Article Restore / Unarchive: **COMPLETED and CLOSED**.
- Phase 10.11B - VIP / Entitlement Architecture Discovery & Design:
  **COMPLETED - DESIGN ONLY**.
- Phase 10.11C - Finalize VIP Architecture Decisions:
  **COMPLETED - ARCHITECTURE DECISIONS ONLY**.
- Decision record: `docs/PHASE_10_11C_ARCHITECTURE_DECISIONS.md`.
- Canonical membership source: `memberships/{membershipId}`; Phase 1 permits
  at most one active membership per user and retains historical records.
- VIP tiers are dynamic data ordered by level; VIP is not an RBAC role or
  permission.
- PUBLIC, VIP-tier and SPECIAL access semantics, server-side enforcement,
  expiration, manual management boundary, audit and backward compatibility are
  recorded in the decision document.
- No source code, Firestore Rules, production data, migration or deployment was
  changed. Phase 10.11 implementation has **not started**.
- Current checkpoint: owner review of the remaining open implementation
  decisions before Phase 10.11 implementation.

## Authoritative Current Snapshot - Phase 10.11B DESIGN COMPLETED

- Phase 10.10 - News Article Restore / Unarchive: **COMPLETED and CLOSED**.
- Phase 10.11B - VIP / Entitlement Architecture Discovery & Design:
  **COMPLETED - DESIGN ONLY**.
- The VIP/entitlement architecture is documented in
  `docs/PHASE_10_11B_VIP_ARCHITECTURE.md`.
- No VIP implementation, membership migration, entitlement mutation, group
  workflow, payment integration, source-code change, Rules change, deployment,
  or production data change was made in this phase.
- Phase 10.11 implementation is **NOT approved/started**. It is waiting for
  explicit decisions on the open design questions listed in the architecture
  document.
- Current phase: **Phase 10.11B - VIP Architecture Design completed**.
- Next action: owner review and approval of the design/open decisions.

The historical snapshots below are preserved. This current snapshot
supersedes older statements that Phase 10.11 had no specification.

> **Documentation synchronization — Phase 10.11A (2026-09-27)**
>
> The older snapshot sections below are preserved as historical phase records.
> They are superseded by this current status after the completed Phase 10.10
> production verification.

## Authoritative Current Snapshot — Phase 10.10 CLOSED

- Phase 10.10 — News Article Restore / Unarchive: **COMPLETED and CLOSED**.
- `unarchiveNewsArticle` is deployed and active in Firebase project
  `along-6e1ce`, region `us-central1`, Node.js 22, Gen 2.
- `news.restore` is materialized in production for the protected system roles.
- ROOT_ADMIN production authorization was verified with **31 permissions**,
  including `news.restore`; the root lock and system role remain unchanged.
- All 19 News Functions were redeployed from the same source hash and verified
  active in production.
- Production smoke test passed for article archive -> restore. Article
  `O9Gz5Nw3d7Aqjy10KqIi` was restored from `archived` to `draft` without
  changing its identity, title, slug, category, content, access policy or ACL.
- Audit event `NEWS_ARTICLE_UNARCHIVED` was verified with the ROOT_ADMIN actor.
- Firestore Rules were not changed by Phase 10.10.
- No further production News mutation is pending from Phase 10.10.
- Current phase: **Phase 10.11A — Documentation synchronization**.
- Phase 10.11: **NO OFFICIAL SPECIFICATION**. No implementation scope is
  selected until the project owner provides and approves it.

The Phase 10.10B/C reports below retain their historical BLOCKED/PENDING
status at the time those checkpoints were executed; the later 10.10H–10.10L
results are the final status.

## Authoritative Current Snapshot — Phase 10.10B

- Phase 10.10 — News Article Restore / Unarchive: **COMPLETED locally**.
- Phase 10.10B deployment: **Firebase Function deployed successfully**.
- `unarchiveNewsArticle`: **ACTIVE**, Node.js 22, Gen 2, `us-central1`.
- Production authorization: **BLOCKED pending explicit authorization rebuild**. Read-only verification found 2 `SUPER_ADMIN` and 1 `ROOT_ADMIN` authorization documents with the previous 30-permission materialization; none yet contains `news.restore`.
- Production UI smoke test: **PENDING**. No authenticated restore action was performed.
- Production data changes: **none**. No article was restored, created, edited or deleted.
- Firestore Rules: **not changed or deployed**.
- Commit/push: **not performed**.
- Next checkpoint: **Phase 10.10C — Production Authorization Rebuild Approval & Restore Smoke Test**.

Detailed report: `docs/PHASE_10_10B_REPORT.md`.

## Authoritative Current Snapshot — Phase 10.10C

- Phase 10.10C authorization rebuild: **BLOCKED** because `RBAC_ROOT_ID_TOKEN` is not configured in the local process.
- Read-only production comparison identified exactly two `SUPER_ADMIN` UIDs and one `ROOT_ADMIN` UID. Each has the expected 30 legacy permissions and is missing only `news.restore`.
- No authorization rebuild was executed and no production document was written.
- Next action: configure a fresh ROOT ID token locally, run the existing dry-run, then perform the explicit approval-gated rebuild for only the three identified UIDs.

Detailed report: `docs/PHASE_10_10C_REPORT.md`.


## Authoritative Current Snapshot — Phase 10.10

- Current phase: **Phase 10.10 — News Article Restore / Unarchive — COMPLETED locally**.
- `news.restore` is a system permission. Under the current catalog model it is
  granted to `SUPER_ADMIN` and `ROOT_ADMIN`, not to `ADMIN`, `EDITOR`, `USER`,
  or Custom Roles.
- `unarchiveNewsArticle` is implemented locally/emulator-only. It changes an
  archived article to `draft`, never directly to `published`, preserves the
  article data/ACL/access policy and records `NEWS_ARTICLE_UNARCHIVED`.
- Production deployment and production data changes: **none**.
- Next proposed checkpoint: **Phase 10.10B — Restore Production Deployment &
  Smoke Test**, after review and authorization-materialization planning.

Last reviewed: 2026-09-25

## Current Phase Snapshot

- Phase 10.9 - News Article Delete / Archive Foundation: **COMPLETED locally**.
- Phase 10.9A - Archive Review and Production Readiness: **COMPLETED locally,
  CONDITIONAL/BLOCKED for production**.
- Blocking finding: the News management list/editor is not rendered for an
  actor who has only `news.delete`, even though the backend allows that actor
  to archive. The minimum fix is a frontend render-guard change; no backend or
  Firestore Rules change is indicated.
- Next proposed phase: fix and test the delete-only News management UX, then
  perform a separate archive deployment/readiness checkpoint.
- The selected lifecycle model is trusted soft-delete/archive through
  `archiveNewsArticle`; no hard-delete or cascade-delete path was added.
- Archive requires the existing server-side `news.delete` permission, derives
  the actor from Firebase Auth, writes an audit event, preserves article/ACL
  history, and removes the article from public reads through the existing
  published-status boundary.
- Existing RBAC, authorization materialization, Firestore Rules, Module 1 and
  News access policy were preserved.
- Local functions, News emulator, RBAC, authorization, policy, frontend, Rules
  and production build checks PASS; Phase 10.9A additionally found the
  delete-only frontend visibility issue described above.
- No Firebase/Vercel deployment, production data mutation, commit or push was
  performed for Phase 10.9.
- Known limitations: no restore workflow, no retention/purge policy, and no
  browser E2E or production smoke test for archive.

Last reviewed: 2026-09-25

## 1. Project Overview

- Project name: `along-van-nien`.
- Purpose: web application for Vietnamese calendar lookup, with an Excel-to-Firestore calendar data flow and a shared Firebase Authentication/RBAC foundation.
- Frontend stack: React 19, Vite, JavaScript/JSX, React Router.
- Backend/data: Firebase Web SDK, Firebase Authentication and Cloud Firestore.
- Trusted administration: Firebase Cloud Functions with Firebase Admin SDK, plus local Admin SDK tools for maintenance and verification. Admin SDK is not used in the frontend.
- Excel: SheetJS (`xlsx`).
- Firebase project: `along-6e1ce`.
- Repository: `https://github.com/Ngoc-MinhLe/along.git`.
- Deployment configuration: Vite builds to `dist`; `vercel.json` rewrites SPA routes to `index.html`.
- Package manager: npm.
- Current state: Phase 10.5 Audit & Security Event Foundation is COMPLETED locally; Phase 10.6 News Entitlement / Group / Subscription Foundation is the next proposed phase.

## 2. Current Status

Authoritative current phase: **Phase 10.5 — Audit & Security Event Foundation — COMPLETED locally**.
Next proposed phase: **Phase 10.6 — News Entitlement / Group / Subscription Foundation**.

Current Phase: Phase 10.5 — Audit & Security Event Foundation

Status: COMPLETED — sanitized trusted audit events, regression tests and build PASS; no production deployment

- Local completed: Phases 1-7B, News Phases 8.1-8.5A, System Role Phases 9.1-9.3, and Phase 10.1 through 10.5 foundations with Rules and regression verification.
- Production deployed: Module 1 frontend, Authentication/RBAC frontend, current Firestore Rules, Phase 6C Functions and Phase 7A Custom Role assignment are deployed according to the project rollout record.
- Production deployed: News Functions and required Firestore indexes.
- Frontend production deployment: pending push to `main`; Vercel is connected to the existing project and will deploy automatically after push.
- Production verified: Phase 7B smoke test was completed manually; the project owner also confirmed Phase 9.3 ROOT_ADMIN System Role changes and SUPER_ADMIN denial of System Role mutation.
- Production data: the intentional `TEST_ADMIN` smoke-test assignment was created, verified after logout/login, and cleaned up through the valid workflow. No News production data exists or was created.

## 3. Phase History

### Phase 1 — Module 1 / Calendar

Status: implemented and deployed in the current frontend; production Module 1 flow is retained.

- Dynamic `.xlsx` parsing reads the `LỊCH` sheet and keeps the source header names and values.
- The parser does not require a fixed row count, year, day count or hard-coded business header such as `Lịch âm`.
- The current sample workbook has 110 source columns; the implementation derives columns dynamically.
- Validation separates valid rows from sparse abnormal rows and keeps the validation report without blocking valid-row import.
- Import stores one import metadata document and calendar entry documents under its `entries` subcollection.
- Firestore writes are committed sequentially in bounded batches with per-document and per-batch size checks.
- Search supports an import batch, date/range fields, dropdown filters, advanced filters, pagination and a client-side fallback when a composite index is unavailable.
- The UI has basic filters, collapsible advanced filter groups, criterion search, active-filter chips, record detail view and responsive layout.
- Excel export uses the imported source column metadata as canonical column order and exports all source fields.
- Firestore Rules now require `calendar.import` for calendar writes while calendar reads remain public.

Known limitation: because calendar data is public-readable, `calendar.export` cannot be claimed as fully protected by Firestore Rules. Export is currently controlled at the UI/permission layer.

Tests relevant to the current state: Rules emulator confirms public calendar read and permission-controlled calendar write; production build passes.

### Phase 2 — Authentication

Status: implemented and production authentication is operational.

- Google Login via `GoogleAuthProvider` and popup.
- Email/password registration and login via Firebase Auth.
- Logout and browser-local auth persistence.
- Guest state when no Firebase user is present.
- First login creates `users/{uid}` with default `systemRole: USER` and `status: active`; registration cannot submit a role.
- User profile updates preserve role/status and do not store passwords in Firestore.

Known limitation: profile creation still depends on the deployed `users` Rules matching the local Rules; the current production login/profile flow has been verified.

### Phase 3 — RBAC Engine

Status: implemented and included in the deployed RBAC baseline.

- Separate System Roles and Custom Roles.
- Permission catalog and effective-permission union.
- Role hierarchy: `USER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN`, `ROOT_ADMIN`.
- Disabled Custom Roles are excluded; unknown permissions are excluded.
- Custom Roles cannot use System Role IDs or forbidden sensitive permissions.
- Policy helpers cover permission checks, hierarchy and management boundaries.

Test: `npm run test:rbac` PASS.

### Phase 4A — Custom Role Management

Status: implemented and included in the deployed RBAC baseline.

- Custom Role creation, metadata update, status handling and role display.
- Browser role creation is limited by Rules and permission policy.
- Mutations that require authorization propagation use trusted tooling in the current Phase 6B design.
- Rules reject System Role IDs and permissions outside the catalog.

### Phase 4A.1 — Security Audit

Status: completed and covered by deployed Rules/test history.

- Client attempts to change System Role, status, custom roles, protected ROOT data and permission data are denied by the emulator tests.

### Phase 4A.2 — Role ID UX

Status: implemented and included in the deployed RBAC baseline.

- The browser form does not ask the user for Role ID.
- Role ID is generated from the role name: uppercase, accent-free, normalized to underscores and made unique with `_2`, `_3`, etc.
- Editing a Custom Role does not change its document ID.

### Phase 4B — System Role Management Boundary

Status: implemented and included in the deployed RBAC baseline.

- System Role changes are separated from Custom Role workflows.
- Browser direct mutation of System Role is denied.
- ROOT cannot be demoted or changed through the browser.

### Phase 4C — Trusted System Role Admin Tool

Status: implemented and included in the deployed RBAC baseline.

- `rbac:set-system-role` uses trusted Admin SDK flow, ROOT authorization, role hierarchy validation, Custom Claims update, Firestore profile update and rollback handling.
- Claims and Firestore profile consistency are verified after mutation.
- The profile update now also updates the materialized authorization document.

Test: `npm run test:system-role-tool` PASS.

### Phase 4D — Role Hierarchy + Permission UI

Status: implemented and included in the deployed RBAC baseline.

- Admin routes and permission visibility use the RBAC policy.
- System Role and Custom Role are displayed separately.
- ROOT-protected UI states are represented explicitly.

### Phase 5 — User Management

Status: implemented and included in the deployed RBAC baseline.

- Admin user list, search/filtering, status display, profile details, role display and effective-permission display are present.
- ROOT and current-user targets are protected in the UI.
- System Role is read-only in the browser.
- Role assignment mutations are now routed to trusted tooling because browser writes cannot atomically update both the user profile and authorization document.

### Phase 6A — Permission Enforcement

Status: implemented and included in the deployed RBAC baseline.

- `PermissionProvider` and `PermissionGate` are used by the frontend.
- Calendar import and admin route/UI access are permission-gated.
- Firestore Rules use authorization data rather than trusting permission values sent by the client.
- Guest calendar lookup remains available.

### Phase 6B — Trusted Authorization Materialization

Status: deployed and production materialization verified.

- Added `userAuthorizations/{uid}` as the trusted effective-permission materialization.
- Added Admin SDK rebuild for one user, all users, dry-run and consistency checks.
- Assign/revoke, System Role changes, role enable/disable and role permission updates recalculate affected authorizations.
- Client writes to authorization documents are denied.
- Rules emulator test suite expanded to 81 assertions.

Tests: `test:authorization`, `test:rbac`, `test:system-role-tool`, `test:rules` and `build` all PASS at the latest review.

### Phase 6C - Trusted Cloud Functions

Status: deployed and operational.

- Trusted Cloud Functions foundation and server-side authorization core are present.
- Custom Role mutation callables use Firebase Auth context, trusted actor loading and Admin SDK writes.
- Frontend does not receive or use Admin SDK credentials.

### Phase 7A - ROOT Custom Role Assignment

Status: deployed and production-tested successfully.

- ROOT_ADMIN can assign and revoke an active, policy-valid Custom Role through the trusted callable workflow.
- Assignment updates `users/{targetUid}.customRoles` and `userAuthorizations/{targetUid}` consistently.
- ROOT_ADMIN protection, immutable System Roles and client write restrictions remain enforced.

### Phase 7B - Production Smoke Test

Status: PASS / COMPLETED.

- Created and assigned the safe `TEST_ADMIN` smoke-test role with two permitted permissions.
- Verified the target USER profile and Effective Permissions after assignment.
- Verified the role and materialized permissions persisted after USER logout/login.
- Verified ROOT_ADMIN remained protected.
- Verified USER has no UI/workflow access to policy-protected mutations.
- Test data was removed through the valid workflow after verification.

### Phase 8.1 — News Access Contract + Trusted Read Authorization

Status: COMPLETED.

- Trusted News read contract implemented through callable Functions.
- PUBLIC, VIP1, VIP2, VIP3 and SPECIAL access decisions use the existing RBAC authorization flow.
- Article, category, entitlement and ACL validation remain server-side.

### Phase 8.2 — Trusted Backend News Mutation

Status: COMPLETED.

- Trusted callable mutations cover article lifecycle, access policy, categories and Special ACL management.
- Client direct News/ACL/entitlement writes remain denied by Firestore Rules.
- Actor identity and permissions are obtained server-side; client payload cannot grant access.

### Phase 8.3 — News Frontend Integration

Status: COMPLETED locally; production frontend deployment pending push to `main`.

- Added News client callable service, list/detail pages and management page.
- Added routes for `/tin-tuc`, `/tin-tuc/:articleId` and `/admin/news`.
- UI visibility uses existing permission gates; backend remains the security boundary.

### Phase 8.4 — News Integration Test & Production Readiness

Status: COMPLETED / PASS.

- Guest, ordinary user, News-permission user, lifecycle, access-level and ACL scenarios passed on the Firebase Emulator.
- Forged actor/role/permission payloads, VIP escalation and direct Firestore News writes were denied.
- Frontend News contract checks, RBAC regression, authorization regression, Rules audit and production build passed.
- No production News data was created during integration testing.

### Phase 8.5A — News Pre-Deployment Review

Status: COMPLETED.

- News callable exports, Node.js 22 runtime configuration, Firestore indexes, frontend routes and Firebase configuration were reviewed.
- Regression tests and production build passed.
- No Firestore Rules change was required.

### Phase 8.5B — News Production Deployment & Smoke Test

Status: PARTIALLY COMPLETED — Firebase deployed; Vercel frontend pending push to `main`.

- The 12 News callable Functions were deployed to Firebase project `along-6e1ce`.
- The 2 required News Firestore indexes were deployed.
- `listNews` was redeployed once to accept the frontend's `categoryId: null` payload without changing authorization behavior.
- Read-only production smoke tests passed for `listNews` and `getNewsArticle` with a nonexistent article ID.
- Mutation, lifecycle, VIP, SPECIAL and ACL production scenarios were not run because no cleanup-safe production fixture exists.
- No production News documents were created or modified.
- Vercel frontend deployment remains pending the user's manual Git push to `main`.

### Phase 9.1 — ROOT System Role Management

Status: COMPLETED.

- Added trusted `setSystemRole` Callable Function for ROOT-only System Role mutation.
- Assignable roles are limited to `USER`, `EDITOR`, `ADMIN` and `SUPER_ADMIN`; `ROOT_ADMIN` cannot be assigned.
- Target ROOT protection, Auth disabled checks, payload allowlisting, consistency verification and rollback are enforced server-side.
- Frontend calls the Callable Function and does not directly write `systemRole`.

### Phase 9.2 — System Role Management Readiness

Status: COMPLETED.

- Source audit and local/emulator regression confirmed actor, ROOT lock, claim/profile/authorization consistency and privilege-escalation boundaries.
- ADMIN and USER are denied access to `setSystemRole`; ROOT-only UI controls are preserved.

### Phase 9.2A — Safe Local Emulator Browser Setup

Status: COMPLETED.

- Frontend Firebase Emulator Mode is opt-in through `VITE_USE_FIREBASE_EMULATOR=true`.
- Auth, Firestore and Functions emulator endpoints are configurable and protected against duplicate HMR connections.
- Production Firebase configuration remains the default when the flag is absent or false.

### Phase 9.2B — Manual Browser Smoke Test

Status: COMPLETED WITH LIMITATION.

- Emulator services were started and local setup was verified.
- Browser automation was unavailable; interactive ROOT → USER → ADMIN browser verification was not completed by the agent.
- No production mutation, deployment or test data was created.

### Phase 9.3 — System Role Production Deployment & Real-World Smoke Test

Status: COMPLETED — Firebase Function DEPLOYED; production browser smoke test PASS based on owner-provided evidence.

- Only `setSystemRole` was deployed to Firebase project `along-6e1ce`.
- Deployment is Node.js 22, 2nd Gen, region `us-central1`, state `ACTIVE`.
- Production callable URL: `https://us-central1-along-6e1ce.cloudfunctions.net/setSystemRole`.
- Production browser evidence confirms ROOT_ADMIN can change non-root System Roles, including USER → ADMIN and ADMIN → USER.
- Production browser evidence confirms SUPER_ADMIN can use the administration area but cannot change another user's System Role or grant ADMIN/SUPER_ADMIN through the System Role workflow.
- No additional production mutation was performed by Phase 10.1.

### Phase 10.1 — Authorization Consistency & Policy Conformance

Status: COMPLETED locally.

- Canonical backend policy and delegation boundary were implemented.
- Frontend/backend/Rules conformance and full regression passed.
- Firestore Rules emulator passed 81 assertions using a temporary CLI config and JDK 21 process configuration.
- No production data or deployment was changed.

### Phase 10.2 — Permission Explanation & Admin UX

Status: COMPLETED locally; production deployment not performed.

- Added display metadata for all 30 permissions and all System Roles without changing authorization codes.
- `/admin/users` now explains identity, System Role, Custom Roles, Effective Permissions, permission sources, risk and delegation scope.
- Custom Role assignment shows the permissions to be granted and whether the actor/recipient can delegate them under the existing policy.
- `/admin/roles` shows readable System Role and Custom Role permission explanations and delegation warnings.
- No direct Firestore mutation, new permission, Rules change, production data change or deployment was added.
- Tests and production build passed.

### Phase 10.3 — Admin Delegated User Management

Status: COMPLETED locally; production deployment not performed.

- Reused existing `users.read`, `users.update`, `roles.assign` and `roles.revoke` permissions; no new permission was added.
- Added trusted `updateUserProfile` Callable for `displayName` and `photoURL` only.
- Existing Custom Role assignment/revocation and ROOT-only System Role mutation were preserved.
- ROOT, inactive and Auth-disabled targets are protected; security fields remain immutable through this workflow.
- Status/suspend/disable/delete-user workflows were intentionally not implemented.
- Unit, policy, RBAC, frontend, Rules and build regression passed; browser E2E was not run.

## 4. Current Architecture

Authentication is provided by Firebase Authentication. `AuthProvider` observes Firebase Auth state, creates/updates the owner profile and refreshes ID token claims.

Authorization follows this trusted flow:

```text
System Role
    + Active Custom Roles
    + Permission Catalog
    -> Effective Permissions
    -> userAuthorizations/{uid}
    -> Firestore Rules
```

Important collections/documents:

- `users/{uid}`: user profile, Firebase UID, profile metadata, System Role, status and assigned Custom Role IDs. The client cannot self-change protected role fields.
- `roles/{roleId}`: Custom Role definitions, status, permission list and creation/update metadata. System Roles are not stored here as Custom Roles.
- `userAuthorizations/{uid}`: trusted materialized effective permissions, version and source role information. Client reads are limited to the owner; client writes are denied.
- `systemConfig/root`: ROOT lock/configuration used by the trusted System Role tooling. It is not client-writable.
- `calendarImports/{importId}`: import metadata, including source column metadata and validation report.
- `calendarImports/{importId}/entries/{entryId}`: normalized calendar row with `sourceFields`, `search` and `range` representations.
- `newsArticles/{articleId}`: News article content, publication state, category and access policy metadata.
- `newsCategories/{categoryId}`: News category metadata and inherited access policy.
- `newsAcl/{aclId}`: trusted Special ACL entries for user, group, article or category scope.
- `contentEntitlements/{uid}` and `newsGroups/{groupId}`: entitlement/group inputs used by trusted News read authorization when present.

## 5. System Roles

The actual hierarchy is:

```text
ROOT_ADMIN
SUPER_ADMIN
ADMIN
EDITOR
USER
```

`GUEST` means an unauthenticated state and is not a System Role.

- System Role mutation is not a browser mutation.
- System Role mutation uses the trusted Admin SDK tool from Phase 4C.
- ROOT is protected by the root lock, Auth Custom Claims, profile checks and exactly-one-ROOT validation.
- No Custom Role may use a System Role ID.
- No Custom Role workflow may create or assign `ROOT_ADMIN`.

## 6. Custom Roles

- Create: browser creation is validated against the catalog and Rules; trusted tooling is available.
- Edit: name, description and permissions are policy-controlled; document ID remains unchanged.
- Enable/disable: trusted tooling updates the role and rebuilds all assigned users.
- Delete: trusted tooling only, and only when the role is not assigned.
- Assign/revoke: trusted tooling updates `users.customRoles` and `userAuthorizations` together.
- Effective permissions are the union of System Role permissions and active Custom Role permissions.
- Disabled roles contribute no permissions.
- Unknown permissions contribute no permissions and are rejected by validation.
- Role IDs are auto-generated from names and get a numeric suffix on collision.

Browser direct mutations that would require propagation are intentionally denied rather than opening Rules broadly.

## 7. Permission Catalog

The catalog is read from `src/services/rbac/permissions.js`.

### users.*

- `users.read`
- `users.create`
- `users.update`
- `users.delete`

### roles.*

- `roles.read`
- `roles.create`
- `roles.update`
- `roles.disable`
- `roles.delete`
- `roles.assign`
- `roles.revoke`

### calendar.*

- `calendar.search`
- `calendar.export`
- `calendar.import`

### news.*

- `news.read`
- `news.create`
- `news.update`
- `news.delete`
- `news.publish`

### quiz.question.*

- `quiz.question.read`
- `quiz.question.create`
- `quiz.question.update`
- `quiz.question.delete`

### quiz.exam.*

- `quiz.exam.create`
- `quiz.exam.update`
- `quiz.exam.publish`
- `quiz.exam.delete`

### approval.*

- `approval.create`
- `approval.review`

### audit.*

- `audit.read`

## 8. Module 1 — Calendar

Current implementation is in `src/services/excel.js`, `src/services/calendarImports.js`, `src/components/CalendarImportPanel.jsx` and `src/pages/CalendarLookupPage.jsx`.

- Excel parser: SheetJS reads `.xlsx`, requires the `LỊCH` sheet, reads the first row as source headers and preserves source field names/values.
- Columns: dynamic; the current workbook sample has 110 columns. The application does not hard-code the sample row count, year or day count.
- Records: valid rows are imported; sparse abnormal rows remain in `validationReport` and do not block valid-row import.
- Search: selected import batch, range filters, dropdown filters, advanced filters, pagination and missing-index fallback.
- Detail: full source field view for each result.
- Export: all source fields in canonical source-column order.
- Import: metadata plus entries subcollection; sequential Firestore batches with progress and document-size checks.
- Permissions: guest/public read uses `calendar.search`; import writes require `calendar.import`; UI export requires `calendar.export`.

Known limitation: calendar data is public-readable, so `calendar.export` is not fully enforceable by Firestore Rules. It is currently controlled by the UI/permission layer. A future protected-export design would require a separate phase.

## 9. Authorization Materialization

`userAuthorizations/{uid}` contains:

```js
{
  uid,
  systemRole,
  customRoles,
  permissions,
  version,
  updatedAt
}
```

The trusted core reuses the existing RBAC engine. It loads the user profile, active/disabled Custom Role definitions and the permission catalog, then writes a deduplicated, known-permission-only effective list.

Current commands from `package.json`:

```bash
npm run rbac:rebuild-authorization -- <uid-or-email> [--dry-run]
npm run rbac:rebuild-all-authorizations -- [--dry-run]
npm run rbac:check-authorization -- [uid-or-email]
```

Propagation behavior:

- assign/revoke: profile and authorization are updated in one batch;
- System Role mutation: profile and authorization are updated in one batch;
- disable/enable Custom Role: every user assigned that role is rebuilt;
- Custom Role permission update: every affected user is rebuilt;
- consistency check: compares profile source data and materialized authorization without automatically repairing production.

## 10. Security Rules

Current local Rules are in [firestore.rules](../firestore.rules).

- `calendarImports`: reads are public; writes require materialized `calendar.import`.
- `users`: owner reads and profile metadata updates are allowed; user listing requires `users.read`; protected role/status/custom-role mutations are not browser-writable; delete is denied.
- `roles`: reads require `roles.read` except an assigned role definition may be read directly; safe creation and metadata updates require permission; permission/status changes and delete require trusted tooling and are denied directly from the browser.
- `userAuthorizations`: owner `get` only; list and all client writes are denied.
- `systemConfig`: no client write; ROOT lock is trusted-tool controlled.
- Permission catalog: no client write path exists and is denied by default.
- ROOT protection: root lock, claims/profile checks and Rules protections remain in place.

Rules production deployment: current RBAC Rules have been deployed and verified. The local Rules file remains authoritative for future review; no News Rules have been added.

## 11. Trusted Admin Tools

These commands exist in `package.json`:

```bash
npm run bootstrap:root
npm run rbac:get-system-role
npm run rbac:set-system-role
npm run rbac:create-role
npm run rbac:update-role
npm run rbac:disable-role
npm run rbac:enable-role
npm run rbac:delete-role
npm run rbac:assign-role
npm run rbac:revoke-role
npm run rbac:rebuild-authorization
npm run rbac:rebuild-all-authorizations
npm run rbac:check-authorization
```

Mutation tools require trusted local credentials and confirmation. They do not put Admin SDK credentials in the frontend or repository.

## 12. Test Status

Latest verified results:

- `npm run test:authorization`: PASS.
- `npm run test:rbac`: PASS.
- `npm run test:system-role-tool`: PASS.
- `npm run test:rules`: PASS, 81 assertions in the Firestore emulator.
- `npm run test:functions`: PASS.
- `npm run test:functions:news:emulator`: PASS.
- `npm run test:functions:emulator`: PASS.
- `npm run check:functions`: PASS.
- `npm run test:frontend-rbac`: PASS.
- `npm run test:frontend-news`: PASS.
- `npm run build`: PASS. Vite produced `dist`; only a bundle-size warning was reported.
- News integration and security scenarios: PASS in the Functions/Firestore emulators.
- Phase 7B production smoke test: PASS, manually verified with ROOT_ADMIN and a USER test account.
- `git diff --check`: PASS; Git emitted only line-ending normalization warnings.

The Rules test uses the local emulator and does not mutate production Firebase data.

## 13. Known Limitations

1. A new user does not automatically receive a materialized authorization document because no auth-user creation trigger is deployed. Until a trusted rebuild runs, the frontend falls back to public permissions.
2. Calendar export cannot be fully protected while the underlying calendar data is public-readable.
3. If propagation is interrupted after a role change, a consistency check/rebuild is required.
4. News has no browser E2E test yet.
5. News has no VIP entitlement workflow or group membership workflow yet.
6. News has no production documents. Only read-only production smoke tests have been performed.
7. Vercel frontend deployment is pending the user's manual push to `main`.
8. News mutation/lifecycle/VIP/SPECIAL/ACL production smoke tests remain pending until a cleanup-safe fixture workflow is available.
9. System Role production browser smoke test remains pending manual verification after the frontend is pushed and deployed.

## 14. Production Rollout — CURRENT RBAC SCOPE COMPLETE

- [x] Phase 6C trusted Functions deployed.
- [x] Phase 6B Firestore Rules and authorization materialization rollout.
- [x] Phase 7A Custom Role assignment deployed.
- [x] Phase 7B Custom Role assignment production smoke test.
- [x] Verify assignment persistence across USER logout/login.
- [x] Verify ROOT_ADMIN protection.
- [ ] Current frontend source deployed through Vercel (existing project is configured; pending manual push to `main`).
- [x] Phase 8.5A News pre-deployment review.
- [x] News callable Functions deployed to Firebase.
- [x] News Firestore indexes deployed.
- [ ] News frontend deployed to the existing Vercel project `lichvannien`.
- [x] Phase 9.3 `setSystemRole` Firebase Function deployed to `along-6e1ce`.
- [x] Phase 9.3 frontend/production browser flow verified by owner-provided evidence.
- [x] Phase 9.3 production ROOT → USER → ADMIN browser smoke test.

News backend deployment and read-only smoke checks are complete. The frontend will be deployed automatically by Vercel after the manual push to `main`.

## 15. Module Status

### Module 2 — News

Implemented through Phase 8.4. News callable Functions and indexes are deployed, while the frontend remains pending push to `main`. No production News documents exist.

Not yet implemented or completed: VIP entitlement workflow, group membership workflow, browser E2E coverage, Vercel frontend deployment for the current News source and mutation production smoke testing.

### Module 3 — Quiz

Not implemented. Question bank, exam generation, practice mode, exam mode, results and statistics are not present as a completed module.

## 16. Future Phases

- Phase 9.3 — System Role Production Deployment & Real-World Smoke Test (completed; Function deployed and browser smoke evidence PASS).
- Phase 8.5 — News Production Deployment & Smoke Test (Firebase complete; Vercel pending push).
- Phase 9 — Module 3: Quiz, practice and exam workflows.
- Phase 10.1 — Authorization Consistency & Policy Conformance (COMPLETED; policy conformance and Rules regression PASS).
- Phase 10.2 — Permission Explanation & Admin UX (COMPLETED locally; no production deployment).
- Phase 10.3 — Admin Delegated User Management (COMPLETED locally; no production deployment).
- Phase 10.5 — Audit & Security Event Foundation (COMPLETED locally; no production deployment).
- Phase 10.6 — News Entitlement / Group / Subscription Foundation (next proposed phase; not started).
- Phase 11 — Final security audit and Rules review.
- Phase 12 — Production hardening, performance, monitoring and UX refinement.

These are roadmap proposals, not completed features.

Roadmap alignment note: Phase 7A and Phase 7B are completed and production
verified. Phase 8.1-8.5A are completed; Phase 8.5B Firebase deployment and the
owner-provided production browser verification are recorded. Phase 9.1-9.3 are
completed. Phase 10.1 policy-contract, conformance-test and Rules verification are
complete. Phase 10.2 and Phase 10.3 are completed locally. Phase 10.5 is the
next proposed implementation phase; Phase 10.4 resource-picker UX remains optional.

## DO NOT BREAK

- Do not put Firebase Admin SDK in the frontend.
- Do not let the client change `systemRole`.
- Do not let the client write `userAuthorizations`.
- Do not let the client grant itself permissions.
- Do not create a second RBAC/effective-permission engine.
- Do not weaken Firestore Rules to make the UI work.
- Do not turn `calendarImports` into public write.
- Do not remove ROOT protection.
- System Role mutation must use the trusted workflow.
- Permission Catalog is policy-controlled.
- Disabled Custom Roles have no effective permissions.
- Invalid permissions have no effective permissions.
- Do not change production data during development/tests.
- Do not deploy before completing the rollout checklist.
- Preserve source Excel field names and canonical export order.
- Keep Module 2 and Module 3 isolated until their phases are explicitly started.

## 17. File Map

- `src/auth/`: Firebase Auth and permission context providers.
- `src/services/rbac/`: permission catalog, role hierarchy, policy, Firestore role services and client authorization subscription.
- `src/services/auth.js`: Firebase Auth operations and user profile creation/update.
- `src/services/excel.js`: dynamic workbook parsing and validation.
- `src/services/calendarImports.js`: Firestore import, query, pagination and fallback logic.
- `src/pages/`: calendar, auth, admin and placeholder route pages.
- `src/components/`: layout-independent UI pieces, import panel and permission gate.
- `src/layouts/`: application and admin layouts.
- `src/firebase/`: Firebase Web SDK configuration and initialization.
- `scripts/`: trusted Admin SDK tools, self-tests and Rules emulator tests.
- `firestore.rules`: local Firestore Security Rules.
- `firebase.json`: Rules path and Firestore emulator configuration.
- `.firebaserc`: Firebase project alias (`along-6e1ce`).
- `package.json`: npm scripts and dependencies.
- `vercel.json`: SPA rewrite configuration for Vercel.

## NEXT ACTION

Current status: Phase 10.5 COMPLETED locally — trusted audit-event foundation and regression boundaries PASS.

Next step: review and approve Phase 10.6 — News Entitlement / Group / Subscription Foundation. No Phase 10.6 implementation has started.

No production data or deployment was changed by Phase 10.3.

## Final Review Notes

- File updated: `docs/PROJECT_STATUS.md`.
- All requested status sections are included.
- Current phase is recorded as `Phase 10.5 — COMPLETED locally`; next proposed phase is Phase 10.6.
- Phase 7A and 7B production results are recorded separately from News production deployment results.
- Phase 8.1-8.5A are completed; Phase 8.5B Firebase deployment is complete and frontend deployment awaits manual Git push.
- Known limitations and rollout checklist are recorded.
- Phase 10.2 application code and documentation are modified locally only; Firestore Rules, Firebase data, deployment and Git history were not changed.

## Phase 10.4 Status Update

- Phase 10.4 — Admin Resource Selection UX: **COMPLETED locally**.
- Implemented bounded, trusted News selector read APIs and searchable selectors for News article/category/ACL resources and principals; existing Admin Users user search remains in place.
- No Firestore Rules, production data, Firebase deployment, commit or push was changed by this phase.
- Required regression tests, emulator tests, frontend checks, build and `git diff --check` PASS.
- Browser E2E was not run; manual/browser verification remains a limitation.
- Current phase: **Phase 10.5 — COMPLETED locally**.
- Next phase: **Phase 10.6 — News Entitlement / Group / Subscription Foundation** (not started).

## Phase 10.5 Status Update

- Phase 10.5 — Audit & Security Event Foundation: **COMPLETED locally**.
- Existing trusted callable mutations now write sanitized server-side audit
  events with SUCCESS/DENIED/FAILED outcomes and correlation IDs.
- Audit events are append-only from the client perspective; no client Rules
  access was added and `firestore.rules` was not changed.
- Audit coverage includes System Role, user profile, Custom Role and News
  mutation callables. No second authorization or materialization engine was
  introduced.
- Required regression, emulator, Rules and frontend tests PASS; Rules test
  passed 84 assertions with temporary local CLI/JDK21 process configuration.
- `npm run build` and `git diff --check` PASS.
- No Firebase/Vercel deployment, production data change, commit or push was
  performed by Phase 10.5.
- Known limitations: no audit UI/retention/SIEM, no audit of read callables,
  local Admin SDK tools are not automatically wrapped, and browser E2E was not
  run in this phase.

Current phase: **Phase 10.5 — COMPLETED locally**.
Next proposed phase: **Phase 10.6 — News Entitlement / Group / Subscription
Foundation**, after review and approval.
