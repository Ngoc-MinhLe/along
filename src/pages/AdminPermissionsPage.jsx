import { PERMISSION_VALUES } from '../services/rbac/permissions'

export default function AdminPermissionsPage() {
  return <section className="admin-card"><div className="admin-section-heading"><div><h3>Permission Catalog</h3><p>Permission là capability của hệ thống; không xóa vật lý, chỉ có thể deprecated ở phase sau.</p></div><span className="admin-readonly">CODE CATALOG</span></div><div className="permission-grid">{PERMISSION_VALUES.map((permission) => <span key={permission}>{permission}</span>)}</div></section>
}
