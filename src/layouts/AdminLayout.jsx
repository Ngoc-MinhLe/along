import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasPermission } from '../services/rbac/policy'
import { PERMISSIONS } from '../services/rbac/permissions'

const routePermissions = {
  '/admin/users': PERMISSIONS.USERS_READ,
  '/admin/roles': PERMISSIONS.ROLES_READ,
  '/admin/permissions': PERMISSIONS.ROLES_READ,
}

export default function AdminLayout() {
  const location = useLocation()
  const { user, profile, claims, loading } = useAuth()
  const actor = { ...profile, systemRole: claims?.systemRole || profile?.systemRole, claims }
  const isRoot = claims?.systemRole === 'ROOT_ADMIN'
  const allowed = isRoot || hasPermission(actor, routePermissions[location.pathname] || PERMISSIONS.ROLES_READ)

  if (loading) return <div className="admin-loading">Đang kiểm tra quyền truy cập…</div>
  if (!user || !allowed) return <Navigate to="/" replace />

  return (
    <div className="admin-area">
      <div className="admin-heading">
        <div><p className="eyebrow">RBAC FOUNDATION</p><h2>Quản trị hệ thống</h2></div>
        <span className="admin-role-badge">{claims?.systemRole || profile?.systemRole}</span>
      </div>
      <nav className="admin-tabs" aria-label="Quản trị">
        <Link to="/admin">Tổng quan</Link>
        <Link to="/admin/users">Người dùng</Link>
        <Link to="/admin/roles">Vai trò</Link>
        <Link to="/admin/permissions">Danh mục quyền</Link>
      </nav>
      <Outlet />
    </div>
  )
}
