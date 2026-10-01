# PHASE 10.11R — RBAC Membership Permission Materialization & Admin Navigation Fix

## Status

**BLOCKED — production authorization rebuild is pending a reviewed deployment of the current rebuild Function.**

No production mutation or deployment was performed in this phase.

## 1. Root cause

The production `userAuthorizations` documents were materialized before the Membership/Entitlement permissions were added to the canonical policy.

Local source currently defines 37 permissions. `ROOT_ADMIN` and `SUPER_ADMIN` both resolve to the complete `PERMISSIONS` catalog, including:

- `membership.read`
- `membership.assign`
- `membership.update`
- `membership.revoke`
- `entitlement.read`
- `entitlement.manage`

Production authorization documents still contain 31 permissions and omit all six permissions above.

Therefore the frontend correctly reads `userAuthorizations/{uid}`, but `PermissionGate` correctly denies `membership.read`.

## 2. Production read-only evidence

| Account role | Authorization version | Permission count | Membership/Entitlement permissions |
|---|---:|---:|---|
| ROOT_ADMIN | 2 | 31 | all 6 missing |
| SUPER_ADMIN | 3 | 31 | all 6 missing |
| SUPER_ADMIN | 3 | 31 | all 6 missing |

All inspected profiles exist and are active. Profile `systemRole` values match their authorization documents. No production data was written.

## 3. Policy/catalog verification

- Backend Permission Catalog: **PASS**.
- Frontend Permission Catalog: **PASS**.
- Backend `ROLE_PERMISSIONS.ROOT_ADMIN`: includes all 37 permissions.
- Backend `ROLE_PERMISSIONS.SUPER_ADMIN`: includes all 37 permissions.
- Frontend role matrix: conforms to backend policy.
- No new permission was created in this phase.

## 4. Frontend verification

The frontend reads the correct source:

`src/services/rbac/authorization.js` subscribes to `userAuthorizations/{uid}`.

`PermissionContext` normalizes the document permissions and `PermissionGate` checks the exact permission string.

The navigation already used effective permissions correctly:

- Membership list: `membership.read`.
- Membership Tier navigation: `membership.update`.

A contract mismatch was found and fixed: `/admin/membership-tiers` was guarded by `membership.read` even though tier administration requires `membership.update`. `AdminLayout` now also allows the admin shell to open when the actor has `membership.update`.

## 5. Files changed

- `src/App.jsx`
  - Tier route now uses `PERMISSIONS.MEMBERSHIP_UPDATE`.
- `src/layouts/AdminLayout.jsx`
  - `membership.update` is included in the admin-shell capability check.
- `scripts/membership-frontend-test.mjs`
  - Regression assertion updated to enforce the tier route contract.
- `docs/PHASE_10_11R_REPORT.md`
  - This report.

No backend, Rules, schema, News, or authorization materialization source was changed.

## 6. Rebuild Function deployment finding

The production `rebuildProtectedSystemRoleAuthorizations` Function is active in `us-central1`, but its deployed source hash is:

`3dffc9662118b2f8e796f242773db615efcc6b3e`

The Membership/Tier deployment used the newer source hash:

`dd99c3577d66a691cc29688905b81d50c546cab6`

The rebuild Function therefore must be reviewed and redeployed from the current source before it can safely materialize the six new permissions. No rebuild was called against production in this phase.

## 7. Tests

PASS:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:authorization`
- `npm run test:rbac`
- `npm run test:policy-conformance`
- `npm run test:frontend-rbac`
- `npm run test:frontend-membership`
- `npm run test:frontend-news`
- `npm run test:rules` — 84 assertions
- `npm run build`
- `git diff --check`

Build retains the existing Vite bundle-size warning only.

## 8. Security and production safety

- No PermissionGate bypass.
- No hard-coded ROOT UID/email.
- No Firestore Rules change.
- No RBAC hierarchy change.
- No Membership/Tier production data created.
- No News data changed.
- No `userAuthorizations` production document changed.
- No Firebase/Vercel deployment performed.
- No commit/push performed.

## 9. Required next action

After review approval:

1. Deploy only the current `rebuildProtectedSystemRoleAuthorizations` Function.
2. Invoke its existing empty-payload callable workflow through the authorized ROOT session.
3. Read back ROOT/SUPER authorization documents and verify 37 permissions, including all six Membership/Entitlement permissions.

This phase stops before those production actions.

## 10. Git status

The working tree contains only the three frontend/test changes and this report. No production or deployment artifact is staged or committed by this phase.
