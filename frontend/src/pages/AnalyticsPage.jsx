import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'
import { analyticsApi } from '../api'
import { useChildStore } from '../store'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { BarChart3, TrendingUp, AlertTriangle, Activity } from 'lucide-react'

const TABS = [
  { id: 'basic', label: '基礎圖表', icon: BarChart3 },
  { id: 'correlation', label: '關聯分析', icon: TrendingUp },
  { id: 'alerts', label: '預警系統', icon: AlertTriangle },
]

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-sage-100 shadow-card rounded-xl px-3 py-2 text-sm">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}{unit || p.unit || ''}
        </p>
      ))}
    </div>
  )
}

function MoodDot({ mood }) {
  const map = { HAPPY: '#f59e0b', STABLE: '#527f52', ANGRY: '#f87c6b', CRYING: '#60a5fa', OTHER: '#9ca3af' }
  return <div className="w-2 h-2 rounded-full mx-auto" style={{ backgroundColor: map[mood] || '#ccc' }} />
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('basic')
  const [days, setDays] = useState(30)
  const { selectedChildId, selectedChild } = useChildStore()

  const basicQuery = useQuery({
    queryKey: ['analytics-basic', selectedChildId, days],
    queryFn: () => analyticsApi.basic(selectedChildId, { days }).then(r => r.data),
    enabled: !!selectedChildId && activeTab === 'basic'
  })

  const corrQuery = useQuery({
    queryKey: ['analytics-corr', selectedChildId, days],
    queryFn: () => analyticsApi.correlation(selectedChildId, { days }).then(r => r.data),
    enabled: !!selectedChildId && activeTab === 'correlation'
  })

  const alertsQuery = useQuery({
    queryKey: ['alerts', selectedChildId],
    queryFn: () => analyticsApi.alerts(selectedChildId).then(r => r.data),
    enabled: !!selectedChildId && activeTab === 'alerts'
  })

  if (!selectedChildId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="text-5xl">📊</div>
        <div className="font-display text-xl font-bold text-gray-600">請選擇幼童以查看分析</div>
      </div>
    )
  }

  const fmt = (dateStr) => {
    try { return format(parseISO(dateStr), 'M/d', { locale: zhTW }) }
    catch { return dateStr }
  }

  const series = basicQuery.data?.dailySeries || []
  const chartData = series.map(d => ({ ...d, date: fmt(d.date) }))

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">{selectedChild?.name} 的成長分析</h1>
          <p className="text-sm text-gray-400 mt-0.5">數據視覺化與健康預警</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">查詢範圍：</span>
          {[7, 14, 30, 60].map(d => (
            <button key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors
                ${days === d ? 'bg-sage-500 text-white' : 'bg-sage-50 text-sage-600 hover:bg-sage-100'}`}>
              {d}天
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-sage-50 p-1 rounded-2xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === id ? 'bg-white text-sage-700 shadow-sm' : 'text-gray-400 hover:text-sage-500'}`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Level 1: Basic ── */}
      {activeTab === 'basic' && (
        <div className="space-y-5 animate-fade-in">
          {basicQuery.isLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-400">載入中...</div>
          ) : chartData.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">此期間尚無紀錄資料</div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '平均奶量', value: basicQuery.data?.summary.avgMilkCc, unit: 'cc', color: '#38bdf8' },
                  { label: '平均睡眠', value: basicQuery.data?.summary.avgSleepHours, unit: '小時', color: '#818cf8' },
                  { label: '平均體溫', value: basicQuery.data?.summary.avgTemp, unit: '°C', color: '#f87171' },
                ].map(s => (
                  <div key={s.label} className="card text-center">
                    <div className="text-xs text-gray-400 mb-1">{s.label}</div>
                    <div className="text-2xl font-bold" style={{ color: s.color }}>
                      {s.value ?? '—'}
                    </div>
                    {s.value != null && <div className="text-xs text-gray-400">{s.unit}</div>}
                  </div>
                ))}
              </div>

              {/* Milk volume chart */}
              <div className="card">
                <p className="section-title mb-4">🍼 每日奶量 (cc)</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6ede6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <Tooltip content={<CustomTooltip unit="cc" />} />
                    <Bar dataKey="totalMilkCc" name="奶量" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Sleep chart */}
              <div className="card">
                <p className="section-title mb-4">😴 每日睡眠時數</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6ede6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis domain={[0, 12]} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <Tooltip content={<CustomTooltip unit="hr" />} />
                    <ReferenceLine y={8} stroke="#a4bfa4" strokeDasharray="5 5" label={{ value: '建議8hr', fontSize: 10, fill: '#9ca3af' }} />
                    <Line type="monotone" dataKey="sleepHours" name="睡眠" stroke="#818cf8" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Temperature chart */}
              <div className="card">
                <p className="section-title mb-4">🌡️ 體溫紀錄</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData.filter(d => d.latestTemp)} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6ede6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis domain={[35.5, 39.5]} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <Tooltip content={<CustomTooltip unit="°C" />} />
                    <ReferenceLine y={37.5} stroke="#fca5a5" strokeDasharray="5 5" label={{ value: '37.5°C', fontSize: 10, fill: '#ef4444' }} />
                    <Line type="monotone" dataKey="latestTemp" name="體溫" stroke="#f87171" strokeWidth={2}
                      dot={({ cx, cy, payload }) => (
                        <circle key={`dot-${payload.date}`} cx={cx} cy={cy} r={4}
                          fill={payload.latestTemp >= 37.5 ? '#ef4444' : '#f87171'} strokeWidth={0} />
                      )}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Level 2: Correlation ── */}
      {activeTab === 'correlation' && (
        <div className="space-y-5 animate-fade-in">
          {corrQuery.isLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-400">載入中...</div>
          ) : (
            <>
              {/* Food-Bowel risk items */}
              <div className="card">
                <div className="section-title mb-1">🥗 副食品與排便關聯</div>
                <p className="text-xs text-gray-400 mb-4">食物品項與出現排便異常的相關性（至少出現 2 次以上才列入分析）</p>
                {corrQuery.data?.foodBowelCorrelation?.riskItems?.length > 0 ? (
                  <div className="space-y-2">
                    {corrQuery.data.foodBowelCorrelation.riskItems.map((item) => (
                      <div key={item.food} className="flex items-center gap-3">
                        <div className="w-20 text-sm text-gray-600 shrink-0">{item.food}</div>
                        <div className="flex-1 bg-sage-50 rounded-full h-5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${item.abnormalRate > 0.5 ? 'bg-red-400' : item.abnormalRate > 0.3 ? 'bg-amber-400' : 'bg-sage-400'}`}
                            style={{ width: `${item.abnormalRate * 100}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium text-gray-600 w-12 text-right shrink-0">
                          {(item.abnormalRate * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-gray-400 shrink-0">({item.occurrences}次)</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-4 text-center">資料不足，無法進行關聯分析</p>
                )}
              </div>

              {/* Sleep-Milk correlation scatter */}
              <div className="card">
                <div className="section-title mb-1">🍼 夜間奶量與睡眠時數</div>
                <p className="text-xs text-gray-400 mb-4">每日 18:00 後奶量 vs 當日總睡眠時數</p>
                {corrQuery.data?.milkSleepCorrelation?.data?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={corrQuery.data.milkSleepCorrelation.data}
                      margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e6ede6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }}
                        tickFormatter={d => fmt(d)} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <Tooltip />
                      <Line yAxisId="left" type="monotone" dataKey="eveningMilkCc" name="夜間奶量(cc)" stroke="#7dd3fc" strokeWidth={1.5} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="sleepHours" name="睡眠(hr)" stroke="#818cf8" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 py-4 text-center">資料不足</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Level 3: Alerts ── */}
      {activeTab === 'alerts' && (
        <div className="space-y-4 animate-fade-in">
          {alertsQuery.isLoading ? (
            <div className="h-32 flex items-center justify-center text-gray-400">載入中...</div>
          ) : alertsQuery.data?.alerts?.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-sage-700">近期健康狀況良好</p>
              <p className="text-sm text-gray-400 mt-1">無任何健康預警</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="card text-center">
                  <div className="text-2xl font-bold text-red-500">{alertsQuery.data?.stats?.redAlerts || 0}</div>
                  <div className="text-xs text-gray-400">紅色警示</div>
                </div>
                <div className="card text-center">
                  <div className="text-2xl font-bold text-amber-500">{alertsQuery.data?.stats?.yellowAlerts || 0}</div>
                  <div className="text-xs text-gray-400">黃色注意</div>
                </div>
                <div className="card text-center">
                  <div className="text-2xl font-bold text-sage-500">{alertsQuery.data?.stats?.recordCount || 0}</div>
                  <div className="text-xs text-gray-400">近 7 日紀錄</div>
                </div>
              </div>

              {alertsQuery.data.alerts.map((alert, i) => (
                <div key={i} className={alert.level === 'RED' ? 'alert-red' : 'alert-yellow'}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">{alert.icon}</span>
                    <div>
                      <div className={`font-semibold ${alert.level === 'RED' ? 'text-red-800' : 'text-amber-800'}`}>
                        {alert.title}
                      </div>
                      <div className={`text-sm mt-0.5 ${alert.level === 'RED' ? 'text-red-700' : 'text-amber-700'}`}>
                        {alert.message}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(alert.triggeredAt).toLocaleString('zh-TW')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
