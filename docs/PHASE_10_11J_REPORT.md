# PHASE 10.11J — Membership Tier Administration Foundation

## 1. Kết luận

**LOCAL IMPLEMENTATION: PASS**

Phase 10.11J đã được triển khai và kiểm thử trên local/emulator. Chưa deploy Firebase/Vercel, chưa ghi production data, chưa commit và chưa push.

## 2. Phạm vi đã triển khai

- Canonical collection: `membershipTiers/{tierId}`.
- Tier dùng schema động với `tierId`, `name`, `level`, `status`, `description`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- `level` là số nguyên dương, không có giới hạn tối đa cố định.
- Tier ID không đổi sau khi tạo.
- Không hard-delete tier; chỉ chuyển `status` sang `inactive`.
- Membership chỉ tham chiếu `tierId`; không thêm `level` vào membership.
- Tier không được đưa vào `systemRole`, `customRoles` hoặc `userAuthorizations`.

Storage canonical không ghi field boolean `active`; các response read có thể expose `active` suy ra từ `status` để giữ tương thích với UI/membership flow hiện tại. Dữ liệu tier malformed hoặc legacy không khớp schema canonical sẽ bị loại/fail closed.

## 3. Callable Functions

Đã thêm và export tại `functions/src/index.js`:

- `listMembershipTiers`
- `createMembershipTier`
- `updateMembershipTier`
- `deactivateMembershipTier`

Mutation dùng `membership.update` hiện có và đồng thời yêu cầu system role là `ROOT_ADMIN` hoặc `SUPER_ADMIN`. Không thêm permission catalog mới.

`listMembershipTiers` mặc định chỉ trả tier active để giữ tương thích workflow Membership hiện tại. Request `includeInactive: true` chỉ dành cho trusted ROOT/SUPER manager.

## 4. Security review

- Actor luôn lấy từ `request.auth.uid` qua trusted actor loader.
- Payload bị allowlist; các field như `actorUid`, `role`, `level` ngoài contract, `createdBy`, `updatedBy`, `status` và `active` không được client điều khiển.
- Server tự ghi `createdBy`, `updatedBy`, timestamps và `status` khi cần.
- Tier ID được kiểm tra format và không thể đổi khi update.
- Level phải là positive safe integer; không hard-code VIP1/VIP2/VIP3.
- Duplicate tier bị từ chối bằng transaction create.
- Tier inactive không thể được dùng để tạo ACTIVE membership.
- Deactivate idempotent và giữ document/history.
- Không có direct Firestore mutation từ frontend; frontend chỉ gọi callable functions.
- Audit events được ghi qua audit path hiện tại:
  - `MEMBERSHIP_TIER_CREATED`
  - `MEMBERSHIP_TIER_UPDATED`
  - `MEMBERSHIP_TIER_DEACTIVATED`

## 5. Frontend

Đã thêm route `/admin/membership-tiers` và UI quản trị tier:

- đọc tier động từ callable;
- tạo, sửa name/level/description;
- giữ tier ID bất biến khi sửa;
- deactivate có confirmation;
- có loading/error/empty/success state;
- không hard-code VIP1/VIP2/VIP3;
- visibility và thao tác được gate bằng RBAC hiện tại.

Không tích hợp Membership vào News evaluator trong phase này.

## 6. Files đã sửa/tạo trong Phase 10.11J

Modified:

- `functions/package.json`
- `functions/src/audit.js`
- `functions/src/index.js`
- `functions/src/membership-functions.js`
- `functions/src/membership-service.js`
- `functions/test/membership-emulator.test.js`
- `functions/test/membership.test.js`
- `package.json`
- `scripts/membership-frontend-test.mjs`
- `src/App.jsx`
- `src/layouts/AdminLayout.jsx`
- `src/pages/AdminPage.jsx`
- `src/services/membership.js`
- `src/styles/admin.css`

Created:

- `functions/test/membership-tier-emulator.test.js`
- `functions/test/membership-tier.test.js`
- `src/pages/AdminMembershipTiersPage.jsx`
- `docs/PHASE_10_11J_REPORT.md`

`docs/PHASE_10_11I_REPORT.md` và `docs/PHASE_10_11I_READINESS_REPORT.md` đang untracked từ trạng thái trước đó; không được sửa trong Phase 10.11J.

## 7. Test results

PASS:

- `npm run check:functions`
- `npm run test:functions`
- `npm run test:functions:membership:emulator`
- `npm run test:functions:membership-tier:emulator`
- `npm run test:functions:emulator`
- `npm run test:functions:news:emulator`
- `npm run test:functions:system-role:emulator`
- `npm run test:functions:authorization-rebuild:emulator`
- `npm run test:rbac`
- `npm run test:authorization`
- `npm run test:policy-conformance`
- `npm run test:frontend-rbac`
- `npm run test:frontend-membership`
- `npm run test:frontend-news`
- `npm run test:system-role-tool`
- `npm run test:rules` — 84 assertions PASS, chạy với JDK 21 tạm thời.
- `npm run build`
- `git diff --check`

Build có cảnh báo bundle JavaScript lớn hơn 500 kB sau minification; đây là warning hiệu năng hiện hữu, không làm build fail và không thuộc phạm vi Phase 10.11J. `git diff --check` chỉ ghi nhận cảnh báo chuyển đổi LF/CRLF của Git, không có whitespace error.

## 8. Rules, indexes và production safety

- `firestore.rules`: không thay đổi.
- `firestore.indexes.json`: không thay đổi; implementation đọc collection rồi lọc/sắp xếp trong backend nên không cần index mới cho tier listing.
- Production data: không thay đổi.
- Firebase/Vercel deployment: chưa thực hiện.
- Production tier/membership/test user: không tạo.
- News, content entitlements, RBAC policy và authorization materialization hiện tại: không tích hợp/thay đổi ngoài việc tái sử dụng permission `membership.update` cho tier management.

## 9. Known limitations / next checkpoint

- Chưa có production tier nên chưa thực hiện production membership smoke test.
- Chưa tích hợp tier vào News VIP evaluator.
- Chưa triển khai SPECIAL entitlement, GROUP, ARTICLE_GROUP, payment, webhook, automatic membership hoặc renewal.
- Chưa có production browser smoke test cho `/admin/membership-tiers`.
- Việc deploy Functions/frontend và tạo dữ liệu production cần phase review/deployment riêng sau khi người dùng kiểm tra.

## 10. Git status

Working tree có các thay đổi Phase 10.11J và các report untracked từ trạng thái trước đó. Không commit/push trong phase này.
