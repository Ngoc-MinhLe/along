# PHASE 10.11W — PRE-DEPLOY NEWS FUNCTIONS REVIEW

## Final status

**READY FOR DEPLOYMENT**

This is a review result only. No Firebase, Vercel, Rules, index, or production deployment was performed.

## 1. Deployment scope: exactly 19 News callable Functions

The following exports are present in `functions/src/news-functions.js` and re-exported by `functions/src/index.js`:

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

All 19 are Firebase callable Functions using Firebase Functions v2 `onCall`. They use the project default region `us-central1`; no per-function region override was found. The Functions runtime is Node.js 22.

No additional News export was found, and no required News export is missing.

## 2. Dependency and execution path

The reviewed dependency chain is:

```text
news-functions.js
  -> news-service.js / news-mutation-service.js
  -> membership-service.js (for canonical VIP read evaluation)
  -> membershipTiers/{tierId} and memberships/{membershipId}
```

Read Functions use `trustedNewsReadCallable()` and execute through `news-service.js` and `service.invokeNews()`.

Mutation Functions use `trustedNewsMutationCallable()` and execute through `news-mutation-service.js`. The mutation service reuses News validation, policy, ACL, authorization, transaction, and audit helpers; the News read evaluator is not duplicated.

`news-service.js` imports `resolveEffectiveMembership` from `membership-service.js`. The VIP decision path is:

```text
canReadArticle()
  -> readCanonicalMembershipLevel()
  -> resolveEffectiveMembership()
  -> memberships query
  -> membershipTiers/{tierId}
```

The evaluator is actually used by the public content-read path:

- `listNews` and `getNewsArticle` resolve the article access policy and call `canReadArticle()`.
- `listNewsManagement` and `getNewsManagementArticle` are trusted management reads and do not apply the public entitlement gate.
- `listNewsCategories`, `listNewsUsers`, and `listNewsGroups` are trusted selector reads and do not resolve article membership access.
- The 12 mutation callables use `news-mutation-service.js` for server-side validation, RBAC, transactions, ACL, lifecycle, and audit. They are bundled with the current `news-service.js` and its shared policy helpers, but they do not use the public article-read entitlement gate as their authorization boundary.

This is intentional: Membership-aware VIP evaluation is a News read-access concern, while mutation authorization remains the existing trusted RBAC/News policy path.

No dependency outside the approved News, Membership read-resolution, Firebase Auth, RBAC, Firestore, and audit paths was found.

## 3. Canonical Membership contract verification

The current source conforms to the reviewed contract:

- `memberships/{membershipId}` stores `userId`, `tierId`, status, start/expiry timestamps, source, and audit metadata. It does not store a duplicate membership level.
- Membership level is resolved only from `membershipTiers/{tierId}.level`.
- A user may not have more than one normalized `ACTIVE` membership; creation rejects a second active membership.
- `membershipTiers/{tierId}` uses `tierId` as both document ID and stored identifier, a positive safe-integer `level`, and `status` of `active` or `inactive`.
- Tier levels are data-driven. No VIP1/VIP2/VIP3 ceiling or hard-coded tier names are used by the evaluator.
- Expired, revoked, future, malformed, or inactive-tier memberships do not grant canonical VIP access.
- VIP access is granted only when `effectiveTier.level >= article.accessPolicy.minVipLevel`.
- Legacy `contentEntitlements/{uid}` is retained only as the validated compatibility fallback when canonical membership does not grant access.
- The stored tier schema does not write a parallel `active:boolean`; any `active` value in normalized/output compatibility data is derived from `status`.

## 4. News behavior preserved

The review found no change to the following behavior beyond the approved Membership-aware VIP evaluator:

- `PUBLIC` remains publicly readable through the trusted News read contract.
- `SPECIAL` continues to use explicit ACL/entitlement evaluation.
- Article/category inheritance and ACL scope behavior remain in the existing News services.
- Draft and archived articles remain excluded from public article reads according to the existing lifecycle policy.
- News mutation authorization continues to use the existing trusted actor and RBAC policy.
- `userAuthorizations`, system-role hierarchy, and Custom Roles are not modified by Membership resolution.
- Firestore Rules are unchanged.
- No second authorization or materialization engine was introduced.

## 5. Production deployment scope

The approved News deployment scope is only the 19 Functions listed in section 1. The expected Firebase command for a separately approved deployment step is:

```text
firebase deploy --only functions:listNews,functions:getNewsArticle,functions:listNewsManagement,functions:getNewsManagementArticle,functions:listNewsCategories,functions:listNewsUsers,functions:listNewsGroups,functions:createNewsArticle,functions:updateNewsArticle,functions:archiveNewsArticle,functions:unarchiveNewsArticle,functions:publishNewsArticle,functions:unpublishNewsArticle,functions:setNewsAccessPolicy,functions:createNewsCategory,functions:updateNewsCategory,functions:deleteNewsCategory,functions:setNewsAclEntry,functions:removeNewsAclEntry --project along-6e1ce
```

This command was **not** executed during Phase 10.11W.

Explicitly excluded from this scope:

- Membership/Tier Functions;
- authorization rebuild or other RBAC Functions;
- Firestore Rules;
- Firestore indexes;
- Hosting/Vercel/frontend deployment;
- production News mutations;
- production Membership/Tier mutations.

The existing Membership composite index is already present in `firestore.indexes.json`; no index deployment is required for this review scope.

## 6. Source/deployment consistency

The selected News Functions import the current local `news-service.js`, and that service imports the current local `membership-service.js`. Therefore a deployment of the reviewed source will bundle the Membership-aware evaluator through the News execution path.

An immutable Firebase production bundle hash cannot be verified without deploying or querying the production deployment state. The relevant local source hashes captured for review are:

```text
EC5862B6F76C241B5B61606A6380BA365C4EEDC2C3DC4E975BD36E954163357B  functions/src/news-functions.js
B730DF00BA5BD56B34FF79AE32E2A475278C3881562CF0FF87E9AD322E797C5A  functions/src/news-service.js
790453458E5DD50C5365ED5939488944AC30494E781FEA9EB7C3242921D110D4  functions/src/membership-service.js
06D9F523A15BBA1431212BBB6BBDC1AE8C3B0A02B5F96527BFE4559DE57E3880  functions/src/news-mutation-service.js
B70597D6BC86444CD04BF718BF3B085C0399622FFA83B2C92438130C55060509  functions/src/index.js
```

The reviewed source changes are currently not committed in this working tree. The eventual deployment must use exactly this reviewed source revision; the production bundle must be verified after deployment in the dedicated deployment phase.

## 7. Regression results

The required regression checks completed successfully:

- `npm run check:functions` — PASS
- `npm run test:functions` — PASS
- `npm run test:functions:membership:emulator` — PASS
- `npm run test:functions:membership-tier:emulator` — PASS
- `npm run test:functions:news:emulator` — PASS
- `npm run test:functions:system-role:emulator` — PASS
- `npm run test:functions:authorization-rebuild:emulator` — PASS
- `npm run test:authorization` — PASS
- `npm run test:rbac` — PASS
- `npm run test:policy-conformance` — PASS
- `npm run test:frontend-rbac` — PASS
- `npm run test:frontend-membership` — PASS
- `npm run test:frontend-news` — PASS
- `npm run test:rules` — PASS, 84 assertions
- `npm run build` — PASS
- `git diff --check` — PASS

The build still reports the existing large JavaScript chunk warning; it does not fail the build and is not a Phase 10.11W deployment blocker.

The emulator commands were run with temporary Firebase CLI configuration and the locally available JDK 21 where required. No persistent CLI or system configuration was changed.

## 8. Production safety

- Firebase deployment: **NO**
- Vercel deployment: **NO**
- Firestore Rules deployment: **NO**
- Firestore index deployment: **NO**
- Production News mutation: **NO**
- Production Membership/Tier mutation: **NO**
- Production authorization mutation: **NO**
- Production data change: **NO**
- Commit: **NO**
- Push: **NO**

## 9. Git state

At the end of the review:

- branch: `main`
- `HEAD`: `59e450cec4b231fc0e448dc25b5bfb54685a7133`
- `origin/main`: `59e450cec4b231fc0e448dc25b5bfb54685a7133`
- working tree: **not clean**

The working tree contains existing Phase 10.11T/U/V source and documentation changes. Phase 10.11W did not modify application source, Rules, or configuration; it adds this review report only. No existing changes were staged, committed, or pushed.

## Conclusion

**PHASE 10.11W: READY FOR DEPLOYMENT**

This conclusion authorizes no deployment by itself. The next step is a separately approved deployment of exactly the 19 News Functions, followed by read-only production verification of the deployed bundle and callable behavior.
