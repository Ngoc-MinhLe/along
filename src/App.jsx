import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import HomePage from './pages/HomePage'
import CalendarLookupPage from './pages/CalendarLookupPage'
import PlaceholderPage from './pages/PlaceholderPage'
import NotFoundPage from './pages/NotFoundPage'
import AuthPage from './pages/AuthPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/" replace />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/tra-cuu-lich" element={<CalendarLookupPage />} />
        <Route path="/tin-tuc" element={<PlaceholderPage title="Tin tức" />} />
        <Route path="/trac-nghiem" element={<PlaceholderPage title="Học trắc nghiệm" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
