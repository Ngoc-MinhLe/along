# PHASE 10.11D - VIP / ENTITLEMENT ARCHITECTURE FINAL

Status: **ARCHITECTURE FINALIZED - IMPLEMENTATION NOT STARTED**

Date: 2026-09-29

This document finalizes the implementation contract for the next phase. It
does not create collections, permissions, Functions, UI, Rules, indexes,
migrations, or production data.

## 1. Canonical membership model

Canonical membership documents are stored at:

`memberships/{membershipId}`

```js
{
  userId: string,
  tierId: string,
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED',
  startsAt: Timestamp,
  expiresAt: Timestamp | null,
  source: 'MANUAL' | 'PAYMENT',
  assignedBy: string,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  paymentReference: string | null
}
```

The membership does **not** store `level`. The effective level is resolved
from `membershipTiers/{tierId}.level`.

Phase 1 invariant: a user may have at most one `ACTIVE` membership. Expired
and revoked history is retained; old membership documents are never deleted by
the manual workflow.

## 2. Data-driven tier model

Tier definitions are stored at:

`membershipTiers/{tierId}`

```js
{
  name: string,
  level: number,
  active: boolean,
  description: string | null,
  sortOrder: number | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

`level` is an ordering value. A membership with level `N` can read content
requiring a level less than or equal to `N`.

VIP1, VIP2, VIP3, VIP4, VIP5, VIP10, GOLD, and PLATINUM are data examples,
not permission names or hard-coded branches. The evaluator uses comparison:

```text
effectiveMembershipLevel >= requiredArticleLevel
```

Adding a tier must not require changes to the RBAC engine, permission catalog,
or core News evaluator.

## 3. RBAC separation and management policy

VIP membership is not any of the following:

- System Role;
- Custom Role;
- Firebase Auth claim;
- `userAuthorizations` permission;
- `news.read` replacement.

The existing hierarchy remains unchanged:

```text
ROOT_ADMIN > SUPER_ADMIN > ADMIN > EDITOR > USER
```

Only `ROOT_ADMIN` and `SUPER_ADMIN` may manage membership and entitlement in
the initial phase.

The finalized catalog additions are:

- `membership.read`
- `membership.assign`
- `membership.update`
- `membership.revoke`
- `entitlement.read`
- `entitlement.manage`

Only `ROOT_ADMIN` and `SUPER_ADMIN` receive the membership mutation and
entitlement-management permissions. No `vip1.read`, `vip2.read`, or similar
permission is created.

## 4. Legacy compatibility

`contentEntitlements/{uid}` is not deleted in this phase. It remains a legacy
fallback/read model during transition.

The new evaluator must:

1. Prefer the canonical active membership and its tier definition.
2. Fall back to the existing valid `contentEntitlements/{uid}` record when no
   canonical membership grants access.
3. Preserve existing `newsLevel` values `0..3`.
4. Preserve current `PUBLIC`, `VIP`, `SPECIAL`, and `INHERIT` behavior.
5. Preserve draft, published, archived, and restore semantics.

No new membership workflow writes to `contentEntitlements/{uid}` unless a
separate compatibility requirement is demonstrated. A later migration phase
may retire the legacy model.

## 5. News access policy

### PUBLIC

Every reader may access a published PUBLIC article.

### VIP

The article stores a required numeric level, represented compatibly by the
existing `minVipLevel` field. Validation accepts any integer `>= 1`; it has no
upper bound of 3.

The server resolves the user's active membership, reads its tier level, and
allows access only when:

```text
membershipTiers.level >= article.minVipLevel
```

Legacy `contentEntitlements.newsLevel` remains a compatibility fallback.

### SPECIAL

VIP level alone never grants SPECIAL access. A valid explicit grant is
required.

### INHERIT

Existing article-to-category policy inheritance remains unchanged.

## 6. Canonical SPECIAL entitlement model

Canonical entitlement documents are stored at:

`contentEntitlements/{entitlementId}`

```js
{
  principalType: 'USER' | 'GROUP',
  principalId: string,
  effect: 'ALLOW',
  scopeType: 'ARTICLE' | 'CATEGORY' | 'ARTICLE_GROUP',
  scopeId: string,
  startsAt: Timestamp,
  expiresAt: Timestamp | null,
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED',
  source: 'MANUAL' | 'PAYMENT',
  assignedBy: string,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  paymentReference: string | null
}
```

`GROUP` is a principal, not a content scope. `ARTICLE_GROUP` is a content
scope. Article group membership is represented by an article field such as:

```js
articleGroupIds: string[]
```

This extends the existing ACL/access evaluation; it does not create a second
ACL engine.

Existing `contentEntitlements/{uid}` documents are legacy records because the
same collection name is being reused with a new document contract. The
implementation must distinguish the legacy UID-shaped document from canonical
entitlement documents without interpreting malformed data as an ALLOW.

## 7. Access precedence

Phase 10.11D supports `ALLOW` only. Explicit `DENY` is intentionally not
implemented.

The evaluator order is:

1. Reject missing, malformed, draft, or archived article data according to
   the existing read contract.
2. Resolve direct article policy or category policy for `INHERIT`.
3. Allow PUBLIC when the article is published.
4. For VIP, require an active canonical membership whose tier level meets the
   required article level; then use the legacy entitlement fallback if needed.
5. For SPECIAL, union valid active ALLOW grants from USER/GROUP principals and
   ARTICLE/CATEGORY/ARTICLE_GROUP scopes.
6. Ignore expired, revoked, malformed, inactive, or invalid grants.
7. Deny when no valid rule grants access.

If multiple valid ALLOW grants exist, any one valid grant is sufficient.
Document iteration order must not affect the result.

Explicit DENY and deny precedence are a future architecture phase.

## 8. Server-side security boundary

```text
Frontend
  -> Firebase Callable/read contract
  -> getTrustedActor()
  -> membership/tier lookup
  -> entitlement/access evaluation
  -> minimal response or denial
```

The server must not trust client-provided actor UID, role, permission,
membership, tier, level, status, expiration, or access decision. Direct client
writes to News, membership, entitlement, and authorization data remain denied.

The frontend may read dynamic tiers for display and submit policy identifiers,
but the backend validates every identifier and all access conditions.

## 9. Dynamic tier read contract

The implementation will add the read-only callable:

`listMembershipTiers`

Authenticated users may read active tiers. The response contains only:

```js
{
  id,
  name,
  level,
  description,
  active
}
```

The callable does not permit client writes and does not accept an actor UID or
permission payload. Tier CRUD is outside this phase.

## 10. Manual membership workflow

Only these mutation callables are in scope:

- `createManualMembership`
- `revokeMembership`

`createManualMembership` validates:

- authenticated trusted actor;
- actor is ROOT_ADMIN or SUPER_ADMIN through current server policy;
- target user exists and is valid under policy;
- target tier exists and is active;
- `startsAt` and optional `expiresAt` are valid;
- no other ACTIVE membership exists for the target;
- client does not supply actor, status, effective level, claims, or
  effective permissions.

It writes a canonical membership with `source: MANUAL`.

`revokeMembership` changes status to `REVOKED` and never deletes history.
Expiration is evaluated by the reader; no automatic renewal or payment
workflow is included.

## 11. Audit

Membership and entitlement mutations must use the existing audit helper. The
minimum actions are:

- `MEMBERSHIP_CREATED`
- `MEMBERSHIP_REVOKED`

If update/renew is added later, it gets a separate audited action. Audit data
contains actor UID, actor role, target/resource, action, result, timestamp,
and source. It must not contain tokens, credentials, or article body content.

## 12. Frontend contract

Frontend must call `listMembershipTiers` rather than hard-code VIP1/VIP2/VIP3.
The News editor may send an access policy with a required numeric level or
validated tier identifier according to the final callable contract; the server
remains authoritative.

The initial admin membership UI is available only to ROOT_ADMIN and
SUPER_ADMIN and supports:

- viewing a user;
- assigning a dynamic tier;
- choosing start/expiry dates;
- viewing current status;
- revoking membership.

No direct Firestore write is permitted.

## 13. Migration and production safety

This architecture-finalization phase performs no migration and no production
write. Implementation must begin with emulator fixtures and a read-only legacy
inventory.

Existing PUBLIC articles, ACLs, access policies, and archive/restore behavior
must remain unchanged. Production deployment and legacy cleanup require later
reviewed phases.

## 14. Acceptance criteria for implementation

- Tier level is data-driven and supports VIP10 without engine changes.
- Membership stores `tierId`, not a duplicate level.
- At most one ACTIVE membership exists per user.
- Create/revoke manual workflow works for ROOT/SUPER only.
- Expired/revoked membership denies VIP access.
- PUBLIC remains readable.
- VIP level 1..N comparison works.
- SPECIAL USER, GROUP, CATEGORY, ARTICLE, and ARTICLE_GROUP grants work.
- Explicit DENY is not implemented.
- Existing ACL and legacy `contentEntitlements/{uid}` behavior remains valid.
- Draft/archived articles remain non-public.
- Frontend reads dynamic tiers.
- All mutations are trusted callable operations and audited.
- Existing RBAC, News, Rules, and regression tests remain passing.

## 15. Implementation plan

Expected implementation areas, subject to source-level review:

1. `functions/src/membership-service.js` for membership normalization,
   active membership lookup, expiry, and mutations.
2. A membership Functions module and `functions/src/index.js` exports for the
   two mutation callables and `listMembershipTiers`.
3. `functions/src/policy.js` plus authorization materialization for the six
   finalized permissions.
4. The existing News access evaluator in `functions/src/news-service.js`,
   extended rather than duplicated.
5. Existing audit catalog/helper.
6. Frontend News service/editor and a restricted membership UI.
7. Emulator, authorization, News, Rules, and frontend regression tests.

Exact edits must be confirmed during implementation. No files outside
documentation are changed by this architecture-finalization phase.

```text
ARCHITECTURE: FINALIZED
IMPLEMENTATION: NOT STARTED
PRODUCTION DATA: NO CHANGE
DEPLOYMENT: NO
FIRESTORE RULES: NO CHANGE
COMMIT: NO
PUSH: NO
```
