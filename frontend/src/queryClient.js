import { QueryClient } from '@tanstack/react-query'

/**
 * Singleton QueryClient — export 供 store/logout 使用
 * 登出時需呼叫 queryClient.clear() 清除所有快取
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      // 確保切換帳號後不使用舊快取
      refetchOnMount: true,
    }
  }
})

export default queryClient
