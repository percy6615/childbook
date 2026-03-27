import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Mail } from 'lucide-react'
import { authApi } from '../api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => authApi.forgotPassword(data),
    onSuccess: () => setSubmitted(true),
    onError: (err) => setError(err.response?.data?.error || '發送失敗，請稍後再試')
  })

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-sage-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-card-hover p-8 border border-sage-100 max-w-sm w-full text-center animate-fade-in">
          <div className="w-16 h-16 bg-sage-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail size={28} className="text-sage-500" />
          </div>
          <h2 className="font-display text-xl font-bold text-gray-800 mb-3">信件已發送</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            若 <strong>{email}</strong> 已註冊，您將收到密碼重置信件。<br />
            請於 30 分鐘內點擊信件連結完成重置。
          </p>
          <p className="text-xs text-gray-400 mb-4">沒收到？請檢查垃圾郵件匣</p>
          <Link to="/login" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft size={15} /> 返回登入
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sage-50 to-sage-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-card-hover p-8 border border-sage-100 max-w-sm w-full animate-fade-in">
        <Link to="/login" className="flex items-center gap-1 text-sm text-sage-500 hover:text-sage-700 mb-6">
          <ArrowLeft size={15} /> 返回登入
        </Link>

        <div className="mb-6">
          <h2 className="font-display text-xl font-bold text-gray-800">忘記密碼</h2>
          <p className="text-sm text-gray-400 mt-1">輸入您的 Email，我們將發送重置連結</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate({ email }) }} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input-field" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          <button type="submit" disabled={mutation.isPending}
            className="btn-primary w-full justify-center flex items-center gap-2">
            {mutation.isPending
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />發送中...</>
              : '發送重置信件'}
          </button>
        </form>
      </div>
    </div>
  )
}
