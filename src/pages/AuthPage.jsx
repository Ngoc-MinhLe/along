import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getAuthErrorMessage } from '../services/auth'

export default function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register'
  const navigate = useNavigate()
  const location = useLocation()
  const { loginWithGoogle, loginWithEmail, registerWithEmail } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const goBack = location.state?.from || '/'

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (isRegister && password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    setSubmitting(true)
    try {
      if (isRegister) await registerWithEmail(email.trim(), password, displayName)
      else await loginWithEmail(email.trim(), password)
      navigate(goBack, { replace: true })
    } catch (authError) { setError(getAuthErrorMessage(authError)) }
    finally { setSubmitting(false) }
  }

  async function handleGoogleLogin() {
    setError('')
    setSubmitting(true)
    try { await loginWithGoogle(); navigate(goBack, { replace: true }) }
    catch (authError) { setError(getAuthErrorMessage(authError)) }
    finally { setSubmitting(false) }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">VẠN NIÊN</p>
        <h1 id="auth-title">{isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
        <p className="auth-intro">{isRegister ? 'Tạo tài khoản để sẵn sàng cho các tính năng thành viên.' : 'Đăng nhập để tiếp tục sử dụng tài khoản của bạn.'}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="google-button" type="button" onClick={handleGoogleLogin} disabled={submitting}>Tiếp tục với Google</button>
        <div className="auth-divider"><span>hoặc</span></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && <label>Tên hiển thị<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></label>}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Mật khẩu<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={6} /></label>
          {isRegister && <label>Xác nhận mật khẩu<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={6} /></label>}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Đang xử lý…' : isRegister ? 'Đăng ký' : 'Đăng nhập'}</button>
        </form>
        <p className="auth-switch">{isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}<Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Đăng nhập' : 'Đăng ký'}</Link></p>
        <Link className="auth-back-link" to="/">Về trang chủ</Link>
      </section>
    </main>
  )
}
