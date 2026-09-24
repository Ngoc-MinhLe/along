export const PERMISSIONS = Object.freeze({
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DISABLE: 'roles.disable',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN: 'roles.assign',
  ROLES_REVOKE: 'roles.revoke',
  CALENDAR_SEARCH: 'calendar.search',
  CALENDAR_EXPORT: 'calendar.export',
  CALENDAR_IMPORT: 'calendar.import',
  NEWS_READ: 'news.read',
  NEWS_CREATE: 'news.create',
  NEWS_UPDATE: 'news.update',
  NEWS_DELETE: 'news.delete',
  NEWS_PUBLISH: 'news.publish',
  QUIZ_QUESTION_READ: 'quiz.question.read',
  QUIZ_QUESTION_CREATE: 'quiz.question.create',
  QUIZ_QUESTION_UPDATE: 'quiz.question.update',
  QUIZ_QUESTION_DELETE: 'quiz.question.delete',
  QUIZ_EXAM_CREATE: 'quiz.exam.create',
  QUIZ_EXAM_UPDATE: 'quiz.exam.update',
  QUIZ_EXAM_PUBLISH: 'quiz.exam.publish',
  QUIZ_EXAM_DELETE: 'quiz.exam.delete',
  APPROVAL_CREATE: 'approval.create',
  APPROVAL_REVIEW: 'approval.review',
  AUDIT_READ: 'audit.read',
})

export const PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS))
export const PERMISSION_STATUS = Object.freeze({ ACTIVE: 'active', DEPRECATED: 'deprecated' })

// Display metadata only. Authorization decisions continue to use the policy
// helpers and the trusted backend; these descriptions never grant permission.
const metadata = (key, name, description, category, riskLevel, delegable = true) => ({
  key,
  name,
  description,
  category,
  riskLevel,
  delegable,
})

export const PERMISSION_METADATA = Object.freeze({
  [PERMISSIONS.USERS_READ]: metadata(PERMISSIONS.USERS_READ, 'Xem người dùng', 'Cho phép xem danh sách và thông tin hồ sơ người dùng.', 'users', 'medium'),
  [PERMISSIONS.USERS_CREATE]: metadata(PERMISSIONS.USERS_CREATE, 'Tạo người dùng', 'Cho phép tạo hồ sơ người dùng theo workflow được tin cậy.', 'users', 'high'),
  [PERMISSIONS.USERS_UPDATE]: metadata(PERMISSIONS.USERS_UPDATE, 'Cập nhật người dùng', 'Cho phép cập nhật thông tin người dùng trong phạm vi policy.', 'users', 'high'),
  [PERMISSIONS.USERS_DELETE]: metadata(PERMISSIONS.USERS_DELETE, 'Xóa người dùng', 'Thao tác nhạy cảm trên vòng đời người dùng; không được cấp qua Custom Role.', 'users', 'critical', false),
  [PERMISSIONS.ROLES_READ]: metadata(PERMISSIONS.ROLES_READ, 'Xem Custom Role', 'Cho phép xem danh sách và chi tiết Custom Role.', 'roles', 'medium'),
  [PERMISSIONS.ROLES_CREATE]: metadata(PERMISSIONS.ROLES_CREATE, 'Tạo Custom Role', 'Cho phép tạo Custom Role; không được cấp qua Custom Role khác.', 'roles', 'critical', false),
  [PERMISSIONS.ROLES_UPDATE]: metadata(PERMISSIONS.ROLES_UPDATE, 'Sửa Custom Role', 'Cho phép sửa Custom Role; không được cấp qua Custom Role khác.', 'roles', 'critical', false),
  [PERMISSIONS.ROLES_DISABLE]: metadata(PERMISSIONS.ROLES_DISABLE, 'Bật/tắt Custom Role', 'Cho phép thay đổi trạng thái Custom Role; không được cấp qua Custom Role khác.', 'roles', 'critical', false),
  [PERMISSIONS.ROLES_DELETE]: metadata(PERMISSIONS.ROLES_DELETE, 'Xóa Custom Role', 'Cho phép xóa Custom Role; không được cấp qua Custom Role khác.', 'roles', 'critical', false),
  [PERMISSIONS.ROLES_ASSIGN]: metadata(PERMISSIONS.ROLES_ASSIGN, 'Gán Custom Role', 'Cho phép gán Custom Role trong delegation scope của actor.', 'roles', 'critical', false),
  [PERMISSIONS.ROLES_REVOKE]: metadata(PERMISSIONS.ROLES_REVOKE, 'Thu hồi Custom Role', 'Cho phép thu hồi Custom Role trong delegation scope của actor.', 'roles', 'critical', false),
  [PERMISSIONS.CALENDAR_SEARCH]: metadata(PERMISSIONS.CALENDAR_SEARCH, 'Tra cứu lịch', 'Cho phép tra cứu dữ liệu lịch.', 'calendar', 'low'),
  [PERMISSIONS.CALENDAR_EXPORT]: metadata(PERMISSIONS.CALENDAR_EXPORT, 'Xuất lịch', 'Cho phép xuất kết quả tra cứu lịch.', 'calendar', 'medium'),
  [PERMISSIONS.CALENDAR_IMPORT]: metadata(PERMISSIONS.CALENDAR_IMPORT, 'Import lịch', 'Cho phép import dữ liệu lịch qua workflow được tin cậy.', 'calendar', 'high'),
  [PERMISSIONS.NEWS_READ]: metadata(PERMISSIONS.NEWS_READ, 'Đọc tin tức', 'Cho phép đọc News theo access policy của bài viết.', 'news', 'low'),
  [PERMISSIONS.NEWS_CREATE]: metadata(PERMISSIONS.NEWS_CREATE, 'Tạo tin tức', 'Cho phép tạo bài viết News dạng draft.', 'news', 'high'),
  [PERMISSIONS.NEWS_UPDATE]: metadata(PERMISSIONS.NEWS_UPDATE, 'Sửa tin tức', 'Cho phép cập nhật bài viết News trong phạm vi policy.', 'news', 'high'),
  [PERMISSIONS.NEWS_DELETE]: metadata(PERMISSIONS.NEWS_DELETE, 'Xóa tin tức', 'Cho phép xóa bài viết News theo workflow được tin cậy.', 'news', 'high'),
  [PERMISSIONS.NEWS_PUBLISH]: metadata(PERMISSIONS.NEWS_PUBLISH, 'Xuất bản tin tức', 'Cho phép publish hoặc unpublish bài viết News.', 'news', 'high'),
  [PERMISSIONS.QUIZ_QUESTION_READ]: metadata(PERMISSIONS.QUIZ_QUESTION_READ, 'Xem câu hỏi', 'Cho phép xem ngân hàng câu hỏi trắc nghiệm.', 'quiz', 'low'),
  [PERMISSIONS.QUIZ_QUESTION_CREATE]: metadata(PERMISSIONS.QUIZ_QUESTION_CREATE, 'Tạo câu hỏi', 'Cho phép tạo câu hỏi trắc nghiệm.', 'quiz', 'medium'),
  [PERMISSIONS.QUIZ_QUESTION_UPDATE]: metadata(PERMISSIONS.QUIZ_QUESTION_UPDATE, 'Sửa câu hỏi', 'Cho phép cập nhật câu hỏi trắc nghiệm.', 'quiz', 'medium'),
  [PERMISSIONS.QUIZ_QUESTION_DELETE]: metadata(PERMISSIONS.QUIZ_QUESTION_DELETE, 'Xóa câu hỏi', 'Cho phép xóa câu hỏi trắc nghiệm.', 'quiz', 'high'),
  [PERMISSIONS.QUIZ_EXAM_CREATE]: metadata(PERMISSIONS.QUIZ_EXAM_CREATE, 'Tạo đề thi', 'Cho phép tạo đề thi từ ngân hàng câu hỏi.', 'quiz', 'high'),
  [PERMISSIONS.QUIZ_EXAM_UPDATE]: metadata(PERMISSIONS.QUIZ_EXAM_UPDATE, 'Sửa đề thi', 'Cho phép cập nhật đề thi.', 'quiz', 'high'),
  [PERMISSIONS.QUIZ_EXAM_PUBLISH]: metadata(PERMISSIONS.QUIZ_EXAM_PUBLISH, 'Xuất bản đề thi', 'Cho phép publish đề thi cho người học.', 'quiz', 'high'),
  [PERMISSIONS.QUIZ_EXAM_DELETE]: metadata(PERMISSIONS.QUIZ_EXAM_DELETE, 'Xóa đề thi', 'Cho phép xóa đề thi.', 'quiz', 'high'),
  [PERMISSIONS.APPROVAL_CREATE]: metadata(PERMISSIONS.APPROVAL_CREATE, 'Tạo yêu cầu duyệt', 'Cho phép tạo yêu cầu approval.', 'approval', 'medium'),
  [PERMISSIONS.APPROVAL_REVIEW]: metadata(PERMISSIONS.APPROVAL_REVIEW, 'Duyệt yêu cầu', 'Cho phép review và xử lý approval theo policy.', 'approval', 'high'),
  [PERMISSIONS.AUDIT_READ]: metadata(PERMISSIONS.AUDIT_READ, 'Xem audit log', 'Cho phép đọc audit/security events khi module audit được triển khai.', 'audit', 'high'),
})

export const PERMISSION_GROUP_LABELS = Object.freeze({
  users: 'Quản lý người dùng',
  roles: 'Quản lý vai trò',
  calendar: 'Lịch',
  news: 'Tin tức',
  quiz: 'Trắc nghiệm',
  approval: 'Phê duyệt',
  audit: 'Audit',
})

export function getPermissionMetadata(permission) {
  return PERMISSION_METADATA[permission] || {
    key: permission,
    name: permission,
    description: 'Permission không có trong catalog hiện tại.',
    category: 'unknown',
    riskLevel: 'unknown',
    delegable: false,
  }
}

export function isKnownPermission(permission) {
  return PERMISSION_VALUES.includes(permission)
}
