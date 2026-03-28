import axios from 'axios'
import { useAuthStore } from '../store'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token 失效：清除狀態後導向登入
      useAuthStore.getState().logout()   // 內部已清除 QueryClient cache
      window.location.replace('/login')  // replace 避免 history 殘留
    }
    return Promise.reject(err)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login:          (data) => api.post('/auth/login', data),
  register:       (data) => api.post('/auth/register', data),
  me:             ()     => api.get('/auth/me'),
  updateProfile:  (data) => api.patch('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword:  (data) => api.post('/auth/reset-password', data),
}

// ─── Children ─────────────────────────────────────────────────────────────────
export const childrenApi = {
  list:    ()         => api.get('/children'),
  get:     (id)       => api.get(`/children/${id}`),
  create:  (data)     => api.post('/children', data),
  update:  (id, data) => api.patch(`/children/${id}`, data),
  delete:  (id)       => api.delete(`/children/${id}`),
  bind:    (data)     => api.post('/children/bind', data),
  unbind:  (id)       => api.delete(`/children/${id}/unbind`),
}

// ─── Records ──────────────────────────────────────────────────────────────────
export const recordsApi = {
  list:    (params)       => api.get('/records', { params }),
  get:     (id)           => api.get(`/records/${id}`),
  create:  (data)         => api.post('/records', data),
  confirm: (data)         => api.post('/records/confirm', data),
  update:  (id, data)     => api.put(`/records/${id}`, data),
  delete:  (id)           => api.delete(`/records/${id}`),
}

// ─── Uploads & Tasks ──────────────────────────────────────────────────────────
export const uploadsApi = {
  upload: (fd) => api.post('/uploads', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}

export const tasksApi = {
  get:  (id)     => api.get(`/tasks/${id}`),
  list: (params) => api.get('/tasks', { params }),
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsApi = {
  basic:       (childId, params) => api.get(`/analytics/${childId}/basic`, { params }),
  correlation: (childId, params) => api.get(`/analytics/${childId}/correlation`, { params }),
  alerts:      (childId)         => api.get(`/analytics/${childId}/alerts`),
}

export default api
