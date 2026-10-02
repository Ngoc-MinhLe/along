# PHASE 10.21 — DEPLOYMENT REPORT

Date: 2026-10-02

## Deployment result

**DEPLOYMENT: PASS**

Exactly one Firebase Function was deployed:

```text
listUsers
```

Command executed:

```bash
firebase deploy --only functions:listUsers --project along-6e1ce
```

Firebase reported:

- 1 Function deployed;
- 0 Function errors;
- 0 deployments aborted;
- successful update operation.

## Production function verification

| Field | Result |
|---|---|
| Project | `along-6e1ce` |
| Function | `listUsers` |
| Trigger | Callable (`onCall`) |
| Region | `us-central1` |
| Runtime | Node.js 22 |
| Generation | Gen 2 |
| State | ACTIVE |
| Revision | `listusers-00002-kem` |
| Endpoint | `https://us-central1-along-6e1ce.cloudfunctions.net/listUsers` |
| Firebase deployment hash | `750c7cc8fbb8481a65d0ee23626151b622e53350` |

`firebase functions:list --project along-6e1ce` also confirmed the production
function inventory remains callable, Gen 2, us-central1, and Node.js 22. No
other function was deployed by this phase.

## Authentication boundary

A read-only unauthenticated POST to the production callable endpoint returned:

```text
HTTP 401 Unauthorized
```

This confirms the callable rejects the request before an authenticated user
search can be performed. No ID token was used or logged.

## Smoke-test result

Authenticated browser smoke testing was **NOT AVAILABLE** in the current
environment because no browser automation/session with a production user was
available. No result was fabricated and no manual token was requested.

The following production scenarios remain pending manual verification through
the existing authenticated admin UI:

- search `long` and confirm `Long Vũ` appears;
- search `Long`;
- search `minh`;
- search an email prefix;
- verify no duplicate user rows;
- verify cursor/page navigation.

No production test user, Membership, Tier, News article, or other fixture was
created.

## Production safety

- Production user, role, authorization, Membership, Tier, News, and audit data:
  **NO WRITE PERFORMED**.
- Firestore Rules deployment: **NO**.
- Firestore indexes deployment: **NO**.
- Hosting/Vercel deployment: **NO**.
- Frontend deployment: **NO**.
- Other Firebase Functions deployment: **NO**.

## Files modified

- `functions/src/user-service.js`
- `functions/test/user-selector.test.js`
- `docs/PHASE_10_20_USER_SEARCH_FIX_REPORT.md`
- `docs/PHASE_10_21_PRE_DEPLOY_REPORT.md`
- `docs/PHASE_10_21_DEPLOYMENT_REPORT.md`

No source changes were made during deployment. The working tree remains
uncommitted by request.

## Final status

```text
PHASE 10.21: DEPLOYED
FUNCTION DEPLOYMENT: PASS
AUTHENTICATED PRODUCTION SMOKE TEST: NOT AVAILABLE
PRODUCTION DATA WRITE: NO
RULES/INDEX/HOSTING DEPLOY: NO
COMMIT: NO
PUSH: NO
```
