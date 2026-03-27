import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Save, User, Shield, Mail } from 'lucide-react'
import { authApi } from '../api'
import { useAuthStore } from '../store'

const ROLE_LABEL = { ADMIN:'管理員', PARENT:'家長', TEACHER:'教師', UNBOUND:'未綁定' }
const ROLE_COLOR = { ADMIN:'badge-red', PARENT:'badge-green', TEACHER:'badge-blue', UNBOUND:'badge-gray' }

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const [form, setForm] = useState({ displayName: user?.displayName || '', password: '', confirmPassword: '' })
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => authApi.updateProfile(data),
    onSuccess: (res) => {
      updateUser(res.data.user)
      setSuccess('更新成功')
      setForm(f => ({ ...f, password: '', confirmPassword: '' }))
      setError('')
      setTimeout(() => setSuccess(''), 3000)
    },
    onError: (err) => setError(err.response?.data?.error || '更新失敗')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (form.password && form.password !== form.confirmPassword) { setError('兩次密碼不一致'); return }
    const payload = { displayName: form.displayName }
    if (form.password) payload.password = form.password
    mutation.mutate(payload)
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="page-title mb-6">個人設定</h1>

      <div className="card mb-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-sage-100 flex items-center justify-center text-3xl font-bold text-sage-600">
            {(user?.displayName || user?.email || '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-lg text-gray-800">{user?.displayName || '（未設定名稱）'}</div>
            <div className="flex items-center gap-1 text-sm text-gray-400 mt-0.5">
              <Mail size={12} />{user?.email}
            </div>
            <div className="mt-1">
              <span className={`badge ${ROLE_COLOR[user?.role] || 'badge-gray'}`}>
                <Shield size={10} />{ROLE_LABEL[user?.role] || user?.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title mb-4"><User size={16} />編輯個人資料</div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email（不可修改）</label>
            <input className="input-field bg-gray-50 cursor-not-allowed" value={user?.email || ''} disabled />
          </div>
          <div>
            <label className="label">顯示名稱</label>
            <input className="input-field" value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="王爸爸 / 陳老師" />
          </div>
          <div>
            <label className="label">新密碼（不修改請留空）</label>
            <input type="password" className="input-field" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="至少 6 字元" />
          </div>
          <div>
            <label className="label">確認新密碼</label>
            <input type="password" className="input-field" value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="再次輸入" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}
          {success && <div className="bg-sage-50 border border-sage-200 text-sage-700 text-sm rounded-xl px-4 py-3">{success}</div>}
          <button type="submit" disabled={mutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2">
            {mutation.isPending
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />儲存中...</>
              : <><Save size={15} />儲存變更</>}
          </button>
        </form>
      </div>
    </div>
  )
}
