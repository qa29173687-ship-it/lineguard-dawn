"""八方旅人風 Q 版英雄（第二版）：三向站姿 + 側面動作條（走 A/B、攻擊預備/出手、技能預備/出手）。
每張圖：去背（深灰底，邊緣洪水填充）→ 角色與特效分離（特效＝獨立區塊＋依顏色/超出寬度的部分）
→ 同一英雄所有影格用同一比例、腳底同一基準線 → 最近鄰縮小存成 2 倍圖。
輸出 assets/{id}_{front,side,back,walk1,walk2,atk1,atk2,sk1,sk2}.png 與特效 assets/{id}_fx_{frame}.png，並更新 js/art_manifest.js。
執行：/workspace/.artenv/bin/python tools/extract_heroes_oct.py"""
import json, os, re
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

SRC = '/home/box/agent-data/agents/931bcd32-9e9a-4a7c-9dda-9f6c2ec3598d/assets/'
SHEETS = {
    'erin': ('11c0d882fb42c9c2484c3e63f67658aef130290979ad3bda78c2bb86f02244c5', '3d05bd3b6cbe4af70bde8fc9375f47cf8039d64c0177f95c3642572920299666'),
    'lena': ('f07e14e9f77fbd09df84fddc7e94f4f9ff810e2f07fda3c1ae1d39e07f9be5ef', 'b56cd09deed0cf856315e075aa8ac6cc77c63db561a5c94ca338470953a9b42c'),
    'vera': ('2523cb5a55065851ab7a01c342270c6c512f51d49591d57bde80eaa89ae191ef', 'bed5bcbc7edf24cb553138d103b0cb7f2eab77b2bb8761cc2525fb2a180b1326'),
}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets') + '/'
REV = '/workspace/art-review/oct/'
# 四方向走路圖（3 列 × 4 格：正面走來、背面走遠、側面走）；SIDE_FLIP = 側面列原圖朝左；SIDE_USE = 採用的側面格（0 起算）
WALK = {
    'erin': ('dae8262e78e8d8dd3bdbf9d7d9af99b6a4f19fbbc3fc142e56a1df27ee1fbccc', False, [0, 1, 2]),   # 第 4 格身體轉向鏡頭 → 捨棄
    'lena': ('d3d63e52c0a887d04c372bd57dce0d66eaab511b54df4aa1d42cadd586936939', True, [0, 1, 2]),    # 第 4 格其實是正面 → 捨棄
    'vera': ('b4fbc4ba5e322e18e0ca1f1221ba4425562a69251fce19db0d9d6d80363c6c1a', True, [0, 1, 2, 3]),
}
BACK_FLIP = {'lena'}   # 蕾娜背面走路圖的劍在左邊、背面站姿在右邊 → 走路格左右翻轉以免停下時劍換邊
TARGET_H = 76            # 站姿高度（存檔像素，= 38 邏輯像素）
ACT = ['walk1', 'walk2', 'atk1', 'atk2', 'sk1', 'sk2']

def analyze(path, T=22):
    im = Image.open(path).convert('RGB').filter(ImageFilter.MedianFilter(3))
    a = np.asarray(im).astype(np.int32)
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d0 = np.sqrt(((a - bg) ** 2).sum(-1))
    lab, n = ndi.label(d0 < T)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    bgm = np.isin(lab, list(edge) + [i + 1 for i, s in enumerate(sizes) if s > 400])
    fg = ndi.binary_opening(~bgm, iterations=1)
    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=2))
    comps = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        m = (lab == i) & fg
        if m.sum() < 250: continue
        ys, xs = np.nonzero(m)
        comps.append({'m': m, 'area': len(xs), 'cx': xs.mean(), 'x0': xs.min(), 'x1': xs.max()})
    return a, fg, comps, d0

def largest(m):
    lab, n = ndi.label(m)
    if n == 0: return m
    s = ndi.sum(m, lab, range(1, n + 1)); return lab == (np.argmax(s) + 1)

def foot_x(m):
    ys, xs = np.nonzero(m); y1 = ys.max(); band = ys > y1 - (y1 - ys.min()) * 0.12
    return xs[band].mean(), y1

def lum(a): return a.mean(-1)

# 每格的特效顏色規則：回傳布林遮罩（True = 特效）
def rules(hid, fr, a, cx, W, yy, xx, top, bot):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; L = lum(a); hgt = bot - top
    m = np.zeros(a.shape[:2], bool)
    if hid == 'erin' and fr in ('atk2', 'sk1', 'sk2'):
        m |= (g > 170) & (g > r + 35) & (g > b + 60) & (L > 140) & (xx > cx + 0.15 * W)     # 亮綠光
    if hid == 'lena' and fr == 'atk2':
        m |= (r > 190) & (g > 140) & (b < 170) & (L > 150) & (xx > cx + 0.35 * W)       # 金色劍弧
    if hid == 'lena' and fr == 'sk2':
        m |= (r > 170) & (g > 110) & (r > b + 40) & (L > 120) & (xx < cx - 0.12 * W) & (yy > top + 0.42 * hgt)   # 身後金色速度線
    if hid == 'vera' and fr in ('atk1', 'sk1'):
        m |= (b > g + 45) & (L > 120) & (yy > top + 0.68 * hgt)                         # 腳下魔法陣（亮紫）
        m |= (b > r) & (b > g + 8) & (yy > bot - 0.06 * hgt)                            # 魔法陣染色的底
    if hid == 'vera' and fr == 'sk2':
        m |= (r > 150) & (r > b + 70) & (xx > cx + 0.3 * W)                             # 火球
    return m

TRIM = {  # 角色允許的左右範圍（以走路寬度 W 的倍數，相對腳中心）
    'erin': {'atk2': (0.8, 0.62), 'sk1': (0.8, 0.62)},
    'lena': {'atk2': (0.8, 0.55), 'sk2': (0.55, 0.8)},
    'vera': {'atk2': (0.8, 0.68), 'sk1': (0.8, 0.9), 'sk2': (0.8, 0.9)},
}

def split_strip(hid, path, names, nchar):
    a, fg, comps, d0 = analyze(path)
    chars = sorted(sorted(comps, key=lambda c: -c['area'])[:nchar], key=lambda c: c['cx'])
    others = [c for c in comps if all(c is not ch for ch in chars)]
    H_, W_ = fg.shape; yy, xx = np.mgrid[0:H_, 0:W_]
    res = {}
    Wref = chars[0]['x1'] - chars[0]['x0']
    for name, ch in zip(names, chars):
        m = ch['m']; ys, xs = np.nonzero(m); top, bot = ys.min(), ys.max()
        band = (ys > top + 0.2 * (bot - top)) & (ys < top + 0.6 * (bot - top))
        cx0 = float(np.median(xs[band]))        # 軀幹中心（不受腳下特效、身後速度線影響）
        fxm = rules(hid, name, a, cx0, Wref, yy, xx, top, bot) & m
        if hid == 'vera' and name in ('atk1', 'sk1'):
            fxm |= m & (yy > top + 0.8 * (bot - top)) & (np.abs(xx - cx0) > 0.36 * Wref)
        L, R = TRIM.get(hid, {}).get(name, (9, 9))
        fxm |= m & ((xx < cx0 - L * Wref) | (xx > cx0 + R * Wref))
        body = largest(ndi.binary_opening(m & ~fxm, iterations=1))
        body = ndi.binary_closing(body, iterations=1) & m
        fx = (m & ~body)
        for o in others:
            if abs(o['cx'] - ch['cx']) == min(abs(o['cx'] - c['cx']) for c in chars): fx |= o['m']
        # 去掉太小的碎片
        lab, n = ndi.label(fx)
        if n:
            s = ndi.sum(fx, lab, range(1, n + 1)); fx = np.isin(lab, [i + 1 for i, v in enumerate(s) if v >= 40])
        if name in ('front', 'side', 'back', 'walk1', 'walk2'):   # 這些影格沒有特效：被切開的小塊（法杖寶石等）併回角色
            body = body | fx; fx = fx & False
        res[name] = (body, fx if fx.sum() > 300 else None)
    return a, res

def export(a, m, scale, ax_src, ay_src, name, white_bg=None):
    ys, xs = np.nonzero(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([a[y0:y1, x0:x1].clip(0, 255), m[y0:y1, x0:x1] * 255]).astype(np.uint8)
    im = Image.fromarray(rgba)
    w, h = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    rgb = im.convert('RGB').resize((w, h), Image.NEAREST)
    al = Image.fromarray(m[y0:y1, x0:x1].astype(np.uint8) * 255).resize((w, h), Image.BOX)
    al = al.point(lambda v: 255 if v > 110 else 0)
    out = rgb.convert('RGBA'); out.putalpha(al)
    out.save(OUT + name + '.png')
    return {'src': f'assets/{name}.png', 'w': w, 'h': h, 'ax': round((ax_src - x0) * scale, 1), 'ay': round((ay_src - y0) * scale, 1)}

manifest_path = os.path.join(ROOT, 'js', 'art_manifest.js')
txt = open(manifest_path, encoding='utf-8').read()
man = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
# 舊的英雄影格移除
for k in list(man):
    if re.match(r'^(erin|lena|vera)_(idle|walk|attack|skill)$', k): del man[k]
for k in ['erin_idle', 'erin_walk', 'erin_attack', 'erin_skill', 'lena_idle', 'lena_walk', 'lena_attack', 'lena_skill', 'vera_idle', 'vera_walk', 'vera_attack', 'vera_skill']:
    p = OUT + k + '.png'
    if os.path.exists(p): os.remove(p)

review = []

def torso_x(m):
    ys, xs = np.nonzero(m); t, b = ys.min(), ys.max()
    band = (ys > t + 0.2 * (b - t)) & (ys < t + 0.6 * (b - t))
    return float(np.median(xs[band]))

def split_grid(path):
    a, fg, comps, d0 = analyze(path)
    chars = sorted(comps, key=lambda c: -c['area'])[:12]
    for c in chars: c['cy'] = np.nonzero(c['m'])[0].mean()
    for o in comps:                      # 小碎片（劍尖、寶石）併回最近的角色
        if any(o is c for c in chars): continue
        oy = np.nonzero(o['m'])[0].mean()
        near = min(chars, key=lambda c: (c['cx'] - o['cx']) ** 2 + (c['cy'] - oy) ** 2); near['m'] = near['m'] | o['m']
    chars.sort(key=lambda c: c['cy'])
    rows = [sorted(chars[i * 4:(i + 1) * 4], key=lambda c: c['cx']) for i in range(3)]
    return a, [[c['m'] for c in r] for r in rows]
for hid, (dsheet, asheet) in SHEETS.items():
    ad, dres = split_strip(hid, SRC + dsheet + '.jpg', ['front', 'side', 'back'], 3)
    aa, ares = split_strip(hid, SRC + asheet + '.jpg', ACT, 6)
    # 比例：側面站姿與走路 A 的身高相同；站姿高度 = TARGET_H
    hgt = lambda m: np.ptp(np.nonzero(m)[0]) + 1
    s_dir = TARGET_H / hgt(dres['side'][0])
    s_act = s_dir * hgt(dres['side'][0]) / ((hgt(ares['walk1'][0]) + hgt(ares['walk2'][0])) / 2)
    # ---- 四方向走路 ----
    wsheet, sflip, suse = WALK[hid]
    wa, wrows = split_grid(SRC + wsheet + '.jpg')
    for (row, masks) in zip(['wf', 'wb', 'ws'], wrows):
        stand = dres[{'wf': 'front', 'wb': 'back', 'ws': 'side'}[row]][0]
        sh = np.ptp(np.nonzero(stand)[0]) + 1
        fs = [m for i, m in enumerate(masks) if row != 'ws' or i in suse]
        hs = [np.ptp(np.nonzero(m)[0]) + 1 for m in fs]
        sc = s_dir * sh / float(np.median(hs))             # 與站姿同高
        sfoot, _ = foot_x(stand)
        dx = (sfoot - torso_x(stand)) * s_dir                # 站姿：腳中心相對軀幹中心（存檔像素）
        for i, m in enumerate(fs):
            img, mm = wa, m
            if (row == 'ws' and sflip) or (row == 'wb' and hid in BACK_FLIP): img, mm = wa[:, ::-1], m[:, ::-1]
            ys, xs = np.nonzero(mm)
            ax = torso_x(mm) + dx / sc                       # 軀幹對齊站姿，不會左右跳
            k = f'{hid}_{row}{i + 1}'
            man[k] = export(np.ascontiguousarray(img), np.ascontiguousarray(mm), sc, ax, ys.max(), k)
            review.append(k)
        for j in range(len(fs), 4):
            man.pop(f'{hid}_{row}{j + 1}', None)
            if os.path.exists(OUT + f'{hid}_{row}{j + 1}.png'): os.remove(OUT + f'{hid}_{row}{j + 1}.png')
    for name, (body, fx) in dres.items():
        fx_, fy_ = foot_x(body)
        man[f'{hid}_{name}'] = export(ad, body, s_dir, fx_, fy_, f'{hid}_{name}')
        review.append(f'{hid}_{name}')
    # 動作條：全部影格用同一個腳底基準（各格自己的腳底），錨點 x = 走路 A 的身體中心相對位置一致 → 用各格腳中心
    for name, (body, fx) in ares.items():
        fx_, fy_ = foot_x(body)
        if name in ('atk1', 'atk2', 'sk1', 'sk2'):
            # 出手時身體前傾、腳會張開：錨點 x 改用「頭/身體」與走路 A 同樣的相對位置，避免畫面跳動
            ys, xs = np.nonzero(body); t0 = ys.min(); hb = (ys < t0 + (ys.max() - t0) * 0.35)
            w1 = ares['walk1'][0]; y1s, x1s = np.nonzero(w1); t1 = y1s.min(); hb1 = y1s < t1 + (y1s.max() - t1) * 0.35
            fw1, _ = foot_x(w1)
            off = x1s[hb1].mean() - fw1                     # 走路 A：頭部中心相對腳中心
            fx_ = xs[hb].mean() - off * 0.5 - (xs[hb].mean() - fx_) * 0.5
        man[f'{hid}_{name}'] = export(aa, body, s_act, fx_, fy_, f'{hid}_{name}')
        review.append(f'{hid}_{name}')
        if fx is not None:
            man[f'{hid}_fx_{name}'] = export(aa, fx, s_act, fx_, fy_, f'{hid}_fx_{name}')
            review.append(f'{hid}_fx_{name}')

open(manifest_path, 'w', encoding='utf-8').write('// 自動產生（tools/extract_art.py、tools/extract_heroes_oct.py）\nconst ART_MANIFEST = ' + json.dumps(man, ensure_ascii=False, indent=1) + ';\n')

# 檢查圖：每格 = 角色 + 特效（同錨點），放大 3 倍；紅線 = 腳底基準、黃線 = 錨點
from PIL import ImageDraw
rows = []
for hid in SHEETS:
    cells = []
    for fr in ['front', 'side', 'back'] + ACT:
        k = f'{hid}_{fr}'; m = man[k]; parts = [(k, m)]
        if f'{hid}_fx_{fr}' in man: parts.append((f'{hid}_fx_{fr}', man[f'{hid}_fx_{fr}']))
        c = Image.new('RGBA', (300, 360), (90, 120, 70, 255))
        for kk, mm in parts:
            im = Image.open(OUT + kk + '.png').resize((mm['w'] * 3, mm['h'] * 3), Image.NEAREST)
            c.alpha_composite(im, (int(150 - mm['ax'] * 3), int(330 - mm['ay'] * 3))) if 150 - mm['ax'] * 3 >= 0 else c.paste(im, (int(150 - mm['ax'] * 3), int(330 - mm['ay'] * 3)), im)
        d = ImageDraw.Draw(c); d.line([(0, 330), (300, 330)], fill=(255, 0, 0)); d.line([(150, 320), (150, 340)], fill=(255, 255, 0))
        d.text((4, 344), fr + (' +fx' if len(parts) > 1 else ''), fill=(255, 255, 255))
        cells.append(c)
    row = Image.new('RGBA', (300 * len(cells), 360))
    for i, c in enumerate(cells): row.paste(c, (i * 300, 0))
    rows.append(row)
sheet = Image.new('RGBA', (rows[0].width, 360 * len(rows)))
for i, r in enumerate(rows): sheet.paste(r, (0, i * 360))
sheet.save(REV + 'extract_v2.png')
rows = []
for hid in SHEETS:
    frs = ['front', 'side', 'back'] + [k.split('_', 1)[1] for k in review if k.startswith(hid + '_w') and k.split('_', 1)[1][:2] in ('wf', 'wb', 'ws')]
    cells = []
    for fr in frs:
        mm = man[f'{hid}_{fr}']; im = Image.open(OUT + f'{hid}_{fr}.png').resize((mm['w'] * 3, mm['h'] * 3), Image.NEAREST)
        c = Image.new('RGBA', (200, 300), (90, 120, 70, 255)); c.paste(im, (int(100 - mm['ax'] * 3), int(270 - mm['ay'] * 3)), im)
        d = ImageDraw.Draw(c); d.line([(0, 270), (200, 270)], fill=(255, 0, 0)); d.line([(100, 30), (100, 280)], fill=(255, 255, 0)); d.line([(0, 270 - 76 * 3), (200, 270 - 76 * 3)], fill=(255, 0, 0))
        d.text((4, 284), fr, fill=(255, 255, 255)); cells.append(c)
    row = Image.new('RGBA', (200 * len(cells), 300))
    for i, c in enumerate(cells): row.paste(c, (i * 200, 0))
    rows.append(row)
ws = Image.new('RGBA', (max(r.width for r in rows), 300 * len(rows)))
for i, r in enumerate(rows): ws.paste(r, (0, i * 300))
ws.save(REV + 'walk_v1.png'); print('ok', len(review))
for k in review: print(k, man[k]['w'], man[k]['h'], man[k]['ax'], man[k]['ay'])
