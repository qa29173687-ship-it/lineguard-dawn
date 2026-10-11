import numpy as np, json, os
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

SRC = '/home/box/agent-data/agents/931bcd32-9e9a-4a7c-9dda-9f6c2ec3598d/assets/'
HEROES_OLD = SRC + '911a50dc11022c562904dd3fdb73dc70d1c8d2881dd5bfcd8770498e2f26f985.jpg'  # 第一版（寫實比例），已不使用
HEROES = SRC + '02965a95d69d6f1ce2879e28235e4272c60b6656f1d8f517bf3af281a01f20a8.jpg'  # 八方旅人風大頭比例
ENEMIES = SRC + '55837ef333ff448a7d49f6556ece080e4801e32134c32ab5109eec360701b18b.jpg'
TOWERS = SRC + 'e0174ce8c77573634b106b615a5268e545ce49d4534154bf7b88f33b4618429f.jpg'
PORTRAITS = {'erin': SRC + '4b4140884106012c14b5e6ed82643628473c6b6d19e0a88ec7584974ae267324.jpg',
             'lena': SRC + '195b857101bf13b91f8749f4797c37904c89761ead301f5948787de2240b0bd3.jpg',
             'vera': SRC + 'fd726c6cb6cf5bc06cd6760b4e4682126c7e71af7135a8f8dd3736e16b432b7f.jpg'}
OUT = '/workspace/game-proto/assets/'
REV = '/workspace/art-review/'
D = 1.25  # 預覽座標(1024寬) → 原圖(1280寬)

def analyze(path, T=20, dil=3, shadowT=46, enclosed=1500):
    im = Image.open(path).convert('RGB').filter(ImageFilter.MedianFilter(3))
    a = np.asarray(im).astype(np.int32)
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    # 局部背景（處理輕微漸層）：對背景候選像素做大範圍平均
    d0 = np.sqrt(((a - bg) ** 2).sum(-1))
    cand = d0 < T
    # 從邊緣向內洪水填充：只有與外圍相連的近背景色才算背景；角色內部的暗色不會被挖掉
    lab, n = ndi.label(cand)
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgids = [i for i in edge] + [i + 1 for i, sz in enumerate(sizes) if sz > enclosed]
    bgm = np.isin(lab, bgids)
    # 影子：比背景暗、低彩度、與背景相連的區域也視為背景
    lum = a.mean(-1); chroma = a.max(-1) - a.min(-1)
    shadow = (d0 < shadowT) if shadowT else np.zeros_like(cand)
    shadow = shadow & (lum < bg.mean()) & (chroma < 16)
    grow = bgm | shadow
    lab2, n2 = ndi.label(grow)
    keep = set(np.unique(lab2[bgm])) - {0}
    bgm = np.isin(lab2, list(keep)) & (bgm | shadow)
    fg = ~bgm
    fg = ndi.binary_opening(fg, iterations=1)
    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=dil))
    return im, a, fg, lab, bg

def pick(lab, fg, pt, extra_pts=()):
    x, y = int(pt[0] * D), int(pt[1] * D)
    ids = set()
    for (px, py) in [(x, y)] + [(int(p[0] * D), int(p[1] * D)) for p in extra_pts]:
        i = lab[py, px]
        if i == 0:  # 找最近的前景
            ys, xs = np.nonzero(lab[max(0, py - 40):py + 40, max(0, px - 40):px + 40])
            j = np.argmin((ys - 40) ** 2 + (xs - 40) ** 2); i = lab[max(0, py - 40) + ys[j], max(0, px - 40) + xs[j]]
        ids.add(i)
    m = fg & np.isin(lab, list(ids))
    ys, xs = np.nonzero(m)
    return m, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)

def cut(im, m, box, scale, name, foot=True):
    x0, y0, x1, y1 = box
    rgb = np.asarray(im)[y0:y1, x0:x1]
    alpha = (m[y0:y1, x0:x1] * 255).astype(np.uint8)
    # 去除邊緣灰色暈：前景邊界 1px 且接近背景色者剔除
    rgba = np.dstack([rgb, alpha])
    img = Image.fromarray(rgba, 'RGBA')
    w, h = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    small = img.resize((w, h), Image.NEAREST)
    sa = np.asarray(small).copy(); sa[..., 3] = np.where(sa[..., 3] > 127, 255, 0)
    small = Image.fromarray(sa, 'RGBA')
    small.save(OUT + name + '.png')
    # 錨點：腳底（最下面 12% 列的前景平均 x），y = 最下緣
    ma = sa[..., 3] > 0
    rows = np.nonzero(ma.any(1))[0]; bot = rows.max()
    band = ma[max(0, bot - max(2, int(h * 0.12))):bot + 1]
    ax = float(np.nonzero(band)[1].mean()) if foot else w / 2
    return {'src': 'assets/' + name + '.png', 'w': w, 'h': h, 'ax': round(ax, 1), 'ay': int(bot + 1)}

manifest = {}
review = []

# ---------- 英雄：3 列 × 4 格 ----------
im, a, fg, lab, bg = analyze(HEROES, enclosed=250)
cols = [145, 345, 555, 760]; rows = [100, 280, 455]; frames = ['idle', 'walk', 'attack', 'skill']
MAX_W = 1.6   # 技能格若含特效且寬度超過待機的 1.6 倍，就只保留角色（特效改用程式光暈）
TRIM_R = {'vera': 0.66}   # 薇拉：切在法杖寶珠之後，不留半截火焰
for r, hid in enumerate(['erin', 'lena', 'vera']):
    masks = []
    for c, fr in enumerate(frames):
        m, box = pick(lab, fg, (cols[c], rows[r]))
        masks.append([fr, m, box])
    iw = masks[0][2][2] - masks[0][2][0]
    for item in masks:
        fr, m, box = item
        if box[2] - box[0] > iw * MAX_W:
            # 以角色腳底中心為準，左右各保留待機寬度的 0.8 倍
            ys, xs = np.nonzero(m)
            bot = ys.max(); feet = xs[ys > bot - (box[3] - box[1]) * 0.12]
            cx = int(feet.mean()); x0 = max(box[0], cx - int(iw * 0.8)); x1 = min(box[2], cx + int(iw * TRIM_R.get(hid, 0.8)))
            m = m.copy(); m[:, :x0] = False; m[:, x1:] = False
            ys, xs = np.nonzero(m); item[1] = m; item[2] = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
            print('trimmed', hid, fr)
    idle_h = masks[0][2][3] - masks[0][2][1]
    sc = 72 / idle_h
    for fr, m, box in masks:
        k = f'{hid}_{fr}'; manifest[k] = cut(im, m, box, sc, k); review.append(k)

# ---------- 敵人 ----------
im, a, fg, lab, bg = analyze(ENEMIES)
E = {'goblin': ((140, 150), 48), 'wolf': ((345, 160), 56), 'shield': ((590, 150), 50), 'bat': ((893, 80), 34),
     'raider': ((125, 395), 52), 'arsonist': ((350, 400), 50), 'sapper': ((560, 430), 40), 'boss': ((840, 380), 90)}
for k, (pt, th) in E.items():
    m, box = pick(lab, fg, pt)
    sc = th / (box[3] - box[1])
    manifest[k] = cut(im, m, box, sc, k); review.append(k)

# ---------- 防禦塔：4 列 × 6 欄，等級 1/2/3 = 欄 1/2/4 ----------
im, a, fg, lab, bg = analyze(TOWERS, T=14, shadowT=0)
tc = [90, 255, 410, 575, 745, 910]; tr = [70, 212, 350, 485]
for r, tid in enumerate(['archer', 'barracks', 'mage', 'cannon']):
    picks = []
    for lvl, c in zip([1, 2, 3], [0, 1, 3]):
        m, box = pick(lab, fg, (tc[c], tr[r])); picks.append((lvl, m, box))
    hmax = max(b[3] - b[1] for _, _, b in picks)
    sc = 84 / hmax
    for lvl, m, box in picks:
        k = f'{tid}_{lvl}'; manifest[k] = cut(im, m, box, sc, k, foot=False); review.append(k)


# ---------- 建築（第 2 批） ----------
BUILD = SRC + 'cad949bdd7573ebfc90ba64095243f1cbc25743df0ccc01c5c37ce7fe0720c40.jpg'
UNITS = SRC + '24bc54cbebab8029307bd96550c79873609fd071f0a28932b1384e6586a9061a.jpg'

def place(sheet_args, items):
    im, a, fg, lab, bg = analyze(*sheet_args[0], **sheet_args[1])
    for k, (pt, mode, size, extra, foot) in items.items():
        m, box = pick(lab, fg, pt, extra)
        bw, bh = box[2] - box[0], box[3] - box[1]
        sc = size / (bh if mode == 'h' else bw)
        manifest[k] = cut(im, m, box, sc, k, foot=foot); review.append(k)

# 尺寸以「存檔像素」計（= 邏輯尺寸 × 2）；mode h=依高度、w=依寬度
place(((BUILD,), dict(T=14, shadowT=0)), {
    'castle':  ((140, 150), 'h', 128, (), False),
    'farm':    ((385, 165), 'w', 84, (), False),
    'lumber':  ((630, 150), 'w', 84, (), False),
    'quarry':  ((880, 150), 'w', 80, (), False),
    'house':   ((140, 390), 'w', 76, (), False),
    'granary': ((380, 380), 'w', 84, (), False),
    'depot':   ((640, 390), 'w', 78, ((690, 315), (550, 420)), False),
    'wagon':   ((910, 400), 'w', 48, ((790, 420),), False),
})

# ---------- 單位／裝飾／圖示 ----------
# 兩種去背：A 會去掉腳下陰影（但會吃掉灰色暗面），B 不去陰影。
# 合併：圖的上 75% 用 B（保留盔甲/岩石暗面），最下 25% 用 A（去除地面陰影）。
im, a, fgA, labA, bg = analyze(UNITS, enclosed=250)
_, _, fgB, labB, _ = analyze(UNITS, T=14, shadowT=0, enclosed=250)
def group(items, mode, size, bottom=0.25):
    picked = []
    for k, pt, extra in items:
        mA, boxA = pick(labA, fgA, pt, extra)
        mB, boxB = pick(labB, fgB, pt, extra)
        cutY = boxA[3] - int((boxA[3] - boxA[1]) * bottom)
        m = mB.copy(); m[cutY:] = mA[cutY:]
        ys, xs = np.nonzero(m)
        picked.append((k, m, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
    ref = max((b[3] - b[1]) if mode == 'h' else (b[2] - b[0]) for _, _, b in picked)
    for k, m, box in picked:
        manifest[k] = cut(im, m, box, size / ref, k); review.append(k)
group([('villager_farmer', (180, 90), ()), ('villager_lumber', (395, 90), ()), ('villager_mason', (610, 90), ()), ('villager_carrier', (815, 90), ())], 'h', 38)
group([('soldier_idle', (180, 240), ()), ('soldier_attack', (380, 240), ()), ('soldier_knight', (610, 240), ())], 'h', 44)
for k, pt, size in [('deco_pine', (170, 375), 50), ('deco_oak', (335, 375), 48), ('deco_bush', (490, 395), 24), ('deco_rock', (655, 390), 26)]:
    group([(k, pt, ())], 'h', size)
group([('pad', (828, 395), ())], 'w', 58)
for k, pt in [('icon_wood', (165, 505)), ('icon_stone', (330, 505)), ('icon_food', (485, 500)), ('icon_front', (655, 500)), ('icon_pop', (825, 505))]:
    group([(k, pt, ())], 'h', 26)

# ---------- 立繪 ----------
PC = {'erin': (230, 18, 500, 292), 'lena': (330, 25, 650, 350), 'vera': (325, 8, 675, 365)}
for hid, (x0, y0, x1, y1) in PC.items():
    img = Image.open(PORTRAITS[hid]).convert('RGB').crop((int(x0 * D), int(y0 * D), int(x1 * D), int(y1 * D)))
    img = img.resize((240, round(240 * img.height / img.width)), Image.LANCZOS)
    k = f'{hid}_portrait'; img.save(OUT + k + '.png')
    manifest[k] = {'src': 'assets/' + k + '.png', 'w': img.width, 'h': img.height, 'ax': img.width / 2, 'ay': img.height}

with open('/workspace/game-proto/js/art_manifest.js', 'w') as f:
    f.write("'use strict';\n// 由 tools/extract_art.py 自動產生：正式美術素材清單（尺寸為邏輯尺寸的 2 倍，ax/ay = 腳底錨點）\n")
    f.write('const ART_MANIFEST = ' + json.dumps(manifest, ensure_ascii=False, indent=1) + ';\n')

# ---------- 檢查用拼圖（棋盤底、放大 3 倍） ----------
tiles = [Image.open(OUT + k + '.png') for k in review]
Z = 3; cw = max(t.width for t in tiles) * Z + 8; ch = max(t.height for t in tiles) * Z + 8
per = 6; sheet = Image.new('RGBA', (cw * per, ch * ((len(tiles) + per - 1) // per)), (255, 0, 255, 255))
for i, t in enumerate(tiles):
    cell = Image.new('RGBA', (cw, ch), (200, 200, 200, 255))
    for yy in range(0, ch, 8):
        for xx in range(0, cw, 8):
            if (xx // 8 + yy // 8) % 2: cell.paste((150, 150, 150, 255), (xx, yy, xx + 8, yy + 8))
    big = t.resize((t.width * Z, t.height * Z), Image.NEAREST)
    cell.alpha_composite(big, (4, 4))
    m = manifest[review[i]]
    for dx in range(-3, 4): cell.putpixel((min(cw - 1, int(4 + m['ax'] * Z + dx)), min(ch - 1, 4 + m['ay'] * Z - 1)), (255, 0, 0, 255))
    sheet.paste(cell, ((i % per) * cw, (i // per) * ch))
sheet.save(REV + 'review.png')
print(json.dumps({k: (v['w'], v['h']) for k, v in manifest.items()}))
