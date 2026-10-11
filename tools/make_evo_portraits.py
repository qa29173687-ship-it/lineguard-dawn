"""進化插畫（含完整背景，不去背）→ 英雄選擇卡用的進化頭像 assets/{id}_evo_portrait.jpg（480×488，與一般頭像同規格）
與技能／進化演出用的面板圖 assets/{id}_evo_panel.jpg（整張 16:9 場景，縮成 960×540）。
執行：/workspace/.artenv/bin/python tools/make_evo_portraits.py"""
import os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
CROP = {'erin': (723, 0), 'lena': (791, 20), 'vera': (679, 0)}   # 臉部中心 x、裁切上緣 y（原圖 1280×720）
for h, (cx, y0) in CROP.items():
    im = Image.open(os.path.join(ROOT, 'tools', f'src_{h}_evo_illust.jpg')).convert('RGB')   # 原始進化插畫（1280×720，含背景）
    w, hh = 460, 468
    x0 = max(0, min(im.width - w, cx - w // 2))
    im.crop((x0, y0, x0 + w, y0 + hh)).resize((480, 488), Image.LANCZOS).save(os.path.join(A, f'{h}_evo_portrait.jpg'), quality=88)
    im.resize((960, 540), Image.LANCZOS).save(os.path.join(A, f'{h}_evo_panel.jpg'), quality=86)
    print(h, x0)
