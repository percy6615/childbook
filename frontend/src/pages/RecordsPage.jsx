import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit, ChevronLeft, ChevronRight } from 'lucide-react'
import { recordsApi } from '../api'
import { useChildStore } from '../store'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const MOOD_MAP = {
  HAPPY: '😊', STABLE: '😌', ANGRY: '😤', CRYING: '😢', OTHER: '🤔'
}

export default function RecordsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { selectedChildId, selectedChild } = useChildStore()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['records', selectedChildId, page],
    queryFn: () => recordsApi.list({ childId: selectedChildId, page, limit: 20 }).then(r => r.data),
    enabled: !!selectedChildId
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => recordsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records'] })
      qc.invalidateQueries({ queryKey: ['alerts'] })
    }
  })

  const records = data?.data || []
  const pagination = data?.pagination

  if (!selectedChildId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="text-5xl">📖</div>
        <div className="font-display text-xl font-bold text-gray-600">請選擇幼童</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">{selectedChild?.name} 的日誌</h1>
          {pagination && (
            <p className="text-sm text-gray-400 mt-0.5">共 {pagination.total} 筆紀錄</p>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm flex items-center gap-1.5"
            onClick={() => navigate('/upload')}>📷 掃描</button>
          <button className="btn-primary text-sm flex items-center gap-1.5"
            onClick={() => navigate('/records/new')}>
            <Plus size={15} /> 新增
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-sage-50" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-semibold text-gray-600">尚無日誌紀錄</p>
          <p className="text-sm text-gray-400 mt-1">點擊「新增」或「掃描」建立第一筆紀錄</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record, i) => {
            const dateStr = record.recordDate ? record.recordDate.split('T')[0] : ''
            const totalMilk = record.diets?.filter(d => d.type === 'MILK').reduce((s, d) => s + (d.volumeCc || 0), 0) || 0
            const hasTemp = record.healths?.[0]?.temperature
            const hasFever = record.healths?.some(h => h.temperature >= 37.5)

            return (
              <div key={record.id}
                className="card group flex items-center gap-4 cursor-pointer hover:shadow-card-hover
                           transition-all duration-150 animate-fade-in"
                style={{ animationDelay: `${i * 0.04}s` }}
                onClick={() => navigate(`/records/${record.id}/edit`)}>

                {/* Date */}
                <div className="text-center shrink-0 w-12">
                  <div className="text-lg font-bold text-sage-700 leading-none">
                    {dateStr ? format(parseISO(dateStr), 'd') : '?'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {dateStr ? format(parseISO(dateStr), 'M月', { locale: zhTW }) : ''}
                  </div>
                </div>

                {/* Mood */}
                <div className="text-2xl shrink-0">{MOOD_MAP[record.mood] || '📋'}</div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-700 text-sm">
                    {dateStr ? format(parseISO(dateStr), 'yyyy年M月d日 EEEE', { locale: zhTW }) : '無日期'}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {record.dropOffTime && (
                      <span className="text-xs text-gray-400">🕗 {record.dropOffTime}</span>
                    )}
                    {totalMilk > 0 && (
                      <span className="text-xs text-gray-400">🍼 {totalMilk}cc</span>
                    )}
                    {record.sleeps?.length > 0 && (
                      <span className="text-xs text-gray-400">😴 午睡</span>
                    )}
                    {hasTemp && (
                      <span className={`text-xs ${hasFever ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        🌡️ {hasTemp}°C{hasFever ? ' ⚠️' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mode badge */}
                <span className={`badge shrink-0 ${record.entryMode === 'AI_ASSISTED' ? 'badge-blue' : 'badge-gray'}`}>
                  {record.entryMode === 'AI_ASSISTED' ? '🤖' : '✍️'}
                </span>

                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/records/${record.id}/edit`) }}
                    className="p-1.5 hover:bg-sage-50 rounded-lg text-sage-400 hover:text-sage-600 transition-colors">
                    <Edit size={15} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm('確定刪除此紀錄？')) deleteMutation.mutate(record.id)
                    }}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
            className="btn-secondary p-2 disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-500">
            {page} / {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= pagination.totalPages}
            className="btn-secondary p-2 disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
