# PHASE 10.11V - PRODUCTION READINESS REPORT

## Executive summary

**READY FOR DEPLOYMENT**

Phase 10.11U is internally consistent and has passed the required local
regression suite. This conclusion authorizes only a later deployment review;
no deployment or production mutation was performed in Phase 10.11V.

## Architecture verification

### Canonical Membership flow

The production-target architecture is:

```text
request.auth.uid
  -> memberships/{membershipId}
  -> membershipTiers/{tierId}
  -> tier.status + tier.level
  -> News accessPolicy.minVipLevel
  -> server-side allow/deny
```

Verified in `functions/src/membership-service.js`:

- Membership documents are read from `memberships/{membershipId}`.
- Membership data carries `userId` and `tierId`; the tier level is not copied
  into the Membership document.
- `readActiveMembership()` rejects more than one ACTIVE Membership for a user.
- `isMembershipEffective()` rejects non-ACTIVE, future-start and expired
  Memberships.
- `resolveEffectiveMembership()` resolves `membershipTiers/{tierId}`, requires
  a valid tier and requires `status === 'active'`.
- Tier levels are positive safe integers and are not capped at 3.

The optional `active` value in read normalization is derived/consistency-
checked from `status`; create/update writes use the canonical `status` field.
`status` remains the source of truth.

### News evaluator

Verified in `functions/src/news-service.js`:

- `canReadArticle()` resolves canonical Membership server-side.
- VIP access is allowed when `tier.level >= policy.minVipLevel`.
- `minVipLevel` accepts any positive safe integer.
- The frontend cannot provide Membership level, tier status, entitlement or
  authorization authority.
- PUBLIC, SPECIAL and category INHERIT/ACL behavior remains on the existing
  evaluator path.

### Legacy fallback precedence

Current behavior is explicitly:

1. A sufficient effective canonical Membership grants access.
2. If it does not grant the requested level, the existing validated
   `contentEntitlements/{uid}` record is evaluated as a compatibility fallback.
3. If neither source grants access, the protected article is denied.

This preserves legacy entitlement-only users. A legacy entitlement cannot be
greater than its existing validated level range of 0..3. If future policy
requires malformed/insufficient canonical Membership data to suppress even a
valid legacy grant, that must be a separately approved policy decision; it is
not changed in this phase.

## Backward compatibility matrix

| Scenario | Result verified |
|---|---|
| PUBLIC article | Existing public behavior passes |
| Legacy entitlement only | Passes through legacy fallback |
| Active Membership level 1/2/10 | Grants matching or lower VIP levels |
| Level below required | Denied unless valid legacy fallback grants |
| Level 10 vs required 11 | Denied |
| Two different tier IDs with same level | Both resolve by level and pass matching policy |
| Expired Membership | Denied |
| REVOKED Membership | Denied |
| Future-start Membership | Denied |
| Inactive tier | Denied |
| SPECIAL/ACL/INHERIT | Existing behavior preserved |

## Security review

PASS:

- Membership and tier data are read by trusted backend code only.
- No Membership level, tierId, entitlement or role supplied by the client is
  used as authorization authority for News reads.
- News callable functions use the existing trusted callable boundary.
- RBAC hierarchy, Custom Roles, `userAuthorizations` and system-role
  protection are unchanged.
- Membership is not materialized into RBAC permissions or system roles.
- No direct client News/Membership write path was added.
- Existing ACL behavior is retained; no DENY semantics were introduced.
- Malformed Membership/tier data fails closed for the canonical Membership
  grant path.

## Regression results

| Check | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS |
| `npm run test:functions:membership:emulator` | PASS |
| `npm run test:functions:membership-tier:emulator` | PASS |
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
| `npm run build` | PASS |
| `git diff --check` | PASS |

The emulator and Rules checks used a temporary Firebase CLI configuration and
the locally installed JDK 21. No persistent environment configuration was
changed. The build emitted the existing large-bundle warning only.

## Deployment scope if separately approved

### Firebase Functions

The source dependency `functions/src/news-service.js` is used by all News
callables. The exact News Functions exported by `functions/src/index.js` and
requiring the updated evaluator are:

- `listNews`
- `getNewsArticle`
- `listNewsManagement`
- `getNewsManagementArticle`
- `listNewsCategories`
- `listNewsUsers`
- `listNewsGroups`
- `createNewsArticle`
- `updateNewsArticle`
- `archiveNewsArticle`
- `unarchiveNewsArticle`
- `publishNewsArticle`
- `unpublishNewsArticle`
- `setNewsAccessPolicy`
- `createNewsCategory`
- `updateNewsCategory`
- `deleteNewsCategory`
- `setNewsAclEntry`
- `removeNewsAclEntry`

The updated `membership-service.js` is bundled through the News dependency
path. No Membership callable contract changed in Phase 10.11U, so the five
Membership read/mutation functions and three tier-management functions do not
need to be redeployed solely to enable News access. They may be redeployed in
a separately approved synchronized release if the project deployment policy
requires every shared source revision to be identical.

### Firebase configuration

- Runtime: Node.js 22, from `firebase.json` and `functions/package.json`.
- Region: existing callable region `us-central1`.
- Firestore Rules: **no deployment required**; Rules were not changed.
- Firestore indexes: **no deployment required for Phase 10.11U**; the existing
  Membership composite index is already present in `firestore.indexes.json`.
- Frontend/Vercel: **no deployment required for the evaluator change**; the
  decision is server-side.

## Production safety

```text
PRODUCTION DATA CHANGED: NO
PRODUCTION MEMBERSHIP CHANGED: NO
PRODUCTION TIER CHANGED: NO
NEWS DATA CHANGED: NO
RBAC/userAuthorizations CHANGED: NO
FIRESTORE RULES CHANGED: NO
FIREBASE DEPLOY: NO
VERCEL DEPLOY: NO
COMMIT: NO
PUSH: NO
```

## Git state

- Branch: `main`
- HEAD: `59e450cec4b231fc0e448dc25b5bfb54685a7133`
- `origin/main`: `59e450cec4b231fc0e448dc25b5bfb54685a7133`
- Working tree: not clean; it contains the existing Phase 10.11T changes,
  Phase 10.11U source/tests, and untracked Phase 10.11R/S/T/U reports.
- No commit or push was performed.

## Risks and open decisions

- Production News Functions still need a separately approved deployment before
  production can use the Membership-aware evaluator.
- No production Membership/Tier smoke test is appropriate in this phase.
- Legacy fallback precedence is preserved as documented above. Changing it to
  deny on any invalid/insufficient canonical Membership would be a policy
  change requiring new acceptance tests.
- Browser E2E and production smoke verification remain pending deployment.

## Conclusion

**READY FOR DEPLOYMENT**

This is a readiness result only. Phase 10.11V performed no deployment,
production mutation, Rules change, commit or push.
