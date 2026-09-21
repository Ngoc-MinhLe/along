# PROJECT STATUS

Last reviewed: 2026-09-21

## 1. Project Overview

- Project name: `along-van-nien`.
- Purpose: web application for Vietnamese calendar lookup, with an Excel-to-Firestore calendar data flow and a shared Firebase Authentication/RBAC foundation.
- Frontend stack: React 19, Vite, JavaScript/JSX, React Router.
- Backend/data: Firebase Web SDK, Firebase Authentication and Cloud Firestore.
- Trusted administration: Firebase Admin SDK local scripts using Application Default Credentials and a fresh ROOT ID token; no separate application server is present.
- Excel: SheetJS (`xlsx`).
- Firebase project: `along-6e1ce`.
- Repository: `https://github.com/Ngoc-MinhLe/along.git`.
- Deployment configuration: Vite builds to `dist`; `vercel.json` rewrites SPA routes to `index.html`.
- Package manager: npm.
- Current state: Phase 6B is completed locally and remains uncommitted. No production rollout was performed in this phase.

## 2. Current Status

Current Phase: 6B

Status: COMPLETED LOCALLY / NOT YET DEPLOYED

- Local completed: Phase 6B authorization materialization code, Rules changes, trusted tooling, emulator security tests and production build have been completed and verified.
- Production deployed: not performed by the current work.
- Production not deployed: Firestore Rules and authorization materialization have not been rolled out as part of this phase. The exact live Console state must be verified during rollout.
- Production data: no production roles, users, authorization documents or calendar data were mutated by this phase.

## 3. Phase History

### Phase 1 — Module 1 / Calendar

Status: implemented locally and used in the application.

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

Status: implemented locally.

- Google Login via `GoogleAuthProvider` and popup.
- Email/password registration and login via Firebase Auth.
- Logout and browser-local auth persistence.
- Guest state when no Firebase user is present.
- First login creates `users/{uid}` with default `systemRole: USER` and `status: active`; registration cannot submit a role.
- User profile updates preserve role/status and do not store passwords in Firestore.

Known limitation: profile creation depends on the deployed `users` Rules matching the local Rules. Production behavior must be verified during rollout.

### Phase 3 — RBAC Engine

Status: implemented locally.

- Separate System Roles and Custom Roles.
- Permission catalog and effective-permission union.
- Role hierarchy: `USER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN`, `ROOT_ADMIN`.
- Disabled Custom Roles are excluded; unknown permissions are excluded.
- Custom Roles cannot use System Role IDs or forbidden sensitive permissions.
- Policy helpers cover permission checks, hierarchy and management boundaries.

Test: `npm run test:rbac` PASS.

### Phase 4A — Custom Role Management

Status: implemented locally.

- Custom Role creation, metadata update, status handling and role display.
- Browser role creation is limited by Rules and permission policy.
- Mutations that require authorization propagation use trusted tooling in the current Phase 6B design.
- Rules reject System Role IDs and permissions outside the catalog.

### Phase 4A.1 — Security Audit

Status: completed in the current Rules/test history.

- Client attempts to change System Role, status, custom roles, protected ROOT data and permission data are denied by the emulator tests.

### Phase 4A.2 — Role ID UX

Status: implemented locally.

- The browser form does not ask the user for Role ID.
- Role ID is generated from the role name: uppercase, accent-free, normalized to underscores and made unique with `_2`, `_3`, etc.
- Editing a Custom Role does not change its document ID.

### Phase 4B — System Role Management Boundary

Status: implemented locally.

- System Role changes are separated from Custom Role workflows.
- Browser direct mutation of System Role is denied.
- ROOT cannot be demoted or changed through the browser.

### Phase 4C — Trusted System Role Admin Tool

Status: implemented locally.

- `rbac:set-system-role` uses trusted Admin SDK flow, ROOT authorization, role hierarchy validation, Custom Claims update, Firestore profile update and rollback handling.
- Claims and Firestore profile consistency are verified after mutation.
- The profile update now also updates the materialized authorization document.

Test: `npm run test:system-role-tool` PASS.

### Phase 4D — Role Hierarchy + Permission UI

Status: implemented locally.

- Admin routes and permission visibility use the RBAC policy.
- System Role and Custom Role are displayed separately.
- ROOT-protected UI states are represented explicitly.

### Phase 5 — User Management

Status: implemented locally.

- Admin user list, search/filtering, status display, profile details, role display and effective-permission display are present.
- ROOT and current-user targets are protected in the UI.
- System Role is read-only in the browser.
- Role assignment mutations are now routed to trusted tooling because browser writes cannot atomically update both the user profile and authorization document.

### Phase 6A — Permission Enforcement

Status: implemented locally.

- `PermissionProvider` and `PermissionGate` are used by the frontend.
- Calendar import and admin route/UI access are permission-gated.
- Firestore Rules use authorization data rather than trusting permission values sent by the client.
- Guest calendar lookup remains available.

### Phase 6B — Trusted Authorization Materialization

Status: COMPLETED LOCALLY / NOT YET DEPLOYED.

- Added `userAuthorizations/{uid}` as the trusted effective-permission materialization.
- Added Admin SDK rebuild for one user, all users, dry-run and consistency checks.
- Assign/revoke, System Role changes, role enable/disable and role permission updates recalculate affected authorizations.
- Client writes to authorization documents are denied.
- Rules emulator test suite expanded to 73 assertions.

Tests: `test:authorization`, `test:rbac`, `test:system-role-tool`, `test:rules` and `build` all PASS at the latest review.

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

Rules production deployment: not performed in Phase 6B. The local Rules file is authoritative for review, but the live Firebase Console state must be verified before rollout.

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
- `npm run test:rules`: PASS, 73 assertions in the Firestore emulator.
- `npm run build`: PASS. Vite produced `dist`; only a bundle-size warning was reported.
- `git diff --check`: PASS; Git emitted only line-ending normalization warnings.

The Rules test uses the local emulator and does not mutate production Firebase data.

## 13. Known Limitations

1. A new user does not automatically receive a materialized authorization document because no Cloud Function/backend trigger is deployed. Until a trusted rebuild runs, the frontend falls back to public permissions.
2. Calendar export cannot be fully protected while the underlying calendar data is public-readable.
3. If propagation is interrupted after a role change, a consistency check/rebuild is required.
4. Production Rules have not been deployed by Phase 6B.
5. Production authorization documents have not been materialized by Phase 6B.
6. No Cloud Functions are present; the current design uses local trusted Admin SDK tooling and does not require Blaze.

## 14. Production Rollout — NOT YET DONE

- [ ] Production consistency/dry-run.
- [ ] Check current ROOT authorization and fresh ROOT token.
- [ ] Materialize authorization for production users.
- [ ] Verify all authorization documents.
- [ ] Deploy Firestore Rules.
- [ ] Verify production security behavior.
- [ ] Deploy frontend/Vercel.
- [ ] Run production smoke test.
- [ ] Verify guest, user, admin and root flows.

No item above is marked complete.

## 15. Modules Not Yet Implemented

### Module 2 — News

Not implemented. Public news, VIP1/VIP2/VIP3 access, special ACLs, news management and approval workflows are not present as a completed module.

### Module 3 — Quiz

Not implemented. Question bank, exam generation, practice mode, exam mode, results and statistics are not present as a completed module.

## 16. Future Phases

- Phase 7 — News module and its access/ACL policy.
- Phase 8 — Quiz module, practice and exam workflows.
- Phase 9 — Approval and audit workflows.
- Phase 10 — Final security audit and Rules review.
- Phase 11 — Production hardening, performance, monitoring and UX refinement.

These are roadmap proposals, not completed features.

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

Current status: Phase 6B local completed.

Next actions:

1. Review `docs/PROJECT_STATUS.md`.
2. Run production dry-run.
3. Materialize production authorization.
4. Deploy Rules.
5. Verify production behavior.
6. Commit/push after code and documentation review.
7. Continue with Module 2 — News.

Do not perform production steps automatically as part of this documentation task.

## Final Review Notes

- File created: `docs/PROJECT_STATUS.md`.
- All requested status sections are included.
- Current phase is recorded as `6B`.
- Local and production status are explicitly separated.
- Known limitations and rollout checklist are recorded.
- No application code, Firestore Rules, Firebase data, deployment or Git history was changed by this documentation task.
