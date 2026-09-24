# PHASE 10.3 — ADMIN DELEGATED USER MANAGEMENT

## 1. Status

Phase 10.3 is **COMPLETED locally** at the implementation and regression-test checkpoint.

- No production deployment.
- No production data mutation.
- No Firestore Rules change.
- No commit or push.
- Browser E2E: **NOT RUN**; browser automation is not available in this environment.

## 2. Audit result

The existing catalog was reused without adding permissions:

- `users.read`: list/read users through existing Rules boundary.
- `users.update`: update safe profile fields through the new trusted Callable.
- `roles.assign` / `roles.revoke`: existing Custom Role Callable workflows and delegation scope.
- System Role mutation: remains `setSystemRole`, ROOT-only.

Current System Role capabilities remain unchanged:

- ADMIN has `users.read`, but does not receive System Role mutation.
- ADMIN does not have `users.update` in the current role matrix unless a valid Custom Role and policy provide it.
- SUPER_ADMIN has the catalog permissions, but still cannot call `setSystemRole`.
- ROOT_ADMIN remains the only System Role mutation actor.

Status/Auth disable, delete user and full lifecycle management were intentionally not implemented because their policy and Auth/Firestore consistency contract were not defined for this phase.

## 3. Backend implementation

Added the trusted Callable `updateUserProfile`.

Payload allowlist:

```text
{
  targetUid,
  displayName?,
  photoURL?
}
```

The function:

- derives actor identity from `request.auth.uid` through `getTrustedActor()`;
- requires the authoritative `users.update` permission;
- validates the target profile and Firebase Auth user are present and active;
- blocks the root lock, ROOT_ADMIN profile and ROOT_ADMIN claim;
- updates only `displayName` and `photoURL`;
- never accepts actorUid, role, permissions, claims, customRoles or authorization data;
- updates Firebase Auth and Firestore with consistency verification;
- rolls back Firebase Auth if Firestore mutation fails;
- returns only a minimal operation result.

Existing `assignCustomRole`, `revokeCustomRole` and `setSystemRole` contracts were preserved. No status mutation or System Role delegation was added.

## 4. Frontend implementation

`/admin/users` now exposes profile editing only when the current authoritative permission context has `users.update` and the target is not protected.

- Uses `updateUserProfile()` Callable service.
- Does not call `updateDoc()`/`setDoc()` for target profile mutation.
- Does not send actorUid, role, permissions or delegation scope.
- Existing Custom Role assignment preview and System Role ROOT-only controls remain unchanged.

## 5. Security review

PASS:

- USER/EDITOR without `users.update` are denied.
- Actor permission is read from trusted materialized authorization.
- Fake actorUid is rejected by the common auth boundary.
- Fake permission/role/effectivePermissions/delegationScope fields are not accepted.
- ROOT target is protected.
- Inactive target is rejected.
- Auth-disabled target is rejected.
- Profile security fields (`systemRole`, `status`, `customRoles`, claims and authorization) cannot be changed by this Callable.
- ADMIN/SUPER_ADMIN still cannot change System Role.
- Custom Role delegation still requires target permissions to be within actor scope.
- Direct client Firestore security-field writes remain denied by existing Rules.

## 6. Tests

| Test | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS, including User Management unit test |
| `npm run test:policy-conformance` | PASS |
| `npm run test:permission-explanation` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:system-role-tool` | PASS |
| `npm run test:rules` | PASS — 81 assertions |
| `npm run build` | PASS; existing bundle-size warning remains |
| `git diff --check` | PASS; only Git line-ending warnings |

Rules tests used the temporary Firebase CLI config and JDK 21 process setup; no system configuration or production project was changed.

## 7. Known limitations

- No status/suspend/disable workflow was added.
- No Firebase Auth delete/disable workflow was added.
- No new ADMIN permission was introduced; current role policy remains authoritative.
- Browser E2E was not run.
- Audit events remain deferred to Phase 10.5.

## 8. Next phase

Recommended next phase: **Phase 10.5 — Audit & Security Event Foundation**, subject to review. Phase 10.4 resource-picker UX remains a separate optional track and was not started here.
