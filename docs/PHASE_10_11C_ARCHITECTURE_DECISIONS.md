# PHASE 10.11C - VIP / ENTITLEMENT ARCHITECTURE DECISIONS

Status: **COMPLETED - ARCHITECTURE DECISIONS ONLY**

Date: 2026-09-28

Source of truth: `docs/PHASE_10_11B_VIP_ARCHITECTURE.md`.

This document finalizes the decisions required before implementation. It does
not implement membership, entitlement, group, payment, News, Rules, or RBAC
changes.

## 1. Membership is separate from RBAC

Membership is a News-content access attribute. It is not a System Role, Custom
Role, permission, claim, or effective permission.

The existing hierarchy remains unchanged:

```text
ROOT_ADMIN > SUPER_ADMIN > ADMIN > EDITOR > USER
```

Membership state must not be written into `userAuthorizations/{uid}` and must
not be used as an RBAC authorization shortcut.

## 2. Canonical membership model

The canonical membership source is `memberships/{membershipId}`.

```js
{
  id: string,
  uid: string,
  tierId: string,
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED',
  startsAt: Timestamp,
  expiresAt: Timestamp | null,
  assignedBy: string,
  assignedAt: Timestamp,
  source: 'MANUAL' | 'PAYMENT' | 'ADMIN',
  paymentReference: string | null,
  paymentProvider: string | null,
  externalTransactionId: string | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Phase 1 policy: one `ACTIVE` membership per user at a time. Historical
records are retained and may be `EXPIRED` or `REVOKED`. The schema remains
compatible with multiple records and future effective-tier resolution.

The current `contentEntitlements/{uid}` data is not migrated or rewritten in
this phase. Compatibility/read-model mapping must be specified before any
production migration.

## 3. Dynamic tier model

The tier source is `membershipTiers/{tierId}`.

```js
{
  id: string,
  name: string,
  level: number,
  status: 'ACTIVE' | 'DISABLED',
  description: string,
  sortOrder: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

`level` is an ordering value, not a permission name. A higher valid membership
level can satisfy a lower article requirement. `VIP_1`, `VIP_2`, and `VIP_3`
are data examples, not hard-coded authorization branches.

Adding `VIP_4`, `VIP_5`, `VIP_10`, `GOLD`, or `PLATINUM` requires tier data and
policy validation, not changes to the RBAC engine, News evaluator core, or
frontend permission checks.

`priority` is not required because level/order is sufficient for the Phase 1
single-active-membership policy. `effectiveFrom`/`effectiveUntil` belong to
membership records as `startsAt`/`expiresAt`, not to tier definitions.

## 4. News access policy

The existing vocabulary remains compatible:

- `PUBLIC`: any reader may read a published article.
- `VIP`: an active membership level greater than or equal to the article
  requirement may read it.
- `SPECIAL`: access requires an explicit valid entitlement/grant and is not
  satisfied by VIP level alone.
- `INHERIT`: article-level behavior continues to resolve the category policy.

Existing `SPECIAL` storage is retained. A future UI label such as
`VIP_SPECIAL` must not introduce a new stored mode without a separate
migration decision.

Publication state remains a prerequisite: draft and archived articles are not
publicly readable. Archive/restore semantics remain unchanged.

## 5. SPECIAL entitlement model

SPECIAL access must support these scope types without changing the meaning of
membership:

- `USER` - one user;
- `CATEGORY` - a News category;
- `ARTICLE_GROUP` - a group of articles;
- `ARTICLE` - one article ID.

The generic entitlement direction from Phase 10.11B is retained:

```js
{
  subjectType: 'USER' | 'GROUP' | 'MEMBERSHIP',
  subjectId: string,
  entitlementType: 'TIER' | 'SPECIAL_ACCESS',
  tierId: string | null,
  scopeType: 'USER' | 'CATEGORY' | 'GROUP' | 'ARTICLE_GROUP' | 'ARTICLE',
  resourceId: string | null,
  effect: 'ALLOW',
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED',
  startsAt: Timestamp,
  expiresAt: Timestamp | null,
  source: 'MANUAL' | 'PAYMENT' | 'SYSTEM',
  assignedBy: string,
  assignedAt: Timestamp
}
```

The exact collection/read-model migration remains an implementation task. No
new entitlement collection is created by this phase.

## 6. Official access precedence

The official initial policy is:

1. The article must be `published`.
2. Resolve direct article policy; if `INHERIT`, resolve category policy.
3. `PUBLIC` allows access without membership or SPECIAL entitlement.
4. `VIP` allows access only when trusted server-side membership level meets the
   article requirement.
5. `SPECIAL` requires at least one valid active explicit grant.
6. Multiple valid `ALLOW` grants are unioned; one valid grant is enough.
7. Expired, revoked, malformed, or ambiguous records do not grant access.
8. If no rule grants access, deny using the existing protected-content
   contract.

The initial model is **ALLOW-only**. Explicit `DENY` is not supported in
Phase 10.11 and cannot override an ALLOW. Adding DENY later requires a new
policy decision and tests; behavior must not depend on document iteration
order.

Examples:

- VIP2 plus a category requiring VIP1: allow, if published.
- VIP2 plus SPECIAL with no valid grant: deny.
- A valid article-specific SPECIAL grant: allow without VIP level.
- A malformed or expired grant: deny.

## 7. Server-side security boundary

```text
Frontend -> callable/read contract -> getTrustedActor()
          -> membership/tier lookup -> entitlement/ACL evaluation
          -> ALLOW or DENY -> minimal article response
```

The server does not trust client-provided actor UID, roles, membership, VIP
level, access policy, permissions, or effective permissions. Frontend cache is
UX-only. Direct client writes to News, memberships, entitlements, groups, or
authorization data remain prohibited.

## 8. RBAC policy for manual management

Only `SUPER_ADMIN` and `ROOT_ADMIN` may manage memberships and entitlements in
the initial manual phase. This is a future business-policy boundary, not an
automatic grant of permissions in this documentation-only phase.

Candidate permissions for the later implementation contract are:

- `membership.read`;
- `membership.assign`;
- `membership.update`;
- `membership.revoke`;
- `entitlement.read`;
- `entitlement.manage`.

They are not added now. Membership management cannot change system roles,
Custom Roles, userAuthorizations, ROOT_ADMIN, or the root lock.

## 9. Manual workflow

```text
ROOT/SUPER opens an active user
  -> selects a dynamic tier and dates
  -> trusted callable validates actor and target
  -> membership is created or updated
  -> prior active membership is expired/revoked by policy
  -> audit event is recorded
```

The workflow supports viewing status, extending expiry, changing tier, and
revoking without deleting historical records. Initial source is `MANUAL`.

## 10. Expiration, revoke and payment compatibility

- `status`, `startsAt`, and `expiresAt` are server-controlled.
- Expired or revoked memberships do not grant access and are retained.
- Only one membership may be `ACTIVE` per user in Phase 1.
- The frontend never decides expiry.
- Future payment flow: provider -> verified webhook -> trusted Function ->
  membership with `source: PAYMENT` -> audit.
- Nullable `paymentReference`, `paymentProvider`, and
  `externalTransactionId` keep the schema provider-neutral.

## 11. Audit contract

Reuse the existing audit infrastructure with:

- `MEMBERSHIP_ASSIGNED`;
- `MEMBERSHIP_UPDATED`;
- `MEMBERSHIP_REVOKED`;
- `MEMBERSHIP_EXPIRED`;
- `NEWS_ENTITLEMENT_GRANTED`;
- `NEWS_ENTITLEMENT_REVOKED`.

Events record actor, target/subject, tier/resource, scope, before/after
summary, source, timestamp, correlation ID when available, and result. No
tokens, credentials, or article body content are allowed.

## 12. Backward compatibility and migration

No migration is performed in Phase 10.11C. When implementation begins:

1. Inventory existing `contentEntitlements/{uid}` and News policies.
2. Run a read-only/dry-run mapping.
3. Preserve PUBLIC behavior and existing ACL behavior.
4. Preserve archived state and archive/restore semantics.
5. Preserve callable names and response behavior where possible.
6. Approve any production read-model migration separately.

## 13. Acceptance criteria

- Decisions are recorded and linked to Phase 10.11B.
- `memberships` is canonical and Phase 1 allows at most one active record per
  user.
- VIP tiers are data-driven and ordered by level.
- Manual membership assignment/update/revoke is specified for ROOT/SUPER.
- SPECIAL supports user, category, article-group, and article scopes.
- Expiration and revocation are server-side.
- Future payment compatibility is documented.
- Server-side enforcement and RBAC separation are preserved.
- PUBLIC, existing ACL, draft/archive, and restore behavior remain compatible.
- Remaining implementation decisions are explicit.

## 14. Remaining open implementation decisions

1. Exact permission catalog additions and whether callable authorization is
   permission-only, role-only, or both.
2. Whether `contentEntitlements/{uid}` becomes a derived read model and when.
3. Whether GROUP is a first-class entitlement subject or only a membership
   resolver.
4. Exact article-group representation, including `groupIds`.
5. Whether future explicit DENY is required and its precedence.
6. Whether privileged admins need a content-preview bypass.
7. Future payment provider and webhook verification requirements.
8. Whether `source: ADMIN` is distinct from `assignedBy`.

## 15. Phase boundary

Phase 10.11C creates no collections, permissions, Functions, UI, Rules,
indexes, migration scripts, or production data.

```text
CODE CHANGE: NO
PRODUCTION DATA CHANGE: NO
FIRESTORE RULES CHANGE: NO
DEPLOY: NO
COMMIT: NO
PUSH: NO
PHASE STATUS: ARCHITECTURE DECISIONS RECORDED - IMPLEMENTATION NOT STARTED
```
