# Phase 10.9 - News Article Archive Foundation

## Status

**COMPLETED locally.** This phase was not deployed, did not write production
data, and was not committed or pushed.

## Audit conclusion

The existing News article model stores article content, category references,
published timestamps, and ACL subcollections. Existing public read logic only
returns articles whose status is `published`. Existing News mutations already
run through trusted callable functions and the centralized RBAC/audit path.

Hard delete was rejected for this phase because it would create unnecessary
questions around ACL history, audit references, category relationships and
future recovery. The selected model is a server-side soft delete named
**archive**.

## Data model change

An archived article keeps its existing document and nested ACL data, with:

- `status: "archived"`
- `archivedAt: Timestamp`
- `archivedBy: trusted actor UID`
- `updatedAt: Timestamp`

Archived articles are excluded from public list/detail reads because public
read already requires `status === "published"`. They remain visible to the
bounded News management read path with an Archived status label.

No cascade delete is performed. No category, group, membership, entitlement,
or ACL document is deleted.

## Callable contract

`archiveNewsArticle` accepts only:

```js
{ articleId }
```

The actor is loaded by the existing trusted callable/audit flow from Firebase
Auth. The function requires the existing `news.delete` permission and rejects
unknown payload fields such as `actorUid`, roles, permissions or claims.

An already archived article cannot be archived again. Archived articles cannot
be updated, published, unpublished, or have article ACL entries changed by
the existing mutation paths.

## Audit

Archive operations use the existing audit writer and add the catalog action
`NEWS_ARTICLE_ARCHIVED`. Audit data contains trusted identifiers and outcome
metadata only; it does not contain content, tokens, claims or full payloads.

## Frontend

- Added `archiveNewsArticle` to the News callable client.
- Added a permission-gated archive action in the existing article editor for
  users with `news.delete`.
- Added explicit confirmation and a clear retained-data/no-restore warning.
- After success, the editor closes and the management list refreshes.
- Archived articles are read-only in the editor.
- Management list loading also works for an actor whose management access is
  provided by `news.delete` alone.
- No direct News Firestore write was added.

## Files changed

- `functions/src/audit.js`
- `functions/src/index.js`
- `functions/src/news-functions.js`
- `functions/src/news-mutation-service.js`
- `functions/src/news-service.js`
- `functions/test/news-emulator.test.js`
- `scripts/news-frontend-test.mjs`
- `src/pages/NewsManagementPage.jsx`
- `src/services/news.js`
- `src/styles/index.css`

## Test results

- `npm run check:functions` - PASS
- `npm run test:functions` - PASS
- `npm run test:functions:news:emulator` - PASS (local emulator; retry with
  temporary Firebase CLI configuration and JDK 21)
- `npm run test:authorization` - PASS
- `npm run test:rbac` - PASS
- `npm run test:policy-conformance` - PASS
- `npm run test:frontend-rbac` - PASS
- `npm run test:frontend-news` - PASS
- `npm run test:system-role-tool` - PASS
- `npm run test:rules` - PASS, 84 assertions (temporary process-only Firebase
  CLI configuration and JDK 21)
- `npm run build` - PASS
- `git diff --check` - PASS

The production build still reports the existing bundle-size warning; it is not
a build failure.

## Security review

- Server-side actor and permission checks remain authoritative.
- No client-provided actor, role, permission, claim, or effective permission
  is trusted.
- No ROOT or system-role behavior changed.
- No Firestore Rules change was needed; direct client News writes remain
  denied.
- No second authorization or materialization engine was introduced.
- No hard-delete or cascade-delete path was added.

## Known limitations

- There is no restore/archive-reversal UI or callable in this phase.
- Archived article content remains in Firestore for history and future
  recovery policy; retention/purge is not defined.
- A user with `news.delete` can archive but cannot edit unless they also have
  the existing update permission.
- Browser E2E and production smoke testing were not performed.

## Next checkpoint

Review the local diff and approve a separate deployment phase. Do not deploy
the new callable or frontend until the production rollout is explicitly
approved.

## Phase 10.9A - Archive Review and Production Readiness

### Review result

**CONDITIONAL / BLOCKED for production readiness.** The archive data model,
trusted backend mutation, public-read boundary, audit path and data integrity
checks passed local review. One frontend permission-visibility issue remains
before this feature should be released.

### Review findings

- **Archived semantics: PASS.** `archived` is accepted only by management
  reads; public reads require `published`; update, publish, unpublish and
  article-ACL mutation paths reject archived articles.
- **Authorization: PASS.** `archiveNewsArticle` is an `onCall` function,
  derives the actor from Firebase Auth, requires `news.delete`, rejects
  forged client authority fields, and has no direct client Firestore write.
- **Audit: PASS.** The existing audited mutation wrapper records
  `NEWS_ARTICLE_ARCHIVED`, trusted actor/resource identifiers, timestamp and
  SUCCESS/DENIED/FAILED outcome without secrets or article content.
- **Data integrity: PASS.** Archive is a transaction that preserves title,
  slug, excerpt, content, category and nested ACL data; it does not cascade
  delete related documents.
- **Idempotency and edge cases: PASS.** Missing/invalid article IDs,
  unauthenticated callers, callers without `news.delete`, already archived
  articles, and archived lifecycle mutations are covered by the existing
  tests and fail closed.
- **Rules: PASS.** `firestore.rules` was not changed; direct News writes
  remain denied and the Admin SDK callable is the mutation boundary.
- **Management search limitation: WARNING.** The current contract performs a
  bounded server query and then filters the returned page. It does not provide
  globally complete title/slug search or pagination. This was not expanded in
  this review because doing so would require a contract/index change.
- **Frontend UX finding: FAIL.** `NewsManagementPage.jsx` loads the article
  list for an actor with `news.delete`, but the list/editor section is rendered
  only when `news.update` or `news.publish` is present. Therefore a valid
  delete-only actor cannot reach the archive action through the UI. The
  backend remains protected, but the frontend does not satisfy the required
  delete-only workflow. Minimum fix: include `canDelete` in that render guard;
  no backend or Rules change is needed.

### Restore decision

Restore is a separate phase and was not implemented. If recovery is required,
use a future callable such as `unarchiveNewsArticle({ articleId })` with a
separately approved permission (for example `news.restore`), restore to
`draft` by default, and record `NEWS_ARTICLE_UNARCHIVED`. It must not silently
republish an article.

### Phase 10.9A verification

- `npm run check:functions` - PASS
- `npm run test:functions` - PASS
- `npm run test:functions:news:emulator` - PASS (local emulator)
- `npm run test:authorization` - PASS
- `npm run test:rbac` - PASS
- `npm run test:policy-conformance` - PASS
- `npm run test:frontend-rbac` - PASS
- `npm run test:frontend-news` - PASS
- `npm run test:rules` - PASS, 84 assertions, using temporary CLI/JDK 21
  process configuration
- `npm run build` - PASS; existing bundle-size warning only
- `git diff --check` - PASS

No production deployment, production data mutation, Firestore Rules change,
commit or push was performed. Browser E2E and production smoke testing remain
pending.
