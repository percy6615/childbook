/**
 * Frontend Unit Tests v2.2
 * Run from frontend/: npm test
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/index.js', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
  childrenApi: {
    list: vi.fn().mockResolvedValue({ data: [] }),
    bind: vi.fn(),
  },
  default: {}
}))

vi.mock('../store/index.js', () => ({
  useAuthStore: vi.fn(() => ({
    user: null, token: null, isAuthenticated: false,
    login: vi.fn(), logout: vi.fn(), updateUser: vi.fn()
  })),
  useChildStore: vi.fn(() => ({
    selectedChild: null, selectedChildId: null,
    selectChild: vi.fn(), clearSelection: vi.fn()
  }))
}))

const wrap = (ui, initialEntries = ['/']) => render(
  <QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })}>
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
  </QueryClientProvider>
)

// ─── calcSleepMinutes ────────────────────────────────────────────────────────
const calcSleepMinutes = (s, e) => {
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  const start = sh * 60 + sm, end = eh * 60 + em
  return end > start ? end - start : 0
}

describe('calcSleepMinutes', () => {
  test('13:00–14:30 = 90 min', () => expect(calcSleepMinutes('13:00', '14:30')).toBe(90))
  test('null inputs → 0', () => expect(calcSleepMinutes(null, null)).toBe(0))
  test('end < start → 0', () => expect(calcSleepMinutes('14:00', '13:00')).toBe(0))
  test('2 hours = 120 min', () => expect(calcSleepMinutes('09:00', '11:00')).toBe(120))
})

// ─── v2.2 Role logic ─────────────────────────────────────────────────────────
const VALID_ROLES = ['ADMIN', 'PARENT', 'TEACHER', 'UNBOUND']
const ROLE_LABEL  = { ADMIN:'管理員', PARENT:'家長', TEACHER:'教師', UNBOUND:'未綁定' }

describe('v2.2 Role definitions', () => {
  test.each(VALID_ROLES)('role %s has a label', (role) => {
    expect(ROLE_LABEL[role]).toBeTruthy()
  })

  test('UNBOUND is a valid role', () => {
    expect(VALID_ROLES).toContain('UNBOUND')
  })

  test('UNBOUND label is 未綁定', () => {
    expect(ROLE_LABEL['UNBOUND']).toBe('未綁定')
  })
})

// ─── Binding code validation ─────────────────────────────────────────────────
const isValidBindingCode = (code) =>
  typeof code === 'string' && code.trim().length > 0

describe('Binding code validation', () => {
  test('non-empty string is valid', () => {
    expect(isValidBindingCode('parent-bind-xiaoming')).toBe(true)
  })
  test('empty string is invalid', () => {
    expect(isValidBindingCode('')).toBe(false)
  })
  test('whitespace-only is invalid', () => {
    expect(isValidBindingCode('   ')).toBe(false)
  })
  test('null is invalid', () => {
    expect(isValidBindingCode(null)).toBe(false)
  })
})

// ─── Email validation ────────────────────────────────────────────────────────
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

describe('Email validation', () => {
  test.each([
    ['user@example.com', true],
    ['user+tag@domain.org', true],
    ['notanemail', false],
    ['missing@', false],
    ['@nodomain.com', false],
    ['', false],
  ])('"%s" → valid=%s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected)
  })
})

// ─── Password validation ─────────────────────────────────────────────────────
const isValidPassword = (pw) => typeof pw === 'string' && pw.length >= 6

describe('Password validation', () => {
  test('6+ chars is valid', () => expect(isValidPassword('abc123')).toBe(true))
  test('5 chars is invalid', () => expect(isValidPassword('abc12')).toBe(false))
  test('empty is invalid', () => expect(isValidPassword('')).toBe(false))
})

// ─── Alert logic ─────────────────────────────────────────────────────────────
const checkFever = (records) =>
  records.filter(r => r.healths?.some(h => h.temperature >= 37.5)).length >= 3

describe('Fever alert', () => {
  const f = { healths: [{ temperature: 38.0 }] }
  const n = { healths: [{ temperature: 36.5 }] }
  test('3 days → triggers', () => expect(checkFever([f, f, f])).toBe(true))
  test('2 days → no trigger', () => expect(checkFever([f, f])).toBe(false))
  test('37.5 exactly counts', () => {
    expect(checkFever([
      { healths: [{ temperature: 37.5 }] },
      { healths: [{ temperature: 37.5 }] },
      { healths: [{ temperature: 37.5 }] }
    ])).toBe(true)
  })
})

// ─── Task polling ─────────────────────────────────────────────────────────────
const TERMINAL = ['COMPLETED', 'FAILED', 'REVIEW_NEEDED']
const shouldPoll = (status) => !TERMINAL.includes(status)

describe.each([
  ['PENDING', true], ['PROCESSING', true],
  ['REVIEW_NEEDED', false], ['COMPLETED', false], ['FAILED', false]
])('shouldPoll(%s) → %s', (s, expected) => {
  test(s, () => expect(shouldPoll(s)).toBe(expected))
})

// ─── Form normalization ──────────────────────────────────────────────────────
const normalizeDiets = (d) => d.map(x => ({ ...x, volumeCc: x.volumeCc ? parseInt(x.volumeCc) : undefined }))
const normalizeHealths = (h) => h.map(x => ({ ...x, temperature: x.temperature ? parseFloat(x.temperature) : undefined }))

describe('normalizeDiets', () => {
  test('"150" → 150', () => expect(normalizeDiets([{ volumeCc: '150' }])[0].volumeCc).toBe(150))
  test('"" → undefined', () => expect(normalizeDiets([{ volumeCc: '' }])[0].volumeCc).toBeUndefined())
})

describe('normalizeHealths', () => {
  test('"36.8" → 36.8', () => expect(normalizeHealths([{ temperature: '36.8' }])[0].temperature).toBe(36.8))
  test('"" → undefined', () => expect(normalizeHealths([{ temperature: '' }])[0].temperature).toBeUndefined())
})

// ─── emptyRecord defaults ─────────────────────────────────────────────────────
const emptyRecord = () => ({
  recordDate: new Date().toISOString().split('T')[0],
  dropOffTime:'', pickUpTime:'', mood:'STABLE',
  homeBowel: false, homeEatingNotes:'', notesTeacher:'', notesParent:'',
  diets:[], sleeps:[], bowels:[], healths:[]
})

describe('emptyRecord', () => {
  test('default mood is STABLE', () => expect(emptyRecord().mood).toBe('STABLE'))
  test('homeBowel is false', () => expect(emptyRecord().homeBowel).toBe(false))
  test('all sub-arrays empty', () => {
    const r = emptyRecord()
    ;['diets','sleeps','bowels','healths'].forEach(k => expect(r[k]).toHaveLength(0))
  })
  test('recordDate is YYYY-MM-DD', () => {
    expect(emptyRecord().recordDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ─── LoginPage ────────────────────────────────────────────────────────────────
import LoginPage from '../pages/LoginPage'

describe('LoginPage (v2.2 email-based)', () => {
  beforeEach(() => vi.clearAllMocks())

  test('renders title', () => {
    wrap(<LoginPage />)
    expect(screen.getByText('寶寶日誌')).toBeInTheDocument()
  })

  test('has email input', () => {
    wrap(<LoginPage />)
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
  })

  test('has password input', () => {
    wrap(<LoginPage />)
    expect(screen.getByPlaceholderText('請輸入密碼')).toBeInTheDocument()
  })

  test('has 忘記密碼 link', () => {
    wrap(<LoginPage />)
    expect(screen.getByText('忘記密碼？')).toBeInTheDocument()
  })

  test('has 立即註冊 link', () => {
    wrap(<LoginPage />)
    expect(screen.getByText('立即註冊')).toBeInTheDocument()
  })

  test('empty submit shows validation error', async () => {
    wrap(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: '登入' }))
    await waitFor(() => expect(screen.getByText('請填寫 Email 與密碼')).toBeInTheDocument())
  })

  test('demo parent fills email', () => {
    wrap(<LoginPage />)
    fireEvent.click(screen.getByText('家長').closest('button'))
    expect(screen.getByPlaceholderText('your@email.com')).toHaveValue('parent@childbook.app')
  })

  test('shows all 4 demo role buttons', () => {
    wrap(<LoginPage />)
    ;['管理員','家長','教師','未綁定'].forEach(r => expect(screen.getByText(r)).toBeInTheDocument())
  })
})

// ─── RegisterPage ─────────────────────────────────────────────────────────────
import RegisterPage from '../pages/RegisterPage'

describe('RegisterPage', () => {
  beforeEach(() => vi.clearAllMocks())

  test('renders form', () => {
    wrap(<RegisterPage />)
    expect(screen.getByText('免費註冊')).toBeInTheDocument()
  })

  test('has email, password, confirm fields', () => {
    wrap(<RegisterPage />)
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('請設定密碼')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('再次輸入密碼')).toBeInTheDocument()
  })

  test('has 登入 link', () => {
    wrap(<RegisterPage />)
    expect(screen.getByText('立即登入')).toBeInTheDocument()
  })

  test('password mismatch shows error', async () => {
    wrap(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'x@x.com' } })
    fireEvent.change(screen.getByPlaceholderText('請設定密碼'), { target: { value: 'abc123' } })
    fireEvent.change(screen.getByPlaceholderText('再次輸入密碼'), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: '建立帳號' }))
    await waitFor(() => expect(screen.getByText('兩次密碼不一致')).toBeInTheDocument())
  })

  test('shows binding code hint', () => {
    wrap(<RegisterPage />)
    expect(screen.getByText(/綁定碼/)).toBeInTheDocument()
  })
})

// ─── ForgotPasswordPage ───────────────────────────────────────────────────────
import ForgotPasswordPage from '../pages/ForgotPasswordPage'

describe('ForgotPasswordPage', () => {
  test('renders form with email input', () => {
    wrap(<ForgotPasswordPage />)
    expect(screen.getByText('忘記密碼')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
  })

  test('has submit button', () => {
    wrap(<ForgotPasswordPage />)
    expect(screen.getByRole('button', { name: '發送重置信件' })).toBeInTheDocument()
  })

  test('has back to login link', () => {
    wrap(<ForgotPasswordPage />)
    expect(screen.getByText('← 返回登入')).toBeInTheDocument()
  })
})

// ─── BindPage ────────────────────────────────────────────────────────────────
import BindPage from '../pages/BindPage'
import { useAuthStore } from '../store/index.js'

describe('BindPage', () => {
  test('renders binding code form', () => {
    wrap(<BindPage />)
    expect(screen.getByText('綁定幼童')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('輸入綁定碼')).toBeInTheDocument()
  })

  test('shows unbound notice when user role is UNBOUND', () => {
    useAuthStore.mockReturnValue({
      user: { role: 'UNBOUND', email: 'x@x.com' },
      updateUser: vi.fn()
    })
    wrap(<BindPage />)
    expect(screen.getByText(/尚未綁定/)).toBeInTheDocument()
  })

  test('empty submit shows validation error', async () => {
    wrap(<BindPage />)
    fireEvent.click(screen.getByRole('button', { name: '確認綁定' }))
    await waitFor(() => expect(screen.getByText('請輸入綁定碼')).toBeInTheDocument())
  })
})
