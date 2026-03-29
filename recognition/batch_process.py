"""
批次處理多張表單圖片
用於一次處理資料夾內所有填寫完成的表單

使用方式：
    python batch_process.py --input-dir ./forms/ --output-dir ./results/
    python batch_process.py --input-dir ./forms/ --template blank_form.jpg
"""

import anthropic
import json
import argparse
import os
import sys
import time
from pathlib import Path
from extractor import extract_filled_form, extract_with_template, validate_and_fill

SUPPORTED_FORMATS = {".jpg", ".jpeg", ".png", ".webp"}


def process_directory(
    client: anthropic.Anthropic,
    input_dir: str,
    output_dir: str,
    template_path: str = None,
    delay_seconds: float = 1.0  # API rate limit 緩衝
):
    """批次處理一個資料夾內的所有表單圖片"""

    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    image_files = [
        f for f in input_path.iterdir()
        if f.suffix.lower() in SUPPORTED_FORMATS
    ]

    if not image_files:
        print(f"[警告] 在 {input_dir} 中找不到支援的圖片格式")
        return

    print(f"[批次處理] 找到 {len(image_files)} 張圖片")
    print(f"[批次處理] 輸出目錄：{output_dir}")
    print("-" * 50)

    success_count = 0
    error_count = 0
    errors = []

    for i, image_file in enumerate(sorted(image_files), 1):
        print(f"\n[{i}/{len(image_files)}] 處理：{image_file.name}")

        output_file = output_path / image_file.with_suffix(".json").name

        try:
            if template_path:
                extracted = extract_with_template(client, str(image_file), template_path)
            else:
                extracted = extract_filled_form(client, str(image_file))

            final_data = validate_and_fill(extracted)

            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(final_data, f, ensure_ascii=False, indent=2)

            print(f"  ✅ 已儲存 → {output_file.name}")
            success_count += 1

        except Exception as e:
            print(f"  ❌ 失敗：{e}")
            error_count += 1
            errors.append({"file": image_file.name, "error": str(e)})

        # 避免 API rate limit，每次請求間加入延遲
        if i < len(image_files):
            time.sleep(delay_seconds)

    # ── 輸出批次處理摘要 ──
    print("\n" + "=" * 50)
    print(f"[批次完成] 成功：{success_count} 筆 / 失敗：{error_count} 筆")

    if errors:
        error_log = output_path / "batch_errors.json"
        with open(error_log, "w", encoding="utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)
        print(f"[錯誤記錄] 已儲存至：{error_log}")

    # ── 合併所有結果為一個清單（可選）──
    all_results = []
    for json_file in sorted(output_path.glob("*.json")):
        if json_file.name == "batch_errors.json":
            continue
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            data["_source_file"] = json_file.stem
            all_results.append(data)

    if all_results:
        merged_output = output_path / "all_records.json"
        with open(merged_output, "w", encoding="utf-8") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)
        print(f"[合併輸出] 所有記錄已合併至：{merged_output}")


def main():
    parser = argparse.ArgumentParser(description="批次處理托育聯絡簿圖片")
    parser.add_argument("--input-dir", required=True, help="輸入圖片資料夾")
    parser.add_argument("--output-dir", default="./results", help="輸出 JSON 資料夾（預設：./results）")
    parser.add_argument("--template", default=None, help="（選填）空白模板圖片路徑")
    parser.add_argument("--delay", type=float, default=1.0, help="每次 API 請求間的延遲秒數（預設：1.0）")
    parser.add_argument("--api-key", default=None, help="Anthropic API Key")

    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[錯誤] 請提供 ANTHROPIC_API_KEY")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    process_directory(
        client=client,
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        template_path=args.template,
        delay_seconds=args.delay
    )


if __name__ == "__main__":
    main()
