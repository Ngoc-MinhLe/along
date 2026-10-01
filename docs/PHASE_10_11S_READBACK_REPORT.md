# PHASE 10.11S — POST-REBUILD PRODUCTION READ-BACK REPORT

## Scope and safety

This report records read-only verification after the ROOT/SUPER authorization
rebuild was completed from the production UI. No production mutation, deploy,
source-code edit, commit, or push was performed for this read-back.

Production project: `along-6e1ce`
Protected accounts checked:

- ROOT_ADMIN: `xITEdVIGAzXgudknovO0FROvNop1`
- SUPER_ADMIN: `G1x7d58ofDS9C86D85pwnR8sfpS2`
- SUPER_ADMIN: `h5FuFGKY3uPVG6jlaikePjIrRTy1`

## Authorization read-back

All three `users/{uid}` profiles and `userAuthorizations/{uid}` documents
exist. The profile role, authorization role, and Auth custom-claim role agree
for every account.

| Account | Profile/Auth role | Status | Profile customRoles | Auth version | Permissions |
|---|---|---|---|---:|---:|
| `xITEdVIGAzXgudknovO0FROvNop1` | `ROOT_ADMIN` | `active` | `[]` | 3 | 37 |
| `G1x7d58ofDS9C86D85pwnR8sfpS2` | `SUPER_ADMIN` | `active` | `[FILE_IMPORT_TESTER]` | 4 | 37 |
| `h5FuFGKY3uPVG6jlaikePjIrRTy1` | `SUPER_ADMIN` | `active` | `[TEST_ADMIN]` | 4 | 37 |

The authorization documents contain the complete canonical 37-permission
catalog for their protected system role. The six Membership/Entitlement
permissions are present for all three accounts:

- `membership.read`
- `membership.assign`
- `membership.update`
- `membership.revoke`
- `entitlement.read`
- `entitlement.manage`

The exact 37-permission list read from each authorization document is identical
for ROOT_ADMIN and both SUPER_ADMIN accounts:

```text
approval.create
approval.review
audit.read
calendar.export
calendar.import
calendar.search
entitlement.manage
entitlement.read
membership.assign
membership.read
membership.revoke
membership.update
news.create
news.delete
news.publish
news.read
news.restore
news.update
quiz.exam.create
quiz.exam.delete
quiz.exam.publish
quiz.exam.update
quiz.question.create
quiz.question.delete
quiz.question.read
quiz.question.update
roles.assign
roles.create
roles.delete
roles.disable
roles.read
roles.revoke
roles.update
users.create
users.delete
users.read
users.update
```

The remaining permissions were also checked against the current protected-role
catalog in `functions/src/policy.js`; no canonical permission was missing and
no unexpected permission was present.

## Canonical source comparison

The read-back was compared with:

- `functions/src/policy.js`
- `src/services/rbac/permissions.js`
- `src/services/rbac/policy.js`

The backend protected-role catalog and frontend permission constants contain the
same 37 permission names, including all six new permissions. The frontend
policy keeps Membership permissions separate from system roles; it does not
turn Membership into a new system role or custom role.

## Rebuild audit evidence

The latest production `auditEvents` record for
`AUTHORIZATION_REBUILT` is:

- Actor: `xITEdVIGAzXgudknovO0FROvNop1`
- Result: `SUCCESS`
- Timestamp: `2026-09-30T02:53:00.289Z`
- `affectedUserCount`: 3
- `updatedUserCount`: 3
- `unchangedUserCount`: 0

This matches the UI result: three accounts updated and zero already correct.
The rebuild function's documented write scope is `userAuthorizations/{uid}`;
the read-back shows no role or profile mutation associated with the rebuild.

## Production collection safety read-back

| Collection | Current document count | Result |
|---|---:|---|
| `membershipTiers` | 0 | unchanged; no tier was created |
| `memberships` | 0 | unchanged; no membership was created |
| `contentEntitlements` | 0 | no entitlement data present |
| `newsArticles` | 3 | no News mutation was performed |

The three protected profiles retain their current custom-role assignments, and
the rebuild did not add `customRoles` to the ROOT profile. No Membership, Tier,
News, entitlement, Rules, Auth-claim, or user-profile mutation was performed
as part of this read-back.

## Frontend PermissionGate verification

Source-level verification confirms:

- `/admin/memberships` is gated by `PERMISSIONS.MEMBERSHIP_READ`.
- `/admin/membership-tiers` is gated by `PERMISSIONS.MEMBERSHIP_UPDATE`.
- The admin navigation uses the same RBAC permission constants.
- The route and navigation changes are present in the current local source.

The authenticated production browser session was not automated in this
read-only step, so the source-level gate result is recorded rather than
claiming a new browser interaction.

## Final status

- READ-BACK: PASS
- 37 PERMISSIONS: PASS
- 6 MEMBERSHIP PERMISSIONS: PASS
- ROLE/STATUS/CUSTOM ROLE: UNCHANGED
- MEMBERSHIP TIER DATA: UNCHANGED
- MEMBERSHIP DATA: UNCHANGED
- NEWS DATA: UNCHANGED
- CODE CHANGE: NO
- PRODUCTION MUTATION: NO
- DEPLOY: NO
- COMMIT: NO
- PUSH: NO
