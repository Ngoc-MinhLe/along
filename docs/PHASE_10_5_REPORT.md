# Phase 10.5 — Audit & Security Event Foundation

Status: **COMPLETED locally**

Date: 2026-09-24

## Scope

Phase 10.5 adds a server-side audit-event foundation for existing trusted
callable mutations. It does not add a new authorization engine, change RBAC
policy, deploy services, or write production data.

## Implementation

- Added `functions/src/audit.js` as the single audit writer/query foundation.
- Integrated audit recording with existing trusted mutation paths:
  - `setSystemRole`
  - `updateUserProfile`
  - Custom Role create/update/enable/disable/delete/assign/revoke
  - News article/category/access-policy/ACL mutations
- The actor is loaded through the existing trusted actor loader. The audit
  event actor UID is never taken from request payload data.
- The action catalog is centralized and limited to existing mutation actions.
- Event payloads contain only safe identifiers, role/result/reason metadata and
  a server-generated correlation ID. Passwords, tokens, claims, permissions,
  secrets and full request payloads are excluded.
- Outcomes are `SUCCESS`, `DENIED`, or `FAILED`. A mutation does not return a
  success response when its required audit event cannot be recorded.
- Added a bounded Admin SDK query helper for actor, target, action, resource and
  time-window filtering.
- Added emulator/unit coverage for successful, denied and failed operations,
  sensitive-field exclusion, trusted actor derivation and audit default deny.

## Data model

Audit documents are stored as `auditEvents/{eventId}` with:

`eventId`, `occurredAt`, `actorUid`, `actorSystemRole`, `action`,
`resourceType`, `result`, `source`, `correlationId`, and optional `resourceId`,
`targetUid`, `metadata`, and `reasonCode`.

The client has no direct read/write rule for `auditEvents`; existing default
deny therefore protects the collection. No `firestore.rules` change was made.

## Test results

- `npm run check:functions` — PASS
- `npm run test:functions` — PASS
- `npm run test:functions:user:emulator` — PASS
- `npm run test:functions:system-role:emulator` — PASS
- `npm run test:functions:emulator` — PASS
- `npm run test:functions:news:emulator` — PASS
- `npm run test:policy-conformance` — PASS
- `npm run test:permission-explanation` — PASS
- `npm run test:rbac` — PASS
- `npm run test:authorization` — PASS
- `npm run test:frontend-rbac` — PASS
- `npm run test:frontend-news` — PASS
- `npm run test:system-role-tool` — PASS
- `npm run test:rules` — PASS, 84 assertions, using temporary Firebase CLI configuration and local JDK 21 for this process
- `npm run build` — PASS
- `git diff --check` — PASS

## Security review

- Audit writes are server-side through Admin SDK only.
- Existing actor, permission, ROOT protection, materialization and mutation
  boundaries remain the source of truth.
- The audit layer does not grant, remove or calculate permissions.
- Direct client creation, update and deletion of audit events is denied by the
  current Rules configuration.
- Mutation-specific rollback behavior remains intact for mutation failures.

## Known limitations

- Audit write failure after an already-completed external mutation fails closed
  at the callable response but does not provide a universal cross-service
  rollback; the operation requires operational reconciliation.
- If trusted actor loading fails, no audit event is emitted because the actor is
  not trusted enough to attribute safely.
- No audit UI, retention policy, export, alerting or SIEM integration exists.
- Read callables are not audited; News mutation paths are covered.
- Local Admin SDK tooling is not automatically wrapped by this callable audit
  adapter.
- Query combinations may need Firestore composite indexes when deployed.

## Production status

No Firebase/Vercel deployment and no production data mutation were performed in
Phase 10.5. The project is ready for a separate review/deployment decision.

