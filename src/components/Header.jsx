import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'

export default function Header() {
  const { user, profile, claims, loading, profileError, logout } = useAuth()
  const { hasAnyPermission, loading: permissionsLoading } = usePermissions()
  const showAdmin = user && !permissionsLoading && hasAnyPermission([
    PERMISSIONS.USERS_READ,
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.AUDIT_READ,
  ])

  async function handleLogout() {
    try { await logout() } catch { /* Auth state remains the source of truth. */ }
  }

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">VẠN NIÊN</p>
        <h1>Không gian tra cứu</h1>
      </div>
      <div className="header-actions">
        <div className="status-pill"><span className="status-dot" /> {loading ? 'Đang kiểm tra phiên' : 'Nền tảng sẵn sàng'}</div>
        {profileError && <span className="auth-inline-error">{profileError}</span>}
        {!loading && !user && <Link className="auth-link" to="/login">Đăng nhập</Link>}
        {showAdmin && <Link className="auth-link" to="/admin">Quản trị</Link>}
        {!loading && user && <div className="user-auth-area"><span className="user-auth-copy"><strong>{user.displayName || 'Tài khoản'}</strong><small>{user.email}</small><small>{claims?.systemRole || profile?.systemRole || 'USER'}</small></span><button className="auth-logout-button" type="button" onClick={handleLogout}>Đăng xuất</button></div>}
      </div>
    </header>
  )
}
