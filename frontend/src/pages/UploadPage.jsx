import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, CheckCircle, XCircle, Clock, RefreshCw, Camera, PenLine, RotateCcw } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { uploadsApi, tasksApi } from '../api'
import { useChildStore } from '../store'
import RecordFormPage from './RecordFormPage'

const STATUS_CONFIG = {
  PENDING:       { label: '等待處理中', icon: Clock,       color: 'text-gray-500',  bg: 'bg-gray-50'   },
  PROCESSING:    { label: 'AI 辨識中',  icon: RefreshCw,   color: 'text-blue-500',  bg: 'bg-blue-50'   },
  REVIEW_NEEDED: { label: '請確認結果', icon: CheckCircle, color: 'text-amber-500', bg: 'bg-amber-50'  },
  COMPLETED:     { label: '已完成',     icon: CheckCircle, color: 'text-sage-500',  bg: 'bg-sage-50'   },
  FAILED:        { label: '辨識失敗',   icon: XCircle,     color: 'text-red-500',   bg: 'bg-red-50'    },
}

// 這些狀態下應該停止 polling
const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'REVIEW_NEEDED']

// 每次 polling 間隔（ms）
const POLL_INTERVAL = 3000

export default function UploadPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { selectedChildId, selectedChild } = useChildStore()
  const [taskId, setTaskId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  // 失敗後的選擇：null | 'manual' | 'retry'
  const [failedAction, setFailedAction] = useState(null)
  const fileRef = useRef()

  // ── Upload mutation ──────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: ({ file, childId }) => {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('childId', childId)
      return uploadsApi.upload(fd)
    },
    onSuccess: (res) => {
      setTaskId(res.data.taskId)
      setFailedAction(null)
    },
    onError: () => {}
  })

  // ── Task polling ─────────────────────────────────────────────────────────────
  // ✅ 修正：TanStack Query v5 的 refetchInterval 收到的是 Query 物件
  //    必須用 query.state.data 才能拿到實際資料
  const { data: task } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId).then(r => r.data),
    // ✅ enabled 條件：有 taskId、尚未確認、狀態不是終態
    enabled: !!taskId && !confirmed,
    // ✅ 修正 refetchInterval：正確讀取 query.state.data.status
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // 終態 → 停止 polling
      if (status && TERMINAL_STATUSES.includes(status)) return false
      // 尚未取得資料，或非終態 → 繼續 polling
      return POLL_INTERVAL
    },
    // 確保頁面重新 focus 時不重新 fetch（已在 refetchInterval 控制）
    refetchOnWindowFocus: false,
    // 避免過時資料被 stale 重新 fetch
    staleTime: 0,
  })

  // ── 處理檔案選擇 ────────────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return

    if (!selectedChildId) {
      alert('請先從左側選擇幼童')
      return
    }

    // 重設所有狀態，準備新的上傳流程
    const url = URL.createObjectURL(file)
    setPreview(url)
    setTaskId(null)
    setConfirmed(false)
    setFailedAction(null)

    // 清除舊的 task query cache
    qc.removeQueries({ queryKey: ['task'] })

    uploadMutation.mutate({ file, childId: selectedChildId })
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleFile(file)
  }, [selectedChildId])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  // ── 重新上傳同一張圖片進行 AI 辨識 ──────────────────────────────────────────
  const handleRetryAI = () => {
    if (!preview || !selectedChildId) return
    // 將 blob URL 轉回 File 物件重新上傳
    fetch(preview)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], 'retry.jpg', { type: blob.type })
        setTaskId(null)
        setFailedAction(null)
        setConfirmed(false)
        qc.removeQueries({ queryKey: ['task'] })
        uploadMutation.mutate({ file, childId: selectedChildId })
      })
      .catch(() => alert('無法重試，請重新選擇圖片'))
  }

  // ── 重置回初始狀態 ──────────────────────────────────────────────────────────
  const handleReset = () => {
    setTaskId(null)
    setPreview(null)
    setConfirmed(false)
    setFailedAction(null)
    qc.removeQueries({ queryKey: ['task'] })
    uploadMutation.reset()
  }

  // ── 解析狀態 ────────────────────────────────────────────────────────────────
  const statusInfo    = task ? STATUS_CONFIG[task.status] : null
  const isReviewReady = task?.status === 'REVIEW_NEEDED'
  const isFailed      = task?.status === 'FAILED'
  const isProcessing  = task?.status === 'PENDING' || task?.status === 'PROCESSING'

  // ── AI prefill 資料 ─────────────────────────────────────────────────────────
  const getAiPrefill = () => {
    if (!task?.rawAiData) return {}
    const d = task.rawAiData
    return {
      recordDate:      d.recordDate || undefined,
      dropOffTime:     d.dropOffTime || '',
      pickUpTime:      d.pickUpTime || '',
      mood:            d.mood || 'STABLE',
      homeBowel:       d.homeBowel || false,
      homeEatingNotes: d.homeEatingNotes || '',
      notesTeacher:    d.notesTeacher || '',
      notesParent:     d.notesParent || '',
      diets:   d.diets   || [],
      sleeps:  d.sleeps  || [],
      bowels:  d.bowels  || [],
      healths: d.healths || []
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 已確認完成畫面
  // ════════════════════════════════════════════════════════════════════════════
  if (confirmed) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4 animate-fade-in">
        <div className="text-6xl">🎉</div>
        <h2 className="font-display text-2xl font-bold text-sage-700">紀錄已成功儲存！</h2>
        <p className="text-gray-500">AI 辨識結果已確認並寫入系統</p>
        <div className="flex gap-3 justify-center pt-4">
          <button className="btn-secondary" onClick={() => navigate('/records')}>查看紀錄</button>
          <button className="btn-primary" onClick={handleReset}>再次上傳</button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 主畫面
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="page-title">AI 掃描上傳</h1>
        <p className="text-sm text-gray-400 mt-1">
          拍攝紙本聯絡簿照片，AI 自動辨識並填入表單，確認後儲存
        </p>
      </div>

      {!selectedChildId && (
        <div className="alert-yellow mb-6">
          <div className="text-amber-700 text-sm font-medium">
            ⚠️ 請先從左側選單選擇幼童，再上傳照片
          </div>
        </div>
      )}

      {/* ── 上傳區（沒有進行中任務時顯示）── */}
      {!taskId && !uploadMutation.isPending && (
        <div
          className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-200 cursor-pointer
            ${isDragging
              ? 'border-sage-400 bg-sage-50'
              : 'border-sage-200 bg-cream-50 hover:border-sage-300 hover:bg-sage-50/50'}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => handleFile(e.target.files[0])}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-sage-100 rounded-2xl flex items-center justify-center">
              <Camera size={32} className="text-sage-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">點擊拍照或拖曳圖片至此</p>
              <p className="text-sm text-gray-400">支援 JPEG、PNG、WebP、HEIC，最大 10MB</p>
            </div>
            <button className="btn-primary flex items-center gap-2" type="button">
              <Upload size={16} /> 選擇圖片
            </button>
          </div>
        </div>
      )}

      {/* 上傳中 spinner */}
      {uploadMutation.isPending && (
        <div className="border-2 border-dashed border-sage-200 rounded-3xl p-12 text-center bg-cream-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-sage-200 border-t-sage-500 rounded-full animate-spin" />
            <p className="text-sage-600 font-medium">上傳中...</p>
          </div>
        </div>
      )}

      {uploadMutation.error && (
        <div className="alert-red mt-4">
          <p className="text-red-700 text-sm">
            {uploadMutation.error.response?.data?.error || '上傳失敗，請重試'}
          </p>
          <button className="mt-2 text-sm text-red-600 underline" onClick={handleReset}>
            重新選擇圖片
          </button>
        </div>
      )}

      {/* ── AI 處理中狀態 ── */}
      {taskId && isProcessing && statusInfo && (
        <div className="mt-6 space-y-4 animate-fade-in">
          <div className={`${statusInfo.bg} border border-sage-200 rounded-2xl p-5 flex items-center gap-4`}>
            <statusInfo.icon
              size={24}
              className={`${statusInfo.color} ${task.status === 'PROCESSING' ? 'animate-spin' : ''}`}
            />
            <div>
              <div className={`font-semibold ${statusInfo.color}`}>{statusInfo.label}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {task.status === 'PENDING'
                  ? '等待 AI 工作器領取任務...'
                  : 'GPT-4o 正在分析您的聯絡簿照片...（約 10~30 秒）'}
              </div>
            </div>
            <div className="ml-auto text-xs text-gray-400 font-mono">{task?.id?.split('-')[0]}</div>
          </div>

          {preview && (
            <div className="card">
              <p className="section-title mb-3">上傳的圖片</p>
              <img src={preview} alt="上傳預覽" className="rounded-xl max-h-64 object-contain mx-auto" />
            </div>
          )}

          <div className="text-center text-xs text-gray-400 animate-pulse-soft">
            每 3 秒自動更新狀態（僅查詢本系統，不額外呼叫 AI）
          </div>

          <div className="text-center">
            <button className="text-sm text-gray-400 hover:text-gray-600 underline" onClick={handleReset}>
              取消，重新上傳
            </button>
          </div>
        </div>
      )}

      {/* ── AI 辨識失敗 → 提供選擇，不直接打 API ── */}
      {taskId && isFailed && !failedAction && (
        <div className="mt-6 space-y-4 animate-fade-in">
          <div className="alert-red">
            <div className="flex items-start gap-3">
              <XCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-700">AI 辨識失敗</p>
                <p className="text-sm text-red-600 mt-1">
                  {task?.errorMsg || '圖片無法辨識，可能是圖片模糊或非表單格式'}
                </p>
              </div>
            </div>
          </div>

          {preview && (
            <div className="card">
              <p className="section-title mb-2 text-xs text-gray-400">辨識的圖片</p>
              <img src={preview} alt="失敗圖片" className="rounded-xl max-h-48 object-contain mx-auto" />
            </div>
          )}

          {/* 選擇操作 — 不自動呼叫任何 API */}
          <div className="card">
            <p className="font-semibold text-gray-700 mb-4 text-center">請選擇後續操作</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

              {/* 選項 1：重新 AI 辨識（用同一張圖） */}
              <button
                onClick={handleRetryAI}
                disabled={uploadMutation.isPending}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-sage-200
                           hover:border-sage-400 hover:bg-sage-50 transition-all duration-150
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <RotateCcw size={20} className="text-blue-500" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm text-gray-700">再次 AI 辨識</p>
                  <p className="text-xs text-gray-400 mt-0.5">使用同一張圖片重試</p>
                </div>
              </button>

              {/* 選項 2：換一張圖片 */}
              <button
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-sage-200
                           hover:border-sage-400 hover:bg-sage-50 transition-all duration-150"
              >
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Camera size={20} className="text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm text-gray-700">換一張圖片</p>
                  <p className="text-xs text-gray-400 mt-0.5">重新拍照或選擇</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleFile(e.target.files[0])}
                />
              </button>

              {/* 選項 3：手動填寫 */}
              <button
                onClick={() => setFailedAction('manual')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-sage-200
                           hover:border-sage-400 hover:bg-sage-50 transition-all duration-150"
              >
                <div className="w-10 h-10 bg-sage-100 rounded-xl flex items-center justify-center">
                  <PenLine size={20} className="text-sage-500" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm text-gray-700">手動填寫</p>
                  <p className="text-xs text-gray-400 mt-0.5">圖片僅供參考</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 選擇「手動填寫」後的雙視窗 */}
      {taskId && isFailed && failedAction === 'manual' && (
        <div className="mt-6 animate-fade-in">
          <div className="alert-yellow mb-4 flex items-center justify-between">
            <p className="text-amber-700 text-sm font-medium">
              ✍️ 手動填寫模式（可對照圖片輸入）
            </p>
            <button
              className="text-amber-600 text-xs underline"
              onClick={() => setFailedAction(null)}
            >
              ← 回到選擇
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {preview && (
              <div className="card sticky top-4 h-fit">
                <p className="section-title mb-3">📷 圖片參考</p>
                <img src={preview} alt="參考圖片" className="rounded-xl w-full object-contain max-h-80" />
              </div>
            )}
            <div>
              <RecordFormPage
                prefillData={{ recordDate: new Date().toISOString().split('T')[0] }}
                onConfirm={() => navigate('/records')}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── AI 辨識成功 → 雙視窗確認 ── */}
      {taskId && isReviewReady && (
        <div className="mt-6 animate-fade-in">
          <div className="alert-yellow mb-4">
            <p className="text-amber-700 font-medium text-sm">
              ✅ AI 辨識完成！請核對左側原始圖片與右側辨識結果，確認無誤後送出
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card sticky top-4 h-fit">
              <p className="section-title mb-3">📷 原始圖片</p>
              <img
                src={task?.imageUrl || preview}
                alt="原始聯絡簿"
                className="rounded-xl w-full object-contain border border-sage-100"
              />
              <p className="text-xs text-gray-400 mt-2 text-center">
                對照此圖片核對右側辨識結果
              </p>
            </div>
            <div>
              <RecordFormPage
                prefillData={getAiPrefill()}
                taskId={taskId}
                onConfirm={() => setConfirmed(true)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
