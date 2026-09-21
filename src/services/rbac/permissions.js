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

export function isKnownPermission(permission) {
  return PERMISSION_VALUES.includes(permission)
}
