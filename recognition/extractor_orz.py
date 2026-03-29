import os
os.environ['FLAGS_use_mkldnn'] = '0'
os.environ['PADDLE_USE_MKLDNN'] = '0'
from paddleocr import PaddleOCR

ocr = PaddleOCR(lang='chinese_cht')
result = ocr.predict('S__54943803.jpg')

for item in result:
    boxes = item['rec_boxes']       # 文字框座標
    texts = item['rec_texts']       # 辨識文字
    scores = item['rec_scores']     # 信心分數

    for box, text, score in zip(boxes, texts, scores):
        print(f"文字: {text}  信心: {score:.2f}")