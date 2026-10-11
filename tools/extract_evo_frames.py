"""進化英雄動作影格：四方向走路（3 列 × 4 格）＋側面動作條（走 A/B、攻擊預備/出手、技能預備/出手），朝右。
流程同 tools/extract_heroes_oct.py（深灰底洪水去背 → 角色／特效分離），比例與基準線對齊 tools/extract_evo.py 的進化站姿：
  走路各列中位身高 = 對應進化站姿（front/back/side）高度；動作條走 A/B 平均身高 = 進化側面站姿高度；腳底 = 錨點；
  縮小：RGB BOX、alpha BOX 後二值化（與進化站姿一致）。
輸出 assets/{id}_evo_{wf1-4,wb1-4,ws1-3/4,walk1,walk2,atk1,atk2,sk1,sk2}.png、特效 assets/{id}_evo_fx_{frame}.png，更新 js/art_manifest.js。
執行：/workspace/.artenv/bin/python tools/extract_evo_frames.py"""
import json, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage as ndi

SRC = '/home/box/agent-data/agents/931bcd32-9e9a-4a7c-9dda-9f6c2ec3598d/assets/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets') + '/'
REV = '/workspace/art-review/evo2/'
# (走路圖, 動作條, 側面列原圖朝左?, 採用的側面格, 背面列左右翻轉?)
SHEETS = {
    'erin': ('4bb0ee52d433f0bbec9ef54648dfc0ab98ea1b1ef26610956ca0697e2b454f50', 'e30e305187b6cc50d8599605d0048e42648778c85ca1a269d9ad7b1a9689a47c', False, [0, 1, 2, 3], False),
    'lena': ('0192a227bd40036b11e6d8761ae72f61492b049ba81821f9a012486a290e4699', 'b436c600cac9c895714dc9e0001fe1db140b9d510c0c78e8cf05f37eec59c23e', True, [0, 1, 2], True),   # 側面第 4 格是正面 → 捨棄；背面劍在左、進化背面站姿劍在右 → 翻轉
    'vera': ('0af1ecdccf6881617263b9a53c00fb7408ebd8353e00729d3cdc8093c16ae5b6', '4788b08b12958acf9c0188fd785e1ed9f82c924a2b68ded0814d0ce1bacbaa85', True, [0, 1, 2, 3], False),
}
T_BG = {}   # 每位英雄的去背門檻（預設 22；試過薇拉 13，內層深紫長袍差異不大且魔法陣會黏回角色）
SHADOW = {'lena'}   # 蕾娜底色偏暖、腳下有灰影；薇拉黑絲襪接近底色，不能用
ACT = ['walk1', 'walk2', 'atk1', 'atk2', 'sk1', 'sk2']

def analyze(path, T=22, shadow=False):
    im = Image.open(path).convert('RGB').filter(ImageFilter.MedianFilter(3))
    a = np.asarray(im).astype(np.int32)
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d0 = np.sqrt(((a - bg) ** 2).sum(-1))
    lab, n = ndi.label(d0 < T)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    bgm = np.isin(lab, list(edge) + [i + 1 for i, s in enumerate(sizes) if s > 400])
    # 腳下陰影：比背景暗、無彩度
    L = a.mean(-1); sat = a.max(-1) - a.min(-1)
    if shadow: bgm |= (L < bg.mean()) & (L > bg.mean() - 26) & (sat < 14)
    fg = ndi.binary_opening(~bgm, iterations=1)
    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=2))
    comps = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        m = (lab == i) & fg
        if m.sum() < 120: continue
        ys, xs = np.nonzero(m)
        comps.append({'m': m, 'area': len(xs), 'cx': xs.mean(), 'cy': ys.mean(), 'x0': xs.min(), 'x1': xs.max()})
    return np.asarray(Image.open(path).convert('RGB')).astype(np.int32), fg, comps

def clean(m, mn=160):
    """去掉小碎片（閃光、腳下陰影點）"""
    lab, n = ndi.label(m)
    if n <= 1: return m
    sz = ndi.sum(m, lab, range(1, n + 1)); return np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= mn])

def deshadow(a, m, hid):
    """薇拉：腳下深灰陰影（比底色暗、無彩度）只在最下方 14% 去除，再清碎片"""
    if hid != 'vera': return clean(m, 300 if hid == 'erin' else 160)
    ys, xs = np.nonzero(m); t, b = ys.min(), ys.max()
    L = a.mean(-1); sat = a.max(-1) - a.min(-1)
    yy = np.arange(a.shape[0])[:, None]
    sh = (yy > b - 0.14 * (b - t)) & (L < 44) & (sat < 16)
    return clean(ndi.binary_opening(m & ~sh, iterations=1) | (m & ~(yy > b - 0.14 * (b - t))), 160)

def largest(m):
    lab, n = ndi.label(m)
    if n == 0: return m
    s = ndi.sum(m, lab, range(1, n + 1)); return lab == (np.argmax(s) + 1)

def foot_x(m):
    ys, xs = np.nonzero(m); y1 = ys.max(); band = ys > y1 - (y1 - ys.min()) * 0.1
    return xs[band].mean(), y1

def torso_x(m):
    ys, xs = np.nonzero(m); t, b = ys.min(), ys.max()
    band = (ys > t + 0.2 * (b - t)) & (ys < t + 0.6 * (b - t))
    return float(np.median(xs[band]))

def fx_rules(hid, fr, a, cx, W, yy, xx, top, bot):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; L = a.mean(-1); hgt = bot - top
    m = np.zeros(a.shape[:2], bool)
    if hid == 'erin' and fr in ('atk2', 'sk1', 'sk2'):
        m |= (b > r + 25) & (L > 120) & (xx > cx + 0.12 * W)                               # 藍白光箭、月牙、箭雨
        m |= (b > r + 12) & (b > g) & (xx > cx + 0.12 * W)                                  # 月牙／箭的深藍外框
        if fr == 'sk1': m |= (yy < top + 0.12 * hgt) & (xx > cx + 0.3 * W) & (L > 150)
    if hid == 'lena' and fr == 'atk2':
        m |= (r > 190) & (g > 140) & (L > 150) & (xx > cx + 0.45 * W)                       # 金色劍弧
    if hid == 'lena' and fr == 'sk2':
        m |= (r > 170) & (g > 120) & (r > b + 40) & (L > 130) & (xx < cx - 0.25 * W)         # 身後速度線
    if hid == 'vera' and fr == 'atk2':
        m |= (r > 150) & (r > b + 60) & (xx > cx + 0.75 * W)                                # 火球
    if hid == 'vera' and fr == 'sk1':
        m |= yy < top + 0.0                                                                 # 魔法陣（獨立區塊，見下）
    if hid == 'vera' and fr == 'sk2':
        m |= (b > g + 35) & (L > 120) & (xx > cx + 0.05 * W)                                # 紫色雷柱（亮紫；長袍與頭髮較暗）
        m |= (b > 135) & (b > g + 65)                                                       # 雷柱本體（頭髮／長袍的藍色分量 < 125）
        m |= (b > g + 50) & (yy > bot - 0.07 * hgt)                                          # 腳下光圈
    return m

TRIM = {'lena': {'atk2': (0.9, 0.75)}, 'vera': {'atk2': (0.9, 0.8)}, 'erin': {'sk2': (0.9, 0.62)}}

def split_strip(hid, path):
    a, fg, comps = analyze(path, T=T_BG.get(hid, 22), shadow=hid in SHADOW)
    big = [c for c in comps if c['area'] > 4000]
    # 角色 = 下半部的大區塊（魔法陣在頭上，面積也大）
    chars = sorted(sorted(big, key=lambda c: -(c['area'] * (c['cy'] > fg.shape[0] * 0.38)))[:6], key=lambda c: c['cx'])
    split = []
    while len(chars) < 6 or any(c['cy'] < fg.shape[0] * 0.38 for c in chars):   # 相鄰兩格黏在一起 → 從最窄的欄切開
        chars = [c for c in chars if c['cy'] >= fg.shape[0] * 0.38]
        w = max(chars, key=lambda c: c['x1'] - c['x0']); chars = [c for c in chars if c is not w]; split.append(w)
        col = w['m'].sum(0); x0, x1 = w['x0'], w['x1']; lo, hi = int(x0 + 0.3 * (x1 - x0)), int(x0 + 0.7 * (x1 - x0))
        cut = lo + int(np.argmin(col[lo:hi]))
        for part in (w['m'] & (np.arange(fg.shape[1]) < cut), w['m'] & (np.arange(fg.shape[1]) >= cut)):
            ys, xs = np.nonzero(part); chars.append({'m': part, 'area': len(xs), 'cx': xs.mean(), 'cy': ys.mean(), 'x0': xs.min(), 'x1': xs.max()})
        chars.sort(key=lambda c: c['cx'])
    others = [c for c in comps if all(c is not ch for ch in chars + split)]
    H_, W_ = fg.shape; yy, xx = np.mgrid[0:H_, 0:W_]
    Wref = chars[0]['x1'] - chars[0]['x0']
    res = {}
    for name, ch in zip(ACT, chars):
        m = ch['m']; ys, xs = np.nonzero(m); top, bot = ys.min(), ys.max()
        band = (ys > top + 0.25 * (bot - top)) & (ys < top + 0.6 * (bot - top))
        cx0 = float(np.median(xs[band]))
        fxm = fx_rules(hid, name, a, cx0, Wref, yy, xx, top, bot) & m
        Lr, Rr = TRIM.get(hid, {}).get(name, (9, 9))
        fxm |= m & ((xx < cx0 - Lr * Wref) | (xx > cx0 + Rr * Wref))
        body = largest(ndi.binary_opening(m & ~fxm, iterations=1))
        body = ndi.binary_fill_holes(ndi.binary_closing(body, iterations=1)) & m   # 被角色包住的部分（火焰中的法杖水晶）留在角色
        fx = m & ~body
        if hid == 'lena' and name == 'sk1': fx &= xx < np.nonzero(body)[1].max() + 4   # 右邊黏過來的是下一格的速度線
        gap = lambda o, c: max(0, c['x0'] - o['x1'], o['x0'] - c['x1'])          # 與角色外框的水平距離
        for o in others:
            behind = o['x1'] < ch['x0'] - 4 and not (hid == 'lena' and name == 'sk2')   # 角色身後的碎塊是上一格的火花 → 不要
            best = min(chars, key=lambda c: (gap(o, c), abs(o['cx'] - c['cx'])))
            if best is ch and gap(o, ch) < 60 and not behind: fx |= o['m']
        lab, n = ndi.label(fx)
        if n:
            s = ndi.sum(fx, lab, range(1, n + 1)); fx = np.isin(lab, [i + 1 for i, v in enumerate(s) if v >= 40])
        if name in ('walk1', 'walk2', 'atk1'):   # 沒有特效的格：整個區塊都是角色（深色絲襪、細法杖不會被切掉）；附近的碎塊（法杖火焰）併回
            near = ndi.binary_dilation(m, iterations=12)
            body = deshadow(a, m | (fx & near), hid); fx = fx & False
        res[name] = (body, fx if fx.sum() > 300 else None)
    return a, res

def split_grid(path, hid):
    a, fg, comps = analyze(path, T=T_BG.get(hid, 22), shadow=hid in SHADOW)
    chars = sorted(comps, key=lambda c: -c['area'])[:12]
    for o in comps:   # 碎片（劍尖、法杖寶石、閃光）：靠近角色才併回
        if any(o is c for c in chars): continue
        near = min(chars, key=lambda c: (c['cx'] - o['cx']) ** 2 + (c['cy'] - o['cy']) ** 2)
        if o['area'] > 400 and ndi.binary_dilation(near['m'], iterations=10)[o['m']].any(): near['m'] = near['m'] | o['m']
    chars.sort(key=lambda c: c['cy'])
    rows = [sorted(chars[i * 4:(i + 1) * 4], key=lambda c: c['cx']) for i in range(3)]
    return a, [[deshadow(a, c['m'], hid) for c in r] for r in rows]

def export(a, m, scale, ax_src, ay_src, name):
    ys, xs = np.nonzero(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    w, h = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    rgb = Image.fromarray(a[y0:y1, x0:x1].clip(0, 255).astype(np.uint8)).resize((w, h), Image.BOX)
    al = np.asarray(Image.fromarray(m[y0:y1, x0:x1].astype(np.uint8) * 255).resize((w, h), Image.BOX))
    al = np.where(al > 110, 255, 0).astype(np.uint8)
    Image.fromarray(np.dstack([np.asarray(rgb), al]), 'RGBA').save(OUT + name + '.png', optimize=True)
    return {'src': f'assets/{name}.png', 'w': w, 'h': h, 'ax': round((ax_src - x0) * scale, 1), 'ay': round((ay_src - y0) * scale, 1)}

def stand_info(man, k):
    """進化站姿（存檔像素）：高度、腳中心相對軀幹中心"""
    al = np.asarray(Image.open(OUT + k + '.png').convert('RGBA'))[..., 3] > 0
    return man[k]['h'], man[k]['ax'] - torso_x(al)

def recolor_cape(a, body, cx, W, hid, name):
    """艾琳技能出手格：身後的綠色披風外層 → 動作 1–5 的白披風色（依亮度做直方圖對應，保留原本的明暗）"""
    if not (hid == 'erin' and name == 'sk2'): return a
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    ys, xs = np.nonzero(body); top, bot = ys.min(), ys.max()
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    cape = body & (g >= r - 6) & (g > b + 2) & (xx < cx - CAPE_X * W) & (yy > top + 0.28 * (bot - top)) & (yy < top + 0.9 * (bot - top))
    cape = ndi.binary_opening(cape, iterations=1)
    # 參考色：動作條第 1 格（走 A）身後的白披風
    ref = a[300:400, 15:120].reshape(-1, 3); refL = ref.mean(-1); ref = ref[(refL > 110) & (ref.max(-1) - ref.min(-1) < 60)]
    ref = ref[np.argsort(ref.mean(-1))]
    a = a.copy(); src = a[cape]; order = np.argsort(np.argsort(src.mean(-1)))
    a[cape] = ref[(order * (len(ref) - 1) // max(1, len(src) - 1)).astype(int)]
    return a
CAPE_X = 0.05

def clean_stand(k):
    """進化站姿（tools/extract_evo.py 產生）去掉分離的小碎片（蕾娜側面左邊的金色劍光殘片、艾琳的閃光點）；尺寸與錨點不變"""
    im = Image.open(OUT + k + '.png').convert('RGBA'); px = np.asarray(im).copy()
    m = px[..., 3] > 0; lab, n = ndi.label(m)
    if n <= 1: return
    sz = ndi.sum(m, lab, range(1, n + 1)); keep = np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= 0.08 * sz.max()])
    px[~keep, 3] = 0; Image.fromarray(px, 'RGBA').save(OUT + k + '.png', optimize=True)
for h in SHEETS:
    for fr in ('front', 'side', 'back'): clean_stand(f'{h}_evo_{fr}')

man_path = os.path.join(ROOT, 'js', 'art_manifest.js')
txt = open(man_path, encoding='utf-8').read()
man = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
review = {}
for hid, (wsheet, asheet, sflip, suse, bflip) in SHEETS.items():
    keys = []
    for k in list(man):
        if k.startswith(hid + '_evo_') and k.split('_evo_')[1] not in ('front', 'side', 'back', 'panel', 'portrait'):
            if os.path.exists(OUT + k + '.png'): os.remove(OUT + k + '.png')   # 舊輸出（這次可能不再產生，例如沒有特效的格）
            del man[k]
    wa, wrows = split_grid(SRC + wsheet + '.jpg', hid)
    for row, masks in zip(['wf', 'wb', 'ws'], wrows):
        sh, dx = stand_info(man, f'{hid}_evo_' + {'wf': 'front', 'wb': 'back', 'ws': 'side'}[row])
        fs = [m for i, m in enumerate(masks) if row != 'ws' or i in suse]
        sc = sh / float(np.median([np.ptp(np.nonzero(m)[0]) + 1 for m in fs]))
        for i, m in enumerate(fs):
            img, mm = wa, m
            if (row == 'ws' and sflip) or (row == 'wb' and bflip): img, mm = wa[:, ::-1], m[:, ::-1]
            ys, xs = np.nonzero(mm)
            k = f'{hid}_evo_{row}{i + 1}'
            man[k] = export(np.ascontiguousarray(img), np.ascontiguousarray(mm), sc, torso_x(mm) + dx / sc, ys.max(), k); keys.append(k)
    aa, ares = split_strip(hid, SRC + asheet + '.jpg')
    sh, _ = stand_info(man, f'{hid}_evo_side')
    hgt = lambda m: np.ptp(np.nonzero(m)[0]) + 1
    s_act = sh / ((hgt(ares['walk1'][0]) + hgt(ares['walk2'][0])) / 2)
    w1 = ares['walk1'][0]; y1s, x1s = np.nonzero(w1); t1 = y1s.min(); hb1 = y1s < t1 + (y1s.max() - t1) * 0.35
    fw1, _ = foot_x(w1); off = x1s[hb1].mean() - fw1
    Wref = np.ptp(x1s)
    for name, (body, fx) in ares.items():
        fx_, fy_ = foot_x(body)
        if name in ('atk1', 'atk2', 'sk1', 'sk2'):
            ys, xs = np.nonzero(body); t0 = ys.min(); hb = ys < t0 + (ys.max() - t0) * 0.35
            fx_ = xs[hb].mean() - off * 0.5 - (xs[hb].mean() - fx_) * 0.5
        img = recolor_cape(aa, body, torso_x(body), Wref, hid, name)
        k = f'{hid}_evo_{name}'
        man[k] = export(img, body, s_act, fx_, fy_, k); keys.append(k)
        if fx is not None:
            man[f'{hid}_evo_fx_{name}'] = export(aa, fx, s_act, fx_, fy_, f'{hid}_evo_fx_{name}'); keys.append(f'{hid}_evo_fx_{name}')
    review[hid] = keys

open(man_path, 'w', encoding='utf-8').write('// 自動產生（tools/extract_art.py、tools/extract_heroes_oct.py、tools/extract_evo.py、tools/extract_evo_frames.py）\nconst ART_MANIFEST = ' + json.dumps(man, ensure_ascii=False, indent=1) + ';\n')

# 檢查圖：每列 = 一個英雄；3 倍、綠底；紅線 = 腳底、黃線 = 錨點；動作格疊上特效
S = 3
for hid, keys in review.items():
    frs = ['front', 'side', 'back'] + [k.split('_evo_')[1] for k in keys if '_fx_' not in k]
    cells = []
    for fr in frs:
        parts = [f'{hid}_evo_{fr}'] + ([f'{hid}_evo_fx_{fr}'] if f'{hid}_evo_fx_{fr}' in man else [])
        c = Image.new('RGBA', (170, 330), (90, 120, 70, 255))
        for kk in parts:
            mm = man[kk]; im = Image.open(OUT + kk + '.png').convert('RGBA').resize((mm['w'] * S, mm['h'] * S), Image.NEAREST)
            if '_fx_' in kk:
                im = Image.fromarray(np.dstack([np.asarray(im)[..., :3], (np.asarray(im)[..., 3] * 0.85).astype(np.uint8)]))
            tmp = Image.new('RGBA', c.size); tmp.paste(im, (int(85 - mm['ax'] * S), int(300 - mm['ay'] * S))); c.alpha_composite(tmp)
        d = ImageDraw.Draw(c); d.line([(0, 300), (170, 300)], fill=(255, 0, 0)); d.line([(85, 290), (85, 310)], fill=(255, 255, 0))
        d.text((4, 314), fr + (' +fx' if len(parts) > 1 else ''), fill=(255, 255, 255)); cells.append(c)
    sheet = Image.new('RGBA', (170 * 9, 330 * ((len(cells) + 8) // 9)), (40, 40, 40, 255))
    for i, c in enumerate(cells): sheet.paste(c, ((i % 9) * 170, (i // 9) * 330))
    sheet.convert('RGB').save(REV + f'{hid}_frames.png')
    print(hid, len(keys), ' '.join(f"{k.split('_evo_')[1]}:{man[k]['w']}x{man[k]['h']}" for k in keys))
