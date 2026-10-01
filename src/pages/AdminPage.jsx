import { Link } from 'react-router-dom'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import { SYSTEM_ROLES } from '../services/rbac/roles'

export default function AdminPage() {
  const { hasPermission } = usePermissions()
  const canReadUsers = hasPermission(PERMISSIONS.USERS_READ)
  const canReadRoles = hasPermission(PERMISSIONS.ROLES_READ)
  const canReadMemberships = hasPermission(PERMISSIONS.MEMBERSHIP_READ)
  const canManageMembershipTiers = hasPermission(PERMISSIONS.MEMBERSHIP_UPDATE)

  return (
    <section className="admin-dashboard">
      <div className="admin-intro-card"><h3>Tổng quan quản trị</h3><p>Các khu vực và thao tác bạn nhìn thấy phụ thuộc vào quyền hiệu lực của tài khoản hiện tại. Bạn không cần biết cấu trúc kỹ thuật phía sau để sử dụng các chức năng này.</p></div>
      <div className="admin-card-grid">
        {canReadUsers && <Link className="admin-card" to="/admin/users"><strong>Người dùng</strong><span>Quản lý hồ sơ, vai trò và quyền được cấp cho từng tài khoản.</span></Link>}
        {canReadRoles && <Link className="admin-card" to="/admin/roles"><strong>Vai trò</strong><span>Phân biệt vai trò nền tảng và vai trò nghiệp vụ tùy chỉnh.</span></Link>}
        {canReadRoles && <Link className="admin-card" to="/admin/permissions"><strong>Danh mục quyền</strong><span>Tra cứu các thao tác hệ thống và ý nghĩa của từng quyền.</span></Link>}
        {canReadMemberships && <Link className="admin-card" to="/admin/memberships"><strong>Membership</strong><span>Cấp, theo dõi và thu hồi quyền lợi Membership theo chính sách.</span></Link>}
        {canManageMembershipTiers && <Link className="admin-card" to="/admin/membership-tiers"><strong>Cấp Membership</strong><span>Tạo và quản lý các cấp Membership động như VIP, Gold hoặc Platinum.</span></Link>}
      </div>
      <div className="admin-card admin-role-list"><h3>Vai trò nền tảng</h3><p>Đây là các vai trò cố định của hệ thống; không chỉnh sửa tại giao diện vai trò tùy chỉnh.</p><div>{Object.values(SYSTEM_ROLES).map((role) => <span key={role}>{role}</span>)}</div></div>
    </section>
  )
}
