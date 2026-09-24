# PROJECT STATUS

Last reviewed: 2026-09-24

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
- Current state: Phase 9.3 System Role production deployment completed; frontend Vercel deployment remains pending push to `main`.

## 2. Current Status

Current Phase: Phase 9.3 — System Role Production Deployment & Real-World Smoke Test

Status: IN PROGRESS — LOCAL VALIDATION COMPLETE; WAITING FOR MANUAL GIT PUSH

- Local completed: Phases 1-7B, News Phases 8.1-8.5A, and System Role Phases 9.1-9.2A have implementation and regression-test coverage; Phase 9.3 System Role Function deployment is complete.
- Production deployed: Module 1 frontend, Authentication/RBAC frontend, current Firestore Rules, Phase 6C Functions and Phase 7A Custom Role assignment are deployed according to the project rollout record.
- Production deployed: News Functions and required Firestore indexes.
- Frontend production deployment: pending push to `main`; Vercel is connected to the existing project and will deploy automatically after push.
- Production verified: Phase 7B smoke test was completed manually with ROOT_ADMIN and a USER test account.
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

Status: Firebase Function DEPLOYED; production browser smoke test PENDING MANUAL VERIFICATION.

- Only `setSystemRole` was deployed to Firebase project `along-6e1ce`.
- Deployment is Node.js 22, 2nd Gen, region `us-central1`, state `ACTIVE`.
- Production callable URL: `https://us-central1-along-6e1ce.cloudfunctions.net/setSystemRole`.
- No Firestore Rules, Vercel deployment or production user/data mutation was performed.
- Frontend source is ready for the user's manual Git push; Vercel will deploy from `main`.
- Production ROOT → USER → ADMIN smoke test is pending the user's manual browser verification after Vercel deployment.

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
- [ ] Phase 9.3 frontend pushed to `main` and Vercel deployment verified.
- [ ] Phase 9.3 production ROOT → USER → ADMIN browser smoke test.

News backend deployment and read-only smoke checks are complete. The frontend will be deployed automatically by Vercel after the manual push to `main`.

## 15. Module Status

### Module 2 — News

Implemented through Phase 8.4. News callable Functions and indexes are deployed, while the frontend remains pending push to `main`. No production News documents exist.

Not yet implemented or completed: VIP entitlement workflow, group membership workflow, browser E2E coverage, Vercel frontend deployment for the current News source and mutation production smoke testing.

### Module 3 — Quiz

Not implemented. Question bank, exam generation, practice mode, exam mode, results and statistics are not present as a completed module.

## 16. Future Phases

- Phase 9.3 — System Role Production Deployment & Real-World Smoke Test (Function deployed; browser verification pending).
- Phase 8.5 — News Production Deployment & Smoke Test (Firebase complete; Vercel pending push).
- Phase 9 — Module 3: Quiz, practice and exam workflows.
- Phase 10 — Approval and audit workflows.
- Phase 11 — Final security audit and Rules review.
- Phase 12 — Production hardening, performance, monitoring and UX refinement.

These are roadmap proposals, not completed features.

Roadmap alignment note: Phase 7A and Phase 7B are completed and production
verified. Phase 8.1-8.5A are completed; Phase 8.5B Firebase deployment is complete
while its Vercel frontend remains pending push. Phase 9.1-9.2A are completed, and
Phase 9.3 `setSystemRole` Firebase Function deployment is complete. The next
operational step is manual Git push to `main`, followed by Vercel automatic frontend
deployment and manual production browser smoke testing.

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

Current status: Phase 9.3 — `setSystemRole` Firebase Function deployed; frontend Vercel deployment pending push to `main`.

Next step: manually review, commit and push the source to `main`; Vercel will deploy the connected existing project, then perform the production browser smoke test.

No production System Role mutation or test user was created. Production browser smoke test remains pending manual verification.

## Final Review Notes

- File updated: `docs/PROJECT_STATUS.md`.
- All requested status sections are included.
- Current phase is recorded as `Phase 8.5B — Firebase deployed; Vercel pending push`.
- Phase 7A and 7B production results are recorded separately from News production deployment results.
- Phase 8.1-8.5A are completed; Phase 8.5B Firebase deployment is complete and frontend deployment awaits manual Git push.
- Known limitations and rollout checklist are recorded.
- No application code, Firestore Rules, Firebase data, deployment or Git history was changed by this documentation task.
