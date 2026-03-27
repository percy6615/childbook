import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Baby, Plus, Loader2 } from 'lucide-react'
import { childrenApi } from '../../api'
import { useChildStore, useAuthStore } from '../../store'
import { useNavigate } from 'react-router-dom'

export default function ChildSelector() {
  const [open, setOpen] = useState(false)
  const { selectedChild, selectChild } = useChildStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const { data: children = [], isLoading, isFetching } = useQuery({
    queryKey: ['children'],
    queryFn: () => childrenApi.list().then(r => r.data),
    enabled: !!user && user.role !== 'UNBOUND',
    // 登入後 cache 被清除，強制重新 fetch
    refetchOnMount: true,
  })

  // UNBOUND：顯示綁定碼入口
  if (user?.role === 'UNBOUND') {
    return (
      <button
        onClick={() => navigate('/settings/bind')}
        className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100
                   rounded-xl text-sm transition-colors border border-amber-200 text-amber-700">
        🔑 <span className="flex-1 text-left">點此輸入綁定碼</span>
      </button>
    )
  }

  // ─── 始終顯示下拉按鈕，Loading 時在按鈕內顯示 spinner ───────────────────────
  return (
    <div className="relative">
      <button
        onClick={() => !isLoading && setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-sage-50 hover:bg-sage-100
                   rounded-xl text-sm transition-colors border border-sage-200
                   disabled:cursor-wait"
        disabled={isLoading}
      >
        {/* 左側圖示：Loading 時顯示 spinner，否則顯示 Baby icon */}
        {isLoading
          ? <Loader2 size={16} className="text-sage-400 animate-spin shrink-0" />
          : <Baby size={16} className="text-sage-500 shrink-0" />
        }

        {/* 中間文字 */}
        <span className="flex-1 text-left truncate text-sage-700 font-medium">
          {isLoading
            ? '載入中...'
            : selectedChild?.name || '請選擇幼童'
          }
        </span>

        {/* 右側箭頭：Loading 時隱藏 */}
        {!isLoading && (
          <ChevronDown
            size={14}
            className={`text-sage-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* 下拉選單 */}
      {open && !isLoading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-sage-100
                        rounded-xl shadow-card-hover z-50 overflow-hidden">
          {children.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-gray-400">尚無綁定的幼童</div>
          ) : (
            children.map((child) => (
              <button
                key={child.id}
                onClick={() => { selectChild(child); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left
                            hover:bg-sage-50 transition-colors duration-100
                            ${selectedChild?.id === child.id
                              ? 'bg-sage-50 text-sage-700 font-medium'
                              : 'text-gray-600'}`}
              >
                <div className="w-6 h-6 rounded-full bg-sage-100 flex items-center justify-center
                                text-sage-600 text-xs font-bold shrink-0">
                  {child.name[0]}
                </div>
                <span className="truncate">{child.name}</span>
              </button>
            ))
          )}

          <div className="border-t border-sage-100">
            <button
              onClick={() => { setOpen(false); navigate('/settings/children') }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm
                         text-sage-500 hover:bg-sage-50 transition-colors">
              <Plus size={14} /> 管理綁定幼童
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
