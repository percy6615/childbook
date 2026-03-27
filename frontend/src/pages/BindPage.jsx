import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, CheckCircle, Baby } from 'lucide-react'
import { childrenApi } from '../api'
import { useAuthStore, useChildStore } from '../store'

export default function BindPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, updateUser } = useAuthStore()
  const { selectChild } = useChildStore()
  const [code, setCode] = useState('')
  const [bound, setBound] = useState(null) // 綁定成功後的幼童資料
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => childrenApi.bind(data),
    onSuccess: (res) => {
      setBound(res.data)
      // 更新 store 中的使用者角色
      updateUser(res.data.user)
      // 自動選取剛綁定的幼童
      selectChild(res.data.child)
      // 讓幼童清單 cache 失效
      qc.invalidateQueries({ queryKey: ['children'] })
      setCode('')
      setError('')
    },
    onError: (err) => setError(err.response?.data?.error || '綁定失敗，請確認綁定碼是否正確')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    const trimmed = code.trim()
    if (!trimmed) { setError('請輸入綁定碼'); return }
    mutation.mutate({ bindingCode: trimmed })
  }

  const isUnbound = user?.role === 'UNBOUND'

  return (
    <div className="min-h-screen bg-gradient-to-br from-sage-50 via-cream-100 to-sage-100 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md animate-fade-in">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sage-500 rounded-2xl shadow-lg mb-4">
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-sage-800">綁定幼童</h1>
          <p className="text-sage-500 mt-1 text-sm">
            {isUnbound ? '請輸入管理員提供的綁定碼以開始使用' : '輸入新的綁定碼可繼續綁定更多幼童'}
          </p>
        </div>

        {/* Unbound notice */}
        {isUnbound && (
          <div className="alert-yellow mb-4">
            <p className="text-amber-700 text-sm font-medium">
              ⚠️ 您的帳號尚未綁定任何幼童，需要綁定碼才能存取系統功能。
            </p>
            <p className="text-amber-600 text-xs mt-1">
              請向機構管理員索取「家長綁定碼」或「教師綁定碼」
            </p>
          </div>
        )}

        {/* Bind form */}
        <div className="bg-white rounded-3xl shadow-card-hover p-8 border border-sage-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label flex items-center gap-2">
                <KeyRound size={14} className="text-sage-500" />
                綁定碼
              </label>
              <input
                type="text"
                className="input-field font-mono tracking-wider text-center text-lg"
                placeholder="輸入綁定碼"
                value={code}
                onChange={e => { setCode(e.target.value); setError('') }}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-gray-400 mt-1">
                綁定碼由管理員建立幼童檔案時自動產生
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button type="submit" disabled={mutation.isPending}
              className="btn-primary w-full justify-center flex items-center gap-2">
              {mutation.isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />綁定中...</>
                : <><KeyRound size={16} />確認綁定</>}
            </button>
          </form>

          {/* 成功訊息 */}
          {bound && (
            <div className="mt-5 p-4 bg-sage-50 border border-sage-200 rounded-2xl animate-fade-in">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-sage-500 shrink-0" />
                <div>
                  <p className="font-semibold text-sage-700 text-sm">{bound.message}</p>
                  <p className="text-xs text-sage-500 mt-0.5">
                    <Baby size={12} className="inline mr-1" />
                    {bound.child?.name}
                  </p>
                </div>
              </div>
              {/* 可繼續綁定更多 */}
              <p className="text-xs text-gray-400 mt-2">
                有多位幼童？可繼續輸入其他綁定碼
              </p>
            </div>
          )}
        </div>

        {/* 已綁定則顯示前往 */}
        {(bound || !isUnbound) && (
          <div className="text-center mt-5">
            <button
              className="btn-primary"
              onClick={() => navigate('/dashboard')}
            >
              前往首頁 →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
