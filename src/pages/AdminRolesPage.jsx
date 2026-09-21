import { ROLE_PERMISSIONS } from '../services/rbac/policy'
import { SYSTEM_ROLES } from '../services/rbac/roles'

export default function AdminRolesPage() {
  return <section className="admin-card"><div className="admin-section-heading"><div><h3>Vai trò</h3><p>System Role là immutable trong UI. Custom Role được quản lý bằng Admin SDK local tooling.</p></div><span className="admin-readonly">READ ONLY</span></div><div className="admin-role-table">{Object.values(SYSTEM_ROLES).map((role) => <article key={role}><strong>{role}</strong><small> SYSTEM ROLE · {ROLE_PERMISSIONS[role]?.length || 0} quyền mặc định</small></article>)}</div></section>
}
