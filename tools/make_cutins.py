"""技能演出用全身去背圖：assets/{id}_illust.jpg → assets/{id}_cutin.webp（＋ .png 備援），最高 900 像素。
去背：rembg（isnet-anime；薇拉用 isnet-general-use 去掉地板／書堆，法杖頂端再補回 isnet-anime 的結果）
清理：只留大的主體區塊、邊緣顏色往內取（去掉背景色光暈）。
執行：/workspace/.artenv/bin/python tools/make_cutins.py   （需要 pip install "rembg[cpu]"）"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from rembg import remove, new_session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets')
REV = '/workspace/art-review/cut/'
MAX_H = 900
sess = {}
def cut(img, model):
    if model not in sess: sess[model] = new_session(model)
    return np.asarray(remove(img, session=sess[model])).astype(np.float32)[..., 3] / 255

def clean(rgb, al):
    # 1) 只保留主要區塊（面積 ≥ 最大區塊的 4%），其他碎片（地上的卷軸、塵土）去掉
    lab, n = ndi.label(al > 0.5)
    if n:
        s = ndi.sum(np.ones_like(al), lab, range(1, n + 1)); keep = np.isin(lab, [i + 1 for i, v in enumerate(s) if v >= s.max() * 0.04])
        al = al * ndi.binary_dilation(keep, iterations=4)
    al[al < 0.04] = 0
    # 2) 去光暈：半透明邊緣的顏色改用附近不透明像素的顏色（背景色不會滲進來）
    solid = (al > 0.95).astype(np.float32)
    out = rgb.copy()
    num = np.stack([ndi.gaussian_filter(rgb[..., c] * solid, 3) for c in range(3)], -1); den = ndi.gaussian_filter(solid, 3)[..., None]
    bleed = num / np.maximum(den, 1e-4)
    edge = (al > 0) & (al <= 0.95) & (den[..., 0] > 0.02)
    k = ((0.95 - np.clip(al, 0, 0.95)) / 0.95)[..., None]       # 越透明越用內側顏色
    out[edge] = (rgb * (1 - k) + bleed * k)[edge]
    return out, al

for hid in ['erin', 'lena', 'vera']:
    img = Image.open(os.path.join(A, f'{hid}_illust.jpg')).convert('RGB')
    rgb = np.asarray(img).astype(np.float32)
    H, W = rgb.shape[:2]
    if hid == 'vera':
        al = cut(img, 'isnet-general-use')
        an = cut(img, 'isnet-anime')
        yy, xx = np.mgrid[0:H, 0:W]
        staff = (xx > W * 0.78) & (yy < H * 0.62)                     # 右上方法杖（含紫水晶）
        al = np.maximum(al, an * staff)
    else:
        al = cut(img, 'isnet-anime')
    rgb, al = clean(rgb, al)
    ys, xs = np.nonzero(al > 0.02)
    x0, x1, y0, y1 = max(0, xs.min() - 4), min(W, xs.max() + 5), max(0, ys.min() - 4), min(H, ys.max() + 5)
    rgba = np.dstack([rgb, al * 255]).clip(0, 255).astype(np.uint8)[y0:y1, x0:x1]
    im = Image.fromarray(rgba, 'RGBA')
    if im.height > MAX_H: im = im.resize((round(im.width * MAX_H / im.height), MAX_H), Image.LANCZOS)
    im.save(os.path.join(A, f'{hid}_cutin.webp'), quality=86, method=6)
    im.save(os.path.join(A, f'{hid}_cutin.png'), optimize=True)
    print(hid, im.size, os.path.getsize(os.path.join(A, f'{hid}_cutin.webp')) // 1024, 'KB webp', os.path.getsize(os.path.join(A, f'{hid}_cutin.png')) // 1024, 'KB png')
    if os.path.isdir(REV):
        for name, bg in (('mag', (255, 0, 255)), ('dark', (20, 20, 40)), ('white', (250, 250, 250))):
            b = Image.new('RGBA', im.size, bg + (255,)); b.alpha_composite(im); b.convert('RGB').save(REV + f'final_{hid}_{name}.jpg', quality=90)
