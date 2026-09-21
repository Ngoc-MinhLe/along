import { Link, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function AdminLayout() {
  const { user, profile, claims, loading } = useAuth()
  const isRoot = claims?.systemRole === 'ROOT_ADMIN'

  if (loading) return <div className="admin-loading">Đang kiểm tra quyền truy cập…</div>
  if (!user || !isRoot) return <Navigate to="/" replace />

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
