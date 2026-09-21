import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ensureUserProfile, getCurrentUserClaims, logout, persistAuthSession, registerWithEmail, signInWithEmail, signInWithGoogle, subscribeToAuth } from '../services/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [claims, setClaims] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    let active = true
    persistAuthSession().catch(() => {})
    const unsubscribe = subscribeToAuth(async (firebaseUser) => {
      if (!active) return
      setUser(firebaseUser)
      setProfileError('')
      if (!firebaseUser) {
        setProfile(null)
        setClaims(null)
        setLoading(false)
        return
      }
      try {
        const nextProfile = await ensureUserProfile(firebaseUser)
        // Force a refresh so a newly assigned trusted claim is visible after reload/login.
        const nextClaims = await getCurrentUserClaims(true)
        if (active) {
          setProfile(nextProfile)
          setClaims(nextClaims)
        }
      } catch {
        if (active) setProfileError('Không thể tạo hoặc cập nhật hồ sơ người dùng trong Firestore. Hãy kiểm tra Firestore Rules.')
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false; unsubscribe() }
  }, [])

  async function refreshClaims() {
    const nextClaims = await getCurrentUserClaims(true)
    setClaims(nextClaims)
    return nextClaims
  }

  const value = useMemo(() => ({
    user, profile, claims, loading, profileError, isGuest: !user, isAuthenticated: Boolean(user), refreshClaims,
    loginWithGoogle: signInWithGoogle, loginWithEmail: signInWithEmail, registerWithEmail, logout,
  }), [claims, loading, profile, profileError, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth phải được sử dụng bên trong AuthProvider.')
  return context
}
