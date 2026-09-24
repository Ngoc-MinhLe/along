import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import HomePage from './pages/HomePage'
import CalendarLookupPage from './pages/CalendarLookupPage'
import PlaceholderPage from './pages/PlaceholderPage'
import NotFoundPage from './pages/NotFoundPage'
import AuthPage from './pages/AuthPage'
import AdminLayout from './layouts/AdminLayout'
import AdminPage from './pages/AdminPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminRolesPage from './pages/AdminRolesPage'
import AdminPermissionsPage from './pages/AdminPermissionsPage'
import NewsListPage from './pages/NewsListPage'
import NewsArticlePage from './pages/NewsArticlePage'
import NewsManagementPage from './pages/NewsManagementPage'
import PermissionGate from './components/PermissionGate'
import { PERMISSIONS } from './services/rbac/permissions'

const NEWS_MANAGEMENT_PERMISSIONS = [
  PERMISSIONS.NEWS_CREATE,
  PERMISSIONS.NEWS_UPDATE,
  PERMISSIONS.NEWS_DELETE,
  PERMISSIONS.NEWS_PUBLISH,
]

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/" replace />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/tra-cuu-lich" element={<CalendarLookupPage />} />
        <Route path="/tin-tuc" element={<NewsListPage />} />
        <Route path="/tin-tuc/:articleId" element={<NewsArticlePage />} />
        <Route path="/trac-nghiem" element={<PlaceholderPage title="Học trắc nghiệm" />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminPage />} />
          <Route path="users" element={<PermissionGate permission={PERMISSIONS.USERS_READ}><AdminUsersPage /></PermissionGate>} />
          <Route path="roles" element={<PermissionGate permission={PERMISSIONS.ROLES_READ}><AdminRolesPage /></PermissionGate>} />
          <Route path="permissions" element={<PermissionGate permission={PERMISSIONS.ROLES_READ}><AdminPermissionsPage /></PermissionGate>} />
          <Route path="news" element={<PermissionGate any={NEWS_MANAGEMENT_PERMISSIONS}><NewsManagementPage /></PermissionGate>} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
