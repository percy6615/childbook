"""
表單 JSON Schema 定義
根據托育聯絡簿空白模板（圖片二）所定義的欄位結構
"""

FORM_SCHEMA = {
    "date": {
        "year": "",           # 年
        "month": "",          # 月
        "day": "",            # 日
        "weekday": ""         # 星期
    },
    "transport": {
        "drop_off_time": "",  # 托送時間
        "pick_up_time": ""    # 接送時間
    },
    "home_situation": {
        "bowel_movement": {
            "has_movement": "",   # 有/無
            "frequency": "",      # 次數
            "consistency": ""     # 正常/偏硬/稀
        },
        "diet": {
            "time": "",
            "ate": "",            # 吃
            "drank": ""           # 喝
        }
    },
    "feeding": {
        "milk_sessions": [
            {"time": "", "amount_cc": ""},
            {"time": "", "amount_cc": ""},
            {"time": "", "amount_cc": ""},
            {"time": "", "amount_cc": ""}
        ],
        "snacks": [
            {"time": "", "items": ""},
            {"time": "", "items": ""},
            {"time": "", "items": ""}
        ],
        "food_types": []  # 地瓜/紅蘿蔔/蔬菜/豆/蛋/肉/魚/水果
    },
    "sleep": [
        {"start_time": "", "end_time": "", "quality": ""},   # 安穩/普通/不安穩
        {"start_time": "", "end_time": "", "quality": ""},
        {"start_time": "", "end_time": "", "quality": ""}
    ],
    "activities": [],  # 玩具/教具/圖卡/認字/體能/音樂/兒歌/生活常規/其他
    "bowel_movement_at_daycare": [
        {"has_movement": "", "time": "", "consistency": "", "other": ""},
        {"has_movement": "", "time": "", "consistency": "", "other": ""},
        {"has_movement": "", "time": "", "consistency": "", "other": ""}
    ],
    "mood": [],        # 愉悅/穩定/生氣/哭鬧/其他
    "symptoms": [],    # 打噴嚏/咳嗽/發燒/腹瀉/尿布疹/紅斑/嘔吐/流鼻涕/鼻塞
    "temperature": [
        {"time": "", "value_celsius": ""},
        {"time": "", "value_celsius": ""},
        {"time": "", "value_celsius": ""},
        {"time": "", "value_celsius": ""}
    ],
    "medication": [
        {"time": "", "oral_packets": "", "oral_cc": "", "external": "", "completed": "", "parent_signature": ""},
        {"time": "", "oral_packets": "", "oral_cc": "", "external": "", "completed": "", "parent_signature": ""},
        {"time": "", "oral_packets": "", "oral_cc": "", "external": "", "completed": "", "parent_signature": ""}
    ],
    "supplies": {
        "diapers": "",     # 尿片（包）
        "formula": "",     # 奶粉（罐）
        "wet_wipes": "",   # 濕紙巾（包）
        "other": ""
    },
    "teacher_note": "",        # 老師小語
    "parent_feedback": "",     # 家長回讀與分享
    "caregiver_signature": "", # 托育人員簽名
    "parent_signature": ""     # 家長簽名
}


def get_empty_schema():
    """返回一個空的表單 schema 副本"""
    import copy
    return copy.deepcopy(FORM_SCHEMA)


def get_extraction_prompt():
    """
    返回給 Claude Vision API 的提取提示詞
    """
    return """你是一個專業的表單資料擷取助理，負責辨識台灣托育聯絡簿的手寫內容。

請仔細分析這張填寫完成的托育聯絡簿圖片，並將所有手寫內容轉換為以下 JSON 格式。

規則：
1. 只填入實際辨識到的內容，空白欄位填入 null
2. 勾選的選項請填入該選項文字，未勾選的忽略
3. 時間格式統一為 "HH:MM"
4. 溫度數值只填數字（如 "36.9"）
5. 如果辨識不確定，在值後面加上 "?" 標記（如 "36.9?"）

請輸出以下完整 JSON 結構（不要輸出任何其他文字，只輸出 JSON）：

{
  "date": {
    "year": "年份數字",
    "month": "月份數字",
    "day": "日期數字",
    "weekday": "星期幾（一/二/三/四/五/六/日）"
  },
  "transport": {
    "drop_off_time": "托送時間 HH:MM",
    "pick_up_time": "接送時間 HH:MM"
  },
  "home_situation": {
    "bowel_movement": {
      "has_movement": "有 或 無",
      "frequency": "次數數字",
      "consistency": "正常 或 偏硬 或 稀"
    },
    "diet": {
      "time": "時間",
      "ate": "吃的內容",
      "drank": "喝的內容"
    }
  },
  "feeding": {
    "milk_sessions": [
      {"time": "時間", "amount_cc": "CC數"},
      {"time": "時間", "amount_cc": "CC數"},
      {"time": "時間", "amount_cc": "CC數"},
      {"time": "時間", "amount_cc": "CC數"}
    ],
    "snacks": [
      {"time": "副食品時間", "items": "品項內容"},
      {"time": "副食品時間", "items": "品項內容"},
      {"time": "副食品時間", "items": "品項內容"}
    ],
    "food_types": ["勾選的食物類型清單，如：地瓜、紅蘿蔔等"]
  },
  "sleep": [
    {"start_time": "開始時間", "end_time": "結束時間", "quality": "安穩 或 普通 或 不安穩"},
    {"start_time": null, "end_time": null, "quality": null},
    {"start_time": null, "end_time": null, "quality": null}
  ],
  "activities": ["勾選的活動清單，如：玩具/教具、體能等"],
  "bowel_movement_at_daycare": [
    {"has_movement": "有 或 無", "time": "時間", "consistency": "正常 或 偏硬 或 稀", "other": "其他說明"},
    {"has_movement": null, "time": null, "consistency": null, "other": null},
    {"has_movement": null, "time": null, "consistency": null, "other": null}
  ],
  "mood": ["勾選的情緒清單，如：愉悅、穩定等"],
  "symptoms": ["勾選的症狀清單，無症狀則為空陣列[]"],
  "temperature": [
    {"time": "量測時間", "value_celsius": "溫度數值"},
    {"time": "量測時間", "value_celsius": "溫度數值"},
    {"time": null, "value_celsius": null},
    {"time": null, "value_celsius": null}
  ],
  "medication": [
    {"time": null, "oral_packets": null, "oral_cc": null, "external": null, "completed": null},
    {"time": null, "oral_packets": null, "oral_cc": null, "external": null, "completed": null},
    {"time": null, "oral_packets": null, "oral_cc": null, "external": null, "completed": null}
  ],
  "supplies": {
    "diapers": "包數",
    "formula": "罐數",
    "wet_wipes": "包數",
    "other": "其他備品"
  },
  "teacher_note": "老師小語內容",
  "parent_feedback": "家長回讀與分享內容",
  "caregiver_signature": "托育人員簽名",
  "parent_signature": "家長簽名"
}"""
