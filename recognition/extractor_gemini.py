"""
托育聯絡簿 OCR 擷取器 — Google Gemini 版
使用 Gemini Vision API 辨識手寫表單並輸出 JSON

安裝依賴：
    pip install google-genai pillow

取得免費 API Key：
    https://aistudio.google.com/apikey

使用方式：
    python extractor_gemini.py --image filled_form.jpg
    python extractor_gemini.py --image filled_form.jpg --template blank_form.jpg
    python extractor_gemini.py --image filled_form.jpg --output result.json
"""

import base64
import json
import argparse
import os
import sys
from pathlib import Path
from schema import get_extraction_prompt, get_empty_schema

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("[錯誤] 請先安裝 google-genai：")
    print("  pip install google-genai")
    sys.exit(1)


# ──────────────────────────────────────────────
# 工具函數
# ──────────────────────────────────────────────

def load_image_bytes(image_path: str) -> tuple[bytes, str]:
    """
    讀取圖片為 bytes，並偵測 MIME type
    Returns: (image_bytes, mime_type)
    """
    path = Path(image_path)
    mime_map = {
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
        ".webp": "image/webp",
        ".gif":  "image/gif",
    }
    mime_type = mime_map.get(path.suffix.lower(), "image/jpeg")
    with open(image_path, "rb") as f:
        return f.read(), mime_type


def parse_json_response(raw_text: str) -> dict:
    """安全解析 JSON，處理 markdown code block"""
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"[警告] JSON 解析失敗：{e}")
        return {"error": "JSON parse failed", "raw": raw_text}


# ──────────────────────────────────────────────
# 階段一：模板解析
# ──────────────────────────────────────────────

def analyze_template(client: genai.Client, template_path: str) -> dict:
    """分析空白表單模板結構"""
    print("[階段一] 分析空白模板結構...")

    image_bytes, mime_type = load_image_bytes(template_path)

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

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt
        ]
    )

    result = parse_json_response(response.text)
    print("[階段一] ✅ 模板分析完成")
    return result


# ──────────────────────────────────────────────
# 階段二：手寫 OCR + 資料填充
# ──────────────────────────────────────────────

def extract_filled_form(client: genai.Client, filled_image_path: str) -> dict:
    """對已填寫表單進行 OCR，對應到 JSON 結構"""
    print("[階段二] 辨識手寫內容...")

    image_bytes, mime_type = load_image_bytes(filled_image_path)
    prompt = get_extraction_prompt()

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt
        ],
        config=types.GenerateContentConfig(
            temperature=0.1,   # 低溫度，讓輸出更穩定、不亂發揮
            max_output_tokens=3000,
        )
    )

    result = parse_json_response(response.text)
    print("[階段二] ✅ 手寫辨識完成")
    return result


# ──────────────────────────────────────────────
# 階段二（進階）：雙圖對照模式
# ──────────────────────────────────────────────

def extract_with_template(
    client: genai.Client,
    filled_image_path: str,
    template_image_path: str
) -> dict:
    """同時傳入空白模板與填寫版，提高對應準確度"""
    print("[階段二-進階] 雙圖對照辨識...")

    filled_bytes, filled_mime = load_image_bytes(filled_image_path)
    template_bytes, template_mime = load_image_bytes(template_image_path)
    prompt = get_extraction_prompt()

    combined_prompt = f"""以下提供兩張圖片：
1. 第一張：空白表單模板（供你了解欄位位置與結構）
2. 第二張：實際填寫的表單（需要辨識的手寫內容）

請參考模板的欄位位置，對照辨識第二張圖片中的手寫內容。

{prompt}"""

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            "【圖片一：空白模板】",
            types.Part.from_bytes(data=template_bytes, mime_type=template_mime),
            "【圖片二：填寫完成的表單】",
            types.Part.from_bytes(data=filled_bytes, mime_type=filled_mime),
            combined_prompt
        ],
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=3000,
        )
    )

    result = parse_json_response(response.text)
    print("[階段二-進階] ✅ 雙圖對照辨識完成")
    return result


# ──────────────────────────────────────────────
# Schema 驗證與補全
# ──────────────────────────────────────────────

def validate_and_fill(extracted: dict) -> dict:
    """將 API 回傳結果與預設 schema 合併，確保所有欄位存在"""
    import copy

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
        description="托育聯絡簿手寫 OCR → JSON（Gemini 版）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用範例：
  # 基本模式
  python extractor_gemini.py --image filled_form.jpg

  # 雙圖對照模式（建議）
  python extractor_gemini.py --image filled_form.jpg --template blank_form.jpg

  # 指定輸出路徑
  python extractor_gemini.py --image filled_form.jpg --output 2025_07_20.json

  # 同時分析模板結構
  python extractor_gemini.py --image filled_form.jpg --template blank_form.jpg --analyze-template
        """
    )
    parser.add_argument("--image", required=True, help="已填寫的表單圖片路徑")
    parser.add_argument("--template", default=None, help="（選填）空白模板圖片路徑")
    parser.add_argument("--output", default=None, help="輸出 JSON 檔案路徑")
    parser.add_argument("--analyze-template", action="store_true", help="同時輸出模板結構分析")
    parser.add_argument("--api-key", default=None, help="Google AI API Key")

    args = parser.parse_args()

    # ── 確認輸入檔案 ──
    if not Path(args.image).exists():
        print(f"[錯誤] 找不到圖片：{args.image}")
        sys.exit(1)
    if args.template and not Path(args.template).exists():
        print(f"[錯誤] 找不到模板圖片：{args.template}")
        sys.exit(1)

    # ── 初始化 Gemini 客戶端 ──
    api_key = args.api_key or os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("[錯誤] 請提供 Google AI API Key：")
        print("  取得免費 Key：https://aistudio.google.com/apikey")
        print("  方法一：export GOOGLE_API_KEY='AIza...'")
        print("  方法二：python extractor_gemini.py --api-key AIza...")
        sys.exit(1)

    client = genai.Client(api_key=api_key)

    # ── 決定輸出路徑 ──
    output_path = args.output or str(Path(args.image).with_suffix(".json"))

    # ── 階段一：模板分析（選填）──
    if args.analyze_template and args.template:
        template_structure = analyze_template(client, args.template)
        template_output = str(Path(output_path).with_stem(Path(output_path).stem + "_template"))
        with open(template_output, "w", encoding="utf-8") as f:
            json.dump(template_structure, f, ensure_ascii=False, indent=2)
        print(f"[輸出] 模板結構分析 → {template_output}")

    # ── 階段二：OCR ──
    if args.template:
        extracted = extract_with_template(client, args.image, args.template)
    else:
        extracted = extract_filled_form(client, args.image)

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
