# Phase 10.10C — Production Authorization Rebuild

## Status

**BLOCKED — trusted ROOT ID token is not configured in the local process.**

## 1. Rebuild implementation audit

The existing command is:

```bash
npm run rbac:rebuild-authorization -- <uid> [--dry-run]
```

It performs the following sequence:

1. Authenticates the operator through `RBAC_ROOT_ID_TOKEN` and the existing root lock.
2. Reads the target `users/{uid}` profile and current `userAuthorizations/{uid}`.
3. Builds canonical effective permissions from the existing policy/materialization engine.
4. With `--dry-run`, performs no write.
5. Without `--dry-run`, writes only `userAuthorizations/{uid}` using fields `uid`, `systemRole`, `customRoles`, `permissions`, `version` and `updatedAt`.

The command does not modify:

- `users/{uid}`;
- Firebase Auth claims;
- `systemConfig/root`;
- role assignments;
- News articles or other production collections.

The actual write is guarded by the existing trusted ROOT authorization and interactive confirmation.

## 2. Production targets identified read-only

The exact production targets are:

```text
G1x7d58ofDS9C86D85pwnR8sfpS2 — SUPER_ADMIN
h5FuFGKY3uPVG6jlaikePjIrRTy1 — SUPER_ADMIN
xITEdVIGAzXgudknovO0FROvNop1 — ROOT_ADMIN
```

All three Auth accounts are enabled.

## 3. Read-only authorization comparison

Current production state:

| Role | Current version | Current permissions | `news.restore` | Expected action |
|---|---:|---:|---|---|
| SUPER_ADMIN | 2 | 30 | missing | add `news.restore` |
| SUPER_ADMIN | 2 | 30 | missing | add `news.restore` |
| ROOT_ADMIN | 1 | 30 | missing | add `news.restore` |

For all three documents:

- exactly `news.restore` is missing from the expected catalog;
- no unexpected permission was found;
- no existing permission is scheduled for removal;
- system role is consistent;
- expected next materialized permission count is 31.

The root lock and role/profile data were not changed.

## 4. Dry-run / credential result

`RBAC_ROOT_ID_TOKEN` is not present in the local process environment. Therefore the existing command cannot pass its trusted ROOT boundary, including its `--dry-run` entry point.

A direct read-only authorization plan was used only to verify the expected diff. No Admin SDK write was used as a bypass.

## 5. Authorization rebuild

**AUTHORIZATION REBUILD: BLOCKED**

No rebuild was executed. No production document was written.

After a fresh ROOT ID token is configured locally, the approved workflow is to run the existing command separately for the three exact UIDs above, using `--dry-run` first and then the confirmed write command for each target.

The token must remain local and must not be sent in chat, committed or logged.

## 6. Tests

Not rerun in this blocked checkpoint because no source code changed and the blocking condition is missing local authorization credential. Previous Phase 10.10/10.10B regression results remain recorded in the prior reports.

## 7. Production safety

```text
PRODUCTION AUTHORIZATION WRITE: NO
PRODUCTION ARTICLE DATA CHANGED: NO
UNARCHIVE CALLED: NO
ARCHIVE CALLED: NO
FIRESTORE RULES CHANGED: NO
CODE CHANGED: NO
FUNCTION DEPLOYED: NO (already deployed in Phase 10.10B)
COMMIT: NO
PUSH: NO
```

## 8. Next action

Configure a fresh Firebase ID token for the current ROOT locally as `RBAC_ROOT_ID_TOKEN`, without exposing it, then rerun the dry-run and approval-gated rebuild workflow. Do not perform the production browser restore smoke test until all three authorization documents verify `news.restore`.
