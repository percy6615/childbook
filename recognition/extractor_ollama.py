"""
托育聯絡簿 OCR 擷取器 — Ollama 本地端版
使用本地 Ollama 模型辨識手寫表單，完全免費、不需要網路

安裝依賴：
    pip install ollama pillow

安裝 Ollama：
    https://ollama.com/download
    
下載支援 Vision 的模型（擇一）：
    ollama pull llava          # 7B，較快，基本可用
    ollama pull llava:13b      # 13B，更準確（需要 ~16GB RAM）
    ollama pull mistrallite    # 支援多語言，繁中效果稍好
    ollama pull gemma3:12b     # Google Gemma3，繁中效果最佳（需要 ~16GB RAM）

使用方式：
    # 啟動 Ollama（如果還沒啟動）
    ollama serve

    # 執行辨識
    python extractor_ollama.py --image filled_form.jpg
    python extractor_ollama.py --image filled_form.jpg --model gemma3:12b
    python extractor_ollama.py --image filled_form.jpg --template blank_form.jpg
"""

import base64
import json
import argparse
import sys
from pathlib import Path
from schema import get_extraction_prompt, get_empty_schema

try:
    import ollama
except ImportError:
    print("[錯誤] 請先安裝 ollama：")
    print("  pip install ollama")
    sys.exit(1)


# ──────────────────────────────────────────────
# 推薦模型（依繁中手寫辨識能力排序）
# ──────────────────────────────────────────────
RECOMMENDED_MODELS = {
    "gemma3:12b":   "繁中最佳，需 ~16GB RAM",
    "llava:13b":    "均衡，需 ~16GB RAM",
    "llava":        "輕量，需 ~8GB RAM，速度快",
    "llava:7b":     "同上（llava 別名）",
    "moondream":    "超輕量，僅 ~4GB RAM，準確度較低",
}

DEFAULT_MODEL = "llava"


# ──────────────────────────────────────────────
# 工具函數
# ──────────────────────────────────────────────

def encode_image_base64(image_path: str) -> str:
    """將圖片轉為 base64 字串（Ollama 所需格式）"""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def parse_json_response(raw_text: str) -> dict:
    """安全解析 JSON，處理 markdown code block"""
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 嘗試找到 JSON 區塊
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        print(f"[警告] JSON 解析失敗，儲存原始回應")
        return {"error": "JSON parse failed", "raw": raw_text}


def check_ollama_and_model(model: str) -> bool:
    """確認 Ollama 服務運行中且指定模型已下載"""
    try:
        models = ollama.list()
        available = [m.model for m in models.models]
        # 支援部分比對（如 "llava" 匹配 "llava:latest"）
        model_base = model.split(":")[0]
        found = any(model_base in m for m in available)
        if not found:
            print(f"[錯誤] 找不到模型 '{model}'")
            print(f"[提示] 請先下載模型：ollama pull {model}")
            print(f"\n已安裝的模型：")
            for m in available:
                print(f"  - {m}")
            print(f"\n推薦模型（依繁中辨識能力）：")
            for m, desc in RECOMMENDED_MODELS.items():
                print(f"  ollama pull {m:<15} # {desc}")
            return False
        return True
    except Exception as e:
        print(f"[錯誤] 無法連接到 Ollama 服務：{e}")
        print("[提示] 請先啟動 Ollama：ollama serve")
        return False


# ──────────────────────────────────────────────
# 階段一：模板解析
# ──────────────────────────────────────────────

def analyze_template(model: str, template_path: str) -> dict:
    """分析空白表單模板結構"""
    print("[階段一] 分析空白模板結構...")

    image_b64 = encode_image_base64(template_path)

    prompt = """這是一份台灣托育中心的空白聯絡簿表單。

請分析此表單的結構，列出所有欄位名稱（中文），以及每個欄位的類型：
- text: 純文字輸入
- time: 時間格式
- checkbox: 勾選選項
- number: 數值
- signature: 簽名欄

請以 JSON 格式回應，格式如下：
{
  "form_title": "表單名稱",
  "sections": [
    {
      "section_name": "區塊名稱",
      "fields": [
        {"field_name": "欄位名稱", "field_type": "類型", "options": ["選項1", "選項2"]}
      ]
    }
  ]
}

只輸出 JSON，不要其他說明文字。"""

    response = ollama.chat(
        model=model,
        messages=[
            {
                "role": "user",
                "content": prompt,
                "images": [image_b64]
            }
        ]
    )

    raw = response["message"]["content"]
    result = parse_json_response(raw)
    print("[階段一] ✅ 模板分析完成")
    return result


# ──────────────────────────────────────────────
# 階段二：手寫 OCR + 資料填充
# ──────────────────────────────────────────────

def extract_filled_form(model: str, filled_image_path: str) -> dict:
    """對已填寫表單進行 OCR，對應到 JSON 結構"""
    print(f"[階段二] 辨識手寫內容（模型：{model}）...")

    image_b64 = encode_image_base64(filled_image_path)
    prompt = get_extraction_prompt()

    # 本地模型對 system prompt 支援度不一，改用 user 角色
    full_prompt = f"""你是一個專業的表單資料擷取助理，請仔細分析這張托育聯絡簿圖片。

{prompt}"""

    response = ollama.chat(
        model=model,
        messages=[
            {
                "role": "user",
                "content": full_prompt,
                "images": [image_b64]
            }
        ],
        options={
            "temperature": 0.1,     # 低溫度，輸出更穩定
            "num_predict": 3000,    # 最大輸出 token 數
        }
    )

    raw = response["message"]["content"]
    result = parse_json_response(raw)
    print("[階段二] ✅ 手寫辨識完成")
    return result


# ──────────────────────────────────────────────
# 階段二（進階）：雙圖對照模式
# 注意：部分 Ollama 模型一次只能處理一張圖片
# 此模式改為兩階段呼叫
# ──────────────────────────────────────────────

def extract_with_template(model: str, filled_image_path: str, template_image_path: str) -> dict:
    """
    雙圖對照版本（Ollama 適配）
    由於部分本地模型不支援多圖，改為：
    1. 先從模板提取欄位說明
    2. 再對填寫版進行辨識，附上欄位說明作為提示
    """
    print("[階段二-進階] 兩步驟對照辨識...")

    # Step 1：先理解模板欄位位置
    print("  → 步驟 1/2：解析模板欄位...")
    template_b64 = encode_image_base64(template_image_path)

    template_response = ollama.chat(
        model=model,
        messages=[
            {
                "role": "user",
                "content": "這是一份空白的台灣托育聯絡簿。請用中文簡短描述每個區塊的名稱與位置，以及每個欄位的填寫格式（時間/文字/勾選），20行以內即可。",
                "images": [template_b64]
            }
        ],
        options={"temperature": 0.1, "num_predict": 1000}
    )
    template_description = template_response["message"]["content"]

    # Step 2：對填寫版進行辨識
    print("  → 步驟 2/2：辨識手寫內容...")
    filled_b64 = encode_image_base64(filled_image_path)
    base_prompt = get_extraction_prompt()

    prompt = f"""以下是空白表單的欄位說明（供參考）：
---
{template_description}
---

根據上述欄位說明，請辨識這張填寫完成的托育聯絡簿中的手寫內容。

{base_prompt}"""

    response = ollama.chat(
        model=model,
        messages=[
            {
                "role": "user",
                "content": prompt,
                "images": [filled_b64]
            }
        ],
        options={"temperature": 0.1, "num_predict": 3000}
    )

    raw = response["message"]["content"]
    result = parse_json_response(raw)
    print("[階段二-進階] ✅ 雙步驟辨識完成")
    return result


# ──────────────────────────────────────────────
# Schema 驗證與補全
# ──────────────────────────────────────────────

def validate_and_fill(extracted: dict) -> dict:
    """將 API 回傳結果與預設 schema 合併"""
    def deep_merge(base, override):
        if isinstance(base, dict) and isinstance(override, dict):
            result = base.copy()
            for k, v in override.items():
                if k in result:
                    result[k] = deep_merge(result[k], v)
                else:
                    result[k] = v
            return result
        return override if override is not None else base

    return deep_merge(get_empty_schema(), extracted)


# ──────────────────────────────────────────────
# 主程式
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="托育聯絡簿手寫 OCR → JSON（Ollama 本地端版）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
推薦模型（依繁中辨識能力排序）：
{''.join(f'  ollama pull {m:<15} # {d}{chr(10)}' for m, d in RECOMMENDED_MODELS.items())}
使用範例：
  python extractor_ollama.py --image filled_form.jpg
  python extractor_ollama.py --image filled_form.jpg --model gemma3:12b
  python extractor_ollama.py --image filled_form.jpg --template blank_form.jpg
        """
    )
    parser.add_argument("--image", required=True, help="已填寫的表單圖片路徑")
    parser.add_argument("--template", default=None, help="（選填）空白模板圖片路徑")
    parser.add_argument("--output", default=None, help="輸出 JSON 檔案路徑")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help=f"Ollama 模型名稱（預設：{DEFAULT_MODEL}）")
    parser.add_argument("--analyze-template", action="store_true", help="同時輸出模板結構分析")
    parser.add_argument("--list-models", action="store_true", help="列出已安裝的 Ollama 模型")

    args = parser.parse_args()

    # ── 列出模型 ──
    if args.list_models:
        try:
            models = ollama.list()
            print("已安裝的 Ollama 模型：")
            for m in models.models:
                print(f"  - {m.model}")
        except Exception as e:
            print(f"[錯誤] 無法連接 Ollama：{e}")
        return

    # ── 確認輸入檔案 ──
    if not Path(args.image).exists():
        print(f"[錯誤] 找不到圖片：{args.image}")
        sys.exit(1)
    if args.template and not Path(args.template).exists():
        print(f"[錯誤] 找不到模板圖片：{args.template}")
        sys.exit(1)

    # ── 確認 Ollama 與模型 ──
    if not check_ollama_and_model(args.model):
        sys.exit(1)

    print(f"[設定] 使用模型：{args.model}")

    # ── 決定輸出路徑 ──
    output_path = args.output or str(Path(args.image).with_suffix(".json"))

    # ── 階段一（選填）──
    if args.analyze_template and args.template:
        template_structure = analyze_template(args.model, args.template)
        template_output = str(Path(output_path).with_stem(Path(output_path).stem + "_template"))
        with open(template_output, "w", encoding="utf-8") as f:
            json.dump(template_structure, f, ensure_ascii=False, indent=2)
        print(f"[輸出] 模板結構分析 → {template_output}")

    # ── 階段二：OCR ──
    if args.template:
        extracted = extract_with_template(args.model, args.image, args.template)
    else:
        extracted = extract_filled_form(args.model, args.image)

    # ── 驗證與補全 ──
    final_data = validate_and_fill(extracted)

    # ── 輸出 JSON ──
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    print(f"\n[完成] 結果已儲存至：{output_path}")
    print("\n[預覽] 部分擷取結果：")
    for key in ["date", "transport", "mood", "symptoms", "temperature"]:
        if key in final_data:
            print(f"  {key}: {json.dumps(final_data[key], ensure_ascii=False)}")


if __name__ == "__main__":
    main()
