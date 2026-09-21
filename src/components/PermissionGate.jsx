import { usePermissions } from '../auth/PermissionContext'

export default function PermissionGate({ permission, any = [], children }) {
  const { hasPermission, hasAnyPermission, loading } = usePermissions()

  if (loading) return <div className="admin-loading">Đang kiểm tra quyền truy cập…</div>
  const allowed = permission ? hasPermission(permission) : hasAnyPermission(any)
  if (!allowed) {
    return <section className="access-denied" role="alert"><h3>Không có quyền truy cập</h3><p>Tài khoản hiện tại không có quyền <code>{permission || any.join(' / ')}</code>.</p></section>
  }
  return children
}
