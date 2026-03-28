import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Save, User, Shield, Mail, Lock, ChevronRight } from 'lucide-react'
import { authApi } from '../api'
import { useAuthStore } from '../store'

const ROLE_LABEL = { ADMIN:'管理員', PARENT:'家長', TEACHER:'教師', UNBOUND:'未綁定' }
const ROLE_COLOR = { ADMIN:'badge-red', PARENT:'badge-green', TEACHER:'badge-blue', UNBOUND:'badge-gray' }

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => authApi.updateProfile(data),
    onSuccess: (res) => {
      updateUser(res.data.user)
      setSuccess('顯示名稱更新成功')
      setError('')
      setTimeout(() => setSuccess(''), 3000)
    },
    onError: (err) => setError(err.response?.data?.error || '更新失敗')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    mutation.mutate({ displayName })
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <h1 className="page-title">個人設定</h1>

      {/* 帳號資訊卡 */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-sage-100 flex items-center justify-center
                          text-3xl font-bold text-sage-600 shrink-0">
            {(user?.displayName || user?.email || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-lg text-gray-800">
              {user?.displayName || '（未設定名稱）'}
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-400 mt-0.5">
              <Mail size={12} /> {user?.email}
            </div>
            <div className="mt-1.5">
              <span className={`badge ${ROLE_COLOR[user?.role] || 'badge-gray'}`}>
                <Shield size={10} /> {ROLE_LABEL[user?.role] || user?.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 顯示名稱 */}
      <div className="card">
        <div className="section-title mb-4">
          <User size={16} /> 編輯顯示名稱
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email（不可修改）</label>
            <input
              className="input-field bg-gray-50 cursor-not-allowed text-gray-400"
              value={user?.email || ''}
              disabled
            />
          </div>
          <div>
            <label className="label">顯示名稱</label>
            <input
              className="input-field"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="王爸爸 / 陳老師"
              maxLength={50}
            />
          </div>

          {error   && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}
          {success && <div className="bg-sage-50 border border-sage-200 text-sage-700 text-sm rounded-xl px-4 py-3">{success}</div>}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {mutation.isPending
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />儲存中...</>
              : <><Save size={15} />儲存名稱</>
            }
          </button>
        </form>
      </div>

      {/* 密碼管理 — 導向獨立頁面 */}
      <div className="card">
        <div className="section-title mb-4">
          <Lock size={16} /> 密碼管理
        </div>
        <Link
          to="/settings/password"
          className="flex items-center justify-between p-4 bg-sage-50 hover:bg-sage-100
                     rounded-xl border border-sage-200 transition-colors duration-150 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sage-200 rounded-xl flex items-center justify-center shrink-0">
              <Lock size={16} className="text-sage-600" />
            </div>
            <div>
              <p className="font-medium text-sm text-gray-700">修改密碼</p>
              <p className="text-xs text-gray-400 mt-0.5">需輸入目前密碼才能設定新密碼</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-sage-400 transition-colors" />
        </Link>
      </div>
    </div>
  )
}
