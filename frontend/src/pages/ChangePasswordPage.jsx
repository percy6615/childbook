import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff, Lock, ArrowLeft, CheckCircle } from 'lucide-react'
import { authApi } from '../api'
import { useAuthStore } from '../store'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess: () => {
      setSuccess(true)
      // 修改密碼後 3 秒自動登出（安全最佳實踐）
      setTimeout(() => {
        logout()
        navigate('/login', { replace: true })
      }, 3000)
    },
    onError: (err) => {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || '修改失敗，請重試')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!form.oldPassword)           { setError('請輸入目前密碼'); return }
    if (form.newPassword.length < 6) { setError('新密碼至少 6 字元'); return }
    if (form.newPassword !== form.confirmPassword) { setError('兩次新密碼不一致'); return }
    if (form.oldPassword === form.newPassword)     { setError('新密碼不可與目前密碼相同'); return }

    mutation.mutate({ oldPassword: form.oldPassword, newPassword: form.newPassword })
  }

  // 成功畫面
  if (success) {
    return (
      <div className="max-w-md mx-auto pt-12 text-center animate-fade-in">
        <div className="card py-12 space-y-4">
          <CheckCircle size={52} className="text-sage-500 mx-auto" />
          <h2 className="font-display text-xl font-bold text-gray-800">密碼修改成功</h2>
          <p className="text-sm text-gray-500">
            為確保帳號安全，系統將在 <strong>3 秒後自動登出</strong>，<br />
            請使用新密碼重新登入。
          </p>
          <div className="h-1.5 w-48 bg-sage-100 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-sage-400 rounded-full animate-[shrink_3s_linear_forwards]" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/profile" className="text-sage-500 hover:text-sage-700 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="page-title">修改密碼</h1>
          <p className="text-sm text-gray-400 mt-0.5">需先驗證目前密碼才能設定新密碼</p>
        </div>
      </div>

      <div className="card space-y-5">
        <div className="flex items-center gap-3 p-3 bg-sage-50 rounded-xl">
          <div className="w-9 h-9 bg-sage-100 rounded-xl flex items-center justify-center shrink-0">
            <Lock size={16} className="text-sage-600" />
          </div>
          <p className="text-xs text-sage-600 leading-relaxed">
            修改密碼後系統將自動登出，請使用新密碼重新登入以確認變更。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 目前密碼 */}
          <div>
            <label className="label">目前密碼 *</label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="請輸入目前使用的密碼"
                value={form.oldPassword}
                onChange={e => set('oldPassword', e.target.value)}
                autoComplete="current-password"
                required
              />
              <button type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowOld(!showOld)}>
                {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="border-t border-sage-100" />

          {/* 新密碼 */}
          <div>
            <label className="label">新密碼 * <span className="text-gray-400 font-normal">（至少 6 字元）</span></label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="設定新密碼"
                value={form.newPassword}
                onChange={e => set('newPassword', e.target.value)}
                autoComplete="new-password"
                required
              />
              <button type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {/* 密碼強度提示 */}
            {form.newPassword.length > 0 && (
              <div className="mt-1.5 flex gap-1">
                {[6, 8, 12].map((len, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    form.newPassword.length >= len ? 'bg-sage-400' : 'bg-gray-200'
                  }`} />
                ))}
                <span className="text-xs text-gray-400 ml-1">
                  {form.newPassword.length < 6  ? '太短' :
                   form.newPassword.length < 8  ? '普通' :
                   form.newPassword.length < 12 ? '良好' : '強'}
                </span>
              </div>
            )}
          </div>

          {/* 確認新密碼 */}
          <div>
            <label className="label">確認新密碼 *</label>
            <input
              type="password"
              className={`input-field ${
                form.confirmPassword && form.newPassword !== form.confirmPassword
                  ? 'border-red-300 bg-red-50'
                  : form.confirmPassword && form.newPassword === form.confirmPassword
                  ? 'border-sage-400'
                  : ''
              }`}
              placeholder="再次輸入新密碼"
              value={form.confirmPassword}
              onChange={e => set('confirmPassword', e.target.value)}
              autoComplete="new-password"
              required
            />
            {form.confirmPassword && form.newPassword !== form.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">兩次密碼不一致</p>
            )}
            {form.confirmPassword && form.newPassword === form.confirmPassword && form.newPassword.length >= 6 && (
              <p className="text-xs text-sage-500 mt-1 flex items-center gap-1">
                <CheckCircle size={12} /> 密碼一致
              </p>
            )}
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* 按鈕 */}
          <div className="flex gap-3 pt-1">
            <Link to="/profile" className="btn-secondary flex-1 text-center">
              取消
            </Link>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {mutation.isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />更新中...</>
                : <><Lock size={15} />確認修改密碼</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
