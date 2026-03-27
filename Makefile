# 寶寶日誌 — 開發工具命令
.PHONY: help dev docker-up docker-down migrate seed test test-backend test-frontend \
        test-coverage clean logs ps

help: ## 顯示此說明
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-20s\033[0m %s\n",$$1,$$2}' $(MAKEFILE_LIST)

# ── 本機開發 ───────────────────────────────────────────────────────────────────
dev: ## 本機同時啟動 backend + frontend（需先建好 .env）
	@echo "🚀 啟動開發模式..."
	@(cd backend && npm run dev) & (cd frontend && npm run dev) & wait

dev-backend: ## 僅啟動後端 API server
	cd backend && npm run dev

dev-worker: ## 僅啟動 AI Worker
	cd backend && npm run worker

dev-frontend: ## 僅啟動前端
	cd frontend && npm run dev

# ── 安裝依賴 ──────────────────────────────────────────────────────────────────
install: ## 安裝前後端所有依賴
	@echo "📦 安裝後端依賴..."
	cd backend && npm install
	@echo "📦 安裝前端依賴..."
	cd frontend && npm install

# ── 資料庫 ────────────────────────────────────────────────────────────────────
migrate: ## 執行資料庫 Migration
	cd backend && npx prisma migrate dev

migrate-prod: ## 部署 Migration（生產環境）
	cd backend && npx prisma migrate deploy

generate: ## 重新產生 Prisma Client
	cd backend && npx prisma generate

seed: ## 寫入測試資料
	cd backend && node prisma/seed.js

studio: ## 開啟 Prisma Studio（視覺化 DB 管理）
	cd backend && npx prisma studio

reset-db: ## 重置資料庫（警告：刪除所有資料）
	cd backend && npx prisma migrate reset --force

# ── Docker ────────────────────────────────────────────────────────────────────
docker-up: ## 啟動所有 Docker 服務
	docker compose up -d
	@echo "✅ 服務已啟動"
	@echo "   Frontend: http://localhost:5173"
	@echo "   Backend:  http://localhost:3001"

docker-up-build: ## 重新建置並啟動 Docker
	docker compose up -d --build

docker-down: ## 停止所有 Docker 服務
	docker compose down

docker-clean: ## 停止並刪除資料卷（警告：刪除所有資料）
	docker compose down -v

logs: ## 查看所有服務 log
	docker compose logs -f

logs-backend: ## 查看後端 log
	docker compose logs -f backend worker

logs-db: ## 查看資料庫 log
	docker compose logs -f postgres

ps: ## 查看服務狀態
	docker compose ps

# ── 測試 ──────────────────────────────────────────────────────────────────────
test: test-backend test-frontend ## 執行所有測試

test-backend: ## 執行後端整合測試
	@echo "🧪 執行後端測試..."
	cd backend && npm test

test-frontend: ## 執行前端單元測試
	@echo "🧪 執行前端測試..."
	cd frontend && npm test

test-coverage: ## 測試覆蓋率報告
	@echo "📊 產生測試覆蓋率..."
	cd backend && npm run test:coverage
	cd frontend && npm run test:coverage

# ── 部署前檢查 ────────────────────────────────────────────────────────────────
pre-deploy: ## 部署前完整檢查
	@echo "🔍 Pre-deploy check..."
	@[ -f .env ] || (echo "❌ .env 不存在，請先 cp .env.example .env" && exit 1)
	@grep -q "OPENAI_API_KEY=sk-" .env || echo "⚠️  警告：OPENAI_API_KEY 未設定，AI 功能將不可用"
	@grep -q "change-this" .env && echo "⚠️  警告：JWT_SECRET 使用預設值，請更換" || true
	cd backend && npm run test:coverage
	@echo "✅ 檢查完成"

# ── 清理 ──────────────────────────────────────────────────────────────────────
clean: ## 清理暫存檔與 node_modules
	rm -rf backend/node_modules frontend/node_modules
	rm -rf backend/uploads/*
	rm -rf frontend/dist

setup: ## 全新環境初始化（安裝 → 設定 .env → migrate → seed）
	@cp -n .env.example .env || true
	@echo "📝 請編輯 .env 填入 OPENAI_API_KEY"
	$(MAKE) install
	$(MAKE) generate
	$(MAKE) migrate
	$(MAKE) seed
	@echo ""
	@echo "✅ 設定完成！執行 make dev 啟動開發伺服器"
