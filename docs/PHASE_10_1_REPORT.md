# PHASE 10.1 REPORT

## 1. Scope

Phase 10.1 tập trung vào Authorization Consistency & Policy Conformance:

- chuẩn hóa policy constants phía trusted backend;
- phân biệt permission với delegation capability;
- kiểm tra consistency giữa frontend policy, backend policy và Firestore Rules;
- bổ sung conformance tests;
- giữ nguyên System Role hierarchy, Root trust boundary, Module 1 và News behavior.

Không triển khai trong phase này:

- Audit Log hoàn chỉnh;
- News entitlement/subscription;
- Quiz;
- Admin delegated System Role mutation;
- production deployment hoặc production data mutation.

## 2. Current Authorization Model

Luồng hiện tại:

~~~text
System Role
  + active Custom Roles
  + Permission Catalog
  -> Effective Permissions
  -> userAuthorizations/{uid}
  -> Callable authorization / Firestore Rules / frontend visibility
~~~

System Role hiện tại:

~~~text
ROOT_ADMIN > SUPER_ADMIN > ADMIN > EDITOR > USER
~~~

Các invariant được giữ nguyên:

- ROOT_ADMIN là trust boundary cao nhất.
- setSystemRole chỉ ROOT_ADMIN được gọi.
- Chỉ có thể cấp USER, EDITOR, ADMIN, SUPER_ADMIN.
- ROOT_ADMIN không được tạo/cấp qua Custom Role.
- SUPER_ADMIN và ADMIN không được đổi System Role.
- Client không được tự sửa role, claims, permissions hoặc userAuthorizations.
- Disabled/malformed Custom Role không được materialize permission.

## 3. Policy Sources

### Backend canonical policy

Tạo functions/src/policy.js làm policy contract thuần, không khởi tạo Firebase/Admin SDK. File này chứa:

- System Roles;
- Role hierarchy;
- Permission Catalog;
- System Role → baseline permissions;
- assignable System Roles;
- forbidden Custom Role permissions;
- delegation actions;
- helper kiểm tra delegation scope.

Backend authorization và services đã dùng các constants/helper này thay cho các bản khai báo trùng lặp:

- functions/src/auth.js;
- functions/src/custom-role-service.js;
- functions/src/system-role-service.js.

### Frontend policy

Frontend policy hiện tại vẫn ở:

- src/services/rbac/permissions.js;
- src/services/rbac/roles.js;
- src/services/rbac/policy.js.

Phase này không tạo authorization engine thứ hai. Conformance test đối chiếu frontend policy với backend canonical policy.

### Firestore Rules

Rules vẫn giữ catalog allowlist hiện tại. Không sửa firestore.rules trong phase này. Test đọc và đối chiếu:

- System Role IDs;
- Custom Role permission allowlist;
- forbidden Custom Role permissions.

## 4. Policy Drift Findings

### Đã xử lý

1. Backend có các bản khai báo riêng cho Permission Catalog, System Roles, Role Permissions và forbidden Custom Role permissions.
2. Đã gom các bản backend vào functions/src/policy.js.
3. custom-role-service.js và system-role-service.js không còn tự khai báo lại các policy constants chính.
4. Có test so sánh backend policy với frontend policy và Rules allowlist.

### Còn giới hạn

- Frontend và Firestore Rules vẫn là các representation khác runtime; conformance test hiện là cơ chế phát hiện drift.
- Chưa chuyển toàn bộ catalog sang một shared generated artifact vì việc đó cần phase riêng để đánh giá bundling/deployment và không cần thiết cho Phase 10.1.
- src/services/rbac/policy.js còn helper canAssignSystemRole theo hierarchy cho UI/policy cũ, trong khi backend setSystemRole vẫn ROOT-only. Đây không tạo bypass vì backend là authority cuối cùng, nhưng cần quyết định/cleanup ở phase policy tiếp theo.

## 5. Role / Permission / Delegation Model

### Permission không đồng nghĩa delegation

Actor phải thỏa cả hai điều kiện khi assign/revoke Custom Role:

1. Có action permission tương ứng: roles.assign hoặc roles.revoke.
2. Toàn bộ permission của Custom Role target nằm trong effective permission scope của actor và là permission hợp lệ, không forbidden.

Ví dụ:

- Có news.create nhưng không có roles.assign → không được assign role có news.create.
- Có roles.assign nhưng không có news.create → không được assign role có news.create.
- Có cả hai → được assign nếu target/role/status/root checks đều hợp lệ.
- Role có roles.assign hoặc permission forbidden → bị loại khỏi delegation scope, kể cả khi actor là ROOT; role phải được validate trước.

### Capabilities

| Actor | System Role mutation | Custom Role definition | Custom Role delegation |
|---|---|---|---|
| ROOT_ADMIN | Non-root allowlist | Theo policy hiện tại | Role hợp lệ theo trusted policy |
| SUPER_ADMIN | DENY | Theo policy hiện tại | Chỉ role nằm trong effective scope |
| ADMIN | DENY trong phase đầu | Không có permission mutation hiện tại | Chỉ role nằm trong effective scope |
| EDITOR | DENY | DENY mặc định | DENY |
| USER | DENY | DENY | DENY |

Custom Role không thể tạo/cấp ROOT_ADMIN, không thể thay thế System Role và không thể vượt Root trust boundary.

## 6. Changes Made

### Files created

- functions/src/policy.js
  - Backend policy contract thuần.
  - Delegation scope helper.
- scripts/policy-conformance-test.mjs
  - Conformance test giữa frontend/backend/Rules.
  - Test role matrix, effective permissions, delegation boundary và Root boundary.
- docs/PHASE_10_1_REPORT.md
  - Báo cáo phase này.

### Files modified

- functions/src/auth.js
  - Dùng policy contract backend.
  - Thêm canDelegateCustomRole và requireCanDelegateCustomRole.
  - Delegation yêu cầu action permission và target role nằm trong actor scope.
  - Từ chối malformed/forbidden target role trước Root shortcut.
- functions/src/authorization.js
  - Re-export delegation helpers.
- functions/src/custom-role-service.js
  - Dùng canonical backend policy.
  - Assign/revoke dùng delegation-specific helper.
- functions/src/system-role-service.js
  - Dùng canonical assignable System Role policy.
- functions/package.json
  - Thêm policy.js vào syntax check.
- package.json
  - Thêm script npm run test:policy-conformance.

### Không sửa

- firestore.rules;
- frontend UI;
- Firebase config;
- Module 1;
- News implementation;
- production data.

## 7. Tests Added

npm run test:policy-conformance kiểm tra:

- frontend/backend Permission Catalog;
- System Role catalog và hierarchy;
- System Role → permission matrix;
- forbidden Custom Role permissions;
- Firestore Rules custom permission allowlist;
- Firestore Rules System Role IDs;
- effective permission merge ở frontend;
- ADMIN delegation trong scope;
- actor chỉ có business permission nhưng thiếu delegation permission;
- actor chỉ có delegation action nhưng thiếu target permission;
- ADMIN không delegate role chứa quiz.exam.publish;
- SUPER_ADMIN delegate role hợp lệ trong scope;
- malformed/forbidden role bị loại khỏi delegation;
- ROOT không được cấp ROOT qua assignable list;
- backend source thực sự dùng delegation scope helper.

## 8. Test Results

| Test | Result | Ghi chú |
|---|---|---|
| npm run test:policy-conformance | PASS | Frontend/backend/Rules policy agreement và delegation boundary |
| npm run check:functions | PASS | Bao gồm functions/src/policy.js |
| npm run test:functions | PASS | Auth boundary, News mutation, System Role rollback |
| npm run test:rbac | PASS | Existing RBAC self-test |
| npm run test:authorization | PASS | Materialization self-test |
| npm run test:frontend-rbac | PASS | Callable-only frontend mutation audit |
| npm run test:frontend-news | PASS | News frontend contract |
| npm run test:system-role-tool | PASS | Trusted System Role tool |
| npm run build | PASS | Có cảnh báo bundle lớn hơn 500 kB |
| npm run test:rules | PASS | 81 Firestore Rules assertions; chạy bằng XDG_CONFIG_HOME tạm và JDK 21 |
| git diff --check | PASS | Chỉ có warning line-ending của Git |

Nguyên nhân lỗi trước đó là Firebase CLI configstore cố đọc file mặc định C:\Users\DELL\.config\configstore\firebase-tools.json và gặp EPERM. Không sửa Rules. Test đã chạy thành công bằng XDG_CONFIG_HOME tạm trong workspace và JDK 21; config tạm đã được dọn sau test.

## 9. Security Findings

### PASS

- Actor vẫn lấy từ request.auth.uid.
- Không chấp nhận actorUid do client gửi.
- Không tin claims, role, permissions hoặc effectivePermissions do client gửi.
- SUPER_ADMIN không có đường gọi setSystemRole.
- ADMIN không có đường gọi setSystemRole.
- ROOT_ADMIN không nằm trong assignable System Role list.
- Target ROOT vẫn được bảo vệ.
- Custom Role forbidden permissions không được materialize/delegate.
- Có permission không tự động biến thành delegation permission.
- Client vẫn không ghi trực tiếp customRoles hoặc userAuthorizations.

### WARNING / deferred

1. Audit log chưa được triển khai; thuộc Phase 10.5.
2. Permission explanation/display metadata chưa được triển khai; thuộc Phase 10.2.
3. Resource picker/autocomplete cho Article ID/Category ID/Principal ID chưa được triển khai; thuộc Phase 10.4.
4. User lifecycle/delegated System Role management cho ADMIN chưa được triển khai; cần policy decision và thuộc Phase 10.3.
5. Không còn blocker test Rules trong phase này; cấu hình tạm chỉ dùng cho process test và không thay đổi hệ thống.

## 10. Deferred Items

Không thực hiện trong Phase 10.1:

- Audit Log và security event storage.
- Permission display name/description UX.
- Admin resource selection UX.
- News entitlement, group membership, subscription.
- Quiz.
- ADMIN System Role mutation.
- production deploy/smoke mutation.
- Firestore Rules deployment.
- policy/catalog generated artifact migration toàn diện.

## 11. Production Safety

- Không deploy Firebase Functions.
- Không deploy Vercel.
- Không deploy Firestore Rules.
- Không thực hiện System Role mutation production.
- Không ghi production Firestore/Auth data.
- Không commit.
- Không push.

## 12. Phase Status và Recommended Next Phase

Phase 10.1 **COMPLETED** ở phạm vi local implementation, policy conformance và regression verification.

Acceptance criteria đã đạt:

1. Backend policy contract và delegation boundary đã được triển khai.
2. Frontend/backend/Rules conformance test PASS.
3. Full regression và production build PASS.
4. Rules emulator PASS 81 assertions bằng môi trường test tạm an toàn.
5. Không deploy và không thay đổi production data.

Recommended next phase sau khi Phase 10.1 acceptance hoàn tất:

**Phase 10.2 — Permission Explanation & Admin UX**

Phase 10.2 chỉ nên bắt đầu với UI read/preview trước; không tự mở quyền delegation hoặc System Role.
