# PHASE 10.11X — DEPLOY NEWS MEMBERSHIP-AWARE EVALUATOR

## 1. Deployment result

**DEPLOYMENT: PASS**

Project: `along-6e1ce`
Region: `us-central1`
Runtime: Node.js 22 / Gen 2

The exact approved deployment command was executed:

```text
firebase deploy --only functions:listNews,functions:getNewsArticle,functions:listNewsManagement,functions:getNewsManagementArticle,functions:listNewsCategories,functions:listNewsUsers,functions:listNewsGroups,functions:createNewsArticle,functions:updateNewsArticle,functions:archiveNewsArticle,functions:unarchiveNewsArticle,functions:publishNewsArticle,functions:unpublishNewsArticle,functions:setNewsAccessPolicy,functions:createNewsCategory,functions:updateNewsCategory,functions:deleteNewsCategory,functions:setNewsAclEntry,functions:removeNewsAclEntry --project along-6e1ce
```

Firebase CLI result:

- 19 Functions deployed;
- 0 Functions errored;
- 0 Function deployments aborted;
- deploy completed successfully.

## 2. Functions deployed

All 19 selected Functions are ACTIVE after deployment:

1. `listNews`
2. `getNewsArticle`
3. `listNewsManagement`
4. `getNewsManagementArticle`
5. `listNewsCategories`
6. `listNewsUsers`
7. `listNewsGroups`
8. `createNewsArticle`
9. `updateNewsArticle`
10. `archiveNewsArticle`
11. `unarchiveNewsArticle`
12. `publishNewsArticle`
13. `unpublishNewsArticle`
14. `setNewsAccessPolicy`
15. `createNewsCategory`
16. `updateNewsCategory`
17. `deleteNewsCategory`
18. `setNewsAclEntry`
19. `removeNewsAclEntry`

Read-only `firebase functions:list --json` verification:

- selected Function count: **19**;
- missing selected Functions: **0**;
- non-ACTIVE selected Functions: **0**;
- regions: **us-central1** only;
- runtimes: **nodejs22** only;
- Gen 2/callable: confirmed;
- production Firebase Functions hash for all 19: `1202f7292fa420ec6c25ac6791a298e619dfeb40`.

The deployment command did not target non-News Functions. Existing Membership/Tier, RBAC, authorization-rebuild, Custom Role, System Role, and user Functions were not redeployed.

## 3. Authentication boundary verification

Two read-only callable checks were performed:

- Unauthenticated `listNews` returned HTTP 200 with PUBLIC News results. This is expected because PUBLIC News is intentionally guest-readable; it is not an authorization bypass.
- Unauthenticated `createNewsArticle` returned HTTP 401 with `UNAUTHENTICATED` and message `Authentication is required.` No mutation occurred.

The News callable authentication boundary is therefore preserved while PUBLIC read behavior remains available.

## 4. Production read-only safety verification

No production mutation callable was invoked. No Membership, Tier, News, RBAC, authorization, or entitlement data was written by this phase.

Post-deployment read-only collection counts:

| Collection | Count after deployment |
|---|---:|
| `membershipTiers` | 0 |
| `memberships` | 0 |
| `newsArticles` | 3 |
| `contentEntitlements` | 0 |
| `userAuthorizations` | 3 |

The prior production readiness/read-back records reported zero `membershipTiers` and `memberships`; both remain zero. No tier or membership test data was created.

## 5. Scope exclusions confirmed

The following were **not** deployed or changed:

- Membership/Tier Functions;
- `rebuildProtectedSystemRoleAuthorizations`;
- Firestore Rules;
- Firestore indexes;
- Hosting or Vercel/frontend;
- production News mutations;
- production Membership/Tier mutations;
- RBAC or `userAuthorizations` mutations.

## 6. Warnings and limitations

- Firebase CLI emitted normal remote configuration/authentication diagnostics during deployment; authentication succeeded and deployment completed.
- No authenticated production News read smoke test was performed because no production test token/session was supplied, and no token was requested or handled in chat.
- No VIP Membership access result was inferred from production data because production has no Membership/Tier records.
- The deployed hash confirms the selected Functions share one deployed source package hash; it does not itself prove a VIP scenario without production Membership/Tier fixtures.

## 7. Git and code state

- Commit: **NO**
- Push: **NO**
- Working tree was preserved; no source or documentation was modified by the deployment operation.
- Existing Phase 10.11T–W working-tree changes remain untouched.

## Final status

```text
DEPLOYMENT: PASS
19 NEWS FUNCTIONS: ACTIVE
REGION: us-central1
RUNTIME: nodejs22 / GEN_2
DEPLOYMENT HASH: 1202f7292fa420ec6c25ac6791a298e619dfeb40
RULES DEPLOY: NO
INDEX DEPLOY: NO
FRONTEND/VERCEL DEPLOY: NO
PRODUCTION DATA MUTATION: NO
COMMIT: NO
PUSH: NO
```
