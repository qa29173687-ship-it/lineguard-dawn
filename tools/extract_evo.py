"""進化 Q 版英雄三向站姿：tools/src_{id}_evo_sheet.jpg（正面／側面朝右／背面）→ assets/{id}_evo_{front,side,back}.png
去背：rembg isnet-general-use 與「每列背景色距離」色鍵取聯集（薇拉深色長袍與法杖兩者互補），只留大區塊。
同一英雄三格同一比例；正面高度 = TARGET_H；腳底中心 = 錨點。縮小：RGB 最近鄰、alpha BOX 後二值化（與原英雄圖一致）。
執行：/workspace/.artenv/bin/python tools/extract_evo.py"""
import json, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
from rembg import remove, new_session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets') + '/'
REV = '/workspace/art-review/evo/'
TARGET_H = {'erin': 80, 'lena': 80, 'vera': 84}   # 存檔像素（原英雄站姿 76）；薇拉含法杖
sess = new_session('isnet-general-use')
man_path = os.path.join(ROOT, 'js', 'art_manifest.js')
txt = open(man_path, encoding='utf-8').read()
man = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
os.makedirs(REV, exist_ok=True)
sheet = []
for h in ['erin', 'lena', 'vera']:
    im = Image.open(os.path.join(ROOT, f'tools/src_{h}_evo_sheet.jpg')).convert('RGB')
    a = np.asarray(im.filter(ImageFilter.MedianFilter(3))).astype(np.int32)
    bgrow = np.median(np.concatenate([a[:, :30], a[:, -30:]], 1), axis=1)
    d = np.sqrt(((a - bgrow[:, None, :]) ** 2).sum(-1))
    key = ndi.binary_opening(d > 28, iterations=1)
    rb = np.asarray(remove(im, session=sess))[..., 3] > 128
    fg = key | rb
    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=1))
    s = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    fg = np.isin(lab, [i + 1 for i, v in enumerate(s) if v > 2500]) & fg
    fg = ndi.binary_fill_holes(fg) & (rb | (d > 28))          # 弓弦內、劍光間的背景灰不要補
    L = a.mean(-1); sat = a.max(-1) - a.min(-1)
    shadow = (L < bgrow.mean(-1)[:, None] - 8) & (sat < 22) & ~rb  # 腳下陰影（比背景暗、無彩度、rembg 不認為是角色）
    fg &= ~shadow
    fg = ndi.binary_opening(fg, iterations=1)
    H, W = fg.shape
    cells = {}
    for ci, fr in enumerate(['front', 'side', 'back']):
        m = np.zeros_like(fg); x0, x1 = W * ci // 3, W * (ci + 1) // 3; m[:, x0:x1] = fg[:, x0:x1]
        lab, n = ndi.label(m); s = ndi.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, v in enumerate(s) if v > s.max() * 0.05])
        cells[fr] = m
    ys, xs = np.nonzero(cells['front']); sc = TARGET_H[h] / (ys.max() - ys.min() + 1)
    for fr, m in cells.items():
        ys, xs = np.nonzero(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        band = ys > y1 - (y1 - y0) * 0.1; fx = xs[band].mean()
        w, hh = max(1, round((x1 - x0) * sc)), max(1, round((y1 - y0) * sc))
        rgb = im.crop((x0, y0, x1, y1)).resize((w, hh), Image.BOX)
        al = np.asarray(Image.fromarray(m[y0:y1, x0:x1].astype(np.uint8) * 255).resize((w, hh), Image.BOX))
        al = np.where(al > 110, 255, 0).astype(np.uint8)
        out = Image.fromarray(np.dstack([np.asarray(rgb), al]), 'RGBA')
        k = f'{h}_evo_{fr}'; out.save(OUT + k + '.png', optimize=True)
        man[k] = {'src': f'assets/{k}.png', 'w': w, 'h': hh, 'ax': round((fx - x0) * sc, 1), 'ay': round((y1 - y0) * sc, 1)}
        print(k, w, hh, man[k]['ax'])
open(man_path, 'w', encoding='utf-8').write('// 自動產生（tools/extract_art.py、tools/extract_heroes_oct.py、tools/extract_evo.py）\nconst ART_MANIFEST = ' + json.dumps(man, ensure_ascii=False, indent=1) + ';\n')
# 檢查圖：原英雄 vs 進化（3 倍，綠底，腳底對齊）
c = Image.new('RGBA', (6 * 160, 3 * 300), (90, 120, 70, 255))
for r, h in enumerate(['erin', 'lena', 'vera']):
    for j, k in enumerate([f'{h}_front', f'{h}_side', f'{h}_back', f'{h}_evo_front', f'{h}_evo_side', f'{h}_evo_back']):
        mm = man[k]; im = Image.open(OUT + k + '.png').convert('RGBA').resize((mm['w'] * 3, mm['h'] * 3), Image.NEAREST)
        c.alpha_composite(im, (int(80 + j * 160 - mm['ax'] * 3), int(r * 300 + 280 - mm['ay'] * 3)))
c.convert('RGB').save(REV + 'evo_review.png')
