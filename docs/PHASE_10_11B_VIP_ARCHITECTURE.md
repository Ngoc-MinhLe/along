# PHASE 10.11B - VIP / ENTITLEMENT ARCHITECTURE

Status: **COMPLETED - DESIGN ONLY - WAITING FOR APPROVAL**

Date: 2026-09-27

This document is a discovery and architecture proposal. It does not implement
VIP, entitlement, membership, payment, group-management, or migration
workflows.

## 1. Current Architecture Audit

The current application uses the following trusted path:

```text
React UI
  -> Firebase Auth client
  -> Firebase Callable Function
  -> trusted actor from request.auth.uid
  -> server authorization / policy
  -> Admin SDK / Firestore
```

The existing authorization system separates:

- System roles: `USER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN`, `ROOT_ADMIN`.
- Custom roles: separate role documents and assignments.
- Effective permissions: materialized in `userAuthorizations/{uid}`.
- News content access: a separate server-side access decision based on article
  policy, entitlement data, ACL, and group membership.

The current News reader is already server-side. `listNews` and
`getNewsArticle` do not trust client-provided VIP level, role, or membership.
Direct client writes to News, entitlement, group, and authorization data are
denied by the current Rules architecture.

Relevant current collections:

- `users/{uid}`
- `roles/{roleId}`
- `userAuthorizations/{uid}`
- `newsArticles/{articleId}`
- `newsArticles/{articleId}/acl/{aclId}`
- `newsCategories/{categoryId}`
- `newsCategories/{categoryId}/acl/{aclId}`
- `contentEntitlements/{uid}`
- `newsGroups/{groupId}`
- `newsGroups/{groupId}/members/{uid}`
- `auditEvents/{eventId}`

## 2. Existing News Access Model

The stored access modes are currently:

- `PUBLIC`
- `VIP` with `minVipLevel` from 1 to 3
- `SPECIAL`
- `INHERIT` at article level, resolving the category default policy

The current reader requires a published article. Public content is readable
without a protected entitlement. Protected content also requires the trusted
actor to have `news.read`.

For VIP access, the backend reads `contentEntitlements/{uid}`, validates an
active time window and `newsLevel`, and compares the effective level with the
article requirement. For SPECIAL access, the backend checks valid `ALLOW`
ACL entries for the user or an active group membership.

The current ACL scopes are `ARTICLE` and `CATEGORY`; principals are `USER` and
`GROUP`. There is no current article-group mapping or trusted membership
mutation workflow.

Archived and unpublished articles are not public. The archive/restore
semantics from Phase 10.10 remain unchanged by this design.

## 3. Proposed Membership Model

Membership represents a user's commercial or manually assigned tier. It is
not an RBAC role and must not be written into `userAuthorizations`.

Proposed authoritative collection:

`memberships/{membershipId}`

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
  source: 'MANUAL' | 'PAYMENT',
  paymentReference: string | null,
  paymentProvider: string | null,
  transactionId: string | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

The root collection supports history, expiry queries, payment webhooks, and
multiple records. The current `contentEntitlements/{uid}` should remain a
compatible read model during migration rather than being silently replaced in
this design phase.

## 4. Proposed Tier Model

Proposed collection:

`membershipTiers/{tierId}`

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

The numeric `level` supports ordering; the stable `tierId` supports names such
as `VIP1`, `VIP2`, `VIP3`, `VIP4`, `GOLD`, or `PLATINUM` without changing the
core evaluator. Tier definitions do not contain user expiry dates. Those dates
belong to memberships.

The implementation must not use a growing chain of hard-coded `if level ===`
branches.

## 5. Proposed Entitlement Model

An entitlement is the effective grant to a content subject or scope. A unified
model is proposed so that user, group, membership, category, and article
grants share one domain rather than creating a second authorization engine.

Proposed collection:

`newsEntitlements/{entitlementId}`

```js
{
  id: string,
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
  assignedAt: Timestamp,
  paymentReference: string | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

This model is a proposal, not a replacement to be applied immediately. A
minimal compatibility alternative is to retain `contentEntitlements/{uid}`
for global tier access and add scoped grants below that document. The choice
requires owner approval because it affects migration and indexes.

## 6. Group Model

The existing `newsGroups/{groupId}` and
`newsGroups/{groupId}/members/{uid}` read path can remain the membership
source. Membership records should include active status and optional start/end
timestamps. Group administration must use trusted callable functions.

For article groups, add an optional `groupIds: string[]` field to an article
only in a separately approved implementation phase. This permits one article
to belong to multiple groups without changing the existing ACL document
shape.

Existing ARTICLE and CATEGORY ACL entries should remain backward compatible.
Group-of-articles access can then be evaluated as article `groupIds` plus an
active membership or entitlement.

## 7. Access Evaluation Algorithm

Keep one backend resolver, conceptually:

`canReadNewsArticle(trustedActor, article)`

The resolver should:

1. Require `status === 'published'` for reads.
2. Resolve direct article policy or category `INHERIT` policy.
3. Allow `PUBLIC` without an entitlement.
4. For VIP, resolve active memberships/entitlements server-side and require
   effective tier level greater than or equal to the requested level.
5. For SPECIAL, evaluate the union of valid active user, category, article,
   group, or article-group grants according to the approved contract.
6. Deny malformed, inactive, expired, revoked, or ambiguous records.
7. Serialize protected content only after authorization passes.

List queries must apply this decision before returning articles. The frontend
must never download protected content and filter it locally.

## 8. Access Precedence

The initial proposal is `ALLOW`-only with union semantics: any valid active
source can grant access. Explicit DENY is not required for the first
implementation.

If DENY is introduced later, precedence must be specified before coding. A
possible ordering is article deny, article allow, group/category allow, then
tier allow. This is an open decision and must not be inferred by an
implementation.

## 9. Security Architecture

- Actor identity always comes from `request.auth.uid`.
- Client payloads cannot select actor UID, system role, VIP level, membership,
  effective permissions, or entitlement result.
- Server-side RBAC remains the authority for administrative mutations.
- News access is a separate content-policy decision, not a Custom Role
  privilege.
- Membership and entitlement writes are trusted backend operations only.
- ROOT protection, system role invariants, and Custom Role forbidden
  permissions remain unchanged.
- Admin UI visibility is only a UX guard; callable authorization is mandatory.
- Malformed ACL, membership, tier, or entitlement data fails closed.
- No service-account credential or ID token is exposed to the browser or logs.

System Role does not currently bypass VIP/SPECIAL content checks. Preserving
that behavior is recommended unless an explicit admin-preview decision is
approved.

## 10. RBAC Permissions Proposal

These are proposed catalog entries only; none is being added in Phase 10.11B:

| Permission | Intended use |
|---|---|
| `membership.read` | Read membership/tier data in authorized admin UI |
| `membership.assign` | Assign a tier manually |
| `membership.update` | Change membership dates/tier under policy |
| `membership.revoke` | Revoke a membership |
| `entitlement.read` | Read scoped entitlement state |
| `entitlement.manage` | Grant/revoke scoped content access |
| `group.read` | Read News groups and membership summaries |
| `group.manage` | Create/update/disable News groups |
| `group.members.manage` | Add/remove group members |

Each permission needs an explicit actor/target boundary before catalog
changes. In particular, permission to manage a membership must not imply the
ability to assign system roles, modify RBAC roles, or create ROOT_ADMIN.

## 11. Manual VIP Workflow

The proposed workflow is:

```text
authorized admin selects active target user
  -> selects data-driven tier and optional dates
  -> callable derives actor from Auth
  -> server checks actor permission and target policy
  -> transaction writes membership/read model
  -> audit event is written
  -> response returns minimal safe result
```

The client sends target and requested business fields only. It does not send
actor, role, permissions, claims, or a computed entitlement.

The allowed actor set (ROOT, SUPER, ADMIN, or another delegated policy) is an
OPEN DECISION. A target ROOT_ADMIN should remain protected by the existing
root policy unless a separate security review approves otherwise.

## 12. Future Payment Architecture

Payment provider -> verified webhook -> trusted Function -> transaction
verification -> membership creation/update -> derived entitlement/read model
-> audit.

No payment provider, checkout flow, webhook, or billing secret belongs in
Phase 10.11B. The membership `source` and payment reference fields are only
future-compatible schema proposals.

## 13. Expiration Model

The backend evaluates `startsAt` and `expiresAt` on every protected read.
Expired or revoked membership denies the corresponding tier access and falls
back to the user's other valid grants. Multiple historical memberships may be
retained; the effective tier is the highest valid active tier unless product
policy chooses a single-current-membership rule.

The frontend must not decide whether an entitlement is expired.

## 14. Audit Model

Proposed audit actions:

- `MEMBERSHIP_ASSIGNED`
- `MEMBERSHIP_UPDATED`
- `MEMBERSHIP_REVOKED`
- `MEMBERSHIP_EXPIRED`
- `NEWS_ENTITLEMENT_GRANTED`
- `NEWS_ENTITLEMENT_REVOKED`

Events should contain actor, target/subject, tier or resource, scope,
before/after summaries, source, timestamp, correlation ID, and result. They
must not contain tokens, credentials, or article body content.

The current audit helper is reused. Its known post-mutation audit failure
behavior remains technical debt and is not changed here.

## 15. Migration and Backward Compatibility

- Existing PUBLIC articles remain PUBLIC.
- Existing VIP/SPECIAL/INHERIT policy values remain valid.
- Existing ARTICLE/CATEGORY ACL entries remain valid.
- Archived articles remain non-public.
- No VIP entitlement is inferred from a System Role or Custom Role.
- Existing `contentEntitlements/{uid}` remains readable while a new model is
  evaluated.
- First implementation should inventory and dry-run conversion before any
  production write.
- No production migration is part of this design phase.

The current stored `SPECIAL` value should be retained. A UI label such as
`VIP_SPECIAL` should not force a data migration unless explicitly approved.

## 16. Firestore Collection Design

| Collection | Purpose | Client direct write |
|---|---|---|
| `membershipTiers` | Tier definitions | Denied; trusted management only |
| `memberships` | Membership history/state | Denied; trusted mutation only |
| `newsEntitlements` | Scoped grants/read model | Denied; trusted mutation only |
| `contentEntitlements` | Current compatibility read model | No new client write |
| `newsGroups` | Group metadata | Denied; trusted management only |
| `newsGroups/{id}/members` | Group membership | Denied; trusted mutation only |
| `newsArticles` | Article content/policy | Existing trusted News mutations |
| `newsArticles/{id}/acl` | Article ACL | Existing trusted ACL mutations |
| `newsCategories/{id}/acl` | Category ACL | Existing trusted ACL mutations |
| `auditEvents` | Security/business audit | Server-created only |

Indexes and Rules must be designed only after the canonical model and query
patterns are approved.

## 17. Callable Functions Proposal

Potential future callables, subject to policy approval:

- `listMembershipTiers`
- `createMembershipTier`
- `updateMembershipTier`
- `assignMembership`
- `updateMembership`
- `revokeMembership`
- `listMemberships`
- `listNewsEntitlements`
- `grantNewsEntitlement`
- `revokeNewsEntitlement`
- `createNewsGroup`
- `updateNewsGroup`
- `manageNewsGroupMember`
- `setNewsArticleGroups`

These names are design candidates, not implementation commitments. Existing
News read/mutation functions should call the shared access resolver rather
than adding a parallel VIP authorization path.

## 18. Frontend UI Proposal

Potential administrative surfaces:

- tier definitions;
- user membership history and active tier;
- assign/update/revoke membership;
- scoped News entitlement/ACL management;
- group and group-member management;
- article group selection.

UI visibility follows approved RBAC permissions, but every mutation calls a
trusted Function. User-facing states must distinguish loading, expired,
revoked, denied, and malformed data without revealing protected content.

No UI implementation is included in Phase 10.11B.

## 19. Acceptance Criteria for a Future Implementation

- Anonymous users can read published PUBLIC articles.
- FREE users cannot read VIP1 without a valid entitlement.
- VIP1 reads VIP1 but not VIP2; VIP2 reads VIP1/VIP2 but not VIP3; VIP3
  reads VIP1/VIP2/VIP3.
- Adding a future tier is data-driven and does not require evaluator logic
  changes.
- Expired and revoked memberships deny access.
- Valid user/category/group/article grants work as explicitly contracted.
- Multiple valid grants resolve deterministically.
- Malformed or stale records fail closed.
- Protected article denial uses the existing not-found/contract behavior.
- Protected content is not leaked by list queries.
- Client role, membership, VIP, actor, and permission spoofing is rejected.
- Direct client writes to membership/entitlement/group data are rejected.
- Existing PUBLIC, ACL, archive, and restore behavior remains unchanged.
- Relevant audit events are written without secrets or article content.
- Emulator, Rules, authorization, frontend, and production smoke tests pass.

## 20. Risks

- Replacing `contentEntitlements/{uid}` too early could break current access.
- A second resolver could create inconsistent decisions between list and detail.
- N+1 membership/group reads can make protected News lists slow.
- Multiple active memberships need deterministic precedence.
- An implicit ADMIN delegation could become a privilege-escalation path.
- Changing `SPECIAL` or `INHERIT` storage values would require migration.
- Rules/index changes can affect existing News and Module 1 behavior.
- Audit failure after mutation can produce an operationally ambiguous result.
- Production Functions/source drift has previously caused real incidents.

## 21. Open Decisions Required

1. Use dynamic `membershipTiers` or retain hard-coded VIP1-3 compatibility
   only? Recommendation: dynamic tiers with compatibility mapping.
2. Is `memberships` the authoritative history with
   `contentEntitlements/{uid}` as a read model, or should the current singleton
   remain canonical?
3. Is `VIP_SPECIAL` only a UI/business label, or a new stored policy value?
4. Does VIP_SPECIAL grant all VIP tiers, or only scoped access?
5. Should System Roles bypass VIP/SPECIAL for admin preview? Current behavior
   is no bypass.
6. Should the first release support only ALLOW, or explicit DENY as well?
7. Is a group membership a subject relationship, a content entitlement, or
   both?
8. Can articles belong to multiple groups? Recommendation: yes, with
   `groupIds[]`.
9. Which actors may grant, update, and revoke VIP memberships?
10. Should membership history allow multiple records with one effective tier,
    or enforce one active record?
11. Should revoke be soft state transition only? Recommendation: yes.
12. Which payment provider, if any, will be supported later?
13. What audit retention and audit UI are required?
14. Which proposed permissions should enter the catalog?
15. What is the migration/read-model strategy for current entitlements?

## 22. Implementation Roadmap (Design Only)

| Phase | Scope | Main dependencies |
|---|---|---|
| 10.11B | Approve contract, schema, precedence, policy, and open decisions | Owner approval |
| 10.11C | Tier/membership/entitlement read contract and emulator tests | 10.11B |
| 10.11D | Trusted manual membership mutation and audit | 10.11C, permission policy |
| 10.11E | Groups, membership management, article-group support | 10.11C/10.11D |
| 10.11F | Integrate News access resolver and server-side list performance | 10.11C-10.11E |
| 10.11G | Admin and user-facing UI | approved callables and permissions |
| 10.11H | Migration dry-run and production readiness | all implementation phases |
| 10.11I | Controlled production deployment and smoke test | 10.11H |

Expected files are likely to include shared News access services, policy and
permission catalog files, trusted Functions, emulator tests, Rules/indexes,
News client services, admin pages, and project reports. Exact files must be
confirmed after the decisions above; no files beyond documentation are changed
in Phase 10.11B.

## Final Phase Boundary

```text
CODE CHANGE: NO
PRODUCTION DATA CHANGE: NO
FIRESTORE RULES CHANGE: NO
DEPLOY: NO
COMMIT: NO
PUSH: NO
PHASE STATUS: DESIGN ONLY - WAITING FOR APPROVAL
```
