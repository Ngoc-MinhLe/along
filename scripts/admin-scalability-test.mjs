import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = Object.fromEntries(await Promise.all([
  ['usersService', 'functions/src/user-service.js'],
  ['usersPage', 'src/pages/AdminUsersPage.jsx'],
  ['membershipPage', 'src/pages/AdminMembershipsPage.jsx'],
  ['membershipService', 'functions/src/membership-service.js'],
  ['newsService', 'functions/src/news-service.js'],
  ['newsPage', 'src/pages/NewsManagementPage.jsx'],
  ['rolesPage', 'src/pages/AdminRolesPage.jsx'],
  ['calendarService', 'src/services/calendarImports.js'],
].map(async ([key, file]) => [key, await readFile(file, 'utf8')])))

assert.match(files.usersService, /function normalizeUserListPayload/)
assert.match(files.usersService, /limit\(payload\.pageSize \+ 1\)/)
assert.match(files.usersService, /startAfter\(payload\.cursor\.value, payload\.cursor\.id\)/)
assert.match(files.usersPage, /listUsersPage/)
assert.match(files.usersPage, /CursorPagination/)
assert.doesNotMatch(files.usersPage, /getDocs\(collection\(['"]users['"]\)/)

assert.match(files.membershipPage, /AsyncSearchSelect/)
assert.match(files.membershipPage, /CursorPagination/)
assert.match(files.membershipService, /normalizeListPayload/)
assert.match(files.membershipService, /limit\(payload\.limit \+ 1\)/)

assert.match(files.newsService, /listNewsGroups[\s\S]*startAfter/)
assert.match(files.newsService, /listNewsManagement[\s\S]*categoryId/)
assert.match(files.newsPage, /AsyncSearchSelect/)
assert.match(files.newsPage, /CursorPagination/)
assert.match(files.newsPage, /status: articleStatusFilter/)

assert.match(files.rolesPage, /listCustomRolesPage/)
assert.doesNotMatch(files.rolesPage, /getDocs\(collection\(['"]users['"]\)/)

assert.match(files.calendarService, /limit\(safePageSize \+ 1\)/)
assert.doesNotMatch(files.calendarService, /searchWithoutCompositeIndex/)

console.log('Admin scalability test PASS: bounded server queries, cursor pagination and async large-data selectors verified.')
