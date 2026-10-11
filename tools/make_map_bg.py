"""合成 HD-2D 風整張地圖背景（720×1280 = 遊戲邏輯畫布 360×640 的 2 倍）。
幾何讀自 js/levels.js（每關的敵人路線、塔位、補給道路、河流／橋、峭壁），城堡／糧倉／後方建地讀自 js/config.js。
用法：
  /workspace/.artenv/bin/python tools/make_map_bg.py all        # 產生 assets/maps/level_01.jpg … level_10.jpg
  /workspace/.artenv/bin/python tools/make_map_bg.py 9          # 只產生第 9 關
  /workspace/.artenv/bin/python tools/make_map_bg.py legacy     # 第 0 關 assets/maps/level_00.jpg（第 1 階段試玩關，依 config.js 的 PATH）
素材：草地／泥土貼圖、洋紅底道具表（松、橡、灌木、苔石、碎石、石台、花草、樹樁、倒木）。（需 Pillow、numpy、scipy）"""
import re, json, os, sys, subprocess
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = '/home/box/agent-data/agents/931bcd32-9e9a-4a7c-9dda-9f6c2ec3598d/assets/'
GRASS = SRC + 'ff39304303d0f076b20f957a35b5fab03a12223cee1810645c9a61e1ffdd902b.jpg'
DIRT = SRC + '35ec5be8e7097a8c13cafdf75a592fd40f59c961a24c699a2349d53737621e0f.jpg'
PROPS = SRC + 'd15b975369a259300b8c558e4d4ac753d5160ffdbeb2d9027d6d8558fbab2506.jpg'
REVIEW = '/workspace/art-review/map/'
S = 2                      # 輸出 = 邏輯座標 × 2
W, H = 360 * S, 640 * S
ARG = sys.argv[1] if len(sys.argv) > 1 else 'all'
if ARG == 'all':
    for i in range(1, 11): subprocess.run([sys.executable, __file__, str(i)], check=True)
    sys.exit(0)

# ---------- 讀取設定 ----------
cfg = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
def arr(name): return json.loads(re.search(name + r'\s*:\s*(\[\[.*?\]\])', cfg, re.S).group(1))
def pt(name):
    m = re.search(name + r'\s*:\s*\{\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+)', cfg); return float(m.group(1)), float(m.group(2))
CASTLE, GRANARY = pt('CASTLE'), pt('GRANARY')
ALLPLOTS = arr('PLOTS')
RIVER, BRIDGES, CLIFFS, VALLEY = None, [], [], False
if ARG == 'legacy':
    PATHS, ROAD, PADS, PLOTS = [arr('PATH')], arr('ROAD'), arr('TOWER_SPOTS'), ALLPLOTS
    DEPOT, RAIDS = pt('DEPOT'), [pt('RAIDER_SPAWN')]
    OUT = os.path.join(ROOT, 'assets', 'maps', 'level_00.jpg'); SEED = 20261011   # 第 0 關（除錯／回歸測試用的第 1 階段試玩關）
else:
    lt = open(os.path.join(ROOT, 'js', 'levels.js'), encoding='utf-8').read()
    LV = json.loads(lt[lt.index('const LEVELS = ') + 15:lt.rindex(';')])[int(ARG) - 1]
    PATHS, PADS, PLOTS = LV['paths'], LV['pads'], [ALLPLOTS[i] for i in LV['plots']]
    sp = LV['supply']
    if sp:
        d = next(x for x in sp['spots'] if x['id'] == sp['default']); ROAD, DEPOT = d['road'], (d['x'], d['y'])
    else: ROAD, DEPOT = None, None
    RAIDS = [tuple(r) for r in LV['raid']]
    RIVER, BRIDGES, CLIFFS, VALLEY = LV['river'], LV['bridges'], LV['cliffs'], LV['valley']
    OUT = os.path.join(ROOT, LV['map']); SEED = 20261011 + int(ARG) * 7919
rng = np.random.default_rng(SEED)
PATH = PATHS[0]
REAR_Y = 458

# ---------- 工具 ----------
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
def dist_poly(pts):
    d = np.full((H, W), 1e9, np.float32)
    if not pts: return d
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        x0, y0, x1, y1 = x0 * S, y0 * S, x1 * S, y1 * S
        dx, dy = x1 - x0, y1 - y0; L = dx * dx + dy * dy or 1
        t = np.clip(((XX - x0) * dx + (YY - y0) * dy) / L, 0, 1)
        d = np.minimum(d, np.hypot(XX - (x0 + t * dx), YY - (y0 + t * dy)))
    return d
def noise(cells_x, cells_y, octaves=3, seed=None):
    r = np.random.default_rng(seed); acc = np.zeros((H, W), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        g = r.random((cells_y * 2 ** o + 1, cells_x * 2 ** o + 1)).astype(np.float32)
        acc += amp * np.asarray(Image.fromarray(g).resize((W, H), Image.BICUBIC)); tot += amp; amp *= 0.5
    return acc / tot   # 約 0..1
def seamless(img):
    """把貼圖做成可無縫重複：與位移半張的自身以中心權重混合。"""
    a = np.asarray(img).astype(np.float32); h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    wy = 1 - np.abs(np.linspace(-1, 1, h))[:, None]; wx = 1 - np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip(np.minimum(wy, wx) * 3, 0, 1)[..., None]
    return a * m + b * (1 - m)
def tile(tex, scale):
    t = Image.fromarray(np.clip(seamless(tex), 0, 255).astype(np.uint8))
    t = t.resize((int(t.width * scale), int(t.height * scale)), Image.LANCZOS)   # 縮小（不放大）
    a = np.asarray(t).astype(np.float32); th, tw = a.shape[:2]
    return np.tile(a, (H // th + 2, W // tw + 2, 1))[7:7 + H, 13:13 + W]
def smooth(x0, x1, v): t = np.clip((v - x0) / (x1 - x0), 0, 1); return t * t * (3 - 2 * t)

# ---------- 地面 ----------
grass = tile(Image.open(GRASS).convert('RGB'), 0.55)
# 色調：更暖、更深的綠（原圖偏亮偏平）
gm = grass.reshape(-1, 3).mean(0)
grass = (grass - gm) * np.array([0.85, 0.85, 0.75]) + np.array([86, 106, 42])   # 對到目標平均色（暖、深綠）
big = noise(3, 5, 3, seed=1)                                   # 大尺度明暗與色偏，避免看出重複
grass *= (0.82 + 0.34 * big)[..., None]
hue = noise(2, 4, 2, seed=2)[..., None]
grass = grass * (1 - 0.25 * hue) + grass * np.array([1.08, 0.98, 0.80]) * 0.25 * hue
# 後方草原（建築區）：較亮、偏黃
meadow = grass * np.array([1.13, 1.12, 1.08]) + np.array([12, 10, 6])
rear_m = smooth(REAR_Y * S - 18, REAR_Y * S + 18, YY + (noise(8, 14, 2, seed=3) - 0.5) * 30)[..., None]
ground = grass * (1 - rear_m) + meadow * rear_m

dirt = tile(Image.open(DIRT).convert('RGB'), 0.5)
dirt = dirt * (0.9 + 0.2 * noise(4, 7, 2, seed=4))[..., None] * np.array([0.98, 0.95, 0.9])
# 後方翻土小田（只放在不會跟建築地塊衝突的位置）
TILLED = [(182, 491, 30, 20)]
for i, (cx, cy, tw, th) in enumerate(TILLED):
    nz = (noise(9, 16, 2, seed=50 + i) - 0.5) * 0.5
    e = np.abs((XX - cx * S) / (tw * S / 2)) ** 4 + np.abs((YY - cy * S) / (th * S / 2)) ** 4 + nz * 0.6   # 圓角矩形小田
    m = smooth(1.0, 0.86, e) * 0.92
    rows = (np.sin((YY - cy * S) * 0.8) > 0.2).astype(np.float32)
    soil = dirt * np.array([0.9, 0.84, 0.76]) * (0.72 + 0.28 * rows)[..., None]
    ground = ground * (1 - m[..., None]) + soil * m[..., None]

# 河流：水面（寬約 30 邏輯像素）＋泥岸；之後在橋的位置蓋木橋
dW = dist_poly(RIVER) if RIVER else np.full((H, W), 1e9, np.float32)
RIV_HALF = 14 * S
if RIVER:
    wn = (noise(16, 28, 2, seed=41) - 0.5) * 8
    bank = 1 - smooth(RIV_HALF + 2, RIV_HALF + 9, dW + wn)
    water = 1 - smooth(RIV_HALF - 3, RIV_HALF + 1, dW + wn)
    mud = dirt * np.array([0.7, 0.62, 0.52])
    ground = ground * (1 - bank[..., None]) + mud * bank[..., None]
    ripple = 0.5 + 0.5 * np.sin(XX * 0.09 + noise(20, 36, 1, seed=42) * 9 + YY * 0.02)
    deep = np.clip(1 - dW / RIV_HALF, 0, 1)
    wcol = np.stack([38 + 20 * ripple - 12 * deep, 92 + 26 * ripple - 18 * deep, 120 + 30 * ripple - 10 * deep], -1)
    ground = ground * (1 - water[..., None]) + wcol * water[..., None]
    foam = np.exp(-((dW - RIV_HALF + 2) / 1.6) ** 2) * water
    ground = ground + (np.array([210, 225, 220]) - ground) * (0.35 * foam)[..., None]

# 敵人道路：噪聲擾動的柔和邊緣、邊緣較暗、中間兩道車轍
dP = np.minimum.reduce([dist_poly([[P[0][0], -20]] + P) for P in PATHS])

en = (noise(14, 25, 2, seed=6) - 0.5) * 9 + (noise(45, 80, 1, seed=7) - 0.5) * 6
HALF = 11.5 * S
road_m = 1 - smooth(HALF - 4, HALF + 3, dP + en)
rim = smooth(HALF - 7, HALF - 1, dP + en) * road_m                # 靠草的邊緣帶
rut = np.exp(-((dP - 4.5 * S) / 2.2) ** 2) * (0.6 + 0.4 * noise(20, 36, 1, seed=8))
pathcol = dirt * (1 - 0.08 * rim)[..., None] * (1 - 0.16 * rut)[..., None]
grass_shade = (1 - 0.14 * smooth(HALF + 6, HALF, dP + en) * (1 - road_m))[..., None]   # 路邊草地微暗
ground = ground * grass_shade
ground = ground * (1 - road_m[..., None]) + pathcol * road_m[..., None]
# 峭壁／山谷：峭壁線附近地面變暗、偏灰（之後再沿線擺大石頭）
if CLIFFS:
    dC = np.minimum.reduce([dist_poly(c) for c in CLIFFS])
    cm = (1 - smooth(3 * S, 11 * S, dC + (noise(10, 18, 2, seed=31) - 0.5) * 10))[..., None]
    rockcol = ground.mean(-1, keepdims=True) * 0.55 + np.array([60, 58, 52]) * 0.45
    ground = ground * (1 - 0.75 * cm) + rockcol * 0.75 * cm
if VALLEY:   # 山谷：左右兩側整片變暗
    vm = smooth(0.62, 1.0, np.abs(XX / W - 0.5) * 2)[..., None]
    ground = ground * (1 - 0.35 * vm)
# 補給道路：較窄、較淡
dR = dist_poly(ROAD) if ROAD else np.full((H, W), 1e9, np.float32)
rn = (noise(14, 25, 2, seed=9) - 0.5) * 4
rm = (1 - smooth(4.5 * S - 3, 4.5 * S + 2, dR + rn))[..., None]
cart = dirt * 0.55 + np.array([222, 198, 150]) * 0.45
cart = cart * (1 - 0.12 * np.exp(-((dR - 2.2 * S) / 1.4) ** 2))[..., None]
ground = ground * (1 - rm) + cart * rm

# ---------- 道具（洋紅去背） ----------
def load_props():
    im = Image.open(PROPS).convert('RGB').filter(ImageFilter.MedianFilter(3))
    a = np.asarray(im).astype(np.int32)
    mag = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    fg = mag < 70
    fg = ndi.binary_opening(fg, iterations=1)
    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=4))
    objs = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        m = (lab[sl] == i) & fg[sl]
        if m.sum() < 1500: continue
        objs.append((sl, m))
    objs.sort(key=lambda o: (round(o[0][0].start / 240), o[0][1].start))
    out = []
    for sl, m in objs:
        rgb = a[sl].copy()
        m = ndi.binary_erosion(m, iterations=1)                       # 去洋紅邊
        mm = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]     # 去溢色
        sp = np.clip(mm + 10, 0, None)
        rgb[..., 0] -= sp; rgb[..., 2] -= sp
        rgba = np.dstack([np.clip(rgb, 0, 255), m * 255]).astype(np.uint8)
        out.append(Image.fromarray(rgba))
    return out
P = load_props()
names = ['pine1', 'pine2', 'pine3', 'oak1', 'oak2', 'bush1', 'bush2', 'boulder1', 'boulder2', 'rocks',
         'platform', 'flowers', 'stump', 'log']
assert len(P) == len(names), f'found {len(P)} props'
PR = dict(zip(names, P))
def scaled(name, h=None, w=None):
    im = PR[name]
    k = (h / im.height) if h else (w / im.width)
    sm = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST)   # 最近鄰：保持像素感
    a = np.asarray(sm).copy(); a[..., 3] = np.where(a[..., 3] > 127, 255, 0)
    return Image.fromarray(a)

# 不可放道具的區域（邏輯座標）
pd = lambda x, y: dP[min(H - 1, max(0, int(y * S))), min(W - 1, max(0, int(x * S)))] / S
rd = lambda x, y: dR[min(H - 1, max(0, int(y * S))), min(W - 1, max(0, int(x * S)))] / S
def blocked(x, y):
    if pd(x, y) < 14 or rd(x, y) < 8: return True
    for px, py in PADS:
        if abs(x - px) < 19 and py - 44 < y < py + 13: return True
    for px, py in PLOTS:
        if abs(x - px) < 26 and abs(y - py) < 26: return True
    if 128 < x < 232 and 362 < y < 474: return True                       # 城堡與駐守士兵
    if DEPOT and abs(x - DEPOT[0]) < 26 and DEPOT[1] - 40 < y < DEPOT[1] + 26: return True
    if RIVER and dW[min(H - 1, max(0, int(y * S))), min(W - 1, max(0, int(x * S)))] / S < 20: return True

    if abs(x - GRANARY[0]) < 30 and GRANARY[1] - 44 < y < GRANARY[1] + 26: return True
    for rx, ry in RAIDS:                                                  # 掠奪者從側邊進入的路線
        if abs(x - rx) < 110 and abs(y - ry) < 22: return True
    if y > REAR_Y and y < 600: return True                                # 後方建築區保持開闊（只放小物見下）
    return False
def bbox_clear(x, y, w, h, rear_ok=False):
    for fy in (0.0, 0.3, 0.6, 0.85, 1.0):
        for fx in (-0.5, -0.25, 0, 0.25, 0.5):
            qx, qy = x + fx * w, y - fy * h
            if qy < -10 or qy > 600 or qx < -20 or qx > 380: continue
            if blocked(qx, qy) and not (rear_ok and qy > REAR_Y and not blocked_rear(qx, qy)): return False
    return True
def blocked_rear(x, y):
    if pd(x, y) < 14 or rd(x, y) < 8: return True
    for px, py in PLOTS:
        if abs(x - px) < 28 and abs(y - py) < 30: return True
    if 128 < x < 232 and 362 < y < 506: return True
    if abs(x - GRANARY[0]) < 32 and GRANARY[1] - 46 < y < GRANARY[1] + 28: return True
    for rx, ry in RAIDS:
        if abs(x - rx) < 110 and abs(y - ry) < 22: return True
    for cx, cy, tw, th in TILLED:
        if abs(x - cx) < tw / 2 + 4 and abs(y - cy) < th / 2 + 4: return True
    return False

placed = []   # (x, y, kind, img, flip)
def edge_w(x, y):
    e = max(0, 1 - min(x, 360 - x) / 55) + max(0, 1 - (y - 30) / 50)
    return min(1, 0.12 + e)
def try_place(kinds, n, attempts, hrange, spacing, wfun=edge_w, rear_ok=False):
    got = 0
    for _ in range(attempts):
        if got >= n: break
        x, y = rng.uniform(-8, 368), rng.uniform(32, 600 if rear_ok else 470)
        if rng.random() > wfun(x, y): continue
        k = kinds[rng.integers(len(kinds))]
        im = scaled(k, h=rng.uniform(*hrange) * S)
        w, h = im.width / S, im.height / S
        if not bbox_clear(x, y, w * 0.8, h * 0.95, rear_ok): continue
        if any(abs(px - x) < spacing * (0.6 + 0.4 * (w / 40)) and abs(py - y) < spacing * 0.7 for px, py, *_ in placed): continue
        placed.append((x, y, k, im, rng.random() < 0.5)); got += 1
# 森林：邊緣密集
try_place(['pine1', 'pine2', 'pine3', 'pine1', 'oak1', 'oak2'], 120, 30000, (30, 42), 12)
# 開闊草地：零星樹木
try_place(['pine2', 'oak1', 'oak2'], 8, 6000, (26, 36), 22, wfun=lambda x, y: 0.5)
try_place(['bush1', 'bush2'], 24, 9000, (11, 15), 16, wfun=lambda x, y: 0.6)
try_place(['boulder1', 'boulder2', 'rocks'], 12, 8000, (10, 14), 18, wfun=lambda x, y: 0.6)
try_place(['flowers', 'flowers', 'stump', 'log'], 26, 9000, (9, 13), 18, wfun=lambda x, y: 0.6)
try_place(['flowers', 'bush1', 'rocks', 'stump'], 7, 8000, (8, 11), 20, wfun=lambda x, y: 0.7, rear_ok=True)

# 峭壁：沿線密集擺放大石頭（避開路、塔位）
for c in CLIFFS:
    (x0, y0), (x1, y1) = c[0], c[-1]; n = int(np.hypot(x1 - x0, y1 - y0) / 7)
    for i in range(n + 1):
        k = i / max(1, n); x, y = x0 + (x1 - x0) * k + rng.uniform(-3, 3), y0 + (y1 - y0) * k + rng.uniform(-3, 3)
        if pd(x, y) < 14 or any(abs(x - px) < 19 and py - 44 < y < py + 13 for px, py in PADS): continue
        im = scaled(['boulder1', 'boulder2', 'rocks'][rng.integers(3)], h=rng.uniform(13, 19) * S)
        placed.append((x, y, 'boulder1', im, rng.random() < 0.5))

# 環境光遮蔽：樹群附近地面變暗
dens = np.zeros((H, W), np.float32)
for x, y, k, im, f in placed:
    if k.startswith(('pine', 'oak')):
        cx, cy, r = int(x * S), int((y - 4) * S), im.width * 0.55
        dens[max(0, int(cy - r)):int(cy + r), max(0, int(cx - r)):int(cx + r)] += 1
dens = ndi.gaussian_filter(dens, 14)
ground *= (1 - 0.5 * np.clip(dens / 1.0, 0, 1))[..., None]

# ---------- 合成 ----------
base = Image.fromarray(np.clip(ground, 0, 255).astype(np.uint8)).convert('RGBA')
# 接觸陰影（先畫在地面）
sh = np.zeros((H, W), np.float32)
def shadow_at(cx, cy, w, k=1.0):
    rx, ry = w * 0.42, w * 0.13
    m = ((XX[int(max(0, cy - ry - 2)):int(cy + ry + 2)] - cx) / rx) ** 2 + ((YY[int(max(0, cy - ry - 2)):int(cy + ry + 2)] - cy) / ry) ** 2
    sh[int(max(0, cy - ry - 2)):int(cy + ry + 2)] = np.maximum(sh[int(max(0, cy - ry - 2)):int(cy + ry + 2)], np.clip(1 - m, 0, 1) * k)
for x, y, k, im, f in placed: shadow_at(x * S + 3, y * S - 1, im.width, 0.6)
PLAT_W = 60
plat = scaled('platform', w=PLAT_W)
for px, py in PADS: shadow_at(px * S + 2, (py + 6) * S, PLAT_W * 1.15, 0.7)
sh = ndi.gaussian_filter(sh, 2.5)
ga = np.asarray(base).astype(np.float32)
ga[..., :3] *= (1 - 0.45 * np.clip(sh, 0, 1))[..., None]
base = Image.fromarray(ga.astype(np.uint8))
# 木橋：在路／補給道路跨河處畫橋面（直向通行；broken = 斷橋，中間缺一段）
if BRIDGES:
    from PIL import ImageDraw
    bd = ImageDraw.Draw(base)
    for bx, by, kind in BRIDGES:
        w2 = 15 if kind != 'road' else 9
        x0, x1 = (bx - w2) * S, (bx + w2) * S; y0, y1 = (by - 24) * S, (by + 24) * S
        for yy in range(int(y0), int(y1), 6):
            if kind == 'broken' and (by - 7) * S < yy < (by + 9) * S: continue
            c = (122 + int(rng.integers(-12, 12)), 86 + int(rng.integers(-10, 10)), 52)
            jag = int(rng.integers(0, 6)) if kind == 'broken' and abs(yy - by * S) < 22 * S else 0
            bd.rectangle([x0 + 2 + jag, yy, x1 - 2 - jag, yy + 4], fill=c + (255,))
            bd.line([x0 + 2 + jag, yy + 5, x1 - 2 - jag, yy + 5], fill=(60, 40, 24, 255), width=1)
        for xx in (x0, x1 - 4):
            for ya, yb in ((y0, (by - 8) * S), ((by + 10) * S, y1)) if kind == 'broken' else ((y0, y1),):
                bd.rectangle([xx, ya, xx + 4, yb], fill=(84, 56, 32, 255))
        for xx in (x0 - 2, x1 - 4):
            for yy in (y0 - 4, y1 - 4):
                bd.rectangle([xx, yy, xx + 6, yy + 8], fill=(70, 46, 26, 255))
# 塔位石台：底邊對齊遊戲原本石台（腳點 = 塔位 y + 7）
for px, py in PADS:
    base.alpha_composite(plat, (int(px * S - plat.width / 2), int((py + 7) * S - plat.height)))
# 道具依 y 排序（遠到近）
for x, y, k, im, f in sorted(placed, key=lambda p: p[1]):
    if f: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    base.alpha_composite(im, (int(x * S - im.width / 2), int(y * S - im.height)))

# ---------- 打光、暗角、移軸 ----------
a = np.asarray(base.convert('RGB')).astype(np.float32)
g = np.clip(1 - (XX / W * 0.45 + YY / H * 0.55), 0, 1)              # 左上較亮
a *= (0.9 + 0.18 * g)[..., None]
a = a * (1 - 0.1 * g[..., None]) + a * np.array([1.08, 1.0, 0.84]) * 0.1 * g[..., None]   # 暖色光
vr = np.hypot((XX - W / 2) / (W / 2), (YY - H / 2) / (H / 2))
a *= (1 - 0.22 * smooth(0.75, 1.42, vr))[..., None]
img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
blur = np.asarray(img.filter(ImageFilter.GaussianBlur(2.6))).astype(np.float32)
band = int(H * 0.1)
tm = np.clip(1 - YY / band, 0, 1) + np.clip((YY - (H - band)) / band, 0, 1)
a = np.asarray(img).astype(np.float32) * (1 - tm[..., None]) + blur * tm[..., None]
fin = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
if OUT.endswith('.jpg'): fin.save(OUT, quality=90, optimize=True, subsampling=0)
else: fin.save(OUT)
print('saved', OUT, (W, H), 'props', len(placed))

# 對位檢查圖：疊上設定的道路中線、塔位、地塊
if os.path.isdir(REVIEW):
    from PIL import ImageDraw
    chk = Image.open(OUT).convert('RGB'); d = ImageDraw.Draw(chk)
    for Q in PATHS: d.line([(x * S, y * S) for x, y in Q], fill=(255, 0, 0), width=2)
    if ROAD: d.line([(x * S, y * S) for x, y in ROAD], fill=(0, 200, 255), width=2)
    for x, y in PADS: d.ellipse([x * S - 4, y * S - 4, x * S + 4, y * S + 4], outline=(255, 255, 0), width=2)
    for x, y in PLOTS: d.rectangle([(x - 20) * S, (y - 20) * S, (x + 20) * S, (y + 20) * S], outline=(255, 255, 255), width=1)
    chk.save(REVIEW + f'map_check_{ARG}.png')
    sheet = Image.new('RGBA', (sum(p.width // 3 + 6 for p in P), max(p.height // 3 for p in P)), (255, 0, 255, 255)); xo = 0
    for p in P: q = p.resize((p.width // 3, p.height // 3)); sheet.alpha_composite(q, (xo, 0)); xo += q.width + 6
    sheet.save(REVIEW + 'props_cut.png')
