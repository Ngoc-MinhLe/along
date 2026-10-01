# PHASE 10.13 — ADMIN SELECTOR UX AUDIT & LOCAL VERIFICATION

Date: 2026-10-02

## 1. Scope and result

This was a read-only audit of the local Phase 10.12 execution path. No source
code, Firestore Rules, production data, deployment, commit, or push was changed.

**AUDIT STATUS: AUDIT PASS**

The high-risk user and management collections use bounded server-side reads,
cursor pagination, or debounced asynchronous search. No audited Admin selector
loads an unbounded collection into the browser. A few bounded resource pickers
remain incomplete when the corresponding dataset grows beyond their explicit
page limit; those are recorded as follow-up UX work, not as a security bypass or
Phase 10.12 deployment blocker.

## 2. Current architecture

The relevant flow is:

```text
Admin page
  -> frontend service
  -> Firebase Callable Function
  -> trusted actor / permission check
  -> bounded Firestore query
  -> page of safe projections + opaque cursor
```

`AsyncSearchSelect` is a debounced local UI component. It does not read
Firestore itself: its `loadOptions` callback calls a bounded service/callable.
`SearchableSelect` only filters the bounded `options` supplied by its parent; it
is not a server-side search implementation.

## 3. Selector inventory

| Area | Current implementation | Classification | Result |
|---|---|---|---|
| Admin Users main list | `listUsersPage` -> `listUsers`, query/status/systemRole/customRole filters, page size 25, cursor pagination | `PAGINATED_TABLE` + server search | PASS |
| Admin Users system role/status filters | Fixed role/status enums | `SMALL_STATIC` | PASS |
| Admin Users Custom Role filter | `listCustomRoles()` first bounded page, currently up to 50 roles | `BOUNDED` / `NEEDS_REVIEW` if roles exceed 50 | No unbounded load; future async/paged role options may be needed |
| Membership assignment user | `AsyncSearchSelect` -> `listUsersPage` -> callable `listUsers`, active users, page size 20, 300 ms debounce, minimum 2 characters | `ASYNC_SEARCH` | PASS |
| Membership history user | Same bounded async user search | `ASYNC_SEARCH` | PASS |
| Membership assignment tier | Callable `listMembershipTiers`, bounded list (default 25), native select | `BOUNDED` / `NEEDS_REVIEW` if tiers exceed 25 | Safe currently; future async/paged tier picker may be needed |
| Membership list | `listMemberships`, limit 25, status/tier filters, cursor pagination | `PAGINATED_TABLE` | PASS |
| Membership Tier management list | `listMembershipTiers`, limit 25, cursor pagination | `PAGINATED_TABLE` | PASS |
| Custom Role management list | `listCustomRolesPage`, page size 50, cursor pagination | `PAGINATED_TABLE` | PASS |
| News management article list | `listNewsManagement`, limit 20, title query, status/category filters, cursor pagination | `PAGINATED_TABLE` + server search | PASS |
| News category/status filters | Status enum; categories loaded through callable with limit 50 | `BOUNDED` | No full load; review if category count can exceed 50 |
| News ACL user/group principal | `AsyncSearchSelect` -> `listNewsUsers`/`listNewsGroups`, limit 20 | `ASYNC_SEARCH` | PASS |
| News access-policy article picker | `SearchableSelect` over the current 20-article management page | `BOUNDED_CURRENT_PAGE` / `NEEDS_REVIEW` | No unbounded load, but not globally searchable |
| News ACL article picker | Same current 20-article page | `BOUNDED_CURRENT_PAGE` / `NEEDS_REVIEW` | Same limitation; an async article resource search is the scalable follow-up |
| News ACL/category management picker | `SearchableSelect` over the current category result, max 50 | `BOUNDED` / `NEEDS_REVIEW` if categories grow | No full load |
| Public News category picker | `listNewsCategories({ limit: 50 })` and local `SearchableSelect` | `BOUNDED` | Acceptable for a small category taxonomy; not a global search |
| Calendar import selector | Current import page is bounded (25); history has cursor pagination | `PAGINATED_TABLE` + bounded select | PASS; older imports require moving through pages |
| Calendar advanced criteria/status filters | Derived from selected import schema and fixed status/range options | `SMALL_STATIC` / `BOUNDED` | PASS |

## 4. Required findings

### Does Admin Membership still load all users?

**No.** `AdminMembershipsPage.jsx` renders `AsyncSearchSelect` for both user
assignment and history. Its loader calls `listUsersPage({ query, status:
'active', pageSize: 20 })`. The backend `listUsers` validates the payload,
limits `pageSize` to 50, searches one indexed field, and returns only a page
plus an opaque cursor. There is no fallback to a full users collection read in
this path.

### Is AsyncSearchSelect actually in the local execution path?

**Yes, statically and through the tested component path.** The Membership page
imports and renders it twice. The News ACL principal picker imports and renders
it with `listNewsUsers` or `listNewsGroups`. The user search callable and
front-end selector tests passed. Browser runtime execution was not available in
this environment, so this is not a browser E2E claim.

### Which selectors need AsyncSearchSelect?

Already using it:

- Membership user assignment;
- Membership history user;
- News ACL USER/GROUP principal.

Recommended future use if the datasets can exceed their current bounded page:

- News access-policy article resource;
- News ACL ARTICLE resource;
- News category selectors if category count is not intentionally bounded;
- Membership Tier assignment if active tiers can exceed 25;
- Custom Role filter options if the catalog can exceed 50.

These recommendations require a separately reviewed contract/UI change. No
selector was changed in Phase 10.13.

### Which selectors can remain native `<select>`?

- System Role and user status enums;
- News status and ACL scope/principal-type enums;
- Membership status;
- Calendar filter/range options;
- Membership Tier and category selectors while their explicit bounded limits
  remain an accepted business constraint;
- Calendar import selection when page-by-page navigation is acceptable.

Native `<select>` is safe here only because the options are fixed or explicitly
bounded; it is not a substitute for loading a large collection.

### Is further fix needed?

**No immediate Phase 10.12 correctness fix is required.** There is no
unbounded collection read in the audited high-risk selector paths. A future
scalable resource-picker phase should replace the two current-page News article
pickers (and, if needed, category/tier/custom-role bounded lists) with dedicated
server-side async search or a paginated resource table.

## 5. Backend contract and security review

- `listUsers` uses an allowlisted payload, validates cursor shape, caps page
  size at 50, orders by `displayName`/`email` plus document ID, and returns a
  safe user projection.
- `listNewsManagement`, `listNewsCategories`, `listNewsUsers`, and
  `listNewsGroups` validate selector payloads and cap each result page at the
  backend boundary. News user/group selectors require `news.update`.
- `listNewsCategories` applies a server-side active-status filter unless the
  caller explicitly requests disabled categories and has an allowed News
  management permission.
- Membership list/tier reads validate limits and cursors and use explicit
  Firestore ordering/indexes. Membership mutations remain callable-only.
- Custom Role management uses a cursor-paginated callable for the main table;
  the Users filter intentionally consumes only a bounded first page today.
- `getCustomRolesByIds` reads only explicitly assigned role IDs; it is not a
  collection loader.
- No audited selector accepts client-provided actor authority, role, or
  permission as an authorization source.
- No direct client write to News, Membership, User authorization, or role
  assignment was introduced by Phase 10.12.

## 6. Index and configuration review

`firebase.json` keeps Functions on Node.js 22 and the existing emulator ports.
The local `firestore.indexes.json` contains the composite query shapes for user,
News, role, membership, and tier pagination/filtering. The local index file is
not a production deployment in this phase. Firestore Rules were not changed.

## 7. Console error assessment

The repository contains no `onboarding.js` source or reference. The reported
`onboarding.js:48 Uncaught (in promise) undefined` therefore cannot be
attributed to Phase 10.12 from local evidence. It is classified as
**NOT ENOUGH EVIDENCE / likely external or injected runtime code**. No local
fix is justified without browser console/network evidence showing that the
application bundle owns that script or that the error correlates with a failed
Admin request.

## 8. Browser verification limitation

**BROWSER E2E: NOT AVAILABLE.** No browser automation or attached browser
session was available. The report must not be read as claiming that a browser
render, click, network request, or console was observed at runtime. Static
execution-path inspection and automated source/regression checks were used.

## 9. Verification results

| Check | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-membership` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:resource-selectors` | PASS |
| `npm run test:admin-scalability` | PASS |
| `npm run test:rules` | PASS — 84 assertions, isolated Firebase CLI home, JDK 21 process only |
| `npm run build` | PASS — Vite emitted an existing bundle-size warning (>500 kB) |
| `git diff --check` | PASS |

## 10. Files and change boundary

Created by this audit:

- `docs/PHASE_10_13_ADMIN_SELECTOR_AUDIT.md`

No source code was changed. The pre-existing working tree still contains the
uncommitted Phase 10.12 implementation, reports, index changes, and test
artifacts listed by `git status`; those were not staged, committed, reverted,
or otherwise altered by this audit.

## 11. Production and deployment safety

- Production data changed: **NO**
- Firebase deployment: **NO**
- Vercel/Hosting deployment: **NO**
- Firestore Rules deployment: **NO**
- Index deployment: **NO**
- Commit: **NO**
- Push: **NO**

## 12. Final checkpoint

Phase 10.12 is structurally ready for a separate deployment review for its
affected callables, indexes, and frontend. It is not production-verified by
this audit. The next action should be a user-approved deployment review and
browser verification, with the current-page News article resource limitation
tracked as follow-up UX work rather than hidden by a client-side full load.
