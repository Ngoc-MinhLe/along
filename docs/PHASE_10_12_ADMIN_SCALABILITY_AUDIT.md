# PHASE 10.12 — ADMIN SCALABLE DATA UX AUDIT

## Phạm vi và kết luận

Đây là audit read-only về khả năng mở rộng của các màn hình quản trị. Không có source code, backend, Firestore Rules, RBAC, schema hoặc production data nào được thay đổi trong phase này.

**PHASE 10.12 STATUS: AUDIT COMPLETE**

## A. Current architecture

- Frontend: React + Vite, các trang quản trị có state/filter/pagination cục bộ theo từng màn hình.
- Backend: Firebase Callable Functions, Functions Node.js 22/Gen 2, Admin SDK chỉ ở backend.
- Authorization: actor và permission được kiểm tra server-side; UI chỉ là visibility/UX guard.
- Firestore: một số dữ liệu quản trị đã đọc qua Callable Functions; `users`, `roles` và một số Module 1 data vẫn có client Firestore read trực tiếp theo Rules.
- Reusable data UX hiện có: `src/components/SearchableSelect.jsx`. Chưa có abstraction chung cho async selector, cursor list, data table hoặc filter bar.
- Test hiện có chủ yếu là unit/emulator/static frontend tests; chưa có browser E2E/performance test cho danh sách lớn.

Các thay đổi chưa commit trước audit vẫn được giữ nguyên, không thuộc phạm vi chỉnh sửa của report này:

- `scripts/membership-frontend-test.mjs`
- `src/pages/AdminMembershipsPage.jsx`
- `src/styles/admin.css`

## B. Screens that load all data

### 1. Admin Users — rủi ro cao

Evidence: `src/services/rbac/firestore.js`, hàm `listUsers()` dùng `getDocs(collection(db, 'users'))` không có `limit`, `where`, cursor hoặc search server-side. `src/pages/AdminUsersPage.jsx` sau đó filter, sort và `.slice()` ở client.

Điều này chỉ giới hạn số dòng render, không giới hạn số document Firestore đã đọc. Ở 1.000 users đã là warning/high; ở 10.000 users là không phù hợp về read cost, latency và memory.

Classification: **TECHNICAL DEBT — HIGH**. Cần thay đổi code sau, không ảnh hưởng production data nếu migration theo từng endpoint.

### 2. Admin Roles — rủi ro trung bình đến cao

Evidence: `src/services/rbac/firestore.js` `listCustomRoles()` đọc toàn bộ `roles`, lọc `type === 'CUSTOM'` ở client. `src/pages/AdminRolesPage.jsx` còn đọc toàn bộ users để tính assigned count bằng `reduce`.

Roles thường ít hơn users, nhưng phần đọc users làm màn hình tăng tuyến tính theo user count.

Classification: **TECHNICAL DEBT — MEDIUM/HIGH**. Nên tách role list khỏi user count hoặc cung cấp summary/count server-side.

### 3. Admin Memberships — selector tải toàn bộ users

Evidence: `src/pages/AdminMembershipsPage.jsx` gọi đồng thời `listMemberships({limit: 25})`, `listMembershipTiers()` và `listUsers()`. User selector và history selector map toàn bộ danh sách users vào `<select>`.

Membership list đã bounded 25 ở backend, nhưng UI chưa có next-page/cursor, status/tier filter hoặc search. Rủi ro chính hiện tại là user selector unbounded.

Classification: **TECHNICAL DEBT — HIGH** cho user selector; **PARTIAL** cho membership list.

### 4. Các danh mục nhỏ

`membershipTiers`, permission catalog và system-role options hiện có quy mô nhỏ hoặc static. Đọc toàn bộ tier catalog hiện chưa phải blocker, nhưng không nên dùng cùng mô hình cho dữ liệu có khả năng tăng lớn.

Classification: **COMPLETED/LOW RISK** ở quy mô hiện tại; cần bounded read nếu catalog trở nên rất lớn.

## C. Dropdown/select scale risks

`SearchableSelect` chỉ search trên `options` đã tải về. Nó không biến một unbounded read thành server-side search.

Rủi ro cụ thể:

| Selector | Hiện trạng | Rủi ro ở 1K | Rủi ro ở 10K | Phân loại |
|---|---|---:|---:|---|
| Admin Users filters | Toàn bộ users, filter client | Cao | Không chấp nhận được | HIGH |
| Membership target user | Toàn bộ users trong `<select>` | Cao | Không chấp nhận được | HIGH |
| Membership history user | Toàn bộ users trong `<select>` | Cao | Không chấp nhận được | HIGH |
| News users | Callable giới hạn 50, search server-side nhưng không cursor | Trung bình | Cao nếu cần tìm beyond 50 | MEDIUM |
| News groups | Lấy tối đa 50 rồi filter trong kết quả | Sai kết quả khi match nằm sau 50 | Cao | HIGH |
| News categories | Callable giới hạn 50 | Thấp hiện tại | Trung bình nếu catalog lớn | MEDIUM |
| Membership tiers | Catalog nhỏ, dynamic | Thấp | Phụ thuộc số tier | LOW/MEDIUM |

Khuyến nghị: tạo async selector dùng query debounce, server-side search, giới hạn kết quả 20–50, giữ selected option ngoài kết quả hiện tại, loading/error/empty state và cursor khi cần. Không tải toàn bộ users vào browser.

## D. Firestore query and scan risks

### Users and roles

- `listUsers()` là full collection read trực tiếp từ browser.
- `listCustomRoles()` là full `roles` read rồi filter client-side.
- Rules có authorization phù hợp (`users.read`, `roles.read`) nhưng Rules không cung cấp pagination tự động; thay đổi scale phải nằm ở query/API.

### Membership

- `listMemberships` đã có `limit` và backend cap 100, nhưng response có `hasMore` mà không có cursor để client chuyển trang.
- `getUserMemberships` cũng bounded nhưng chưa có cursor.
- Membership hydration đọc profile/tier theo các ID trong page; bounded theo page size nhưng cần theo dõi chi phí N+1 khi mở rộng.
- `listMembershipTiers` đọc full tier catalog; chấp nhận được với catalog nhỏ.

### News

- `listNewsManagement` search theo title prefix và có limit; chưa có cursor/status/category filters.
- `listNews` public bounded nhưng có thể scan tối đa khoảng `requestLimit * 2` để bỏ qua article không có quyền; với nhiều protected/denied articles cần cursor/continuation hoặc query strategy tốt hơn.
- `listNewsUsers` có server-side prefix search và limit 50 nhưng không cursor.
- `listNewsGroups` chỉ đọc 50 records đầu rồi filter name/id ở backend; đây là correctness/scale risk vì kết quả matching có thể nằm ngoài batch đầu.
- `listNewsCategories` bounded 50, chưa có cursor.

### Module 1

- `src/services/calendarImports.js` `listCalendarImports()` đọc toàn bộ collection imports theo `createdAt`.
- `searchCalendarEntries()` đã có `limit` và `startAfter` cursor; đây là pattern nên tái sử dụng.
- Các calendar entry/preview reads còn lại đều bounded hoặc có cursor.

Classification tổng hợp: **TECHNICAL DEBT — MEDIUM/HIGH**. Chưa có bằng chứng cần sửa Rules; cần bổ sung query/API/index theo từng rollout.

## E. Module scalability matrix

| Module | Current implementation | Risk at 1K | Risk at 10K | Recommended direction |
|---|---|---|---|---|
| Users | Full `users` read; client filter/sort/page | High | Critical | Trusted server-side user search + cursor; async selector |
| Custom roles | Full `roles` read; client type filter | Medium | High | Bounded role list; server-side type/status filter |
| Role assigned counts | Full users read + client reduce | High | Critical | Server-side summary/count or denormalized safe counter |
| Membership records | Backend limit 25/100; no cursor UI | Medium | High UX/cost over navigation | Cursor + status/tier/user filters |
| Membership target selector | Full users read into select | High | Critical | Async user search callable |
| Membership tiers | Full small catalog | Low | Medium if catalog grows | Keep bounded catalog; add cursor only when needed |
| Public News | Limit 20, access scan multiplier, no cursor | Medium | High | Cursor and server-side continuation; preserve evaluator |
| News management | Server title search, limit 20, no cursor/filter | Medium | High | Cursor + status/category filters + stable sort |
| News categories | Limit 50, no cursor | Low/Medium | Medium | Async search/cursor if catalog grows |
| News users | Server prefix search, limit 50, no cursor | Medium | High | Async selector + cursor |
| News groups | First 50 then filter | Medium | High/correctness | Server-side query/order/cursor |
| Calendar imports | Unbounded metadata read | Medium | High | Limit/cursor; keep entry search cursor pattern |
| Calendar entries | Bounded query + cursor | Low | Medium | Preserve; verify indexes/perf |
| Permission catalog | Static/small | Low | Low | Preserve static loading |
| ACL detail | No evidence of a bulk unbounded list | Not enough evidence | Not enough evidence | Audit with real ACL volume before changes |

## F. Proposed common search/pagination architecture

This is a proposal only; no implementation is included in Phase 10.12.

### Backend contract convention

Use a consistent read contract:

```js
{
  query,
  filters,
  pageSize,
  cursor
}
```

Response:

```js
{
  items,
  nextCursor,
  hasMore
}
```

Use Firestore cursor pagination (`startAfter`) rather than offset pagination. The backend must validate page size, allowlist filters, normalize query text and derive authorization from the trusted actor. Cursor encoding must not contain trusted role/permission claims supplied by the client.

### Frontend primitives

Potential shared primitives:

- `AdminAsyncSelect`: debounced server query, selected-value retention, loading/error/empty states.
- `AdminDataTable`: presentational table only; no authorization decisions.
- `AdminFilterBar`: shared query/filter state.
- `useAdminCursorList`: manages cursor, next/previous state and refresh.

These primitives must not become a second authorization engine. Callable services remain the read/security boundary.

### Recommended query rules

- Stable order (`updatedAt`/`createdAt` plus document ID tie-breaker).
- Explicit bounded default and maximum page size.
- Search performed by backend query/prefix contract, never by loading the entire collection.
- Composite indexes added only with a specific query and reviewed deployment scope.
- Preserve existing Rules and callable permission checks unless a documented security review proves a required change.

## G. User selector proposal

Introduce an authorized server-side read endpoint for user search, or extend an existing approved read contract. The request should accept only safe search/filter/cursor fields such as `query`, `status`, `pageSize`, and `cursor`.

The server must derive the actor from `request.auth.uid`, enforce `users.read` or the more specific management permission, and return minimal selector fields (UID, display name, safe status/role label as policy permits). It must not accept `actorUid`, client permissions, or client role claims.

Use this endpoint in:

- Admin Users search/list;
- Membership target selector;
- membership history filter;
- role assignment summaries where applicable.

Do not expose a broad wildcard user export endpoint.

## H. Membership scalability proposal

- Keep canonical `memberships/{membershipId}` and dynamic `membershipTiers/{tierId}` unchanged.
- Add cursor support to `listMemberships` and `getUserMemberships`.
- Add status/tier/user filters with server-side allowlists.
- Replace full user selector with `AdminAsyncSelect`.
- Keep tier list as a small dynamic catalog; avoid hard-coded VIP levels.
- Preserve single ACTIVE membership invariant and trusted mutation authorization.
- Add emulator tests for cursor continuation, filtering and unauthorized read/mutation boundaries.

No News evaluator integration or production data migration is implied by this audit.

## I. News scalability proposal

- Extend management list with cursor, status and category filters while preserving `listNewsManagement` authorization.
- Keep title search server-side; do not load all articles into the browser.
- Add continuation for public `listNews` without changing PUBLIC/VIP/SPECIAL semantics.
- Replace News user/group selectors with async server-side search.
- Fix `listNewsGroups` so filtering does not depend on the first 50 records.
- Add/verify indexes for the exact query combinations before deployment.
- Preserve ACL, access policy, Membership-aware evaluator, RBAC and legacy fallback behavior.

## J. Other admin modules

### Admin Users

Current local filtering/pagination is UX-only. The full read must be replaced by server-side query/cursor.

### Admin Roles

Separate role catalog loading from assigned-user counts. Counts should be obtained via a bounded/authorized backend summary rather than reading every user.

### Membership Tiers

Current full catalog read is acceptable while tier count is small. Keep dynamic schema and add scale support only if catalog size justifies it.

### Calendar

Preserve the existing cursor search for calendar entries. Bound `listCalendarImports` when import history can grow.

## K. Console error investigation

The reported browser error is:

`Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')` at `onboarding.js:48`.

Repository search found no matching `onboarding.js`, `startTime`, `onboarding`, `instrument` or `instrumentation` application source outside excluded/generated locations. Therefore the root cause is **NOT DETERMINED from repository evidence**. It may be external browser instrumentation, an extension, a deployed artifact not represented in the current checkout, or another runtime source.

No workaround or source change is recommended based only on this message. If the error remains, capture the production bundle URL/source map and full stack before classifying it as an application issue.

Classification: **NOT ENOUGH EVIDENCE — LOW/MEDIUM**. No production impact can be attributed to the repository from current evidence.

## L. Security and RBAC impact

Scalability work must preserve these invariants:

- Authorization remains server-side for trusted read and mutation paths.
- Actor UID comes from Firebase Auth context, never payload.
- Client cannot provide role, permissions, effective permissions, membership level or access policy as authority.
- Async selectors only improve UX; they do not authorize actions.
- Direct Firestore reads, where retained, remain protected by existing Rules.
- No broad user export or wildcard mutation endpoint.
- News access evaluator remains the only News access decision path; no second engine is introduced.
- Membership tier level is resolved from canonical tier data, not client input or duplicated membership fields.

Security classification: **PASS at architecture level; future implementation requires regression tests**. No Rules/RBAC change is required by this audit.

## M. Migration plan in small phases

1. **Phase 10.12.1 — Shared read UX contract**: define cursor/query response conventions and async selector/table primitives; no business-policy change.
2. **Phase 10.12.2 — Trusted user search**: add the minimum authorized user read contract, then migrate Membership selectors and Admin Users list.
3. **Phase 10.12.3 — Membership navigation**: add cursor/filter UI and tests; preserve canonical membership schema.
4. **Phase 10.12.4 — Roles and counts**: bound custom-role catalog and replace full-user assigned-count calculation.
5. **Phase 10.12.5 — News management scale**: add article cursor/status/category filters and correct group selector search; preserve News policy.
6. **Phase 10.12.6 — Module 1/admin cleanup**: bound import history and verify existing calendar cursor queries/indexes.
7. **Phase 10.12.7 — Hardening**: emulator, Rules, frontend, browser and performance checks at representative volumes.

Each implementation phase should be separately reviewed and deployed only after its contract, indexes, authorization tests and production-readiness checks pass.

## Findings summary

| Finding | Classification | Impact | Code change now? | Production impact now? | Dependency |
|---|---|---|---|---|---|
| Full users read in Admin Users | TECHNICAL DEBT | High/Critical at scale | No, audit only | No current mutation | Trusted user search contract |
| Full users read in Membership selectors | TECHNICAL DEBT | High/Critical at scale | No | No current mutation | Trusted user search contract |
| Full roles read and client user counts | TECHNICAL DEBT | Medium/High | No | No current mutation | Role summary/read contract |
| Membership list has no cursor UI | PARTIAL | Medium/High UX | No | No current mutation | Cursor contract |
| News management lacks cursor/filters | PARTIAL | Medium/High | No | No current mutation | News read contract/indexes |
| News groups filter only first 50 | TECHNICAL DEBT | Correctness/High at scale | No | No current mutation | Group search query |
| Calendar imports unbounded | TECHNICAL DEBT | Medium | No | No current mutation | Calendar read contract |
| No shared async data primitives | TECHNICAL DEBT | Medium maintainability | No | No | Shared UX phase |
| `onboarding.js` console error | NOT ENOUGH EVIDENCE | Unknown | No | Unknown | Production stack/source map |

## Audit-only safety result

- CODE CHANGE: NO
- PRODUCTION DATA CHANGE: NO
- FIREBASE DEPLOY: NO
- VERCEL DEPLOY: NO
- RULES CHANGE: NO
- SCHEMA CHANGE: NO
- RBAC CHANGE: NO
- COMMIT: NO
- PUSH: NO
