import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { authApi } from '../api'
import { useAuthStore } from '../store'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', displayName: '' })
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => authApi.register(data),
    onSuccess: (res) => {
      login(res.data.user, res.data.token)
      // 新用戶預設 UNBOUND，導向綁定頁
      navigate('/settings/bind')
    },
    onError: (err) => {
      const msg = err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || '註冊失敗'
      setError(msg)
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) { setError('請填寫所有必填欄位'); return }
    if (form.password !== form.confirmPassword) { setError('兩次密碼不一致'); return }
    if (form.password.length < 6) { setError('密碼至少 6 個字元'); return }
    const { confirmPassword, ...payload } = form
    mutation.mutate(payload)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sage-50 via-cream-100 to-sage-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-sage-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sage-500 rounded-2xl shadow-lg mb-4">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-sage-800">寶寶日誌</h1>
          <p className="text-sage-500 mt-1 text-sm">建立帳號</p>
        </div>

        <div className="bg-white rounded-3xl shadow-card-hover p-8 border border-sage-100">
          <h2 className="font-display text-xl font-bold text-gray-800 mb-6">免費註冊</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email *</label>
              <input type="email" className="input-field" placeholder="your@email.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="label">顯示名稱（選填）</label>
              <input type="text" className="input-field" placeholder="王爸爸 / 陳老師"
                value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div>
              <label className="label">密碼 *（至少 6 字元）</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input-field pr-10"
                  placeholder="請設定密碼" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">確認密碼 *</label>
              <input type="password" className="input-field" placeholder="再次輸入密碼"
                value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} required />
            </div>

            {/* 提示：角色由綁定碼決定 */}
            <div className="bg-sage-50 rounded-xl p-3 text-xs text-sage-600 leading-relaxed">
              💡 帳號角色（家長/教師）將在您輸入管理員提供的<strong>綁定碼</strong>後自動設定
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            <button type="submit" disabled={mutation.isPending}
              className="btn-primary w-full justify-center flex items-center gap-2">
              {mutation.isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />建立帳號中...</>
                : '建立帳號'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-sage-100 text-center">
            <p className="text-sm text-gray-400">已有帳號？
              <Link to="/login" className="text-sage-600 font-medium hover:text-sage-800 ml-1">立即登入</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
