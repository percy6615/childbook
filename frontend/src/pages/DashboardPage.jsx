import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, AlertTriangle, Activity, Moon, Droplets, TrendingUp, ChevronRight } from 'lucide-react'
import { analyticsApi, recordsApi } from '../api'
import { useChildStore } from '../store'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const MOOD_MAP = {
  HAPPY: { emoji: '😊', label: '快樂', color: 'text-yellow-500' },
  STABLE: { emoji: '😌', label: '穩定', color: 'text-sage-500' },
  ANGRY: { emoji: '😤', label: '生氣', color: 'text-orange-500' },
  CRYING: { emoji: '😢', label: '哭鬧', color: 'text-blue-500' },
  OTHER: { emoji: '🤔', label: '其他', color: 'text-gray-500' },
}

function AlertCard({ alert }) {
  const bgMap = { RED: 'alert-red', YELLOW: 'alert-yellow' }
  const textMap = { RED: 'text-red-700', YELLOW: 'text-amber-700' }
  const titleMap = { RED: 'text-red-800', YELLOW: 'text-amber-800' }

  return (
    <div className={`${bgMap[alert.level] || 'alert-yellow'} animate-fade-in`}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{alert.icon}</span>
        <div>
          <div className={`font-semibold text-sm ${titleMap[alert.level]}`}>{alert.title}</div>
          <div className={`text-sm mt-0.5 ${textMap[alert.level]}`}>{alert.message}</div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, unit, color, className }) {
  return (
    <div className={`card flex items-center gap-4 ${className}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-0.5">{label}</div>
        <div className="text-xl font-bold text-gray-800">
          {value ?? '—'}
          {value != null && unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { selectedChild, selectedChildId } = useChildStore()
  const navigate = useNavigate()
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['alerts', selectedChildId],
    queryFn: () => analyticsApi.alerts(selectedChildId).then(r => r.data),
    enabled: !!selectedChildId,
    refetchInterval: 60_000
  })

  const { data: basicData } = useQuery({
    queryKey: ['analytics-basic', selectedChildId],
    queryFn: () => analyticsApi.basic(selectedChildId, { days: 7 }).then(r => r.data),
    enabled: !!selectedChildId
  })

  const { data: recentRecords } = useQuery({
    queryKey: ['records-recent', selectedChildId],
    queryFn: () => recordsApi.list({ childId: selectedChildId, limit: 5 }).then(r => r.data),
    enabled: !!selectedChildId
  })

  if (!selectedChildId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-5xl">👶</div>
        <div className="text-center">
          <div className="font-display text-xl font-bold text-gray-700 mb-2">請先選擇幼童</div>
          <p className="text-gray-400 text-sm">從左側選單選擇要查看的幼童，或</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/children')}>
          新增幼童資料
        </button>
      </div>
    )
  }

  const summary = basicData?.summary || {}
  const activeAlerts = alerts?.alerts || []
  const records = recentRecords?.data || []
  const todayRecord = records.find(r => r.recordDate?.startsWith(today))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">
            {selectedChild?.name} 的今日總覽
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary flex items-center gap-1.5 text-sm"
            onClick={() => navigate('/upload')}
          >
            📷 掃描上傳
          </button>
          <button
            className="btn-primary flex items-center gap-1.5 text-sm"
            onClick={() => navigate('/records/new')}
          >
            <Plus size={16} /> 新增紀錄
          </button>
        </div>
      </div>

      {/* Alerts */}
      {activeAlerts.length > 0 && (
        <div className="space-y-3 animate-fade-in stagger-1">
          <div className="section-title">
            <AlertTriangle size={16} className="text-amber-500" />
            健康預警通知
          </div>
          {activeAlerts.map((alert, i) => (
            <AlertCard key={i} alert={alert} />
          ))}
        </div>
      )}

      {activeAlerts.length === 0 && !alertsLoading && (
        <div className="alert-green animate-fade-in stagger-1">
          <div className="flex items-center gap-2 text-sage-700">
            <span className="text-lg">✅</span>
            <span className="font-medium text-sm">近期健康狀況良好，無異常警示</span>
          </div>
        </div>
      )}

      {/* Today's record status */}
      <div className="card animate-fade-in stagger-2">
        <div className="flex items-center justify-between mb-3">
          <div className="section-title">今日紀錄狀態</div>
          {todayRecord && (
            <span className="badge badge-green">已建立</span>
          )}
        </div>
        {todayRecord ? (
          <div className="flex flex-wrap gap-4">
            {todayRecord.mood && (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-lg">{MOOD_MAP[todayRecord.mood]?.emoji}</span>
                <span className="text-gray-600">{MOOD_MAP[todayRecord.mood]?.label}</span>
              </div>
            )}
            {todayRecord.dropOffTime && (
              <div className="text-sm text-gray-600">
                🕗 到校 {todayRecord.dropOffTime}
              </div>
            )}
            {todayRecord.healths?.[0]?.temperature && (
              <div className="text-sm text-gray-600">
                🌡️ {todayRecord.healths[0].temperature}°C
              </div>
            )}
            <button
              className="ml-auto text-sage-500 hover:text-sage-700 text-sm flex items-center gap-1"
              onClick={() => navigate(`/records/${todayRecord.id}/edit`)}
            >
              查看詳情 <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-gray-400 text-sm">
            <span>今日尚未建立紀錄</span>
            <button
              className="btn-primary text-xs py-1.5 px-3"
              onClick={() => navigate('/records/new')}
            >
              立即填寫
            </button>
          </div>
        )}
      </div>

      {/* Stats (last 7 days) */}
      <div>
        <div className="section-title mb-3">近 7 日平均數據</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            icon={Droplets} label="每日平均奶量" value={summary.avgMilkCc} unit="cc"
            color="bg-sky-400" className="animate-fade-in stagger-2"
          />
          <StatCard
            icon={Moon} label="每日平均睡眠" value={summary.avgSleepHours} unit="小時"
            color="bg-indigo-400" className="animate-fade-in stagger-3"
          />
          <StatCard
            icon={Activity} label="近期平均體溫" value={summary.avgTemp} unit="°C"
            color="bg-coral-400" className="animate-fade-in stagger-4"
          />
        </div>
      </div>

      {/* Recent records */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="section-title">
            <TrendingUp size={16} />
            最近紀錄
          </div>
          <button
            className="text-sm text-sage-500 hover:text-sage-700 flex items-center gap-1"
            onClick={() => navigate('/records')}
          >
            查看全部 <ChevronRight size={14} />
          </button>
        </div>
        <div className="space-y-2">
          {records.length === 0 ? (
            <div className="card text-center text-gray-400 text-sm py-8">尚無紀錄</div>
          ) : (
            records.slice(0, 5).map((record, i) => (
              <div
                key={record.id}
                className={`card flex items-center gap-4 cursor-pointer hover:shadow-card-hover
                            transition-shadow duration-150 animate-fade-in`}
                style={{ animationDelay: `${i * 0.05}s` }}
                onClick={() => navigate(`/records/${record.id}/edit`)}
              >
                <div className="text-2xl">{MOOD_MAP[record.mood]?.emoji || '📋'}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-700 text-sm">
                    {format(parseISO(record.recordDate), 'M月d日 EEEE', { locale: zhTW })}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 flex gap-2">
                    {record.healths?.[0]?.temperature && (
                      <span>🌡️ {record.healths[0].temperature}°C</span>
                    )}
                    {record.diets?.length > 0 && (
                      <span>🍼 {record.diets.length} 筆飲食</span>
                    )}
                    {record.sleeps?.length > 0 && (
                      <span>😴 有午睡</span>
                    )}
                  </div>
                </div>
                <span className={`badge ${record.entryMode === 'AI_ASSISTED' ? 'badge-blue' : 'badge-gray'}`}>
                  {record.entryMode === 'AI_ASSISTED' ? '🤖 AI' : '✍️ 手動'}
                </span>
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
