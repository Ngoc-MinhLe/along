import { Link } from 'react-router-dom'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import { SYSTEM_ROLES } from '../services/rbac/roles'

export default function AdminPage() {
  const { hasPermission } = usePermissions()
  const canReadUsers = hasPermission(PERMISSIONS.USERS_READ)
  const canReadRoles = hasPermission(PERMISSIONS.ROLES_READ)

  return (
    <section className="admin-dashboard">
      <div className="admin-intro-card"><h3>RBAC foundation</h3><p>Các khu vực quản trị và thao tác được hiển thị theo effective permissions của tài khoản hiện tại.</p></div>
      <div className="admin-card-grid">
        {canReadUsers && <Link className="admin-card" to="/admin/users"><strong>Người dùng</strong><span>Quản lý hồ sơ và Custom Role theo permission.</span></Link>}
        {canReadRoles && <Link className="admin-card" to="/admin/roles"><strong>Vai trò</strong><span>Phân biệt System Role và Custom Role.</span></Link>}
        {canReadRoles && <Link className="admin-card" to="/admin/permissions"><strong>Permission Catalog</strong><span>{Object.keys(PERMISSIONS).length} capability được định nghĩa.</span></Link>}
      </div>
      <div className="admin-card admin-role-list"><h3>System Roles</h3><div>{Object.values(SYSTEM_ROLES).map((role) => <span key={role}>{role}</span>)}</div></div>
    </section>
  )
}
