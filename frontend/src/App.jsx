import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store'
import Layout from './components/common/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import BindPage from './pages/BindPage'
import DashboardPage from './pages/DashboardPage'
import ChildrenPage from './pages/ChildrenPage'
import RecordsPage from './pages/RecordsPage'
import RecordFormPage from './pages/RecordFormPage'
import UploadPage from './pages/UploadPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ProfilePage from './pages/ProfilePage'

// 需要登入
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

// 需要已綁定（UNBOUND → 綁定頁）
const BoundRoute = ({ children }) => {
  const user = useAuthStore(s => s.user)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role === 'UNBOUND') return <Navigate to="/settings/bind" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* ── Public routes ─────────────────────────────────── */}
      <Route path="/login"           element={<LoginPage />} />
      <Route path="/register"        element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />

      {/* ── Bind page（登入後但尚未綁定）─────────────────── */}
      <Route path="/settings/bind" element={
        <ProtectedRoute><BindPage /></ProtectedRoute>
      } />

      {/* ── Main app（需登入 + 已綁定）────────────────────── */}
      <Route path="/" element={<BoundRoute><Layout /></BoundRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"         element={<DashboardPage />} />
        <Route path="records"           element={<RecordsPage />} />
        <Route path="records/new"       element={<RecordFormPage />} />
        <Route path="records/:id/edit"  element={<RecordFormPage />} />
        <Route path="upload"            element={<UploadPage />} />
        <Route path="analytics"         element={<AnalyticsPage />} />
        <Route path="settings/children" element={<ChildrenPage />} />
        <Route path="profile"           element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
