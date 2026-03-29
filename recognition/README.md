# 托育聯絡簿 OCR 系統

自動將手寫托育聯絡簿圖片轉換為結構化 JSON 資料。

## 檔案說明

| 檔案 | 說明 |
|------|------|
| `schema.py` | 表單欄位結構定義與提取提示詞（三個版本共用） |
| `extractor_gemini.py` | **Gemini 版**（免費額度最多，推薦） |
| `extractor_ollama.py` | **Ollama 本地端版**（完全免費，需要 GPU/RAM） |
| `extractor.py` | Anthropic Claude 版（需付費） |
| `batch_process.py` | 批次處理多張圖片 |
| `sample_output.json` | 範例輸出 JSON |

---

## 版本一：Google Gemini（推薦）

### 安裝
```bash
pip install google-genai pillow
```

### 取得免費 API Key
👉 https://aistudio.google.com/apikey

### 設置與使用
```bash
export GOOGLE_API_KEY="AIza..."

# 基本模式
python extractor_gemini.py --image filled_form.jpg

# 雙圖對照模式（推薦）
python extractor_gemini.py --image filled_form.jpg --template blank_form.jpg

# 指定輸出路徑
python extractor_gemini.py --image filled_form.jpg --output 2025_07_20.json
```

---

## 版本二：Ollama 本地端

### 安裝
👉 https://ollama.com/download
```bash
pip install ollama pillow
```

### 下載模型（擇一）

| 模型 | 需求 RAM | 繁中效果 | 速度 |
|------|---------|---------|------|
| `gemma3:12b` | ~16GB | ⭐⭐⭐⭐⭐ | 中 |
| `llava:13b` | ~16GB | ⭐⭐⭐⭐ | 中 |
| `llava` | ~8GB | ⭐⭐⭐ | 快 |
| `moondream` | ~4GB | ⭐⭐ | 最快 |

```bash
ollama pull gemma3:12b   # 推薦
ollama serve             # 啟動服務
```

### 使用
```bash
# 基本（預設 llava）
python extractor_ollama.py --image filled_form.jpg

# 指定模型
python extractor_ollama.py --image filled_form.jpg --model gemma3:12b

# 雙圖對照
python extractor_ollama.py --image filled_form.jpg --template blank_form.jpg --model gemma3:12b

# 列出已安裝模型
python extractor_ollama.py --list-models
```

---

## 版本比較

| 項目 | Gemini | Ollama | Claude |
|------|--------|--------|--------|
| 費用 | 免費（有額度）| 完全免費 | 付費 |
| 繁中手寫辨識 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐（依模型）| ⭐⭐⭐⭐⭐ |
| 網路需求 | 需要 | 不需要 | 需要 |
| 速度 | 快（~5秒）| 依硬體（10-60秒）| 快（~5秒）|
| 隱私保護 | 傳至 Google | 完全本地 | 傳至 Anthropic |

**建議：一般使用選 Gemini；資料需保密選 Ollama + gemma3:12b**
