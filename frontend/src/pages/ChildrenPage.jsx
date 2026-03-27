import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Baby, Trash2, KeyRound, Copy, Check, Link as LinkIcon } from 'lucide-react'
import { childrenApi } from '../api'
import { useChildStore, useAuthStore } from '../store'

// 複製到剪貼簿按鈕
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="p-1 hover:bg-sage-100 rounded text-sage-400 hover:text-sage-600 transition-colors"
      title="複製綁定碼"
    >
      {copied ? <Check size={13} className="text-sage-500" /> : <Copy size={13} />}
    </button>
  )
}

// Admin 新增幼童表單
function CreateChildForm({ onDone }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', birthDate: '', gender: '', notes: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data) => childrenApi.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['children'] })
      setResult(res.data)
    },
    onError: (err) => setError(err.response?.data?.error || '建立失敗')
  })

  if (result) return (
    <div className="space-y-4">
      <div className="alert-green">
        <p className="font-semibold text-sage-700 text-sm">✅ 幼童「{result.child.name}」建立成功！</p>
        <p className="text-xs text-sage-500 mt-1">請將以下綁定碼提供給對應人員：</p>
      </div>
      {[
        { label: '家長綁定碼', code: result.bindingCodes?.parent, color: 'bg-blue-50 border-blue-200 text-blue-700' },
        { label: '教師綁定碼', code: result.bindingCodes?.teacher, color: 'bg-amber-50 border-amber-200 text-amber-700' },
      ].map(({ label, code, color }) => (
        <div key={label} className={`rounded-xl border p-3 ${color}`}>
          <div className="text-xs font-medium mb-1">{label}</div>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm flex-1 break-all">{code}</code>
            <CopyButton text={code} />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={() => { setResult(null); setForm({ name:'',birthDate:'',gender:'',notes:'' }) }}>
          再新增一位
        </button>
        <button className="btn-primary flex-1" onClick={onDone}>完成</button>
      </div>
    </div>
  )

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }} className="space-y-3">
      <div>
        <label className="label">姓名 *</label>
        <input className="input-field" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} required placeholder="幼童姓名" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">出生日期</label>
          <input type="date" className="input-field" value={form.birthDate} onChange={e => setForm(f=>({...f,birthDate:e.target.value}))} />
        </div>
        <div>
          <label className="label">性別</label>
          <select className="select-field" value={form.gender} onChange={e => setForm(f=>({...f,gender:e.target.value}))}>
            <option value="">不指定</option>
            <option value="M">男</option>
            <option value="F">女</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">備註</label>
        <textarea rows={2} className="input-field resize-none" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="過敏史、特殊需求..." />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onDone}>取消</button>
        <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
          {mutation.isPending ? '建立中...' : '建立幼童'}
        </button>
      </div>
    </form>
  )
}

export default function ChildrenPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const { selectedChildId, selectChild } = useChildStore()
  const [showCreate, setShowCreate] = useState(false)
  const isAdmin = user?.role === 'ADMIN'

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['children'],
    queryFn: () => childrenApi.list().then(r => r.data)
  })

  const unbindMutation = useMutation({
    mutationFn: (id) => childrenApi.unbind(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['children'] })
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => childrenApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['children'] })
  })

  const getAge = (birthDate) => {
    if (!birthDate) return null
    const b = new Date(birthDate), n = new Date()
    const m = (n.getFullYear()-b.getFullYear())*12 + (n.getMonth()-b.getMonth())
    return m < 24 ? `${m} 個月` : `${Math.floor(m/12)} 歲 ${m%12} 個月`
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">幼童管理</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isAdmin ? '所有幼童檔案（管理員視圖）' : `目前綁定 ${children.length} 位幼童`}
          </p>
        </div>
        <div className="flex gap-2">
          {!isAdmin && (
            <button className="btn-secondary text-sm flex items-center gap-1.5"
              onClick={() => navigate('/settings/bind')}>
              <KeyRound size={14} /> 新增綁定
            </button>
          )}
          {isAdmin && (
            <button className="btn-primary text-sm flex items-center gap-1.5"
              onClick={() => setShowCreate(true)}>
              <Plus size={15} /> 建立幼童
            </button>
          )}
        </div>
      </div>

      {/* Admin 建立表單 */}
      {showCreate && isAdmin && (
        <div className="card mb-5 border-sage-200 animate-fade-in">
          <div className="section-title mb-4">➕ 建立幼童檔案</div>
          <CreateChildForm onDone={() => setShowCreate(false)} />
        </div>
      )}

      {/* 未綁定提示 */}
      {!isLoading && children.length === 0 && user?.role !== 'ADMIN' && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🔑</div>
          <p className="font-semibold text-gray-600">尚未綁定任何幼童</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">請向管理員索取綁定碼</p>
          <button className="btn-primary" onClick={() => navigate('/settings/bind')}>
            輸入綁定碼
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-sage-50" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {children.map((child) => (
            <div key={child.id}
              className={`card animate-fade-in transition-all duration-150 ${selectedChildId === child.id ? 'ring-2 ring-sage-400' : 'hover:shadow-card-hover'}`}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-sage-100 flex items-center justify-center text-2xl shrink-0">
                  {child.gender === 'M' ? '👦' : child.gender === 'F' ? '👧' : '👶'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{child.name}</span>
                    {selectedChildId === child.id && <span className="badge badge-green">目前選取</span>}
                  </div>
                  {child.birthDate && (
                    <div className="text-xs text-gray-400 mt-0.5">🎂 {getAge(child.birthDate)}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5 flex gap-3 flex-wrap">
                    <span>📝 {child._count?.records || 0} 筆紀錄</span>
                    <span>👨‍👩‍👧 {child.parents?.length || 0} 位家長</span>
                    <span>👩‍🏫 {child.teachers?.length || 0} 位老師</span>
                  </div>

                  {/* Admin 可看到綁定碼 */}
                  {isAdmin && (
                    <div className="mt-2 space-y-1">
                      {[
                        { label: '家長碼', code: child.parentBindingCode,  color: 'text-blue-600 bg-blue-50' },
                        { label: '教師碼', code: child.teacherBindingCode, color: 'text-amber-600 bg-amber-50' },
                      ].map(({ label, code, color }) => (
                        <div key={label} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg w-fit ${color}`}>
                          <KeyRound size={10} />
                          <span className="font-medium">{label}：</span>
                          <code className="font-mono">{code}</code>
                          <CopyButton text={code} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 shrink-0 flex-col">
                  <button onClick={() => selectChild(child)} className="btn-secondary text-xs py-1.5 px-3">選取</button>
                  {!isAdmin && (
                    <button
                      onClick={() => { if (confirm(`確定解除「${child.name}」的綁定？`)) unbindMutation.mutate(child.id) }}
                      className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded transition-colors">
                      解除綁定
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => { if (confirm(`確定刪除「${child.name}」所有資料？`)) deleteMutation.mutate(child.id) }}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
