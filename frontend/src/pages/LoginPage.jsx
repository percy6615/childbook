import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { authApi } from '../api'
import { useAuthStore } from '../store'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => authApi.login(data),
    onSuccess: (res) => {
      login(res.data.user, res.data.token)
      // UNBOUND 使用者導向綁定頁
      if (res.data.user.role === 'UNBOUND') {
        navigate('/settings/bind')
      } else {
        navigate('/dashboard')
      }
    },
    onError: (err) => setError(err.response?.data?.error || '登入失敗，請稍後再試')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) { setError('請填寫 Email 與密碼'); return }
    mutation.mutate(form)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sage-50 via-cream-100 to-sage-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-sage-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-sage-300/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sage-500 rounded-2xl shadow-lg mb-4">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-sage-800">寶寶日誌</h1>
          <p className="text-sage-500 mt-1 text-sm">幼兒家庭聯絡簿數位化系統</p>
        </div>

        <div className="bg-white rounded-3xl shadow-card-hover p-8 border border-sage-100">
          <h2 className="font-display text-xl font-bold text-gray-800 mb-6">歡迎回來</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input-field" placeholder="your@email.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                autoComplete="email" />
            </div>
            <div>
              <label className="label">密碼</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input-field pr-10"
                  placeholder="請輸入密碼" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="text-right mt-1">
                <Link to="/forgot-password" className="text-xs text-sage-500 hover:text-sage-700">忘記密碼？</Link>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            <button type="submit" disabled={mutation.isPending}
              className="btn-primary w-full justify-center flex items-center gap-2">
              {mutation.isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />登入中...</>
                : '登入'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-sage-100 text-center">
            <p className="text-sm text-gray-400">還沒有帳號？
              <Link to="/register" className="text-sage-600 font-medium hover:text-sage-800 ml-1">立即註冊</Link>
            </p>
          </div>

          {/* 測試帳號 */}
          <div className="mt-4 pt-4 border-t border-sage-100">
            <p className="text-xs text-gray-400 mb-2 font-medium">測試帳號（密碼均為 Test1234）</p>
            <div className="space-y-1">
              {[
                { role: '管理員', email: 'admin@childbook.app' },
                { role: '家長',   email: 'parent@childbook.app' },
                { role: '教師',   email: 'teacher@childbook.app' },
                { role: '未綁定', email: 'newuser@childbook.app' },
              ].map(({ role, email }) => (
                <button key={email} type="button"
                  onClick={() => setForm({ email, password: 'Test1234' })}
                  className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-sage-50 text-xs text-gray-500 transition-colors flex justify-between">
                  <span className="font-medium text-sage-600">{role}</span>
                  <span className="text-gray-400">{email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
