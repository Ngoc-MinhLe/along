# Phase 10.10 — News Article Restore / Unarchive Report

## Status

**COMPLETED locally/emulator-only. Production deployment is pending review.**

## Policy

- Permission: `news.restore`.
- `SUPER_ADMIN` and `ROOT_ADMIN` receive it through the existing full system
  permission catalog.
- `ADMIN`, `EDITOR`, `USER` do not receive it.
- Custom Roles cannot contain `news.restore`; this prevents delegation through
  the Custom Role workflow.

## Backend

- Added callable: `unarchiveNewsArticle`.
- Payload allowlist: `{ articleId }` only.
- Actor is derived from `request.auth.uid` by the existing trusted actor/audit
  flow. Client-provided actor, role or permission values are not trusted.
- Transaction transition: `archived -> draft` only.
- `draft` and `published` articles are rejected; missing articles are
  `not-found`.
- Article content, title, slug, category, access policy, ACL and document ID
  remain unchanged. `publishedAt` is cleared because the restored article is
  not published; `updatedAt` is refreshed.
- Audit action: `NEWS_ARTICLE_UNARCHIVED`.

## Frontend

- Added `unarchiveNewsArticle(articleId)` callable helper.
- Archived articles show `Khôi phục` only when the trusted materialized
  permission `news.restore` is present.
- Confirmation explains that restore changes `archived` to `draft` and does
  not automatically publish the article.
- After success, the management list and article detail are refreshed.

## Tests

- Functions syntax/unit tests: PASS.
- News emulator integration: PASS, including guest/unauthorized denial,
  forged actor rejection, SUPER_ADMIN/ROOT_ADMIN restore, invalid state
  transitions, data preservation, no auto-publish and audit verification.
- Policy/RBAC/authorization/frontend News checks: PASS.
- Firestore Rules architecture unchanged; restore is forbidden to Custom Roles,
  so no Rules catalog change was required.

## Production safety

- Firebase Functions: not deployed.
- Vercel: not deployed.
- Firestore Rules: not changed or deployed.
- Production data: unchanged.
- Git: no commit or push performed.

## Follow-up

Before production deployment, existing production `SUPER_ADMIN`/`ROOT_ADMIN`
authorization documents must be materialized with the new system permission by
the established trusted authorization rebuild workflow. That belongs to the
next deployment checkpoint and is not performed in Phase 10.10.
