"""
托育聯絡簿 OCR 擷取器
使用 Claude Vision API 辨識手寫表單並輸出 JSON

安裝依賴：
    pip install anthropic pillow

使用方式：
    python extractor.py --image path/to/filled_form.jpg
    python extractor.py --image path/to/filled_form.jpg --output result.json
    python extractor.py --image path/to/filled_form.jpg --template path/to/blank_form.jpg
"""

import anthropic
import base64
import json
import argparse
import sys
from pathlib import Path
from schema import get_extraction_prompt, get_empty_schema


# ──────────────────────────────────────────────
# 工具函數
# ──────────────────────────────────────────────

def encode_image(image_path: str) -> tuple[str, str]:
    """
    將圖片編碼為 base64 字串，並自動偵測 media_type
    
    Returns:
        (base64_data, media_type)
    """
    path = Path(image_path)
    suffix = path.suffix.lower()

    media_type_map = {
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
        ".gif":  "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_type_map.get(suffix, "image/jpeg")

    with open(image_path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")

    return data, media_type


def parse_json_response(raw_text: str) -> dict:
    """
    從 Claude 回應中安全地解析 JSON
    處理可能含有 markdown code block 的情況
    """
    text = raw_text.strip()

    # 移除 markdown code block（```json ... ``` 或 ``` ... ```）
    if text.startswith("```"):
        lines = text.split("\n")
        # 去掉第一行（```json 或 ```）和最後一行（```）
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"[警告] JSON 解析失敗：{e}")
        print(f"[原始回應]\n{raw_text[:500]}...")
        return {"error": "JSON parse failed", "raw": raw_text}


# ──────────────────────────────────────────────
# 階段一：模板解析（Template Analysis）
# ──────────────────────────────────────────────

def analyze_template(client: anthropic.Anthropic, template_path: str) -> dict:
    """
    階段一：分析空白表單模板，輸出欄位結構描述
    （此步驟為輔助理解，主要結構已內建於 schema.py）
    """
    print("[階段一] 分析空白模板結構...")

    image_data, media_type = encode_image(template_path)

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

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {"type": "text", "text": prompt}
                ],
            }
        ],
    )

    raw = response.content[0].text
    result = parse_json_response(raw)
    print("[階段一] ✅ 模板分析完成")
    return result


# ──────────────────────────────────────────────
# 階段二：手寫 OCR + 資料填充（OCR + Mapping）
# ──────────────────────────────────────────────

def extract_filled_form(client: anthropic.Anthropic, filled_image_path: str) -> dict:
    """
    階段二：對已填寫表單進行 OCR，並對應到 JSON 結構
    """
    print("[階段二] 辨識手寫內容...")

    image_data, media_type = encode_image(filled_image_path)
    prompt = get_extraction_prompt()

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {"type": "text", "text": prompt}
                ],
            }
        ],
    )

    raw = response.content[0].text
    result = parse_json_response(raw)
    print("[階段二] ✅ 手寫辨識完成")
    return result


# ──────────────────────────────────────────────
# 階段二（進階）：雙圖對照模式
# 同時提供空白模板 + 填寫版，提高對應準確度
# ──────────────────────────────────────────────

def extract_with_template(
    client: anthropic.Anthropic,
    filled_image_path: str,
    template_image_path: str
) -> dict:
    """
    進階版：同時傳入空白模板與填寫版圖片，讓模型對照比較
    可提高欄位對應的準確度
    """
    print("[階段二-進階] 雙圖對照辨識...")

    filled_data, filled_type = encode_image(filled_image_path)
    template_data, template_type = encode_image(template_image_path)
    prompt = get_extraction_prompt()

    combined_prompt = f"""以下提供兩張圖片：
1. 第一張：空白表單模板（供你了解欄位位置與結構）
2. 第二張：實際填寫的表單（需要辨識的手寫內容）

請參考模板的欄位位置，對照辨識第二張圖片中的手寫內容。

{prompt}"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "【圖片一：空白模板】"
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": template_type,
                            "data": template_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": "【圖片二：填寫完成的表單】"
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": filled_type,
                            "data": filled_data,
                        },
                    },
                    {"type": "text", "text": combined_prompt}
                ],
            }
        ],
    )

    raw = response.content[0].text
    result = parse_json_response(raw)
    print("[階段二-進階] ✅ 雙圖對照辨識完成")
    return result


# ──────────────────────────────────────────────
# 驗證輸出
# ──────────────────────────────────────────────

def validate_and_fill(extracted: dict) -> dict:
    """
    將 API 回傳的結果與預設 schema 合併，
    確保所有欄位都存在（避免缺 key 問題）
    """
    schema = get_empty_schema()

    def deep_merge(base, override):
        """遞迴合併，以 override 的值為主"""
        if isinstance(base, dict) and isinstance(override, dict):
            result = base.copy()
            for k, v in override.items():
                if k in result:
                    result[k] = deep_merge(result[k], v)
                else:
                    result[k] = v
            return result
        return override if override is not None else base

    return deep_merge(schema, extracted)


# ──────────────────────────────────────────────
# 主程式
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="托育聯絡簿手寫 OCR → JSON 擷取器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用範例：
  # 只用填寫圖（基本模式）
  python extractor.py --image filled_form.jpg

  # 雙圖對照模式（建議，準確度更高）
  python extractor.py --image filled_form.jpg --template blank_form.jpg

  # 指定輸出路徑
  python extractor.py --image filled_form.jpg --output 2025_07_20.json

  # 同時分析模板結構
  python extractor.py --image filled_form.jpg --template blank_form.jpg --analyze-template
        """
    )
    parser.add_argument("--image", required=True, help="已填寫的表單圖片路徑")
    parser.add_argument("--template", default=None, help="（選填）空白模板圖片路徑，啟用雙圖對照模式")
    parser.add_argument("--output", default=None, help="輸出 JSON 檔案路徑（預設：輸入圖片同名.json）")
    parser.add_argument("--analyze-template", action="store_true", help="同時輸出模板結構分析")
    parser.add_argument("--api-key", default=None, help="Anthropic API Key（也可設置環境變數 ANTHROPIC_API_KEY）")

    args = parser.parse_args()

    # ── 確認輸入檔案存在 ──
    if not Path(args.image).exists():
        print(f"[錯誤] 找不到圖片：{args.image}")
        sys.exit(1)
    if args.template and not Path(args.template).exists():
        print(f"[錯誤] 找不到模板圖片：{args.template}")
        sys.exit(1)

    # ── 初始化 Anthropic 客戶端 ──
    import os
    api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[錯誤] 請提供 Anthropic API Key：")
        print("  方法一：設置環境變數  export ANTHROPIC_API_KEY='sk-ant-...'")
        print("  方法二：使用參數      python extractor.py --api-key sk-ant-...")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # ── 決定輸出路徑 ──
    if args.output:
        output_path = args.output
    else:
        output_path = str(Path(args.image).with_suffix(".json"))

    results = {}

    # ── 階段一：模板分析（選填）──
    if args.analyze_template and args.template:
        template_structure = analyze_template(client, args.template)
        template_output = str(Path(output_path).with_stem(Path(output_path).stem + "_template"))
        with open(template_output, "w", encoding="utf-8") as f:
            json.dump(template_structure, f, ensure_ascii=False, indent=2)
        print(f"[輸出] 模板結構分析 → {template_output}")
        results["template_structure"] = template_structure

    # ── 階段二：OCR 擷取 ──
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
    preview_keys = ["date", "transport", "mood", "symptoms", "temperature"]
    for key in preview_keys:
        if key in final_data:
            print(f"  {key}: {json.dumps(final_data[key], ensure_ascii=False)}")

    return final_data


if __name__ == "__main__":
    main()
