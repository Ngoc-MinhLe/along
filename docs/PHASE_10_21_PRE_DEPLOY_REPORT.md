# PHASE 10.21 — PRE-DEPLOY REPORT

Date: 2026-10-02

## Audit result

Phase 10.20 changes were reviewed against the current callable path:

`AdminMembershipsPage` / `AdminUsersPage`
→ `listUsersPage`
→ callable `listUsers`
→ `functions/src/user-functions.js`
→ `functions/src/user-service.js`
→ bounded Firestore queries on `users`.

The fix searches bounded Unicode/case variants, merges by user ID, and uses a
versioned cursor for multi-stream search. It does not scan the complete
`users` collection, write normalized fields, or change the callable payload
allowlist.

The expected cases are covered:

- `long`, `Long`, and `LONG` can match legacy `Long Vũ` data;
- `minh`, `Minh`, and `MINH` remain covered;
- email-prefix search is covered;
- duplicate results are removed by user ID;
- each internal query remains bounded to at most 50 documents;
- cursor version 2 is validated server-side.

## Tests

The Phase 10.20/10.21 validation suite passed:

- Functions syntax/check and unit tests;
- user selector tests;
- user, custom-role, membership, membership-tier, News, System Role, and
  authorization-rebuild emulator suites;
- authorization, RBAC, policy-conformance, frontend RBAC, frontend
  Membership, frontend News, and admin scalability tests;
- Firestore Rules test: 84 assertions;
- production build;
- `git diff --check`.

The existing Vite bundle-size warning remains unchanged and is not a Phase
10.21 blocker.

## Exact deployment scope

Deploy only:

```text
functions:listUsers
```

Project and region:

```text
Project: along-6e1ce
Region: us-central1
Runtime: Node.js 22 / Gen 2
```

Command:

```bash
firebase deploy --only functions:listUsers --project along-6e1ce
```

No other Function is required for this fix. In particular, do not deploy:

- Firestore Rules;
- Firestore indexes;
- Hosting or Vercel;
- Membership, News, RBAC, System Role, or authorization-rebuild Functions.

## Security impact

- `request.auth.uid` and existing server-side `users.read` authorization are
  unchanged.
- Client-supplied actor, role, permission, claims, and authorization data are
  not accepted.
- The response remains a safe projection and never returns secrets or tokens.
- No direct Firestore write was introduced.
- RBAC, authorization materialization, Membership schema, News policy, and
  Rules are unchanged.

## Production impact and rollback

- Production data mutation: **NO**.
- Membership/Tier mutation: **NO**.
- News mutation: **NO**.
- Rules/index deployment: **NO**.
- Hosting/Vercel deployment: **NO**.

Rollback, if required, is to redeploy `listUsers` from the last known-good
source revision. No destructive delete or data rollback is required.

## Known limitations

- Search remains prefix-based.
- Accent folding/diacritic removal is intentionally not introduced.
- Legacy compatibility uses a bounded fan-out of up to eight streams; a future
  normalized-field migration or search index could reduce read amplification.
- Browser automation is unavailable in this environment; production smoke
  verification will be read-only and reported separately.

## Pre-deploy status

**READY FOR DEPLOYMENT**
