import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react'
import { authApi } from '../api'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' })
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) setError('重置連結無效，請重新申請')
  }, [token])

  const mutation = useMutation({
    mutationFn: (data) => authApi.resetPassword(data),
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(err.response?.data?.error || '重置失敗，連結可能已過期')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (form.newPassword.length < 6) { setError('密碼至少 6 字元'); return }
    if (form.newPassword !== form.confirmPassword) { setError('兩次密碼不一致'); return }
    mutation.mutate({ token, newPassword: form.newPassword })
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-sage-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-card-hover p-8 max-w-sm w-full text-center animate-fade-in">
          <CheckCircle size={48} className="text-sage-500 mx-auto mb-4" />
          <h2 className="font-display text-xl font-bold text-gray-800 mb-3">密碼已重置</h2>
          <p className="text-sm text-gray-500 mb-6">您的密碼已成功更新，請使用新密碼登入。</p>
          <button className="btn-primary" onClick={() => navigate('/login')}>前往登入</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sage-50 to-sage-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-card-hover p-8 border border-sage-100 max-w-sm w-full animate-fade-in">
        <div className="mb-6">
          <h2 className="font-display text-xl font-bold text-gray-800">設定新密碼</h2>
          <p className="text-sm text-gray-400 mt-1">請輸入您的新密碼</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">新密碼（至少 6 字元）</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className="input-field pr-10"
                placeholder="設定新密碼" value={form.newPassword}
                onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">確認新密碼</label>
            <input type="password" className="input-field" placeholder="再次輸入新密碼"
              value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} required />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
              <XCircle size={16} className="shrink-0" />{error}
            </div>
          )}

          <button type="submit" disabled={mutation.isPending || !token}
            className="btn-primary w-full justify-center flex items-center gap-2">
            {mutation.isPending
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />更新中...</>
              : '確認重置密碼'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/login" className="text-sm text-sage-500 hover:text-sage-700">返回登入</Link>
        </div>
      </div>
    </div>
  )
}
