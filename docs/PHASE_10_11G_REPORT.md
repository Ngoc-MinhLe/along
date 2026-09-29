# PHASE 10.11G - MEMBERSHIP PRODUCTION READINESS & DEPLOYMENT REVIEW

Date: 2026-09-29

## Conclusion

**PRODUCTION READY**

This was a review-only checkpoint. No Firebase/Vercel deployment, production
write, membership/tier fixture, commit, or push was performed.

## Architecture review

- Canonical memberships are stored at `memberships/{membershipId}`.
- A membership stores `tierId`, not a copied tier level.
- `membershipTiers/{tierId}.level` is the canonical level source.
- The service enforces at most one `ACTIVE` membership per user while
  retaining revoked history.
- Tiers are data-driven and dynamic; no `VIP1`/`VIP2`/`VIP3` hard-code was
  found in the Membership implementation or UI.
- Membership is separate from `systemRole`, Custom Roles and
  `userAuthorizations`; it is not an RBAC permission substitute.

## Backend security and integrity

Reviewed callables:

- `listMembershipTiers`
- `listMemberships`
- `getUserMemberships`
- `createManualMembership`
- `revokeMembership`

The actor is derived from Firebase Auth through the existing trusted actor
loader. Payload values such as `actorUid`, role, permission, tier level and
claims are not trusted. Management reads/mutations are restricted to the
existing ROOT_ADMIN/SUPER_ADMIN boundary. USER, EDITOR and ADMIN are denied.

Input validation covers unknown fields, target users, tier existence and
active status, timestamps, expiration, duplicate ACTIVE memberships and
invalid revoke transitions. Revoke is idempotency-safe by refusing a second
non-ACTIVE transition and retains membership history. Audit events
`MEMBERSHIP_CREATED` and `MEMBERSHIP_REVOKED` are written through the existing
audit path. Malformed tier/membership data fails closed or is excluded from
trusted results.

The frontend uses callable services only; it has no direct Firestore write for
Membership data.

## News compatibility

Phase 10.11E/F did not change the News evaluator, News Rules, News data or
legacy `contentEntitlements` behavior. Membership is not yet integrated into
News access, SPECIAL entitlement, group membership or payment. Existing News
regression tests pass.

## Frontend review

`/admin/memberships` is protected by `membership.read`, loads tiers
dynamically, and provides bounded listing, per-user history, manual creation
and ACTIVE revoke. Loading, error, empty, success and busy states are present.
The route and navigation use the existing RBAC gates; no VIP tier list is
hard-coded.

## Rules and indexes

- `firestore.rules`: unchanged; direct client writes to the unmatched
  `memberships` collection remain denied by default, and no Rules deployment
  is required for this implementation.
- `firestore.indexes.json`: contains the Membership collection-group index
  needed by per-user history reads (`userId ASCENDING`, `createdAt DESCENDING`).
  This index must be deployed before production use of that query.

## Deployment plan (not executed)

Functions to deploy, all in `us-central1`:

```text
listMembershipTiers
listMemberships
getUserMemberships
createManualMembership
revokeMembership
```

After explicit approval, the targeted command is:

```bash
firebase deploy --only functions:listMembershipTiers,functions:listMemberships,functions:getUserMemberships,functions:createManualMembership,functions:revokeMembership --project along-6e1ce
```

The index can be deployed separately:

```bash
firebase deploy --only firestore:indexes --project along-6e1ce
```

Do not deploy Firestore Rules for this phase. The frontend/Vercel deployment
must be handled separately through the project’s normal source push/deployment
workflow. No production migration or test membership is required for the
review; production tier documents must exist before a manual membership can
be created. Rollback is a targeted function redeploy; revoked memberships are
non-destructive and retained as history.

## Test results

| Test | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS |
| `npm run test:functions:membership:emulator` | PASS |
| `npm run test:functions:emulator` | PASS |
| `npm run test:functions:news:emulator` | PASS |
| `npm run test:functions:system-role:emulator` | PASS |
| `npm run test:functions:authorization-rebuild:emulator` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:policy-conformance` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-membership` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:system-role-tool` | PASS |
| `npm run test:rules` | PASS - 84 assertions |
| `npm run build` | PASS; bundle-size warning only |
| `git diff --check` | PASS; existing CRLF warnings only |

Rules and emulator tests used JDK 21 at the installed Android Studio path and
a temporary Firebase CLI home. System configuration was not changed. The
CLI’s unauthenticated/MOTD warnings did not prevent the tests from running.

## Known limitations

- Membership is not yet connected to the News evaluator.
- SPECIAL entitlement, group membership, payment/subscription and expiration
  automation remain outside this phase.
- Reads use bounded limits and `hasMore`; cursor pagination is not yet a
  separate UI/API workflow.
- No production browser smoke test or production membership data was created.

## Files changed by this review

Created:

- `docs/PHASE_10_11G_REPORT.md`

Updated:

- `docs/PROJECT_STATUS.md`
- `docs/NEXT_PHASE_ROADMAP.md`

Existing Phase 10.11E/F source and documentation changes remain in the working
tree and were not rewritten or committed by this phase.

## Safety declaration

- Production data changed: **NO**
- Firebase/Vercel deploy: **NO**
- Firestore Rules changed: **NO**
- Source logic changed by Phase 10.11G: **NO**
- Commit/push: **NO**
