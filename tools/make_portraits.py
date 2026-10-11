"""英雄選擇卡頭像：從使用者插畫（assets/{id}_illust.jpg，原尺寸保留）裁切上半身 → assets/{id}_portrait.jpg（480×488）並更新 js/art_manifest.js。
在 tools/extract_art.py 之後執行（extract_art.py 會寫回舊的頭像）。執行：/workspace/.artenv/bin/python tools/make_portraits.py"""
import json, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CROPS = {'erin': (150, 10, 650, 518), 'lena': (166, 0, 666, 508), 'vera': (96, 40, 596, 548)}   # 原圖 784×1168 座標
mp = os.path.join(ROOT, 'js', 'art_manifest.js'); t = open(mp, encoding='utf-8').read()
man = json.loads(t[t.index('{'):t.rindex('}') + 1])
for hid, box in CROPS.items():
    im = Image.open(os.path.join(ROOT, 'assets', f'{hid}_illust.jpg')).convert('RGB').crop(box).resize((480, 488), Image.LANCZOS)
    im.save(os.path.join(ROOT, 'assets', f'{hid}_portrait.jpg'), quality=88, optimize=True)
    old = os.path.join(ROOT, 'assets', f'{hid}_portrait.png')
    if os.path.exists(old): os.remove(old)
    man[f'{hid}_portrait'] = {'src': f'assets/{hid}_portrait.jpg', 'w': 480, 'h': 488, 'ax': 240.0, 'ay': 488}
open(mp, 'w', encoding='utf-8').write(t[:t.index('{')] + json.dumps(man, ensure_ascii=False, indent=1) + ';\n')
print('ok')
