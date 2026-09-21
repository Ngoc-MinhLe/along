import { Link } from 'react-router-dom'
import { PERMISSIONS } from '../services/rbac/permissions'
import { SYSTEM_ROLES } from '../services/rbac/roles'

export default function AdminPage() {
  return (
    <section className="admin-dashboard">
      <div className="admin-intro-card"><h3>RBAC foundation</h3><p>Trang nền tảng chỉ đọc cho System Role, Custom Role và Permission Catalog. Các thay đổi role phải chạy qua trusted local tooling.</p></div>
      <div className="admin-card-grid">
        <Link className="admin-card" to="/admin/users"><strong>Người dùng</strong><span>Gán và thu hồi role qua Admin SDK tooling.</span></Link>
        <Link className="admin-card" to="/admin/roles"><strong>Vai trò</strong><span>Phân biệt System Role và Custom Role.</span></Link>
        <Link className="admin-card" to="/admin/permissions"><strong>Permission Catalog</strong><span>{Object.keys(PERMISSIONS).length} capability đã được định nghĩa.</span></Link>
      </div>
      <div className="admin-card admin-role-list"><h3>System Roles</h3><div>{Object.values(SYSTEM_ROLES).map((role) => <span key={role}>{role}</span>)}</div></div>
    </section>
  )
}
