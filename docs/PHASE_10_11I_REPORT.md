# PHASE 10.11I — Membership Production Smoke Test & Readiness

Date: 2026-09-29
Project: `along-6e1ce`

## 1. Result

**SMOKE TEST: BLOCKED**

The Firestore Membership index is ready, but production has no Membership tier and no suitable non-ROOT/SUPER test account. The smoke test was therefore stopped before any production mutation.

## 2. Firestore index

Read-only Firebase CLI inspection confirmed:

- collection group: `memberships`
- fields: `userId ASCENDING`, `createdAt DESCENDING`
- state: `READY`

## 3. Production read-only inspection

Active `membershipTiers` query:

- active tier count: `0`

All-tier metadata inspection:

- total tier count: `0`

User profile metadata inspection:

- total profiles found: `3`
- `ROOT_ADMIN/active`: `1`
- `SUPER_ADMIN/active`: `2`
- suitable non-ROOT/SUPER test user: **not found**

No token was read or printed. No production mutation was attempted.

## 4. Smoke-test steps not executed

Because there is no active production tier and no suitable test account, these operations were intentionally not executed:

- manual Membership creation;
- duplicate ACTIVE Membership test;
- Membership revoke;
- `listMemberships`/`getUserMemberships` mutation verification;
- `MEMBERSHIP_CREATED` or `MEMBERSHIP_REVOKED` production audit verification.

No production membership or tier was created automatically.

## 5. Unexpected changes

- News articles: unchanged.
- `contentEntitlements`: unchanged.
- `userAuthorizations`: unchanged.
- System Roles: unchanged.
- Custom Roles: unchanged.
- Firestore Rules: unchanged and not deployed in this phase.
- Membership documents: unchanged.

## 6. Required next action

An authorized operator must provide or approve:

1. one valid active Membership tier; and
2. one existing non-ROOT/SUPER production user suitable for testing.

After that approval, the controlled create → duplicate rejection → revoke smoke test can be performed through the official UI/Callable workflow only.
