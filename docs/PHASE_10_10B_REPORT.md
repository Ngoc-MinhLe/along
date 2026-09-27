# Phase 10.10B — Restore Production Deployment & Controlled Smoke Test

## Status

**BLOCKED — deployment passed, authorization materialization is pending.**

## 1. Pre-deploy audit

- `unarchiveNewsArticle` exists and is exported from `functions/src/index.js`.
- `news.restore` is a catalog/system permission granted by policy to `SUPER_ADMIN` and `ROOT_ADMIN` only.
- Custom Roles are forbidden from containing `news.restore`.
- Restore changes `archived` to `draft`, never directly to `published`.
- Article content, title, slug, category, access policy, ACL and document ID are preserved.
- `NEWS_ARTICLE_UNARCHIVED` audit action exists.
- Frontend uses the callable service and does not write News documents directly.
- `firestore.rules` was not changed.

## 2. Local tests

All required checks passed:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:functions:news:emulator`
- `npm run test:functions:emulator`
- `npm run test:functions:system-role:emulator`
- `npm run test:authorization`
- `npm run test:rbac`
- `npm run test:policy-conformance`
- `npm run test:frontend-rbac`
- `npm run test:frontend-news`
- `npm run test:system-role-tool`
- `npm run test:rules` — 84 assertions
- `npm run build`
- `git diff --check`

Emulator tests used a temporary Firebase CLI configuration and local JDK 21. No production project was used by emulator tests.

## 3. Deployment target

```text
Project: along-6e1ce
Function: unarchiveNewsArticle
Region: us-central1
Runtime: Node.js 22
Generation: 2nd Gen
Callable: yes
```

## 4. Deployment result

**DEPLOYMENT: PASS**

Command executed:

```bash
firebase deploy --only functions:unarchiveNewsArticle --project along-6e1ce
```

Firebase reported 1 function deployed and 0 errors. The function is `ACTIVE` in `us-central1` with endpoint:

```text
https://us-central1-along-6e1ce.cloudfunctions.net/unarchiveNewsArticle
```

No Firestore Rules, Hosting or unrelated Functions were deployed.

## 5. Production function status

- Function exists: yes.
- State: `ACTIVE`.
- Region: `us-central1`.
- Runtime: Node.js 22.
- Callable endpoint: present.

## 6. Authorization verification

**AUTHORIZATION: BLOCKED**

Read-only Admin SDK verification found:

- `systemConfig/root` exists and has a root lock.
- Two active `SUPER_ADMIN` profiles and one active `ROOT_ADMIN` profile were found.
- All three corresponding `userAuthorizations` documents exist.
- All three are currently materialized with 30 permissions.
- None currently contains `news.restore`.

This is stale materialization after adding the catalog permission. No rebuild was executed because rebuilding writes production authorization data and the phase safety rules require stopping before that write.

The existing trusted workflow is `scripts/rebuild-authorization.mjs`; it requires a fresh ROOT authorization token and explicit confirmation. It must be run only after approval of the intended production authorization write.

## 7. CORS and unauthenticated boundary

**CORS: PASS for the configured production origin.**

A read-only unauthenticated callable probe returned HTTP `401` and included:

```text
Access-Control-Allow-Origin: https://lichvannien-phi.vercel.app
```

This confirms the endpoint is reachable and does not allow unauthenticated restore calls.

## 8. UI verification

**UI VERIFICATION: PENDING**

No authenticated browser session was used. The restore button cannot be considered production-ready for ROOT/SUPER_ADMIN until their authorization documents contain `news.restore`. No restore button was clicked and no article was mutated.

## 9. Production data changes

**PRODUCTION DATA CHANGE: NO**

- No article was restored, created, deleted or edited.
- No ACL, category, slug or content was changed.
- No authorization rebuild was performed.

## 10. Firestore Rules changes

**FIRESTORE RULES CHANGE: NO**

Rules were neither modified nor deployed.

## 11. Code changes

**CODE CHANGE: NO during Phase 10.10B.**

The source changes belong to Phase 10.10 and remain uncommitted/unpushed.

## 12. Git status

The working tree contains the Phase 10.10 source/test/document changes plus this report. No commit or push was performed.

## 13. Remaining issue

Production authorization materialization must be explicitly rebuilt for the affected system-role users before production restore can be tested. The rebuild must use the existing trusted authorization workflow and must be reviewed as an intentional production data change.

## 14. Next recommended phase

**Phase 10.10C — Production Authorization Rebuild Approval & Restore Smoke Test**

First obtain explicit approval for the targeted rebuild. Then rebuild only the affected authorization documents, verify that `news.restore` is present for `SUPER_ADMIN`/`ROOT_ADMIN` and absent for lower roles/Custom Roles, and only afterward perform a controlled browser smoke test. Do not restore a production article without separate confirmation.

## Final classification

```text
DEPLOYMENT: PASS
AUTHORIZATION: BLOCKED
UI VERIFICATION: PENDING
PRODUCTION DATA CHANGE: NO
FIRESTORE RULES CHANGE: NO
CODE CHANGE: NO (Phase 10.10B)
COMMIT: NO
PUSH: NO
```
