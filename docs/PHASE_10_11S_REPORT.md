# PHASE 10.11S — Production Authorization Materialization

## Status

**DEPLOYMENT: PASS**
**AUTHORIZATION REBUILD: PENDING MANUAL ROOT ACTION**

The rebuild Function was deployed, but no production authorization mutation was initiated by this session. The remaining step must be performed through the existing authenticated ROOT workflow.

## Function deployment

Only this Function was deployed:

`rebuildProtectedSystemRoleAuthorizations`

Deployment result: **PASS**

- Project: `along-6e1ce`
- Region: `us-central1`
- Runtime: Node.js 22
- Platform: Gen 2
- State: `ACTIVE`
- Source hash before: `3dffc9662118b2f8e796f242773db615efcc6b3e`
- Source hash after: `dd99c3577d66a691cc29688905b81d50c546cab6`

No other Function, Firestore Rules, Firestore indexes, Hosting, or Vercel deployment was performed.

## Authentication boundary

An unauthenticated read-only callable request returned:

```text
HTTP 401
UNAUTHENTICATED
Authentication is required.
```

The Function continues to require the trusted Firebase Auth context and server-side ROOT checks.

## Existing ROOT workflow

The repository already contains the approved workflow:

- Production route: `/admin/users`
- Existing control: `Đồng bộ authorization ROOT/SUPER`
- Callable payload: `{}`
- Callable: `rebuildProtectedSystemRoleAuthorizations`

The Function is designed to rebuild only active protected `ROOT_ADMIN` and `SUPER_ADMIN` authorizations and write only their `userAuthorizations` documents.

## Production authorization state

No rebuild has been called yet in this phase. Therefore the previously observed production state remains unchanged until the ROOT action is completed:

- ROOT/SUPER authorization documents: not changed by this phase.
- Membership/Entitlement permissions: pending read-back.
- Expected permission count after rebuild: 37 per protected account.
- News, Membership, Tier, Roles, Claims, Profiles, and Rules: unchanged.

## Required manual action

Using the existing ROOT_ADMIN session, open:

`https://lichvannien-phi.vercel.app/admin/users`

Click **“Đồng bộ authorization ROOT/SUPER”** and confirm. Do not use a token, Admin SDK script, or direct Firestore write.

After that action, the next verification must read back all three protected accounts and confirm:

- 37 permissions each;
- all six Membership/Entitlement permissions;
- unchanged system roles and active status;
- unchanged custom roles;
- no News/Membership/Tier data changes.

## Source/Git safety

No source code was changed in this deployment step. Existing uncommitted Phase 10.11R files remain untouched:

- `src/App.jsx`
- `src/layouts/AdminLayout.jsx`
- `scripts/membership-frontend-test.mjs`
- `docs/PHASE_10_11R_REPORT.md`

No commit or push was performed.

## Production safety

- Production membership created: **NO**
- Production tier created: **NO**
- Production user created: **NO**
- Direct `userAuthorizations` write: **NO**
- News data changed: **NO**
- Firestore Rules changed: **NO**
- Rebuild mutation: **PENDING MANUAL ROOT ACTION**
