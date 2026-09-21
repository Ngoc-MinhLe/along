import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { PermissionProvider } from './auth/PermissionContext'
import './styles/index.css'
import './styles/auth.css'
import './styles/admin.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <PermissionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PermissionProvider>
    </AuthProvider>
  </StrictMode>,
)
