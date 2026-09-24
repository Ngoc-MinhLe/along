# Next Phase Roadmap — RBAC, System Role, News và các bước tiếp theo

Ngày audit: 2026-09-24
Phạm vi: audit source/repository và lập roadmap.
Trạng thái thay đổi: chỉ tạo tài liệu này; không sửa source code, Firestore Rules, production data, deployment hoặc Git history.

## 1. Kết luận điều hành

Project hiện đã có nền tảng RBAC và trusted backend khá đầy đủ:

- System Role gồm `USER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN`, `ROOT_ADMIN`.
- Custom Role được tách khỏi System Role.
- Effective Permissions được materialize vào `userAuthorizations/{uid}`.
- Các mutation nhạy cảm đã chuyển sang Firebase Callable Functions/Admin SDK.
- `setSystemRole` là ROOT-only và chỉ cho phép cấp các role không phải ROOT.
- Module 1 đang hoạt động; Module 2 đã có backend/frontend implementation theo status document; Module 3 chưa triển khai.

Kết luận chính:

1. **Đã có System Role ADMIN.** ADMIN hiện có quyền quản trị một phần, nhưng không có quyền tạo/sửa/disable/delete Custom Role và không thể gọi `setSystemRole`.
2. **ROOT_ADMIN hiện có thể cấp ADMIN** thông qua `setSystemRole`, với điều kiện target tồn tại, active, không phải ROOT và caller vượt qua toàn bộ kiểm tra trusted ROOT.
3. **ADMIN có thể đọc User và assign/revoke Custom Role trong phạm vi policy**, nhưng không có toàn quyền quản trị user và không thể thay đổi System Role.
4. `SUPER_ADMIN` hiện có cùng 30 permission catalog với `ROOT_ADMIN`, nhưng vẫn không được gọi mutation System Role vì backend bắt buộc `requireRootActor()`. Đây là khác biệt về trust boundary.
5. Còn các khoảng trống cần xử lý trước khi mở rộng quản trị: audit log chưa hiện thực, user authorization mới chưa tự materialize bằng Auth trigger, policy catalog được biểu diễn ở nhiều lớp và delegation boundary chưa có contract hiển thị rõ trong UI.

Roadmap khuyến nghị:

```text
Production closure
  -> Authorization consistency và auditability
  -> User lifecycle/delegated administration
  -> News entitlement/group/subscription
  -> Quiz module
  -> Hardening, performance và operations
```

## 2. Bằng chứng và phạm vi kiểm tra

Đã đối chiếu:

- `docs/PROJECT_STATUS.md`
- `src/services/rbac/*`
- `src/pages/Admin*.jsx`, `src/layouts/AdminLayout.jsx`, `src/App.jsx`
- `functions/src/*`
- `functions/test/*`
- `scripts/*rbac*`, `scripts/*authorization*`, `scripts/*system-role*`, `scripts/*rules*`
- `firestore.rules`, `firebase.json`, `.firebaserc`
- root và Functions `package.json`

Đã search các nhóm `setSystemRole`, `roles.*`, `users.*`, `SUPER_ADMIN`, `ROOT_ADMIN`, `userAuthorizations` và audit-related names.

Kết quả kiểm tra cục bộ trong lượt audit:

| Kiểm tra | Kết quả |
|---|---|
| `npm run check:functions` | PASS theo output kiểm tra syntax Functions |
| `npm run test:functions` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:system-role-tool` | PASS |
| `npm run build` | PASS; có cảnh báo bundle lớn hơn 500 kB |
| `git diff --check` trước khi tạo tài liệu | PASS |
| `npm run test:rules` | PASS — 81 assertions; chạy với XDG_CONFIG_HOME tạm trong workspace và JDK 21 |

`npm run test:rules` đã được tái lập thành công. EPERM chỉ nằm ở Firebase CLI configstore mặc định; test được chạy an toàn với XDG_CONFIG_HOME tạm trong workspace và JDK 21, không sửa Rules và không chạm production.

## 3. Kiến trúc hiện tại

### 3.1 Authentication và actor trust

Trusted Functions dùng `request.auth.uid` làm actor UID. `functions/src/auth.js`:

1. yêu cầu request đã authenticate;
2. từ chối payload có `actorUid`;
3. đọc `users/{uid}`;
4. yêu cầu profile tồn tại, `uid` khớp và `status === active`;
5. đọc Firebase Auth record và Custom Claims;
6. đọc `userAuthorizations/{uid}`;
7. kiểm tra consistency giữa profile, claims và materialized authorization;
8. fail closed nếu dữ liệu thiếu, sai schema, role/permission không hợp lệ hoặc version không hợp lệ.

Client không được cung cấp actor, claims, effective permissions hoặc danh sách quyền để quyết định authorization.

### 3.2 Authorization materialization

```text
Firebase Auth context
        +
users/{uid}.systemRole
        +
users/{uid}.customRoles
        +
roles/{roleId} active + policy-valid
        +
Permission Catalog
        ↓
trusted materialization
        ↓
userAuthorizations/{uid}
        ↓
Functions authorization / Firestore Rules / frontend UI state
```

`functions/src/custom-role-service.js` validate lại các role được tham chiếu trước khi đưa permission vào materialization. Role malformed, disabled, unknown permission và forbidden permission không được đưa vào effective permission list.

### 3.3 Firestore boundary

`firestore.rules` hiện có các boundary chính:

- `calendarImports`: read public; write yêu cầu `calendar.import`.
- `users`: owner được đọc profile của mình; user có `users.read` được list/read; protected fields không được owner tự sửa; delete bị cấm.
- `roles`: read theo `roles.read` hoặc một role được gán cho chính actor; các write an toàn bị permission-gate; các thay đổi cần propagation được đưa qua trusted backend.
- `userAuthorizations`: owner `get` only; list và mọi client write bị cấm.
- `systemConfig/root`: không có client write path.
- News collections hiện không có client write match riêng; mặc định direct Firestore access bị deny, trong khi News backend dùng Admin SDK.

### 3.4 Frontend boundary

Frontend dùng `PermissionContext`, `PermissionGate`, `AdminLayout` và route guard để điều khiển UX. Đây chỉ là UX boundary. Backend Callable và Firestore Rules mới là security boundary cuối cùng.

`src/services/rbac/firestore.js` là read-only đối với RBAC. Các mutation trong `src/services/rbac/functions.js` gọi Callable Functions; payload không gửi actor hoặc quyền hiệu lực.

## 4. System Role hiện tại

### 4.1 Danh sách và hierarchy

```text
ROOT_ADMIN
    > SUPER_ADMIN
        > ADMIN
            > EDITOR
                > USER
```

`GUEST` là trạng thái chưa đăng nhập, không phải System Role.

Định nghĩa chính:

- `src/services/rbac/roles.js`: `SYSTEM_ROLES`, `ROLE_HIERARCHY`, `isSystemRole`, `hasMinimumRole`.
- `src/services/rbac/policy.js`: `ROLE_PERMISSIONS`, hierarchy helpers và Custom Role policy.
- `functions/src/auth.js`: backend trusted validation và Root detection.
- `functions/src/system-role-service.js`: assignable System Role và mutation transaction/rollback.

### 4.2 Permission matrix

| System Role | Effective permission |
|---|---:|
| `USER` | 2 |
| `EDITOR` | 11 |
| `ADMIN` | 16 |
| `SUPER_ADMIN` | 30 |
| `ROOT_ADMIN` | 30 |

Chi tiết:

- `USER`: `calendar.search`, `calendar.export`.
- `EDITOR`: toàn bộ quyền của USER, cộng `news.read`, `news.create`, `news.update`, `news.delete`, `news.publish`, `quiz.question.read`, `quiz.question.create`, `quiz.question.update`, `quiz.question.delete`.
- `ADMIN`: `calendar.search`, `calendar.export`, `calendar.import`, `users.read`, `roles.read`, `roles.assign`, `roles.revoke`, toàn bộ `news.*` hiện có và toàn bộ `quiz.question.*` hiện có.
- `SUPER_ADMIN` và `ROOT_ADMIN`: toàn bộ catalog:

```text
users.read, users.create, users.update, users.delete
roles.read, roles.create, roles.update, roles.disable, roles.delete, roles.assign, roles.revoke
calendar.search, calendar.export, calendar.import
news.read, news.create, news.update, news.delete, news.publish
quiz.question.read, quiz.question.create, quiz.question.update, quiz.question.delete
quiz.exam.create, quiz.exam.update, quiz.exam.publish, quiz.exam.delete
approval.create, approval.review, audit.read
```

`SUPER_ADMIN` có 30 permission nhưng không có Root trust boundary, vì `setSystemRole` và Root-sensitive operations vẫn gọi `requireRootActor()`.

## 5. System Role, Custom Role và Effective Permissions

### 5.1 System Role

System Role là thuộc tính authoritative của profile/Auth claims và được phản ánh trong `userAuthorizations`. System Role xác định baseline permission và trust level. System Role không được lưu như một Custom Role trong `roles/{roleId}`.

### 5.2 Custom Role

Custom Role nằm trong `roles/{roleId}` và profile chỉ lưu các ID trong `users/{uid}.customRoles`.

Invariant hiện tại:

- role phải có `type === CUSTOM`;
- ID không được trùng `ROOT_ADMIN`, `SUPER_ADMIN`, `ADMIN`, `EDITOR`, `USER`;
- permissions phải thuộc catalog;
- status chỉ `active` hoặc `disabled`;
- forbidden permissions không được tạo/gán/materialize trong Custom Role;
- disabled role không đóng góp permission;
- role ID immutable sau khi tạo;
- không delete role đang được user sử dụng;
- malformed role bị loại khỏi materialized permissions.

Forbidden trong Custom Role:

```text
users.delete
roles.create
roles.update
roles.disable
roles.delete
roles.assign
roles.revoke
```

### 5.3 Effective Permissions

Effective Permissions là union của permission từ System Role và các Custom Role đang active, sau validation/catalog filtering. Kết quả trusted được ghi vào `userAuthorizations/{uid}`.

Frontend đọc materialized authorization để hiển thị UI; frontend không được dùng giá trị client gửi để cấp quyền. Backend đọc lại actor context/authorization và Rules dùng document materialization theo actor.

## 6. Current capabilities

### 6.1 ADMIN

ADMIN hiện có thể:

- đọc danh sách/profile User vì có `users.read`;
- đọc danh sách Custom Role vì có `roles.read`;
- assign/revoke Custom Role vì có `roles.assign`/`roles.revoke`, nhưng backend còn kiểm tra role active, role hợp lệ và permission của role nằm trong phạm vi actor;
- dùng các tính năng News/Quiz question mà permission matrix cho phép;
- import calendar vì có `calendar.import`;
- mở các admin route tương ứng permission.

ADMIN hiện không thể:

- gọi `setSystemRole`; backend chỉ Root được gọi;
- tạo/sửa/disable/delete Custom Role vì không có các permission mutation tương ứng;
- đổi `systemRole` bằng browser hoặc direct Firestore;
- cấp `ROOT_ADMIN`, sửa target ROOT hoặc tự cấp thêm quyền bằng payload giả;
- tự ghi `userAuthorizations`;
- thực hiện user lifecycle mutation cho suspend/delete/Auth disable vì workflow này chưa có trong source.

### 6.2 SUPER_ADMIN

SUPER_ADMIN có toàn bộ 30 permission catalog và có thể thực hiện Custom Role mutations theo policy nếu role hợp lệ. Tuy nhiên:

- không gọi được `setSystemRole` vì Function yêu cầu Root;
- không thay đổi Root lock;
- không đổi target ROOT;
- không tạo Custom Role có forbidden permission.

### 6.3 ROOT_ADMIN

ROOT_ADMIN là actor duy nhất hiện được trusted `setSystemRole`:

- target phải tồn tại, active và Auth không disabled;
- target không được là ROOT;
- role chỉ thuộc `USER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN`;
- claims, profile và `userAuthorizations` được đồng bộ;
- có consistency verification và rollback khi bước sau mutation thất bại;
- root lock và exactly-one-ROOT protection vẫn được kiểm tra.

### 6.4 Câu trả lời nghiệp vụ

**Có, hiện tại đã có thể biến USER thành ADMIN**, thông qua `setSystemRole` Callable Function bằng ROOT_ADMIN. Sau mutation, User nhận baseline permissions của ADMIN sau lần refresh/re-login cần thiết để Auth claims và frontend authorization state cập nhật.

Nhưng **ADMIN chưa phải full user manager**. Nếu mục tiêu là để ADMIN quản lý vòng đời User, cấp System Role hoặc quản lý tất cả Custom Role, cần policy và phase backend riêng; không nên suy ra các quyền đó chỉ từ việc role ADMIN đã tồn tại.

## 7. Callable Functions và mutation map

### System Role

- `setSystemRole` — `functions/src/system-role-functions.js`, export từ `functions/src/index.js`.
- Payload allowlist: `targetUid`, `targetSystemRole`.
- Không nhận actorUid, permissions, claims, customRoles hoặc effectivePermissions.
- ROOT-only.

### Custom Role

- `createCustomRole`
- `updateCustomRole`
- `disableCustomRole`
- `enableCustomRole`
- `deleteCustomRole`
- `assignCustomRole`
- `revokeCustomRole`

Các Function tương ứng nằm trong `functions/src/custom-role-functions.js` và service trong `functions/src/custom-role-service.js`.

### News

News có callable trong `functions/src/news-functions.js` cho trusted read/mutation theo implementation Phase 8. News client dùng `src/services/news.js`; direct client News write không phải workflow hợp lệ.

### Những gì chưa có

Audit source không thấy audit-log collection/service/function hoàn chỉnh. `audit.read` đã tồn tại trong Permission Catalog, nhưng không đồng nghĩa audit event storage đã được hiện thực.

Không thấy callable hoàn chỉnh cho:

- create/suspend/restore/delete User;
- disable/enable Firebase Auth user qua policy quản trị;
- user profile administrative update;
- approval workflow;
- VIP entitlement/group membership workflow.

## 8. Security audit

### PASS

- actor lấy từ Firebase Auth context;
- payload có `actorUid` bị từ chối;
- backend không tin role/permission/claims/customRoles do client gửi;
- client không ghi `userAuthorizations`;
- owner không tự đổi `systemRole`, `status` hoặc `customRoles`;
- target ROOT bị bảo vệ trong System Role và Custom Role workflow;
- `ROOT_ADMIN` không thể được tạo dưới dạng Custom Role;
- Custom Role không được chứa permission policy-protected;
- role disabled/malformed/unknown permissions không được materialize;
- News direct Firestore mutation bị deny theo default Rules path; mutation đi qua trusted backend;
- Module 1 flow được giữ nguyên, ngoài giới hạn export đã được ghi trong status.

### WARNING

#### 8.1 Chưa có audit log implementation

Có permission `audit.read` nhưng chưa thấy collection/service ghi append-only audit event cho `setSystemRole`, role mutation, assignment/revoke hoặc News mutation. Đây là thiếu sót auditability với mutation quyền.

#### 8.2 New user chưa tự động materialize authorization

`docs/PROJECT_STATUS.md` ghi nhận chưa có `onAuthUserCreated` trigger. User mới có thể thiếu `userAuthorizations/{uid}` cho đến khi trusted rebuild; protected permissions vẫn phải fail closed. Đây là consistency/operability gap.

#### 8.3 Policy hiện diện ở nhiều lớp

Permission catalog và role policy được biểu diễn ở frontend, backend và Rules-side allowlist. Đây chưa phải authorization engine thứ hai, nhưng là nguy cơ policy drift giữa `src/services/rbac/policy.js`, `functions/src/auth.js`, `functions/src/custom-role-service.js` và `firestore.rules`.

#### 8.4 Helper frontend và backend có phạm vi khác nhau

`src/services/rbac/policy.js` có `canAssignSystemRole` hỗ trợ logic hierarchy cho non-root, trong khi backend `setSystemRole` là ROOT-only và `AdminUsersPage` chỉ hiển thị control cho ROOT. Hiện không tạo bypass vì server là boundary cuối cùng, nhưng là inconsistency cần làm rõ.

#### 8.5 Data access và scalability

`listUsers()` hiện đọc toàn bộ `users` collection cho màn hình quản trị. Với quy mô lớn cần pagination/server-side search và giảm dữ liệu profile trả về.

#### 8.6 Transaction propagation

Role update/disable rebuild nhiều user bằng các batch tuần tự và có rollback/repair logic. Đây không phải một transaction Firestore duy nhất; nếu rollback cũng thất bại, cần consistency check/rebuild thủ công.

### NEEDS VERIFICATION

- Production browser evidence do chủ dự án cung cấp: ROOT_ADMIN đã đổi System Role thành công; SUPER_ADMIN truy cập được hệ thống quản trị nhưng không được đổi System Role của User. Cần cập nhật `PROJECT_STATUS.md` ở một lượt documentation riêng nếu muốn đồng bộ status file.
- Repository status cũ có thể còn ghi frontend pending push/deployment; bằng chứng browser production mới nhất cần được đối chiếu với commit/Vercel deployment trước khi chốt release metadata.
- `npm run test:rules` đã PASS 81 assertions sau khi dùng Firebase CLI configstore tạm thời và JDK 21 cho đúng process test. Không còn blocker Rules trong Phase 10.1.

## 9. Phân loại công việc còn lại

### 9.1 Security Required

Các hạng mục cần ưu tiên vì liên quan trực tiếp đến trust boundary, consistency hoặc forensic capability:

1. **Production deployment closure**: xác minh commit frontend thực tế, Vercel deployment, Auth claims refresh và browser smoke test cho `setSystemRole`.
2. **Audit event foundation**: append-only audit log từ trusted Functions cho System Role, Custom Role, assignment/revoke và News ACL/access mutations. Client không được ghi audit event.
3. **Authorization consistency lifecycle**: bảo đảm user mới có authorization materialization đáng tin cậy; cân nhắc Auth trigger/trusted onboarding và repair tooling. Phải giữ fail-closed khi materialization thiếu.
4. **Policy/catalog conformance**: tạo contract/self-test để phát hiện drift giữa catalog, frontend policy, backend constants và Rules allowlist. Không cho từng lớp tự mở rộng permission.
5. **User lifecycle security**: nếu mở suspend/delete/disable Auth, phải có trusted Callable, claim/session invalidation, target policy, audit event và rollback/repair.
6. **News entitlement security**: trước khi có VIP production data phải có entitlement/group ownership, expiry/revoke semantics server-side; không dùng UI hoặc Custom Role thay cho entitlement.

### 9.2 Functional Completion

1. Admin delegated user management theo policy được duyệt: profile view, search/pagination, status lifecycle, giới hạn target và allowed transitions.
2. Custom Role management UX/backend hoàn chỉnh cho các actor được policy cho phép, gồm conflict handling và repair visibility.
3. News production readiness: VIP entitlement, group membership, category/article ACL administration và production smoke fixture cleanup.
4. Module 3 Quiz: question bank, exam builder, practice mode, grading và sau đó exam mode.
5. Admin observability: authorization diagnostics, materialization version/status, failed propagation queue hoặc repair screen.

### 9.3 Optional / Hardening

1. Browser E2E tự động cho Auth, RBAC, System Role và News.
2. Server-side pagination/indexing cho users/roles/news.
3. Bundle splitting và lazy loading admin/news pages; build hiện PASS nhưng có bundle warning khoảng 1.3 MB minified.
4. Monitoring/alerting cho callable failures, authorization inconsistency và rollback failures.
5. Export protection cho Module 1 nếu nghiệp vụ yêu cầu `calendar.export` là security boundary thật sự. Với calendar public-readable, Rules không thể ngăn người dùng đã đọc dữ liệu sao chép/export.

## 10. Roadmap phase đề xuất

### Phase 9.3 completion gate — Production closure

**Mục tiêu:** đóng các công việc đã viết nhưng chưa được xác minh trên production.

**Phạm vi:** không đổi policy; xác minh Vercel/frontend commit, production `setSystemRole`, claims refresh, ROOT → USER/EDITOR/ADMIN/SUPER_ADMIN và deny cases bằng tài khoản test an toàn.

**Không làm:** tạo role/permission mới, mở Rules, mở quyền ADMIN, tạo production fixture không cleanup được.

**DoD:** frontend deployment và Function version khớp source; browser smoke test có evidence; không có mutation ngoài test case đã phê duyệt; status document được cập nhật.

### Phase 10.1 — Authorization Consistency & Policy Conformance

**Mục tiêu:** giảm nguy cơ stale/missing authorization và policy drift trước khi mở rộng quản trị.

**Phạm vi dự kiến:**

- trusted onboarding/materialization strategy cho user mới;
- consistency check rõ ràng giữa Auth claims, profile và `userAuthorizations`;
- canonical policy contract hoặc generated conformance checks;
- test matrix cho tất cả role/permission/forbidden custom permission;
- repair/alert path, không tự silent grant quyền.

**Invariant:** thiếu hoặc mâu thuẫn authorization phải fail closed; không tin client; không tạo engine thứ hai; không tự cấp ROOT.

**DoD:** user lifecycle test, drift test, stale claim test, malformed role test và Rules/Functions regression PASS.

### Phase 10.5 — Audit & Security Event Foundation

**Mục tiêu:** có lịch sử đáng tin cho mutation nhạy cảm.

**Phạm vi dự kiến:**

- append-only `auditLogs/{eventId}` hoặc schema tương đương do trusted backend ghi;
- actor lấy từ Auth context;
- target, operation, before/after summary, outcome, request correlation và timestamps;
- không ghi token/password/secret/toàn bộ authorization document;
- read policy riêng cho `audit.read`;
- retention và query/index tối thiểu.

**DoD:** mọi setSystemRole/Custom Role assignment và News ACL mutation đều phát sinh audit event; client direct write bị deny; test tamper resistance PASS.

### Phase 10.3 — Admin Delegated User Management

**Mục tiêu:** cho ADMIN quản lý User trong phạm vi được duyệt, không tạo privilege escalation.

**Phạm vi cần quyết định trước:**

- ADMIN có được suspend/restore User không;
- ADMIN có được assign/revoke Custom Role nào;
- ADMIN có được set `USER ↔ EDITOR` hoặc `USER ↔ ADMIN` không;
- ADMIN có được tác động ADMIN khác không;
- SUPER_ADMIN có được làm gì khác ADMIN;
- user delete và Auth disable có được triển khai không.

**Policy mặc định an toàn đề xuất:**

- ROOT có thể cấp non-root System Role theo allowlist hiện tại;
- ADMIN không được gọi `setSystemRole` trong phase đầu;
- ADMIN chỉ assign/revoke Custom Role có effective permissions là subset của actor và target không phải ROOT;
- mọi status/Auth lifecycle mutation đi qua Callable riêng, có audit và target hierarchy check;
- không cho phép ADMIN tạo quyền cao hơn chính actor.

**DoD:** policy transition matrix, callable tests, Rules tests, audit events, rollback/repair và browser UX tests PASS.

### Phase 10.4 — News Entitlement, Group và Subscription Foundation

**Mục tiêu:** hoàn thiện các inputs còn thiếu cho VIP1/VIP2/VIP3/SPECIAL production.

**Phạm vi:** entitlement theo user, group membership, expiry/revoke, category/article ACL, subscription/paid-content hooks và trusted read contract hiện có.

**Invariant:** Custom Role không thay thế entitlement; USER không tự nâng VIP; article ACL malformed phải deny; read result không leak existence nếu contract yêu cầu not-found.

**DoD:** emulator + Rules + callable + frontend tests cho PUBLIC/VIP/SPECIAL, expired entitlement, group membership và revoke.

### Phase 10.5 — Module 3 Quiz Foundation

**Mục tiêu:** triển khai Quiz sau khi authorization/audit nền tảng ổn định.

**Phạm vi:** question bank, categories/tags, practice mode, answer feedback, exam model và grading contract.

**Invariant:** question/exam mutation trusted; không leak đáp án trong exam mode; permission theo catalog; không ảnh hưởng Module 1/News.

### Phase 10.6 — Production Hardening

**Mục tiêu:** performance, monitoring, E2E, backup/repair và UX.

**Phạm vi:** pagination, indexes, bundle split, browser E2E, alerting, audit retention, failure queue và backup/restore drill.

## 11. Đề xuất permission mới

Không cần thêm permission mới chỉ để hoàn thành audit này. Catalog hiện có các nhóm nền tảng nhưng một số permission chưa có workflow backend tương ứng.

Nếu triển khai Admin Delegation, nên quyết định rõ trước khi thêm:

| Permission đề xuất | Actor dự kiến | Target | Điều kiện | Lý do |
|---|---|---|---|---|
| `users.status.update` | ROOT/ADMIN theo policy | User non-root | target scope, transition, audit | Tách status lifecycle khỏi `users.update` profile |
| `users.auth.disable` | ROOT/SUPER hoặc policy cụ thể | User non-root | Auth + profile + authz consistency | Không lẫn với profile update |
| `users.roles.manage` | ROOT/ADMIN theo policy | Custom Role assignment | subset-of-actor, no ROOT target, active role | Tách assignment khỏi role definition mutation |
| `systemRole.assign` | ROOT only | non-root User | allowlist USER/EDITOR/ADMIN/SUPER_ADMIN | Tên rõ hơn cho policy, nhưng không bắt buộc nếu `setSystemRole` đã là boundary |
| `audit.read` | ROOT/SUPER/được cấp | audit events | scope/filter policy | Permission đã tồn tại; cần backend/read model thật |

Đây là đề xuất, không phải thay đổi đã thực hiện. Không nên thêm permission chỉ để làm UI hiện nút.

## 12. Dependencies và thứ tự triển khai an toàn

```text
Production closure
    ↓
10.1 Consistency + policy conformance
    ↓
10.2 Audit event foundation
    ↓
10.3 Delegated user management
    ├──> 10.4 News entitlement/group/subscription
    └──> 10.5 Quiz foundation
    ↓
10.6 Hardening/operations
```

Lý do:

- Không mở quyền ADMIN khi chưa có audit và consistency signal.
- Không mở VIP/SPECIAL production khi entitlement/group source chưa có schema và revoke semantics.
- Không mở Quiz khi permission catalog có sẵn nhưng business model và answer security chưa được chốt.
- Không triển khai bất kỳ phase nào bằng direct client write để né backend authorization.

## 13. Migration và production impact

### Nguyên tắc

- Không đổi tên các collection đang dùng.
- Không chuyển `systemRole` thành Custom Role.
- Không bỏ `userAuthorizations`.
- Không backfill permission bằng client.
- Mọi backfill authorization phải chạy bằng Admin SDK/tool trusted, có dry-run, report và rollback/repair.
- News entitlement/group backfill chỉ chạy khi có fixture/mapping rõ ràng; không suy diễn VIP từ System Role hoặc Custom Role.

### Production data impact

| Phase | Production data |
|---|---|
| 9.3 completion gate | Chỉ smoke mutation đã được phê duyệt, nếu cần; không tạo fixture không cleanup được |
| 10.1 | Có thể cần rebuild `userAuthorizations`; phải dry-run và xác minh trước |
| 10.2 | Tạo audit events từ mutation mới; không sửa lịch sử cũ nếu chưa có migration plan |
| 10.3 | Có thể thay đổi users/Auth claims/authorization cho actor được phê duyệt; phải có audit và rollback |
| 10.4 | Có thể tạo entitlement/group/article ACL; phải có fixture cleanup và access review |
| 10.5 | Tạo question/exam data; triển khai riêng, không chạm Module 1 |

## 14. Definition of Done chung

Mỗi phase chỉ được đánh dấu hoàn thành khi:

- source audit trước implementation;
- payload allowlist và actor từ Auth context;
- server-side allow/deny tests;
- forged actor/role/permission payload tests;
- ROOT protection tests;
- malformed/stale/missing authorization tests;
- Functions unit + emulator tests;
- Firestore Rules tests bằng môi trường Firebase CLI hợp lệ;
- frontend permission visibility tests nếu có UI;
- `npm run check:functions`;
- `npm run build`;
- `git diff --check`;
- production safety review;
- status document cập nhật sau review;
- chưa deploy/ghi production nếu chưa có checkpoint riêng.

## 15. Các quyết định cần chủ dự án xác nhận

1. Có giữ `SUPER_ADMIN` với toàn bộ 30 permission như hiện tại hay giảm permission để khác biệt thực chất với ROOT?
2. ADMIN có được suspend/restore User không? Nếu có, target scope và audit requirement là gì?
3. ADMIN có được chuyển `USER ↔ EDITOR` hoặc `USER ↔ ADMIN` không, hay System Role luôn ROOT-only?
4. Có cần triển khai user delete/Auth disable trong roadmap gần không?
5. `audit.read` sẽ dành cho ROOT only hay ROOT/SUPER/actor được ủy quyền?
6. Có cần browser E2E tự động hay manual smoke test là đủ cho production gate?
7. News VIP1/VIP2/VIP3 là entitlement riêng, subscription, hay derived từ membership khác?
8. Group ACL thuộc mô hình group nào: static group, organization, hay subscription group?
9. Module 3 bắt đầu sau khi News entitlement hoàn tất hay có thể chạy song song sau 10.2?
10. Có chấp nhận policy duplication kèm conformance test, hay muốn canonical policy package trước khi mở thêm mutation?

## 16. Current phase và next phase

Theo `docs/PROJECT_STATUS.md` và source hiện tại:

- Current phase: **Phase 10.5 — Audit & Security Event Foundation — COMPLETED locally**.
- Phase 9.3: Function đã deploy và production browser evidence đã được chủ dự án xác nhận; status document cần được đồng bộ riêng nếu cần.
- Phase 10.2 — Permission Explanation & Admin UX đã được triển khai local và regression-tested PASS.
- Phase 10.3 — Admin Delegated User Management đã được triển khai local và regression-tested PASS.
- Next implementation phase khuyến nghị: **Phase 10.6 — News Entitlement / Group / Subscription Foundation**.
- Phase 10.5 Audit đã được hoàn thành locally; Phase 10.6 là bước tiếp theo sau review.

Tài liệu này là roadmap/audit only. Không phase nào ở trên được implement trong lượt này.

## 17. Git và production safety

- Không commit/push trong lượt audit.
- Không deploy Firebase/Vercel.
- Không ghi production data.
- Không sửa Firestore Rules.
- Không sửa Module 1, Module 2 hoặc Module 3 source.
- Git working tree được kiểm tra sạch trước khi tạo file roadmap; sau khi tạo file này, file duy nhất dự kiến là `docs/NEXT_PHASE_ROADMAP.md` ở trạng thái untracked.

## 18. Tóm tắt

| Câu hỏi | Kết luận |
|---|---|
| Đã có ADMIN chưa? | YES |
| ROOT_ADMIN có thể cấp ADMIN chưa? | YES, qua trusted `setSystemRole` |
| ADMIN có thể đọc/quản lý User không? | Có đọc và một phần role assignment; chưa có full lifecycle management |
| ADMIN có thể tạo/sửa/xóa Custom Role không? | Không theo System Role permissions hiện tại |
| SUPER_ADMIN có quyền bằng ROOT về permission không? | Có 30 permission, nhưng không có Root trust boundary |
| ADMIN có thể cấp ROOT_ADMIN không? | NO |
| User có thể tự nâng quyền không? | Không qua trusted path/Rules hiện tại |
| Audit log đã đầy đủ chưa? | NO — NEEDS IMPLEMENTATION |
| Authorization consistency lifecycle đã đầy đủ chưa? | Chưa; new-user trigger/materialization còn là known limitation |
| Phase tiếp theo nên làm gì? | Phase 10.6 News Entitlement / Group / Subscription Foundation |

---

**Kết luận cuối:** Nền tảng hiện tại đủ để tiếp tục roadmap có kiểm soát, nhưng không nên mở rộng quyền ADMIN hoặc VIP production chỉ dựa vào UI. Trusted backend, materialized authorization, Rules, auditability và consistency checks phải tiếp tục là các invariant bắt buộc.

---

# Phase 10 — Roadmap and Implementation Status

Phần này là bản refinement và status có hiệu lực cho kế hoạch Phase 10 dựa trên bằng chứng production mới nhất do chủ dự án cung cấp. Các phần roadmap trước vẫn được giữ để làm lịch sử audit; nếu có khác biệt về thứ tự hoặc tên phase, phần này được ưu tiên.

## 19. ROLE / PERMISSION / DELEGATION MODEL

### 19.1 Bốn khái niệm phải tách biệt

| Khái niệm | Ý nghĩa | Nguồn authoritative |
|---|---|---|
| System Role | Vai trò nền tảng cố định: USER, EDITOR, ADMIN, SUPER_ADMIN, ROOT_ADMIN | Auth Claims + users/{uid}.systemRole + consistency check |
| Custom Role | Nhóm permission do trusted policy cho phép, được gán bằng role ID | roles/{roleId} và users/{uid}.customRoles |
| Permission | Một khả năng thao tác cụ thể, ví dụ news.publish | Permission Catalog |
| Effective Permission | Union sau khi tính System Role + active Custom Role và lọc policy | userAuthorizations/{uid} |
| Delegation | Quyền cấp/thu hồi role hoặc permission cho actor khác | Trusted backend policy, không suy ra tự động từ permission |

Having a permission và Being allowed to delegate that permission là hai khái niệm khác nhau. Có permission để thực hiện một hành động không mặc nhiên cho phép cấp hành động đó cho User khác.

Ví dụ:

- SUPER_ADMIN có nhiều permission, thậm chí 30 permission theo catalog hiện tại, nhưng không được gọi setSystemRole.
- ADMIN có roles.assign và roles.revoke, nhưng không vì vậy mà được assign mọi Custom Role cho mọi target.
- Actor có news.publish có thể xuất bản bài viết nếu policy cho phép, nhưng không mặc nhiên được tạo role chứa news.publish hoặc cấp role đó cho User khác.

### 19.2 Mô hình thực tế

#### ROOT_ADMIN

- Có thể thay đổi System Role qua trusted setSystemRole.
- Có thể cấp USER, EDITOR, ADMIN, SUPER_ADMIN.
- Không được tạo/cấp ROOT_ADMIN qua Custom Role hoặc payload.
- Không được phá root lock, tạo ROOT thứ hai hoặc sửa target ROOT.
- Có thể quản lý Custom Role theo policy hiện tại.

#### SUPER_ADMIN

- Có 30 Effective Permissions theo policy hiện tại.
- Có thể sử dụng các chức năng quản trị mà permission cho phép.
- Có thể quản lý Custom Role nếu policy/backend cho phép.
- Không được thay đổi System Role của User khác.
- Không được cấp SUPER_ADMIN hoặc ADMIN qua setSystemRole.
- Không được tạo đường vòng tới ROOT bằng Custom Role.

#### ADMIN

- Có users.read, một số roles.*, Calendar import và các module được policy cấp.
- Có thể assign/revoke Custom Role trong delegation boundary của mình.
- Không được tự nâng System Role.
- Không được cấp System Role cho User khác trong policy hiện tại.
- Không được tạo Custom Role có permission vượt quá phạm vi delegation.

#### EDITOR

- Có quyền nội dung theo catalog hiện tại.
- Không có quyền quản trị User/System Role mặc định.
- Không được tự cấp Custom Role hoặc permission cho mình/người khác.

#### USER

- Có quyền nghiệp vụ cơ bản theo catalog hiện tại.
- Không có quyền quản trị.
- Không được đổi System Role, Custom Role, permission, entitlement hoặc ACL bằng client.

### 19.3 Delegation boundary cần được định nghĩa riêng

Phase 10.1 phải chốt một hàm policy rõ ràng, khái niệm:

~~~text
canDelegate(actor, delegationAction, targetResource)
~~~

Hàm này không được chỉ kiểm tra hasPermission(actor, roles.assign). Mà phải kiểm tra thêm:

- role/permission target có hợp lệ và active không;
- toàn bộ permission của target role có nằm trong actor delegation scope không;
- target user có thuộc scope actor được tác động không;
- target có phải ROOT hoặc System Role protected không;
- action có cho phép tự tác động lên chính actor không;
- actor có đang cố tạo chuỗi privilege escalation không;
- target role có chứa permission dành riêng cho trusted/system workflow không.

### 19.4 Nguyên tắc không tạo privilege escalation

Không được tồn tại đường đi:

~~~text
USER/ADMIN/SUPER_ADMIN
  -> tạo hoặc sửa Custom Role
  -> nhúng quyền System Role/trusted mutation
  -> assign cho bản thân hoặc User khác
  -> vượt hierarchy hoặc Root trust boundary
~~~

Các invariant bắt buộc:

- Custom Role không được mang ID của System Role.
- Custom Role không được cấp ROOT.
- Sensitive permission bị policy cấm không được materialize.
- Actor không được cấp role có delegation scope cao hơn scope của actor.
- Direct Firestore write không được thay thế Callable authorization.
- Frontend chỉ hiển thị control, không quyết định authority.

## 20. Phase 10.1 — Authorization Consistency & Policy Conformance

### Mục tiêu

Tạo contract kiểm chứng thống nhất cho:

~~~text
System Role -> baseline permissions
Custom Role -> validated permissions
System Role + Custom Roles -> Effective Permissions
Effective Permissions + target/policy -> Delegation decision
~~~

### Phạm vi bắt buộc

1. Xác định một nguồn policy chuẩn hoặc cơ chế generated/conformance để tránh drift giữa:
   - src/services/rbac/permissions.js;
   - src/services/rbac/roles.js;
   - src/services/rbac/policy.js;
   - functions/src/auth.js;
   - functions/src/custom-role-service.js;
   - firestore.rules.
2. Xác định rõ System Role → permissions, bao gồm việc SUPER_ADMIN và ROOT_ADMIN có cùng 30 permission nhưng trust boundary khác nhau.
3. Xác định Custom Role → permissions: catalog validation, forbidden permission, active/disabled và malformed role behavior.
4. Xác định Effective Permissions: union, deduplication, disabled role exclusion, unknown permission exclusion và version/consistency.
5. Xác định delegation boundary độc lập với hasPermission.
6. Server-side enforcement: actor từ request.auth.uid; server đọc profile/claims/authorization; không tin payload role/permission/actor; fail closed.
7. Frontend visibility chỉ là UX guard; loading/error state không được biến thành quyền.
8. Firestore Rules không mở write cho userAuthorizations; protected fields vẫn cấm direct write.
9. Callable Functions dùng payload allowlist, mutation/delegation check, consistency verification và audit hook.

### Conformance test matrix

| Scenario | Expected |
|---|---|
| USER reads own profile | Allow theo owner policy |
| USER changes own System Role | Deny |
| USER changes own Custom Role | Deny |
| ADMIN uses allowed role assignment | Allow only within delegation boundary |
| ADMIN assigns role vượt scope | Deny |
| SUPER_ADMIN calls setSystemRole | Deny |
| ROOT assigns non-root System Role | Allow |
| Any actor assigns ROOT | Deny |
| Any actor forges actorUid | Deny |
| Disabled Custom Role | Excluded |
| Malformed Custom Role | Excluded/deny, không grant |
| Missing userAuthorizations | Protected operation deny/fail closed |
| Profile/claims/authz mismatch | Deny và tạo repair signal |

### Security gate

Không bắt đầu Phase 10.3 trước khi conformance test chứng minh rõ having và delegating không bị gộp thành một điều kiện.

## 21. Phase 10.2 — Permission Explanation & Admin UX

### Mục tiêu

Người quản trị nhìn vào Role/User có thể hiểu ngay:

~~~text
Role/User này được làm gì?
Không được làm gì?
Có được cấp tiếp gì cho người khác?
Phạm vi cấp tiếp đến đâu?
~~~

### Permission catalog metadata

Mỗi permission nên có metadata tương ứng, không thay đổi permission code hiện có:

| Field | Ý nghĩa |
|---|---|
| code | Permission code ổn định, ví dụ news.publish |
| displayName | Tên hiển thị tiếng Việt |
| description | Giải thích hành động |
| resource/module | users, roles, calendar, news, quiz, ... |
| action | read, create, update, publish, assign, ... |
| risk | low/medium/high hoặc cấp rủi ro tương đương |
| scope | self, assigned target, module-wide, system-wide |
| delegable | Có thể cấp tiếp hay không theo policy |
| requiresConfirmation | Có cần confirmation mạnh hơn không |

Metadata là lớp giải thích/UI; authorization vẫn phải dùng code và server-side policy.

### Role/User views

UI cần có hai lớp:

1. Role view: System Role hoặc Custom Role; permission code; tên dễ hiểu; mô tả; risk/scope; delegation scope.
2. User view: System Role; Custom Roles active/disabled; Effective Permissions; nguồn của từng permission nếu có thể; delegation scope của actor đang xem.

### Confirmation UX

Trước assign role, UI nên hiển thị preview:

~~~text
Role: QUẢN TRỊ TIN TỨC

Permissions:
✓ Xem tin
✓ Tạo tin
✓ Sửa tin
✓ Xuất bản
✓ Gỡ xuất bản
✓ Xóa tin

Delegation:
- Có/không được cấp role này cho User khác
- Nếu có: phạm vi nào

Target: User A
Hậu quả: Effective Permissions của User A sẽ thay đổi
~~~

Confirmation không thay thế backend check. Backend phải re-read role/policy tại thời điểm mutation.

## 22. Phase 10.3 — Delegated User Management

### Câu hỏi policy phải chốt trước implementation

- ROOT_ADMIN được làm gì ngoài setSystemRole và Custom Role mutation?
- SUPER_ADMIN có được quản lý User nào, Custom Role nào?
- ADMIN có được suspend/restore User không?
- ADMIN có được assign/revoke mọi Custom Role hay chỉ role trong delegation scope?
- Ai được tạo/sửa/disable/delete Custom Role?
- Actor có được cấp permission mà chính actor không có không?
- Actor có được cấp permission mạnh hơn delegation boundary không?
- Actor có được cấp role cho chính mình không?
- Actor có được cấp role chứa quyền quản trị cho User khác không?
- ADMIN có được chuyển USER ↔ EDITOR hoặc USER ↔ ADMIN không?

### Policy mặc định an toàn để đánh giá

| Actor | System Role mutation | Custom Role definition | Assign/revoke Custom Role |
|---|---|---|---|
| ROOT_ADMIN | Non-root allowlist | Theo policy | Theo policy |
| SUPER_ADMIN | Deny | Theo policy hiện tại | Chỉ role trong scope |
| ADMIN | Deny trong phase đầu | Chỉ khi được cấp riêng | Chỉ role trong scope |
| EDITOR | Deny | Deny | Deny mặc định |
| USER | Deny | Deny | Deny |

Đây là baseline đề xuất, không phải thay đổi source hiện tại.

### Enforcement requirements

- Callable đọc actor trusted.
- Payload không có actor/role/permission authority.
- Target root/system role protected.
- canDelegate được gọi sau khi role được validate.
- Không cho self-escalation.
- Không cho role chain vượt actor scope.
- Authorization materialization cập nhật nhất quán.
- Audit event ghi theo contract được chốt.
- Failure fail closed và có repair/rollback.

## 23. Phase 10.4 — Admin Resource Selection UX

### Rà soát technical identifiers

| Trường | Đề xuất UX | Ghi chú |
|---|---|---|
| Article ID | Search/autocomplete hoặc chọn từ article list | Không bắt nhập thủ công nếu backend có thể liệt kê bài viết |
| Category ID | Select/search category | Hiển thị tên category, giữ ID ẩn/readonly |
| Resource ID | Resource picker theo module | Fallback manual input chỉ khi resource không thể list |
| Principal ID | User/group autocomplete | Hiển thị email/displayName/group name, lưu ID authoritative |

### Nguyên tắc

- Technical ID vẫn giữ trong data model và callable payload.
- UI ưu tiên label dễ hiểu và resolve ID từ dữ liệu hiện có.
- Backend validate ID tồn tại, scope và quyền actor.
- Không tự sửa implementation Article ID hiện tại trong roadmap này.
- Resource list lớn phải dùng server-side search/pagination.

## 24. Phase 10.5 — Audit & Security Event Foundation

### Events tối thiểu

- System Role change;
- Custom Role create/update/disable/enable/delete;
- Custom Role assign/revoke;
- permission/delegation change;
- user status change;
- News article access/ACL mutation;
- entitlement/group/subscription mutation ở phase sau.

### Audit record tối thiểu

~~~js
{
  eventId,
  actorUid,
  actorSystemRole,
  action,
  targetType,
  targetId,
  before,
  after,
  source,
  success,
  errorCode,
  correlationId,
  createdAt
}
~~~

Không ghi token, password, service account, secret hoặc toàn bộ authorization document nếu không cần thiết.

### Invariants

- Chỉ trusted backend được ghi audit.
- Client không được sửa/xóa audit event.
- Audit phản ánh success/failure thực tế, không ghi success trước mutation chưa commit.
- Before/after được sanitize.
- Root-sensitive operation có event riêng.
- Read audit dùng audit.read và scope policy rõ ràng.

## 25. Phase 10.6 — News Entitlement / Group / Subscription

Chỉ bắt đầu sau khi Phase 10.1 và audit/delegation foundation cần thiết ổn định.

Phải phân biệt:

- PUBLIC: không cần đăng nhập;
- authenticated users: cần Auth;
- role-based: dựa trên System Role khi business thực sự yêu cầu;
- custom-role-based: chỉ dùng khi policy chấp thuận, không thay entitlement;
- group-based: membership authoritative;
- subscription/entitlement: source riêng, có expiry/revoke.

Không suy diễn VIP chỉ từ Custom Role. Entitlement phải có schema, thời hạn, revoke semantics và server-side read authorization.

## 26. Phase 10.7 — Quiz Foundation

Chỉ bắt đầu sau authorization/delegation và audit foundation đủ ổn định.

Phạm vi: question bank, category/tag, practice mode, answer feedback, exam model, grading contract và sau đó exam mode.

Security gate:

- mutation qua trusted backend;
- practice và exam tách read model;
- không leak đáp án ở exam mode;
- permission theo catalog;
- không ảnh hưởng Module 1/News.

## 27. Phase 10.8 — Production Hardening

Bao gồm regression/conformance/security tests, production smoke test có cleanup, monitoring, rollback/repair strategy, deployment checklist, pagination/index review, browser E2E nếu được phê duyệt, bundle/performance review, audit retention và backup/restore drill.

## 28. Dependency graph và thứ tự làm trước

~~~text
Phase 9.3 evidence/status closure
            ↓
Phase 10.1 policy + consistency + delegation contract
            ↓
Phase 10.2 permission explanation + admin UX
            ↓
Phase 10.3 delegated user management
            ↓
Phase 10.5 audit/security events
       ↙                    ↘
Phase 10.4 resource UX       Phase 10.6 News entitlement
                                ↓
                         Phase 10.7 Quiz
                                ↓
                         Phase 10.8 hardening
~~~

Điều chỉnh triển khai an toàn:

1. Phase 10.1 phải làm trước vì mọi UI và delegated mutation cần delegation contract.
2. Phase 10.2 có thể làm UI read-only sau contract, trước mutation delegated.
3. Phase 10.3 không mở System Role cho ADMIN nếu policy chưa được quyết định.
4. Phase 10.5 audit cần hoàn thành trước khi có nhiều mutation production mới; có thể bắt đầu song song với 10.3 nhưng mutation nhạy cảm không được productionize nếu thiếu audit plan.
5. Phase 10.4 resource picker phụ thuộc schema/list API của từng module, không được tự tạo resource model song song.
6. Phase 10.6 phụ thuộc entitlement/group model; không dùng Custom Role như workaround.
7. Phase 10.7 phụ thuộc permission và audit boundary.

## 29. Security gates trước production

Không deploy phase mới nếu chưa đạt:

1. Source audit và schema review.
2. Payload allowlist.
3. Actor lấy từ Auth context.
4. Không tin role/permission/claims/effectivePermissions từ client.
5. ROOT lock và exactly-one-ROOT được giữ.
6. Không có Custom Role giả System Role.
7. Having permission và delegating permission được test riêng.
8. Self-escalation, escalation target và forged actor đều DENY.
9. Missing/stale/malformed authorization fail closed.
10. Firestore direct write trái policy DENY.
11. Callable unit/emulator tests PASS.
12. Rules tests PASS trong môi trường Java/Firebase CLI hợp lệ.
13. Frontend visibility tests PASS nhưng không được coi là security proof.
14. Audit/rollback/repair plan có evidence.
15. Production smoke fixture cleanup được chứng minh.
16. check:functions, build và diff check PASS.
17. Không deploy/ghi production trước checkpoint phê duyệt riêng.

## 30. Cập nhật trạng thái và giới hạn

Evidence production mới do chủ dự án cung cấp:

- ROOT_ADMIN đổi được System Role của User.
- ROOT_ADMIN thực hiện được USER → ADMIN và ADMIN → USER.
- SUPER_ADMIN vào được hệ thống quản trị.
- SUPER_ADMIN không được thay đổi System Role của User khác.
- SUPER_ADMIN không thể cấp SUPER_ADMIN/ADMIN qua System Role function.
- System Roles vẫn fixed/read-only.
- Custom Role assign/revoke và Effective Permissions đang hoạt động.

Các điểm chưa được suy diễn thành tính năng mới:

- Chưa mở System Role mutation cho ADMIN.
- Chưa coi roles.assign là quyền assign mọi Custom Role.
- Chưa coi permission sở hữu là delegation permission.
- Chưa thay đổi Article ID UI.
- Chưa thêm audit implementation.
- Chưa triển khai VIP entitlement/group/subscription.
- Chưa triển khai Quiz.

## 31. Checkpoint sau Phase 10.2

Phase 10.2 đã được triển khai ở local checkpoint; phần dưới đây ghi nhận production safety của phase đó.

- Files source sửa: permission metadata, policy explanation helpers, Admin Users/Role UX và CSS; không sửa backend mutation contract.
- Firebase Functions sửa/deploy: không có.
- Firestore Rules sửa/deploy: không có.
- Auth sửa: không có.
- Production data thay đổi: không có.
- Commit/push: không có.

Phase 10.1, Phase 10.2 và Phase 10.3 đã COMPLETED ở local checkpoint. Phase nên triển khai tiếp theo sau khi được duyệt: **Phase 10.5 — Audit & Security Event Foundation**.

## Phase 10.4 Checkpoint Update

- Phase 10.4 — Admin Resource Selection UX: **COMPLETED locally**.
- Trusted, bounded selector reads were added only where the existing News backend model already supports them. Existing Callable mutation contracts and RBAC authorization remain the security boundary.
- No new authorization engine, entitlement model, group-membership workflow, Firestore Rules change, production data change, deployment, commit or push was made.
- Required regression/emulator tests, frontend checks, build and diff validation passed. Browser E2E was not run.
- Next proposed implementation phase: **Phase 10.6 — News Entitlement / Group / Subscription Foundation**.

## Phase 10.5 Checkpoint Update

- Phase 10.5 — Audit & Security Event Foundation: **COMPLETED locally**.
- Existing trusted callable mutation paths now use the centralized sanitized
  audit-event writer. Audit records capture trusted actor, action, resource,
  outcome and correlation metadata without sensitive payloads.
- Direct client audit writes remain denied by the existing Rules default deny;
  Firestore Rules were not changed.
- Functions, emulator, policy, RBAC, authorization, frontend, Rules and build
  regression checks PASS. Rules verification passed 84 assertions using a
  temporary local Firebase CLI configuration and JDK 21 process environment.
- No production deployment, production data mutation, commit or push was
  performed.
- Known limitations are documented in `docs/PHASE_10_5_REPORT.md`: no audit UI,
  retention/SIEM integration, read-event audit, or automatic wrapping of local
  Admin SDK tools.
- Current phase: **Phase 10.5 — COMPLETED locally**.
- Next proposed implementation phase: **Phase 10.6 — News Entitlement / Group /
  Subscription Foundation**.
