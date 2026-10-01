# PHASE 10.15 — PRODUCTION DEPLOYMENT + SMOKE TEST REPORT

Date: 2026-10-02
Firebase project: `along-6e1ce`
Region: `us-central1`

## 1. Deployment summary

| Item | Result |
|---|---|
| Firebase project | PASS — `along-6e1ce` |
| Firestore indexes | PASS — 29 composite indexes deployed and `READY` |
| Selector/read Functions | PASS — 9/9 deployed successfully |
| Rules deployment | NO |
| Hosting/Vercel deployment | NO |
| Production data mutation | NO |
| Git commit/push | NO |

The deployment commands targeted only the approved index configuration and the
nine approved callable read/selector Functions. No mutation callable, Rules,
Hosting, or Vercel deployment was included.

## 2. Firestore indexes

The Phase 10.14 source configuration contained 36 entries, but Firebase
rejected seven single-field-plus-`__name__` definitions as unnecessary. Those
seven redundant entries were removed from `firestore.indexes.json`; no query
shape required by the reviewed source was removed.

The final source and deployed configuration contains 29 composite indexes.
Firebase reports all 29 as `READY` and zero field overrides. The successful
deployment command was:

```text
firebase deploy --only firestore:indexes --project along-6e1ce
```

This was an indexes-only deployment. `firestore.rules` was not deployed or
modified.

## 3. Functions deployed

The exact deployment command was:

```text
firebase deploy --only functions:listCustomRoles,functions:listUsers,functions:listMembershipTiers,functions:listMemberships,functions:getUserMemberships,functions:listNewsManagement,functions:listNewsCategories,functions:listNewsUsers,functions:listNewsGroups --project along-6e1ce
```

Firebase CLI reported 9 Functions Deployed, 0 Functions Errored and 0
Function Deployments Aborted. Read-back through `firebase functions:list`
confirmed every target as `ACTIVE`, `us-central1`, Node.js 22, Gen 2, with the
same deployment hash:

`20e3e8bcf23943f7a615241aa4bdb80c761a8770`

| Function | State | Region | Runtime | Hash |
|---|---|---|---|---|
| `listCustomRoles` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| `listUsers` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| `listMembershipTiers` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| `listMemberships` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| `getUserMemberships` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| `listNewsManagement` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| `listNewsCategories` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| `listNewsUsers` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |
| `listNewsGroups` | ACTIVE | us-central1 | nodejs22 / Gen 2 | `20e3e8bcf23943f7a615241aa4bdb80c761a8770` |

No other Function was included in the deployment command.

## 4. Callable boundary verification

Read-only unauthenticated POSTs were sent using the callable protocol with an
empty data object. No ID token or credential was used, and no mutation payload
was sent.

| Function | HTTP result | Interpretation |
|---|---:|---|
| `listCustomRoles` | 401 | Authentication required |
| `listUsers` | 401 | Authentication required |
| `listMembershipTiers` | 401 | Authentication required |
| `listMemberships` | 401 | Authentication required |
| `getUserMemberships` | 401 | Authentication required |
| `listNewsManagement` | 403 | Public caller denied by management authorization |
| `listNewsCategories` | 200 | Expected public active-category read path |
| `listNewsUsers` | 403 | Public caller denied by ACL-selector authorization |
| `listNewsGroups` | 403 | Public caller denied by ACL-selector authorization |

These results confirm endpoint existence and the expected distinction between
public category reads and protected administrative selectors. Authenticated
admin UI behavior still requires a manual browser session.

## 5. Production route reachability

Unauthenticated HTTP reachability checks returned `200 text/html` for:

- `/`
- `/admin/memberships`
- `/admin/membership-tiers`
- `/admin/news`
- `/admin/users`
- `/admin/roles`

This confirms the SPA routes are served. It does not replace an authenticated
browser smoke test for selector loading, cursor interaction, or console
inspection.

## 6. Production data safety

No callable mutation was invoked and no Admin SDK write was executed. A
read-only count check after deployment returned:

| Collection | Current document count |
|---|---:|
| `users` | 4 |
| `membershipTiers` | 0 |
| `memberships` | 0 |
| `contentEntitlements` | 0 |
| `newsArticles` | 3 |
| `userAuthorizations` | 3 |

These are read-back counts only; no before/after data mutation was performed.
No test tier, membership, user, News article, entitlement, role, or
authorization document was created or changed by this phase.

## 7. Local validation

| Check | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run build` | PASS — existing Vite large-bundle warning remains |
| `npm run test:admin-scalability` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-membership` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:policy-conformance` | PASS |
| `git diff --check` | PASS — line-ending warnings only |

The broader Phase 10.14 emulator/regression matrix was already recorded as
PASS in `docs/PHASE_10_14_PRODUCTION_READINESS_REPORT.md`; this phase did not
change Rules or application logic outside the reviewed scalability source.

## 8. Browser/network limitations

No browser automation or attached DevTools session is available in this
environment. Therefore the following remain **not verified here**:

- authenticated ROOT/SUPER UI selector interactions;
- visual loading/empty/error states;
- authenticated Network panel cursor payload inspection;
- browser console classification.

`onboarding.js` was not treated as an application error because no browser
console evidence was available and it is not part of this repository.

## 9. Git state

The working tree was already dirty before this phase with the Phase 10.12–
10.14 implementation and documentation changes. This phase did not commit or
push. The Phase 10.15 deployment report is an additional untracked
documentation file. Existing changes were preserved; no reset, checkout,
revert, or discard was performed.

## 10. Final status

- **DEPLOY SUCCESS:** PASS
- **INDEX READY:** PASS
- **9 FUNCTIONS ACTIVE:** PASS
- **CALLABLE BOUNDARY:** PASS for the read-only checks performed
- **PRODUCTION DATA UNCHANGED:** PASS
- **BROWSER UI SMOKE TEST:** NOT VERIFIED — browser tooling unavailable
- **PHASE 10.15:** DEPLOYED; manual authenticated browser smoke test remains
  the next verification step

No further deployment, mutation, commit, or push was performed.
