# PHASE 10.16 — ADMIN SEARCHABLE SELECT / ASYNC COMBOBOX REPORT

## Status

LOCAL IMPLEMENTATION: PASS

Production deploy, production data mutation, commit và push: CHƯA thực hiện.

## 1. Audit selectors

| Khu vực | Dataset | Kết quả | Cách xử lý |
|---|---|---|---|
| Admin Users | Users | PASS | Backend `listUsersPage` với query, giới hạn kết quả và cursor; không tải toàn bộ users. |
| Admin Users | Custom Roles | PASS | `AsyncSearchSelect`, tìm theo tên trên server, giới hạn 20 kết quả. |
| Admin Users | System Role/status | PASS | Native select; danh sách nhỏ, cố định theo policy. |
| Admin Memberships | User | PASS | `AsyncSearchSelect` dùng `listUsersPage`, giới hạn 20. |
| Admin Memberships | Membership Tier | PASS | `AsyncSearchSelect`, tìm theo tên hoặc level, tier động. |
| Admin Memberships | Membership history/list | PASS | Danh sách backend-paginated; không đưa toàn bộ collection vào browser. |
| Admin Membership Tiers | Tier list | PASS | Danh sách phân trang/cursor; không hard-code VIP1/VIP2/VIP3. |
| Admin Roles | Permission/System Role | PASS | Checkbox/select cố định từ catalog và hierarchy nhỏ; không cần async search. |
| News Management | News Article | PASS | Tìm tiêu đề qua `listNewsManagement` server-side, giới hạn 20, cursor pagination. |
| News Management | Category | PASS | `SearchableSelect` dùng async loader `listNewsCategories`; category được tải bounded. |
| News Management | ACL User/Group | PASS | Async selector qua `listNewsUsers`/`listNewsGroups`. |
| News Management | Status/access/scope/principal type | PASS | Native select; tập option nhỏ và cố định. |
| Calendar Lookup | Import batch | LIMITATION DOCUMENTED | Vẫn hiển thị native select trên một trang tối đa 25 import đã tải bằng cursor. Không fetch toàn bộ collection; Module 1 hiện chưa có contract/query indexed theo tên file để tìm kiếm toàn server. |
| Calendar Lookup | Filter fields/values | PASS | Các option lấy từ schema/filter options của import đã chọn; không phải collection động độc lập. |

## 2. Shared UX abstraction

Đã chuẩn hóa bằng `AsyncSearchSelect`; `SearchableSelect` chỉ là compatibility wrapper và chuyển sang async khi nhận `loadOptions`.

Các hành vi chung:

- debounce 300 ms;
- giới hạn kết quả do loader/backend quy định;
- loading, empty, error và clear selection;
- tìm kiếm một phần; các service hiện có hậu kiểm không phân biệt hoa thường ở phần dữ liệu đã lấy, nhưng Firestore prefix range vẫn phụ thuộc field được lưu. Muốn bảo đảm case-insensitive tuyệt đối cho dữ liệu lớn cần normalized search fields/backfill riêng;
- Arrow Up/Down, Enter, Escape;
- `role=listbox`, `role=option`, `aria-expanded`, `aria-controls`, `aria-selected`;
- hiển thị label và metadata để phân biệt user, role, tier, article, category, group.

## 3. Backend/query được tái sử dụng

- Users: `listUsersPage({ query, pageSize, cursor })`.
- Custom Roles: `listCustomRoles`/`listCustomRolesPage` hỗ trợ query theo `name` và cursor.
- Membership Tiers: `listMembershipTiers` hỗ trợ query theo tên hoặc level và cursor.
- News Articles: `listNewsManagement` hỗ trợ query theo title, status, category và cursor.
- News Categories: `listNewsCategories` hỗ trợ query theo tên và cursor.
- News Users/Groups: các selector callable hiện có hỗ trợ query và giới hạn kết quả.

Các query mới chỉ mở rộng payload đọc, không thay đổi authorization hoặc mutation contract.

## 4. Security review

- Không nhận hoặc tin `actorUid`, role, permission, claims hay effective permissions từ frontend.
- Tất cả News/Role/ACL/Membership mutations tiếp tục đi qua Callable Functions.
- Async selector chỉ là UX; backend vẫn kiểm tra actor và permission.
- Không mở Firestore write access.
- Không thay đổi System Role, Custom Role policy, Membership schema, News evaluator hoặc Firestore Rules.
- Không có selector nào tải toàn bộ collection lớn về frontend để lọc bằng JavaScript.

## 5. Files thuộc thay đổi Phase 10.16

Các file có chỉnh sửa trực tiếp cho Phase 10.16:

- `src/components/AsyncSearchSelect.jsx`
- `src/components/SearchableSelect.jsx`
- `src/pages/AdminUsersPage.jsx`
- `src/pages/AdminMembershipsPage.jsx`
- `src/pages/NewsManagementPage.jsx`
- `src/styles/admin.css`
- `functions/src/custom-role-service.js`
- `functions/src/membership-service.js`
- `src/services/membership.js`
- `src/services/rbac/firestore.js`
- `firestore.indexes.json` (index phục vụ query tên mới; chưa deploy)
- `scripts/membership-frontend-test.mjs`
- `docs/PHASE_10_16_REPORT.md`

Repository hiện còn các thay đổi từ các phase trước trong cùng một số file; không reset hoặc loại bỏ các thay đổi đó.

## 6. Test results

- `npm run check:functions` — PASS
- `npm run test:functions` — PASS
- `npm run test:functions:membership-tier:emulator` — PASS, chạy với JDK 21 và Firebase CLI home tạm thời
- `npm run test:functions:membership:emulator` — PASS, chạy với JDK 21 và Firebase CLI home tạm thời
- `npm run test:functions:emulator` — PASS, chạy với JDK 21 và Firebase CLI home tạm thời
- `npm run test:functions:news:emulator` — PASS, chạy với JDK 21 và Firebase CLI home tạm thời
- `npm run test:functions:system-role:emulator` — PASS, chạy với JDK 21 và Firebase CLI home tạm thời
- `npm run test:functions:authorization-rebuild:emulator` — PASS, chạy với JDK 21 và Firebase CLI home tạm thời
- `npm run test:resource-selectors` — PASS
- `npm run test:admin-scalability` — PASS
- `npm run test:frontend-rbac` — PASS
- `npm run test:frontend-membership` — PASS
- `npm run test:frontend-news` — PASS
- `npm run test:authorization` — PASS
- `npm run test:rbac` — PASS
- `npm run test:policy-conformance` — PASS
- `npm run test:rules` — PASS, 84 assertions
- `npm run build` — PASS
- `git diff --check` — PASS

Các lần emulator chạy bằng cấu hình Firebase CLI mặc định trước đó bị chặn bởi EPERM tại `C:\Users\DELL\.config\configstore\firebase-tools.json`; không phải lỗi source. Lần chạy xác nhận dùng cấu hình tạm thời và JDK 21 tại Android Studio.

Build còn cảnh báo bundle JavaScript lớn hơn 500 kB sau minification; đây là cảnh báo performance hiện hữu, không phải lỗi correctness của Phase 10.16.

## 7. Production safety

- Firebase deploy: NO
- Vercel deploy: NO
- Firestore Rules deploy: NO
- Firestore indexes deploy: NO
- Production data mutation: NO
- Commit/push: NO

## 8. Known limitations / next work

Calendar import selector hiện vẫn là native select trên một trang bounded 25 bản ghi. Đây là giới hạn có chủ ý để không thay đổi Module 1 hoặc tạo query giả lập client-side; nếu cần tìm kiếm import theo tên trên toàn dataset, phase sau cần chốt contract/index cho `calendarImports` và xử lý dữ liệu legacy thiếu field tìm kiếm chuẩn hóa.

Phase 10.16 dừng tại checkpoint local để review; chưa có production deployment.
