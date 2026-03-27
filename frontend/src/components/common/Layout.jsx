import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, BookOpen, Upload, BarChart3,
  User, LogOut, Menu, X, Baby, KeyRound
} from 'lucide-react'
import { useAuthStore, useChildStore } from '../../store'
import ChildSelector from './ChildSelector'

const navItems = [
  { to: '/dashboard',         icon: LayoutDashboard, label: '首頁總覽' },
  { to: '/records',           icon: BookOpen,        label: '日誌紀錄' },
  { to: '/upload',            icon: Upload,          label: 'AI 掃描上傳' },
  { to: '/analytics',         icon: BarChart3,       label: '成長分析' },
  { to: '/settings/children', icon: Baby,            label: '幼童管理' },
  { to: '/profile',           icon: User,            label: '個人設定' },
]

const ROLE_LABEL = { ADMIN: '管理員', PARENT: '家長', TEACHER: '教師', UNBOUND: '未綁定' }

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-cream-50 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-sage-100 shadow-lg
        flex flex-col transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:shadow-none
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-sage-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-sage-500 rounded-xl flex items-center justify-center text-white text-lg">🌿</div>
            <div>
              <div className="font-display font-bold text-sage-800 text-sm leading-tight">寶寶日誌</div>
              <div className="text-xs text-sage-400">幼兒家庭聯絡簿</div>
            </div>
          </div>
          <button className="ml-auto lg:hidden text-sage-400" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>

        {/* Child Selector */}
        <div className="px-4 py-3 border-b border-sage-100">
          <ChildSelector />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150 group
                ${isActive ? 'bg-sage-50 text-sage-700 shadow-sm' : 'text-gray-500 hover:bg-sage-50 hover:text-sage-600'}
              `}>
              {({ isActive }) => (
                <><Icon size={18} className={isActive ? 'text-sage-500' : 'text-gray-400 group-hover:text-sage-400'} />{label}</>
              )}
            </NavLink>
          ))}
          {/* 綁定碼快捷入口（家長/教師可繼續綁定更多幼童） */}
          {['PARENT', 'TEACHER'].includes(user?.role) && (
            <NavLink to="/settings/bind" onClick={() => setOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150
                ${isActive ? 'bg-sage-50 text-sage-700' : 'text-gray-500 hover:bg-sage-50 hover:text-sage-600'}
              `}>
              {() => <><KeyRound size={18} className="text-gray-400" />新增幼童綁定</>}
            </NavLink>
          )}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-sage-100">
          <div className="flex items-center gap-3 px-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-sage-100 flex items-center justify-center text-sage-600 font-semibold text-sm">
              {(user?.displayName || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-700 truncate">{user?.displayName || user?.email}</div>
              <div className="text-xs text-gray-400">{ROLE_LABEL[user?.role] || user?.role}</div>
            </div>
          </div>
          <button
            onClick={() => {
              // logout() 內部已清除 QueryClient cache + localStorage
              logout()
              // 導向登入頁（在狀態清除後）
              navigate('/login', { replace: true })
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500
                       hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors duration-150">
            <LogOut size={16} /> 登出
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 bg-white border-b border-sage-100 flex items-center px-4 gap-3">
          <button className="text-sage-500" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <span className="font-display font-bold text-sage-800">寶寶日誌</span>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
