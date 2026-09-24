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
5. Còn các khoảng trống cần xử lý trước khi mở rộng quản trị: audit log chưa hiện thực, user authorization mới chưa tự materialize bằng Auth trigger, policy catalog được biểu diễn ở nhiều lớp, và production browser smoke test còn phụ thuộc xác minh thủ công.

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
| `npm run test:rules` | **NEEDS VERIFICATION**: Firebase CLI bị `EPERM` khi đọc `C:\\Users\\DELL\\.config\\configstore\\firebase-tools.json`; chưa xác định lỗi trong Rules |

`docs/PROJECT_STATUS.md` ghi nhận Rules emulator đã PASS 81 assertions ở lần review trước. Lần chạy audit này chưa tái lập được vì lỗi môi trường Firebase CLI.

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

- Production browser smoke test Phase 9.3 vẫn được `PROJECT_STATUS.md` ghi là pending manual verification.
- User brief nói Vercel frontend đã deploy, nhưng repository status hiện vẫn ghi frontend pending push/deployment. Cần xác nhận trực tiếp trên Vercel/GitHub.
- `npm run test:rules` đã PASS theo status lịch sử, nhưng lần chạy audit bị Firebase CLI `EPERM` ở local config store. Cần chạy lại sau khi môi trường CLI được sửa an toàn.

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

### Phase 10.2 — Audit & Security Event Foundation

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

- Current operational phase: **Phase 9.3 — System Role Production Deployment & Real-World Smoke Test**, Function đã deploy; browser/frontend verification còn pending theo status document.
- Next immediate gate: **Production closure/manual browser smoke test**, không phải mutation feature mới.
- Next implementation phase khuyến nghị: **Phase 10.1 — Authorization Consistency & Policy Conformance**.
- Phase 10.2 Audit nên đứng ngay sau hoặc làm cùng 10.1 nếu muốn mọi mutation mới đều có forensic trail.

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
| Phase tiếp theo nên làm gì? | Đóng production gate, sau đó Phase 10.1 consistency/policy conformance |

---

**Kết luận cuối:** Nền tảng hiện tại đủ để tiếp tục roadmap có kiểm soát, nhưng không nên mở rộng quyền ADMIN hoặc VIP production chỉ dựa vào UI. Trusted backend, materialized authorization, Rules, auditability và consistency checks phải tiếp tục là các invariant bắt buộc.
