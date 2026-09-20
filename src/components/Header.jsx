import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Header() {
  const { user, loading, profileError, logout } = useAuth()

  async function handleLogout() {
    try { await logout() } catch { /* Auth state remains the source of truth. */ }
  }

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">VẠN NIÊN 2026</p>
        <h1>Không gian tra cứu</h1>
      </div>
      <div className="header-actions">
        <div className="status-pill"><span className="status-dot" /> {loading ? 'Đang kiểm tra phiên' : 'Nền tảng sẵn sàng'}</div>
        {profileError && <span className="auth-inline-error">{profileError}</span>}
        {!loading && !user && <Link className="auth-link" to="/login">Đăng nhập</Link>}
        {!loading && user && <div className="user-auth-area"><span className="user-auth-copy"><strong>{user.displayName || 'Tài khoản'}</strong><small>{user.email}</small></span><button className="auth-logout-button" type="button" onClick={handleLogout}>Đăng xuất</button></div>}
      </div>
    </header>
  )
}
