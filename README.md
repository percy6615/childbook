# 🌿 寶寶日誌 — 幼兒家庭聯絡簿數位化系統

**版本：** v1.0.0  |  **規格文件：** SD v2.1

將傳統紙本幼兒家庭聯絡簿全面數位化。以 **OCR + GPT-4o 多模態 AI** 辨識手寫表單，提供三層次數據分析與健康預警功能。

---

## 📐 系統架構

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (Vite + React)                │
│  Dashboard │ 手動填寫 │ AI 掃描 │ 分析圖表 │ 幼童管理    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / REST API
┌────────────────────────▼────────────────────────────────┐
│              Backend (Node.js + Express)                 │
│  Auth(JWT+RBAC) │ Records │ Uploads │ Analytics │ Tasks  │
└──────┬──────────────────────────────────────┬───────────┘
       │ Prisma ORM                            │ BullMQ
┌──────▼──────┐                    ┌──────────▼──────────┐
│ PostgreSQL  │                    │  Redis + AI Worker  │
│  (資料庫)   │                    │  (GPT-4o 影像辨識)  │
└─────────────┘                    └─────────────────────┘
```

### 雙軌資料輸入流程

```
模式一：手動填寫
  使用者 → 表單填寫 → POST /api/v1/records → PostgreSQL
           (entryMode: MANUAL，即時完成)

模式二：AI 影像辨識
  使用者 → 上傳圖片 → POST /api/v1/uploads
         ↓ 立即回傳 taskId (非阻塞)
  Worker → BullMQ 佇列 → GPT-4o 辨識
         ↓ status: REVIEW_NEEDED
  前端 Polling → 雙視窗確認 (左圖右表單)
         ↓ 使用者確認
  POST /api/v1/records/confirm → PostgreSQL
           (entryMode: AI_ASSISTED，Transaction 確保一致性)
```

---

## 📦 目錄結構

```
childbook/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # 資料庫模型 (8 個資料表)
│   │   └── seed.js            # 測試資料
│   ├── src/
│   │   ├── app.js             # Express 主程式
│   │   ├── routes/
│   │   │   ├── auth.js        # 登入/註冊/個人資料
│   │   │   ├── children.js    # 幼童 CRUD
│   │   │   ├── records.js     # 日誌 + AI 確認
│   │   │   ├── uploads.js     # 圖片上傳 → 佇列
│   │   │   ├── tasks.js       # 任務狀態 Polling
│   │   │   └── analytics.js   # Level 1/2/3 分析
│   │   ├── workers/
│   │   │   └── aiWorker.js    # BullMQ + GPT-4o
│   │   ├── middleware/
│   │   │   ├── auth.js        # JWT + RBAC + Child 授權
│   │   │   └── errorHandler.js
│   │   └── utils/
│   │       ├── logger.js      # Winston
│   │       └── queue.js       # BullMQ + Redis
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/index.js       # Axios client + API helpers
│   │   ├── store/index.js     # Zustand (auth + child)
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── DashboardPage.jsx  # 總覽 + 預警
│   │   │   ├── RecordsPage.jsx    # 日誌列表
│   │   │   ├── RecordFormPage.jsx # 手動填寫表單
│   │   │   ├── UploadPage.jsx     # AI 掃描 + 雙視窗確認
│   │   │   ├── AnalyticsPage.jsx  # L1/L2/L3 圖表
│   │   │   ├── ChildrenPage.jsx
│   │   │   └── ProfilePage.jsx
│   │   └── components/common/
│   │       ├── Layout.jsx     # 側欄導覽
│   │       └── ChildSelector.jsx
│   ├── Dockerfile
│   └── package.json
├── tests/
│   ├── backend/api.test.js    # Supertest 整合測試 (30+)
│   └── frontend/unit.test.jsx # Vitest 單元測試 (25+)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🚀 快速啟動

### 方式一：Docker Compose（推薦）

```bash
# 1. 複製並設定環境變數
cp .env.example .env
nano .env   # 填入 OPENAI_API_KEY 和 JWT_SECRET

# 2. 一鍵啟動所有服務
docker compose up -d

# 3. 執行資料庫 Migration + Seed
docker compose exec backend npx prisma migrate deploy
docker compose exec backend node prisma/seed.js

# 4. 開啟瀏覽器
open http://localhost:5173
```

### 方式二：本機開發

**前置需求：** Node.js ≥ 20, PostgreSQL ≥ 14, Redis ≥ 7

```bash
# ── Backend ────────────────────────────────────────────────
cd backend
cp .env.example .env
# 編輯 .env 填入資料庫連線和 OpenAI API Key

npm install
npx prisma generate
npx prisma migrate dev --name init
node prisma/seed.js

# 啟動 API server (port 3001)
npm run dev

# 另開終端啟動 AI Worker
npm run worker

# ── Frontend ───────────────────────────────────────────────
cd ../frontend
npm install
npm run dev   # port 5173 (已設定 proxy → localhost:3001)
```

---

## 🔑 測試帳號

| 角色 | 帳號 | 密碼 | 可用功能 |
|------|------|------|----------|
| 管理員 | `admin@childbook.app` | `Test1234` | 全域管理、建立幼童 |
| 家長 | `parent@childbook.app` | `Test1234` | 完整日誌 + AI + Level 1~3 分析 |
| 教師 | `teacher@childbook.app` | `Test1234` | 當日紀錄 + Level 1 分析 |
| 未綁定 | `newuser@childbook.app` | `Test1234` | 需先輸入綁定碼 |

> 測試幼童：**王小明**（含近 7 天 Seed 資料）
>
> **🔑 測試綁定碼**
> - 王小明 家長碼：`parent-bind-xiaoming`
> - 王小明 教師碼：`teacher-bind-xiaoming`
> - 王小花 家長碼：`parent-bind-xiaohua`

---

## 📡 API 規格

### 認證
所有 API（除 `/auth/login`, `/auth/register`, `/health`）需 Bearer Token：
```
Authorization: Bearer <JWT_TOKEN>
```

### 核心端點

| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/v1/auth/login` | 登入 |
| POST | `/api/v1/auth/register` | 註冊 |
| GET  | `/api/v1/auth/me` | 當前使用者 |
| GET  | `/api/v1/children` | 幼童列表 |
| POST | `/api/v1/children` | 新增幼童 |
| GET  | `/api/v1/records?childId=&page=&limit=` | 日誌列表 |
| POST | `/api/v1/records` | **模式一：手動新增** |
| POST | `/api/v1/records/confirm` | **模式二：AI確認送出** |
| PUT  | `/api/v1/records/:id` | 更新日誌 |
| POST | `/api/v1/uploads` | 上傳圖片（啟動 AI 任務） |
| GET  | `/api/v1/tasks/:taskId` | 任務狀態 Polling |
| GET  | `/api/v1/analytics/:childId/basic` | Level 1 圖表資料 |
| GET  | `/api/v1/analytics/:childId/correlation` | Level 2 關聯分析 |
| GET  | `/api/v1/analytics/:childId/alerts` | Level 3 預警 |

### 手動新增範例
```bash
curl -X POST http://localhost:3001/api/v1/records \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "childId": "uuid-here",
    "recordDate": "2026-03-25",
    "dropOffTime": "07:30",
    "pickUpTime": "16:50",
    "mood": "HAPPY",
    "homeBowel": true,
    "diets": [
      { "type": "MILK", "time": "10:00", "volumeCc": 150 },
      { "type": "SOLID", "time": "12:00", "items": "豬肉、木耳" }
    ],
    "sleeps": [{ "startTime": "14:00", "endTime": "15:25", "quality": "GOOD" }],
    "bowels": [{ "time": "13:15", "quality": "NORMAL" }],
    "healths": [{ "time": "07:31", "temperature": 36.9, "symptoms": [] }]
  }'
```

---

## 🔐 角色權限矩陣 (RBAC)

| 功能 | Admin | Parent | Teacher |
|------|:-----:|:------:|:-------:|
| 查看幼童資料 | 全域 | 僅自己幼童 | 僅授權班級 |
| 新增/修改紀錄 | ✅ | ✅（歷史均可） | ✅（近3日限制） |
| AI 上傳掃描 | ✅ | ✅ | ✅ |
| Level 1-3 分析 | ✅ | ✅ | Level 1 限 |
| 幼童管理 | ✅ | ✅（自己幼童） | ❌ |
| 帳號管理 | ✅ | ❌ | ❌ |

---

## 📊 分析模組說明

### Level 1：基礎圖表 (`/analytics/:id/basic`)
- 每日奶量趨勢（Bar Chart）
- 每日睡眠時數（Line Chart + 8小時基準線）
- 體溫波動（Line Chart + 37.5°C 警戒線）
- 近期平均彙整

### Level 2：關聯分析 (`/analytics/:id/correlation`)
- 副食品品項 × 排便異常相關性（出現率分析）
- 夜間奶量 × 睡眠時數雙軸折線圖

### Level 3：預警系統 (`/analytics/:id/alerts`)
| 預警類型 | 觸發條件 | 等級 |
|----------|----------|------|
| 🌡️ 持續發燒 | 連續 3 天體溫 ≥ 37.5°C | 🔴 紅色 |
| 🏥 腸胃健康 | 連續 3 天排便異常 | 🟡 黃色 |
| 😴 睡眠品質 | 連續 3 天睡眠不足/品質差 | 🟡 黃色 |
| 💛 情緒關注 | 連續 2 天哭鬧/生氣 | 🟡 黃色 |

---

## 🧪 執行測試

```bash
# Backend 整合測試（需要資料庫連線）
cd backend
DATABASE_URL="postgresql://childbook:childbook123@localhost:5432/childbook_test" \
  npm test

# 查看測試覆蓋率
npm run test:coverage

# Frontend 單元測試（不需要後端）
cd frontend
npm test

# Frontend 覆蓋率
npm run test:coverage
```

測試涵蓋：
- **Backend：** 30+ 整合測試（Auth × 8、Children × 5、Records × 10、Analytics × 5、Tasks × 4、Alerts × 1）
- **Frontend：** 25+ 單元測試（睡眠計算、預警邏輯、表單正規化、情緒對應、年齡計算、元件渲染）

---

## 🔧 環境變數說明

| 變數 | 必填 | 說明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 連線字串 |
| `REDIS_HOST` | ✅ | Redis 主機位址 |
| `REDIS_PORT` | ✅ | Redis 埠號（預設 6379） |
| `JWT_SECRET` | ✅ | JWT 簽名密鑰（生產環境請使用隨機長字串）|
| `OPENAI_API_KEY` | ✅ | OpenAI API Key（GPT-4o 影像辨識）|
| `PORT` | | 後端伺服器埠號（預設 3001）|
| `UPLOAD_DIR` | | 圖片儲存目錄（預設 `./uploads`）|
| `MAX_FILE_SIZE_MB` | | 上傳圖片大小限制（預設 10MB）|

---

## 🛠 技術堆疊

| 層次 | 技術 |
|------|------|
| **前端** | Vite + React 18, React Router v6, Zustand, TanStack Query v5 |
| **樣式** | Tailwind CSS v3, Noto Serif/Sans TC, 自訂 CSS 動畫 |
| **圖表** | Recharts (Line, Bar, Reference Lines) |
| **後端** | Node.js 20, Express.js, Prisma ORM |
| **資料庫** | PostgreSQL 16 |
| **佇列** | BullMQ + Redis 7（指數退避重試）|
| **AI** | OpenAI GPT-4o（多模態影像辨識）|
| **認證** | JWT + bcryptjs + RBAC |
| **測試** | Jest + Supertest（Backend）, Vitest + Testing Library（Frontend）|
| **部署** | Docker Compose + Nginx（SPA + API Proxy）|

---

## ⚠️ 注意事項

1. **OpenAI API Key**：AI 影像辨識功能需要有效的 OpenAI API Key（gpt-4o 模型）
2. **Redis**：BullMQ 需要 Redis，若 Redis 未啟動，AI 上傳功能將不可用（手動填寫仍正常）
3. **生產環境**：請務必修改 `JWT_SECRET`，建議使用 `openssl rand -hex 32` 生成
4. **檔案儲存**：目前為本地磁碟，生產環境建議改為 AWS S3 / GCS

---

## 📝 設計文件補充說明

依設計文件框架，本實作額外補足以下項目：

1. **`Child.birthDate`, `Child.gender`**：補充幼童基本資料欄位
2. **`@@unique([childId, recordDate])`**：防止同一幼童同一天重複建立紀錄
3. **교師近3日限制**：教師僅可填寫/修改近三日紀錄（家長無此限制）
4. **任務重試計數**：`UploadTask.retryCount` 追蹤重試次數
5. **Prisma Migration**：提供完整的 `schema.prisma` 可直接 `prisma migrate dev`
6. **Seed 資料**：7日完整測試資料含所有子表
7. **健康檢查端點** `GET /health`：供 Docker 容器健康監測
8. **Winston 結構化日誌**：統一記錄所有 API 請求與錯誤

---

*© 2026 寶寶日誌系統  |  依設計文件 SD v2.1 開發*
