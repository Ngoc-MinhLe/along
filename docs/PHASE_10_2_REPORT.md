# PHASE 10.2 — PERMISSION EXPLANATION & ADMIN UX

## 1. Status

Phase 10.2 is **COMPLETED locally** at the implementation and regression-test checkpoint.

- No Firebase deployment was performed.
- No Vercel deployment was performed.
- No production data was created or changed.
- No Firestore Rules change was required.
- No commit or push was performed.

## 2. Scope implemented

The existing RBAC policy and materialization architecture were retained. The phase adds a display and preview layer only:

- Permission metadata for all 30 catalog permissions.
- System Role display metadata for USER, EDITOR, ADMIN, SUPER_ADMIN and ROOT_ADMIN.
- Effective Permission display with readable name, technical key, description, category, risk and source role.
- Separate distinction between having a permission and being allowed to delegate it.
- Custom Role assignment preview showing permissions that will be granted.
- Delegation-scope preview based on the existing frontend policy helpers.
- Role detail view with permission explanations and delegation warnings.

The metadata is not used as an authorization source. Backend policy, Firebase Auth context, materialized authorization and Firestore Rules remain the security boundary.

## 3. Existing contract verified

- System Role hierarchy remains USER < EDITOR < ADMIN < SUPER_ADMIN < ROOT_ADMIN.
- System Roles remain separate from Custom Roles.
- Effective Permissions remain the union of the System Role and active, valid Custom Roles.
- Disabled Custom Roles remain excluded.
- Unknown permissions remain excluded.
- Custom Role forbidden permissions remain forbidden, including sensitive role-management permissions and users.delete.
- Having `roles.assign` does not by itself allow arbitrary delegation. The target Custom Role permissions must also be inside the actor's existing delegation scope.
- No Custom Role can create or assign ROOT_ADMIN.

## 4. UI behavior

### User detail (`/admin/users`)

The drawer now shows:

- identity, status and System Role explanation;
- Custom Role name, status, description and permission count;
- Effective Permissions grouped by module/category;
- readable permission name, key, description, risk and source (`SYSTEM`/`CUSTOM`);
- whether a permission is delegable in a valid Custom Role;
- assignment preview and recipient delegation preview;
- a clear warning when the selected role is outside the current actor's delegation scope.

The assignment button is disabled for a role that the current frontend policy cannot preview as valid. This is UX only; the trusted Callable Function still validates the mutation independently.

### Role detail (`/admin/roles`)

- System Role cards show name and policy description.
- Custom Role permission details show readable metadata.
- Each Custom Role shows whether its permissions are within the current actor's delegation scope.
- Forbidden or malformed permissions remain visibly blocked.

## 5. Security review

PASS:

- No actorUid, role, permission, effectivePermissions or delegation scope is sent as authorization input by the UI.
- No direct Firestore mutation was added.
- Existing Callable Functions remain responsible for Custom Role and System Role mutation.
- The UI does not grant or materialize permissions.
- Frontend previews do not weaken ROOT protection or System Role policy.
- ADMIN and SUPER_ADMIN do not receive a System Role mutation path.
- The phase does not add VIP entitlement, group membership, subscription, audit or quiz behavior.

Known limitation:

- Metadata is maintained in the frontend catalog for display. It is deliberately not imported into backend authorization code, so it cannot affect server authorization. A generated shared artifact can be considered separately if catalog maintenance becomes a concern.

## 6. Tests

| Test | Result |
|---|---|
| `npm run test:permission-explanation` | PASS |
| `npm run test:policy-conformance` | PASS |
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:system-role-tool` | PASS |
| `npm run test:rules` | PASS — 81 assertions |
| `npm run build` | PASS; existing bundle-size warning remains |
| `git diff --check` | PASS; only Git line-ending warnings |

Rules tests used a temporary `XDG_CONFIG_HOME` and the available JDK 21 process configuration. The Firebase CLI EPERM workaround did not modify system settings, Rules or production.

## 7. Next phase

Recommended next phase: **Phase 10.3 — Admin Delegated User Management**.

It must first define the exact ADMIN target scope and allowed System Role transitions. Phase 10.2 does not grant ADMIN any new authority.
