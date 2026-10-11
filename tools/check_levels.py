"""關卡幾何檢查：塔位離路、離其他塔位、離補給道路的距離；並輸出示意圖 /workspace/art-review/levels/geo.png"""
import json, os, math
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
t = open(os.path.join(ROOT, 'js', 'levels.js'), encoding='utf-8').read()
L = json.loads(t[t.index('const LEVELS = ') + 15:t.rindex(';')])
def dseg(p, a, b):
    ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1
    k = max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2)); return math.hypot(p[0] - ax - k * dx, p[1] - ay - k * dy)
def dpoly(p, pts): return min(dseg(p, a, b) for a, b in zip(pts, pts[1:]))
def river_y(lv, x):
    r = lv['river']
    for (x0, y0), (x1, y1) in zip(r, r[1:]):
        if x0 <= x <= x1: return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
bad = 0
sheet = Image.new('RGB', (5 * 370, 2 * 650), (30, 30, 30))
for i, lv in enumerate(L):
    errs = []
    for j, p in enumerate(lv['pads']):
        d = min(dpoly(p, P) for P in lv['paths'])
        if d < 30: errs.append(f'pad{j}{p} path {d:.0f}')
        for k, q in enumerate(lv['pads'][:j]):
            if math.dist(p, q) < 44: errs.append(f'pad{j}{p}~pad{k}{q} {math.dist(p, q):.0f}')
        if lv['supply']:
            for s in lv['supply']['spots']:
                dr = dpoly(p, s['road'])
                if dr < 22: errs.append(f"pad{j}{p} road {s['id']} {dr:.0f}")
                if math.dist(p, (s['x'], s['y'])) < 34: errs.append(f"pad{j}{p} post {s['id']}")
        if 132 < p[0] < 228 and p[1] > 366: errs.append(f'pad{j}{p} castle')
        if not (24 <= p[0] <= 336 and 44 <= p[1] <= 410): errs.append(f'pad{j}{p} bounds')
        if lv['river']:
            ry = river_y(lv, p[0])
            if ry is not None and abs(p[1] - ry) < 28: errs.append(f'pad{j}{p} river')
    if lv['supply']:
        for s in lv['supply']['spots']:
            for P in lv['paths']:
                if dpoly((s['x'], s['y']), P) < 22: errs.append(f"post {s['id']} on path")
    print(lv['id'], lv['name'], 'pads', len(lv['pads']), 'OK' if not errs else errs); bad += len(errs)
    im = Image.new('RGB', (360, 640), (70, 110, 50)); d = ImageDraw.Draw(im)
    if lv['river']: d.line([tuple(p) for p in lv['river']], fill=(60, 120, 200), width=28)
    for c in lv['cliffs']: d.line([tuple(p) for p in c], fill=(120, 120, 120), width=12)
    for P in lv['paths']: d.line([tuple(p) for p in P], fill=(170, 130, 80), width=23)
    if lv['supply']:
        for s in lv['supply']['spots']:
            d.line([tuple(p) for p in s['road']], fill=(230, 210, 150) if s['id'] == lv['supply']['default'] else (200, 160, 220), width=6)
            d.ellipse([s['x'] - 7, s['y'] - 7, s['x'] + 7, s['y'] + 7], fill=(255, 200, 0))
    for p in lv['pads']: d.ellipse([p[0] - 12, p[1] - 8, p[0] + 12, p[1] + 8], fill=(150, 150, 160), outline=(255, 255, 0))
    d.rectangle([140, 400, 220, 460], fill=(120, 90, 90)); d.text((5, 5), f"{lv['id']} {lv['name']}", fill=(255, 255, 255))
    sheet.paste(im, ((i % 5) * 370, (i // 5) * 650))
sheet.save('/workspace/art-review/levels/geo.png'); print('issues', bad)
