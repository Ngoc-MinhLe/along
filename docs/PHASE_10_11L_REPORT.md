# PHASE 10.11L — Membership Tier Deployment Readiness Review

Date: 2026-09-29

## 1. Conclusion

**BLOCKED**

Historical note: this blocker was recorded before the Phase 10.11M
documentation reconciliation. Phase 10.11M adopts the already-tested
Phase 10.11J schema as canonical and updates the architecture documents; it
does not change source code or approve deployment. A fresh readiness review is
still required before production deployment.

Local implementation and regression tests pass, but deployment is blocked by an
unresolved contract mismatch between the source-of-truth architecture document
`docs/PHASE_10_11D_ARCHITECTURE_FINAL.md` and the Phase 10.11J tier schema.

No code, Rules, indexes, production data, deployment, commit or push was
performed in this review phase.

## 2. Architecture comparison

### Membership model — PASS

- Canonical membership path: `memberships/{membershipId}`.
- Membership stores `tierId`, not a copied tier level.
- Effective level is resolved from `membershipTiers/{tierId}`.
- Membership status, dates and source are server-controlled.
- The service rejects a second `ACTIVE` membership for the same user.
- Revoke is a non-destructive status transition and retains history.

### Dynamic tier behavior — PASS

- Level validation is a positive safe integer with no maximum of 3.
- VIP1/VIP2/VIP3 are not hard-coded in the tier service or UI.
- VIP10, GOLD and PLATINUM-style data can be represented without changing the
  authorization engine.
- Tiers are not copied into `systemRole`, `customRoles` or
  `userAuthorizations`.

### Architecture contract drift — BLOCKER

`docs/PHASE_10_11D_ARCHITECTURE_FINAL.md` describes a tier document with:

- `active: boolean`;
- `sortOrder`;
- the architecture's tier status vocabulary where applicable.

The current Phase 10.11J source instead defines:

- `TIER_STATUSES = { ACTIVE: 'active', INACTIVE: 'inactive' }` in
  `functions/src/membership-service.js:13`;
- stored `tierId` in addition to the document ID;
- stored `status: 'active' | 'inactive'`;
- no stored `active` field;
- no `sortOrder` field.

The normalizer at `functions/src/membership-service.js:141-159` also treats
the lowercase status as canonical and derives `active` only in the response.
This is internally consistent with Phase 10.11J tests, but it is not
unambiguously consistent with the currently documented Phase 10.11D contract.

### Required resolution before deployment

One explicit architecture decision is required:

1. approve the Phase 10.11J schema as the new canonical contract and update
   the architecture documentation; or
2. change the implementation to match Phase 10.11D (`active`, `sortOrder` and
   the approved status vocabulary), then rerun the full regression suite.

No production tier should be created before this decision. This review does
not choose between the two options.

## 3. Callable review

### Tier callables

- `listMembershipTiers`
- `createMembershipTier`
- `updateMembershipTier`
- `deactivateMembershipTier`

### Membership callables

- `listMemberships`
- `getUserMemberships`
- `createManualMembership`
- `revokeMembership`

Security review: **PASS**

- All are exported from `functions/src/index.js` through
  `membership-functions.js`.
- Callable handlers use the existing trusted actor loader.
- Actor identity comes from Firebase Auth context, not payload fields.
- Unknown fields such as `actorUid`, role, claims, level and server-managed
  metadata are rejected or ignored according to the existing allowlist.
- Tier management requires trusted `ROOT_ADMIN` or `SUPER_ADMIN` plus
  `membership.update`.
- Membership reads require the existing manager boundary and
  `membership.read`.
- Create/revoke use `membership.assign`/`membership.revoke`.
- Duplicate ACTIVE membership creation is rejected transactionally.
- Inactive tiers cannot be assigned to new ACTIVE memberships.
- Tier deactivation is soft-state and idempotent; no hard delete exists.
- Tier and membership mutations use the existing audited callable path.

## 4. Frontend review

**PASS locally**

- `/admin/membership-tiers` is routed and RBAC-gated.
- Tiers are loaded dynamically through `listMembershipTiers`.
- Create/update/deactivate use Callable Functions only.
- Tier ID is immutable during edit.
- No VIP1/VIP2/VIP3 list is hard-coded.
- Loading, error, empty, success and confirmation states exist.
- No direct Firestore write for Membership/Tier data was found.

A Vercel/frontend deployment is required later for the new route to appear in
production. It was not performed here.

## 5. RBAC and authorization

**PASS**

- Existing permissions are reused: `membership.read`, `membership.assign`,
  `membership.update`, `membership.revoke`.
- No new permission was added in Phase 10.11J.
- Membership tier/level is not an effective permission.
- Membership data is not materialized into `userAuthorizations`.
- USER/EDITOR/ADMIN denial and ROOT/SUPER authorization are covered by
  emulator tests.

## 6. News backward compatibility

**PASS / intentionally not integrated**

- `functions/src/news-service.js` continues to read legacy
  `contentEntitlements` behavior.
- The News evaluator was not changed to use Membership/Tier.
- PUBLIC/VIP/SPECIAL/INHERIT, ACL and archive/restore semantics were not
  changed by Phase 10.11J.
- News emulator and frontend regression tests pass.
- Phase 10.11J does not open VIP access for News.

## 7. Firestore Rules and indexes

### Rules

- `firestore.rules`: unchanged.
- No Membership/Tier direct client write rule was opened.
- No Rules deployment is required for the current callable-only workflow.

### Indexes

- `firestore.indexes.json` contains the existing `memberships` composite index
  for `userId ASCENDING` + `createdAt DESCENDING`.
- Tier listing reads the collection and filters/sorts in the trusted backend;
  no `membershipTiers` index is required by the current implementation.
- Based on the Phase 10.11H record, the Membership index was already deployed.
- **No additional index deployment is required for Phase 10.11J/L.**

## 8. Deployment scope after blocker resolution

After the schema contract is explicitly resolved and tests remain green, the
targeted Functions would be:

```text
listMembershipTiers
listMemberships
getUserMemberships
createManualMembership
revokeMembership
createMembershipTier
updateMembershipTier
deactivateMembershipTier
```

No full-project Functions deployment is needed.

Not included:

- Firestore Rules deployment;
- additional Firestore indexes deployment;
- News Functions or News evaluator deployment;
- RBAC/authorization rebuild Functions;
- payment/webhook/entitlement/group Functions.

The frontend route requires the normal Vercel deployment after the source is
approved and pushed. No Vercel deployment was performed here.

## 9. Production migration and prohibited mutations

- Production migration: **NO**.
- Production tier creation: **PROHIBITED in this phase**.
- Production membership creation: **PROHIBITED in this phase**.
- Production revoke/deactivate/update: **PROHIBITED in this phase**.
- Test-user creation or role changes: **PROHIBITED in this phase**.
- News mutation: **PROHIBITED in this phase**.
- `userAuthorizations`, system roles, Custom Roles and claims: **NO CHANGE**.

## 10. Test results

All requested local checks passed:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:functions:membership:emulator`
- `npm run test:functions:membership-tier:emulator`
- `npm run test:functions:emulator`
- `npm run test:functions:news:emulator`
- `npm run test:functions:system-role:emulator`
- `npm run test:functions:authorization-rebuild:emulator`
- `npm run test:authorization`
- `npm run test:rbac`
- `npm run test:policy-conformance`
- `npm run test:frontend-rbac`
- `npm run test:frontend-membership`
- `npm run test:frontend-news`
- `npm run test:system-role-tool`
- `npm run test:rules` — 84 assertions
- `npm run build`
- `git diff --check`

Rules/emulator tests used the installed JDK 21 through a temporary Firebase
CLI process configuration. No system configuration or production data was
changed. Build produced only the existing bundle-size warning.

## 11. Files and Git

Created in this review:

- `docs/PHASE_10_11L_REPORT.md`

No source, Rules, indexes or production data were changed. The report is
currently uncommitted as requested.

## 12. Final status

**PRODUCTION READY: NO**
**BLOCKED: YES — resolve the Phase 10.11D vs 10.11J tier schema contract first.**

Minimum next action: approve one canonical tier schema and update either the
architecture documentation or implementation/tests accordingly. Then rerun
this review before any Firebase/Vercel deployment or production data creation.
