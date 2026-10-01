import { getPermissionMetadata, PERMISSION_VALUES } from '../services/rbac/permissions'

export default function AdminPermissionsPage() {
  return <section className="admin-card admin-permissions-page">
    <div className="admin-section-heading">
      <div><h3>Danh mục quyền truy cập</h3><p>Mỗi quyền là một thao tác hệ thống có thể được cho phép. Danh mục này chỉ để tra cứu; không chỉnh sửa trực tiếp tại đây.</p></div>
      <span className="admin-readonly">Chỉ xem</span>
    </div>
    <div className="permission-explanation-list admin-permission-catalog">
      {PERMISSION_VALUES.map((permission) => {
        const info = getPermissionMetadata(permission)
        return <article className="permission-explanation-row" key={permission}>
          <div><strong>{info.name}</strong><code>{permission}</code><p>{info.description}</p></div>
          <span className={`permission-risk ${info.riskLevel}`}>{info.riskLevel}</span>
        </article>
      })}
    </div>
  </section>
}
