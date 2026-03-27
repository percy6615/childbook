import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, ArrowLeft, Thermometer, Moon, Droplets, Utensils, Heart } from 'lucide-react'
import { recordsApi } from '../api'
import { useChildStore } from '../store'
import { format } from 'date-fns'

const MOOD_OPTIONS = [
  { value: 'HAPPY', label: '😊 快樂' },
  { value: 'STABLE', label: '😌 穩定' },
  { value: 'ANGRY', label: '😤 生氣' },
  { value: 'CRYING', label: '😢 哭鬧' },
  { value: 'OTHER', label: '🤔 其他' },
]

const BOWEL_OPTIONS = [
  { value: 'NORMAL', label: '正常' },
  { value: 'HARD', label: '偏硬' },
  { value: 'WATERY', label: '水便' },
  { value: 'OTHER', label: '其他' },
]

const SLEEP_QUALITY = [
  { value: 'GOOD', label: '好' },
  { value: 'NORMAL', label: '普通' },
  { value: 'POOR', label: '差' },
]

const empty = {
  recordDate: format(new Date(), 'yyyy-MM-dd'),
  dropOffTime: '', pickUpTime: '', mood: 'STABLE',
  homeBowel: false, homeEatingNotes: '', notesTeacher: '', notesParent: '',
  diets: [], sleeps: [], bowels: [], healths: []
}

function SectionHeader({ icon: Icon, title, color, onAdd, addLabel }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className={`section-title ${color}`}>
        <Icon size={16} />
        {title}
      </div>
      {onAdd && (
        <button type="button" onClick={onAdd}
          className="flex items-center gap-1 text-xs text-sage-500 hover:text-sage-700 transition-colors">
          <Plus size={14} /> {addLabel}
        </button>
      )}
    </div>
  )
}

export default function RecordFormPage({ prefillData, taskId, onConfirm }) {
  const { id: editId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { selectedChildId, selectedChild } = useChildStore()
  const isEdit = !!editId
  const isConfirm = !!taskId

  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})

  // Load existing record for edit
  const { data: existingRecord } = useQuery({
    queryKey: ['record', editId],
    queryFn: () => recordsApi.get(editId).then(r => r.data),
    enabled: !!editId
  })

  useEffect(() => {
    if (existingRecord) {
      setForm({
        recordDate: existingRecord.recordDate?.split('T')[0] || empty.recordDate,
        dropOffTime: existingRecord.dropOffTime || '',
        pickUpTime: existingRecord.pickUpTime || '',
        mood: existingRecord.mood || 'STABLE',
        homeBowel: existingRecord.homeBowel || false,
        homeEatingNotes: existingRecord.homeEatingNotes || '',
        notesTeacher: existingRecord.notesTeacher || '',
        notesParent: existingRecord.notesParent || '',
        diets: existingRecord.diets || [],
        sleeps: existingRecord.sleeps || [],
        bowels: existingRecord.bowels || [],
        healths: existingRecord.healths || []
      })
    }
  }, [existingRecord])

  useEffect(() => {
    if (prefillData) setForm(f => ({ ...f, ...prefillData }))
  }, [prefillData])

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (isConfirm) return recordsApi.confirm({ ...data, taskId })
      if (isEdit) return recordsApi.update(editId, data)
      return recordsApi.create(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records'] })
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['analytics-basic'] })
      if (onConfirm) { onConfirm(); return }
      navigate('/records')
    }
  })

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Sub-record helpers ──────────────────────────────────────────────────────
  const addDiet = () => setField('diets', [...form.diets, { time: '', type: 'MILK', volumeCc: '', items: '' }])
  const updDiet = (i, k, v) => setField('diets', form.diets.map((d, idx) => idx === i ? { ...d, [k]: v } : d))
  const delDiet = (i) => setField('diets', form.diets.filter((_, idx) => idx !== i))

  const addSleep = () => setField('sleeps', [...form.sleeps, { startTime: '', endTime: '', quality: 'GOOD' }])
  const updSleep = (i, k, v) => setField('sleeps', form.sleeps.map((s, idx) => idx === i ? { ...s, [k]: v } : s))
  const delSleep = (i) => setField('sleeps', form.sleeps.filter((_, idx) => idx !== i))

  const addBowel = () => setField('bowels', [...form.bowels, { time: '', quality: 'NORMAL' }])
  const updBowel = (i, k, v) => setField('bowels', form.bowels.map((b, idx) => idx === i ? { ...b, [k]: v } : b))
  const delBowel = (i) => setField('bowels', form.bowels.filter((_, idx) => idx !== i))

  const addHealth = () => setField('healths', [...form.healths, { time: '', temperature: '', symptoms: [] }])
  const updHealth = (i, k, v) => setField('healths', form.healths.map((h, idx) => idx === i ? { ...h, [k]: v } : h))
  const delHealth = (i) => setField('healths', form.healths.filter((_, idx) => idx !== i))

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!selectedChildId && !isEdit) { setErrors({ global: '請先選擇幼童' }); return }
    const childId = isEdit ? existingRecord?.childId : selectedChildId

    const payload = {
      childId,
      ...form,
      diets: form.diets.map(d => ({ ...d, volumeCc: d.volumeCc ? parseInt(d.volumeCc) : undefined })),
      healths: form.healths.map(h => ({
        ...h,
        temperature: h.temperature ? parseFloat(h.temperature) : undefined
      }))
    }
    saveMutation.mutate(payload)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {!isConfirm && (
          <button onClick={() => navigate(-1)} className="text-sage-500 hover:text-sage-700">
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <h1 className="page-title">
            {isConfirm ? 'AI 辨識結果確認' : isEdit ? '編輯紀錄' : '新增日誌紀錄'}
          </h1>
          {(selectedChild || existingRecord?.child) && (
            <p className="text-sm text-gray-400 mt-0.5">
              {selectedChild?.name || existingRecord?.child?.name}
            </p>
          )}
        </div>
      </div>

      {errors.global && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
          {errors.global}
        </div>
      )}

      {saveMutation.error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
          {saveMutation.error.response?.data?.error || '儲存失敗，請重試'}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── Basic Info ── */}
        <div className="card space-y-4">
          <div className="section-title text-gray-700">📋 基本資訊</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">日期</label>
              <input type="date" className="input-field"
                value={form.recordDate} onChange={e => setField('recordDate', e.target.value)} required />
            </div>
            <div>
              <label className="label">到校時間</label>
              <input type="time" className="input-field"
                value={form.dropOffTime} onChange={e => setField('dropOffTime', e.target.value)} />
            </div>
            <div>
              <label className="label">離校時間</label>
              <input type="time" className="input-field"
                value={form.pickUpTime} onChange={e => setField('pickUpTime', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">今日情緒</label>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setField('mood', opt.value)}
                  className={`px-3 py-1.5 rounded-xl text-sm border transition-all duration-150
                    ${form.mood === opt.value
                      ? 'bg-sage-500 text-white border-sage-500'
                      : 'bg-cream-50 text-gray-600 border-sage-200 hover:border-sage-400'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="homeBowel" className="w-4 h-4 accent-sage-500"
              checked={form.homeBowel} onChange={e => setField('homeBowel', e.target.checked)} />
            <label htmlFor="homeBowel" className="text-sm text-gray-600 cursor-pointer">
              居家已排便
            </label>
          </div>
        </div>

        {/* ── Diet Records ── */}
        <div className="card">
          <SectionHeader icon={Droplets} title="飲食紀錄" color="text-sky-600"
            onAdd={addDiet} addLabel="新增" />
          {form.diets.length === 0 && (
            <p className="text-sm text-gray-400 py-2">點擊「新增」加入飲食紀錄</p>
          )}
          <div className="space-y-3">
            {form.diets.map((d, i) => (
              <div key={i} className="p-3 bg-cream-50 rounded-xl border border-sage-100 animate-fade-in">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="label text-xs">時間</label>
                    <input type="time" className="input-field text-sm"
                      value={d.time} onChange={e => updDiet(i, 'time', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">類型</label>
                    <select className="select-field text-sm"
                      value={d.type} onChange={e => updDiet(i, 'type', e.target.value)}>
                      <option value="MILK">🍼 喝奶</option>
                      <option value="SOLID">🍚 副食品</option>
                    </select>
                  </div>
                  {d.type === 'MILK' ? (
                    <div>
                      <label className="label text-xs">奶量 (cc)</label>
                      <input type="number" className="input-field text-sm" placeholder="150"
                        value={d.volumeCc} onChange={e => updDiet(i, 'volumeCc', e.target.value)} />
                    </div>
                  ) : (
                    <div className="col-span-1 sm:col-span-1">
                      <label className="label text-xs">食物內容</label>
                      <input type="text" className="input-field text-sm" placeholder="米糊、紅蘿蔔..."
                        value={d.items} onChange={e => updDiet(i, 'items', e.target.value)} />
                    </div>
                  )}
                  <button type="button" onClick={() => delDiet(i)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sleep Records ── */}
        <div className="card">
          <SectionHeader icon={Moon} title="睡眠紀錄" color="text-indigo-600"
            onAdd={addSleep} addLabel="新增" />
          {form.sleeps.length === 0 && (
            <p className="text-sm text-gray-400 py-2">點擊「新增」加入睡眠紀錄</p>
          )}
          <div className="space-y-3">
            {form.sleeps.map((s, i) => (
              <div key={i} className="p-3 bg-cream-50 rounded-xl border border-sage-100 animate-fade-in">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="label text-xs">開始時間</label>
                    <input type="time" className="input-field text-sm"
                      value={s.startTime} onChange={e => updSleep(i, 'startTime', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">結束時間</label>
                    <input type="time" className="input-field text-sm"
                      value={s.endTime} onChange={e => updSleep(i, 'endTime', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">品質</label>
                    <select className="select-field text-sm"
                      value={s.quality || 'GOOD'} onChange={e => updSleep(i, 'quality', e.target.value)}>
                      {SLEEP_QUALITY.map(q => (
                        <option key={q.value} value={q.value}>{q.label}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={() => delSleep(i)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bowel Records ── */}
        <div className="card">
          <SectionHeader icon={Utensils} title="排便紀錄" color="text-amber-600"
            onAdd={addBowel} addLabel="新增" />
          {form.bowels.length === 0 && (
            <p className="text-sm text-gray-400 py-2">點擊「新增」加入排便紀錄</p>
          )}
          <div className="space-y-3">
            {form.bowels.map((b, i) => (
              <div key={i} className="p-3 bg-cream-50 rounded-xl border border-sage-100 animate-fade-in">
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="label text-xs">時間</label>
                    <input type="time" className="input-field text-sm"
                      value={b.time} onChange={e => updBowel(i, 'time', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">性狀</label>
                    <select className="select-field text-sm"
                      value={b.quality} onChange={e => updBowel(i, 'quality', e.target.value)}>
                      {BOWEL_OPTIONS.map(q => (
                        <option key={q.value} value={q.value}>{q.label}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={() => delBowel(i)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Health Records ── */}
        <div className="card">
          <SectionHeader icon={Thermometer} title="健康紀錄" color="text-red-600"
            onAdd={addHealth} addLabel="新增" />
          {form.healths.length === 0 && (
            <p className="text-sm text-gray-400 py-2">點擊「新增」加入體溫/症狀紀錄</p>
          )}
          <div className="space-y-3">
            {form.healths.map((h, i) => (
              <div key={i} className="p-3 bg-cream-50 rounded-xl border border-sage-100 animate-fade-in">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="label text-xs">時間</label>
                    <input type="time" className="input-field text-sm"
                      value={h.time} onChange={e => updHealth(i, 'time', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">體溫 (°C)</label>
                    <input type="number" step="0.1" min="34" max="42" className="input-field text-sm" placeholder="36.8"
                      value={h.temperature} onChange={e => updHealth(i, 'temperature', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">症狀（逗號分隔）</label>
                    <input type="text" className="input-field text-sm" placeholder="發燒, 流鼻水"
                      value={Array.isArray(h.symptoms) ? h.symptoms.join(', ') : ''}
                      onChange={e => updHealth(i, 'symptoms', e.target.value.split(/[,，\s]+/).filter(Boolean))} />
                  </div>
                  <button type="button" onClick={() => delHealth(i)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="card space-y-4">
          <div className="section-title text-gray-700">📝 備註</div>
          <div>
            <label className="label">老師備註</label>
            <textarea rows={2} className="input-field resize-none" placeholder="今日活動、觀察..."
              value={form.notesTeacher} onChange={e => setField('notesTeacher', e.target.value)} />
          </div>
          <div>
            <label className="label">家長備註</label>
            <textarea rows={2} className="input-field resize-none" placeholder="昨夜睡況、家中備註..."
              value={form.notesParent} onChange={e => setField('notesParent', e.target.value)} />
          </div>
          <div>
            <label className="label">家中飲食備註</label>
            <textarea rows={2} className="input-field resize-none" placeholder="早餐、家中飲食狀況..."
              value={form.homeEatingNotes} onChange={e => setField('homeEatingNotes', e.target.value)} />
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="flex gap-3 pb-8">
          {!isConfirm && (
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">
              取消
            </button>
          )}
          <button type="submit" disabled={saveMutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saveMutation.isPending
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 儲存中...</>
              : <><Save size={16} /> {isConfirm ? '確認送出' : isEdit ? '更新紀錄' : '儲存紀錄'}</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}
