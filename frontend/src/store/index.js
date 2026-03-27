import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import queryClient from '../queryClient'

/**
 * 清除所有 React Query 快取（登入/登出時呼叫）
 */
const clearQueryCache = () => {
  queryClient.clear()
}

// ─── Auth Store ───────────────────────────────────────────────────────────────
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        // 登入時先清除前一個使用者的 cache，再設定新狀態
        clearQueryCache()
        set({ user, token, isAuthenticated: true })
      },

      updateUser: (updatedFields) =>
        set((state) => ({ user: { ...state.user, ...updatedFields } })),

      logout: () => {
        // 1. 清除 React Query 全部快取（最重要）
        clearQueryCache()
        // 2. 清除 Zustand 狀態
        set({ user: null, token: null, isAuthenticated: false })
        // 3. 清除幼童選取
        useChildStore.getState().clearSelection()
        // 4. 清除 localStorage persist（確保重開分頁也乾淨）
        localStorage.removeItem('childbook-auth')
        localStorage.removeItem('childbook-child')
      },
    }),
    {
      name: 'childbook-auth',
      partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated })
    }
  )
)

// ─── Child Store ──────────────────────────────────────────────────────────────
export const useChildStore = create(
  persist(
    (set) => ({
      selectedChildId: null,
      selectedChild: null,
      selectChild: (child) => set({ selectedChildId: child.id, selectedChild: child }),
      clearSelection: () => set({ selectedChildId: null, selectedChild: null }),
    }),
    {
      name: 'childbook-child',
      partialize: (s) => ({ selectedChildId: s.selectedChildId, selectedChild: s.selectedChild })
    }
  )
)
