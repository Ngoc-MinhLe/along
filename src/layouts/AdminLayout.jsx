import { Link, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'

export default function AdminLayout() {
  const { user, profile, claims, loading } = useAuth()
  const { hasPermission, hasAnyPermission, loading: permissionsLoading, permissionError } = usePermissions()
  const canReadUsers = hasPermission(PERMISSIONS.USERS_READ)
  const canReadRoles = hasPermission(PERMISSIONS.ROLES_READ)
  const canOpenAdmin = hasAnyPermission([PERMISSIONS.USERS_READ, PERMISSIONS.ROLES_READ, PERMISSIONS.AUDIT_READ])

  if (loading || permissionsLoading) return <div className="admin-loading">Đang kiểm tra quyền truy cập…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!canOpenAdmin) return <section className="access-denied" role="alert"><h3>Không có quyền truy cập</h3><p>Tài khoản hiện tại không có quyền quản trị.</p></section>

  return (
    <div className="admin-area">
      <div className="admin-heading">
        <div><p className="eyebrow">RBAC FOUNDATION</p><h2>Quản trị hệ thống</h2></div>
        <span className="admin-role-badge">{claims?.systemRole || profile?.systemRole}</span>
      </div>
      {permissionError && <p className="admin-error" role="alert">{permissionError}</p>}
      <nav className="admin-tabs" aria-label="Quản trị">
        <Link to="/admin">Tổng quan</Link>
        {canReadUsers && <Link to="/admin/users">Người dùng</Link>}
        {canReadRoles && <Link to="/admin/roles">Vai trò</Link>}
        {canReadRoles && <Link to="/admin/permissions">Danh mục quyền</Link>}
      </nav>
      <Outlet />
    </div>
  )
}
