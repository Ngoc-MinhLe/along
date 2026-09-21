import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { subscribeToUserAuthorization } from '../services/rbac/authorization'
import { isKnownPermission } from '../services/rbac/permissions'
import { PUBLIC_PERMISSIONS } from '../services/rbac/policy'

const PermissionContext = createContext(null)

function normalizePermissions(authorization, uid) {
  if (!authorization || authorization.uid !== uid || !Array.isArray(authorization.permissions)) return []
  return [...new Set(authorization.permissions.filter(isKnownPermission))]
}

export function PermissionProvider({ children }) {
  const { user, profile, claims, loading: authLoading } = useAuth()
  const [authorization, setAuthorization] = useState(null)
  const [authorizationLoading, setAuthorizationLoading] = useState(false)
  const [permissionError, setPermissionError] = useState('')

  useEffect(() => {
    if (!user) {
      setAuthorization(null)
      setAuthorizationLoading(false)
      setPermissionError('')
      return () => {}
    }

    setAuthorizationLoading(true)
    setPermissionError('')
    return subscribeToUserAuthorization(
      user.uid,
      (nextAuthorization) => {
        setAuthorization(nextAuthorization)
        setAuthorizationLoading(false)
        if (!nextAuthorization) setPermissionError('Tài khoản chưa có authorization được materialize. Chỉ quyền public đang có hiệu lực.')
        else if (nextAuthorization.uid !== user.uid) setPermissionError('Authorization không nhất quán với tài khoản hiện tại.')
      },
      () => {
        setAuthorization(null)
        setAuthorizationLoading(false)
        setPermissionError('Không thể tải authorization của tài khoản hiện tại.')
      },
    )
  }, [user])

  const actor = useMemo(() => {
    if (!user) return null
    return { ...(profile || {}), uid: user.uid, claims: claims || {} }
  }, [claims, profile, user])

  const effectivePermissions = useMemo(() => [
    ...new Set([
      ...PUBLIC_PERMISSIONS,
      ...normalizePermissions(authorization, user?.uid),
    ]),
  ], [authorization, user?.uid])
  const permissionSet = useMemo(() => new Set(effectivePermissions), [effectivePermissions])

  const value = useMemo(() => ({
    actor,
    authorization,
    effectivePermissions,
    loading: authLoading || authorizationLoading,
    permissionError,
    hasPermission: (permission) => permissionSet.has(permission),
    hasAnyPermission: (permissions) => permissions.some((permission) => permissionSet.has(permission)),
    hasAllPermissions: (permissions) => permissions.every((permission) => permissionSet.has(permission)),
  }), [actor, authLoading, authorization, authorizationLoading, effectivePermissions, permissionError, permissionSet])

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>
}

export function usePermissions() {
  const context = useContext(PermissionContext)
  if (!context) throw new Error('usePermissions phải được sử dụng bên trong PermissionProvider.')
  return context
}
