"""第 1 階段：從防禦塔圖（第 5、6 欄 = 分支塔）裁出 8 種分支塔，並裁出首領登場用的大圖。
結果併入 js/art_manifest.js（不重跑整個 extract_art.py）。
執行：/workspace/.artenv/bin/python tools/extract_branches.py"""
import json, re, os
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'extract_art.py'), encoding='utf-8').read()
exec(src[:src.index('manifest = {}')])          # 共用 analyze / pick / cut 與路徑常數

MF = '/workspace/game-proto/js/art_manifest.js'
txt = open(MF, encoding='utf-8').read()
manifest = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])

im, a, fg, lab, bg = analyze(TOWERS, T=14, shadowT=0)
tc = [90, 255, 410, 575, 745, 910]; tr = [70, 212, 350, 485]
BR = [('ranger', 'musket'), ('templar', 'berserker'), ('arcane', 'necro'), ('catapult', 'tesla')]
review = []
for r, pair in enumerate(BR):
    # 與該列第 3 級同一縮放基準（第 3 級高 84 存檔像素），分支塔稍大一點（最高 92）
    m3, b3 = pick(lab, fg, (tc[3], tr[r]))
    for c, k in zip([4, 5], pair):
        m, box = pick(lab, fg, (tc[c], tr[r]))
        # 相鄰兩列的塔在膨脹後可能連在一起：只保留本格範圍
        bounds = [0, 141, 281, 417, 576]
        yy0, yy1 = int(bounds[r] * D), int(bounds[r + 1] * D); xx0 = int((tc[c] - 82) * D); xx1 = int((tc[c] + 82) * D)
        m = m.copy(); m[:yy0] = False; m[yy1:] = False; m[:, :xx0] = False; m[:, xx1:] = False
        ys, xs = np.nonzero(m); box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        h = box[3] - box[1]
        sc = min(92 / h, 84 / (b3[3] - b3[1]) * 1.08)
        key = 'tower_' + k
        manifest[key] = cut(im, m, box, sc, key, foot=False); review.append(key)
        print(key, manifest[key]['w'], manifest[key]['h'])

# 首領（格魯姆）：深灰狼與深灰背景太接近，色差去背會吃掉狼毛 → 改用 rembg（isnet-general-use）去背
# 產生：boss_big.png（登場演出用，平滑縮放約 300 px 高）＋ 重新產生遊戲內 boss.png（90 存檔像素高，硬邊 alpha）
from rembg import remove, new_session
e = Image.open(ENEMIES).convert('RGB').crop((850, 250, 1250, 640))
o = np.asarray(remove(e, session=new_session('isnet-general-use'))).copy()
al = o[..., 3].astype(np.float32) / 255
al = np.clip((al - 0.15) / 0.7, 0, 1)
o[..., 3] = (al * 255).astype(np.uint8)
ys, xs = np.nonzero(o[..., 3] > 20); o = o[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
cut_img = Image.fromarray(o, 'RGBA')
big = cut_img.resize((round(cut_img.width * 300 / cut_img.height), 300), Image.LANCZOS)
big.save(OUT + 'boss_big.png', optimize=True)
manifest['boss_big'] = {'src': 'assets/boss_big.png', 'w': big.width, 'h': big.height, 'ax': big.width / 2, 'ay': big.height}
sm = cut_img.resize((round(cut_img.width * 90 / cut_img.height), 90), Image.LANCZOS)
sa = np.asarray(sm).copy(); sa[..., 3] = np.where(sa[..., 3] > 110, 255, 0); sm = Image.fromarray(sa, 'RGBA'); sm.save(OUT + 'boss.png')
ma = sa[..., 3] > 0; rows = np.nonzero(ma.any(1))[0]; bot = rows.max()
band = ma[max(0, bot - 10):bot + 1]
manifest['boss'] = {'src': 'assets/boss.png', 'w': sm.width, 'h': sm.height, 'ax': round(float(np.nonzero(band)[1].mean()), 1), 'ay': int(bot + 1)}
print('boss', manifest['boss'], 'boss_big', big.size)

with open(MF, 'w', encoding='utf-8') as f:
    f.write(txt[:txt.index('{')] + json.dumps(manifest, ensure_ascii=False, indent=1) + txt[txt.rindex('}') + 1:])

tiles = [Image.open(OUT + k + '.png') for k in review]
Z = 3; cw = max(t.width for t in tiles) * Z + 8; ch = max(t.height for t in tiles) * Z + 8
sheet = Image.new('RGBA', (cw * 4, ch * 2), (200, 200, 200, 255))
for i, t in enumerate(tiles):
    sheet.alpha_composite(t.resize((t.width * Z, t.height * Z), Image.NEAREST), ((i % 4) * cw + 4, (i // 4) * ch + 4))
sheet.save(REV + 'branches_review.png')
