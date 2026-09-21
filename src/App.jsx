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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/" replace />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/tra-cuu-lich" element={<CalendarLookupPage />} />
        <Route path="/tin-tuc" element={<PlaceholderPage title="Tin tức" />} />
        <Route path="/trac-nghiem" element={<PlaceholderPage title="Học trắc nghiệm" />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="roles" element={<AdminRolesPage />} />
          <Route path="permissions" element={<AdminPermissionsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
