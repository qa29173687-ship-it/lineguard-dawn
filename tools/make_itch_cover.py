"""itch.io 封面 630×500：三位英雄插畫斜切拼貼 + 標題。輸出 /workspace/itch/cover.png
執行：/workspace/.artenv/bin/python tools/make_itch_cover.py"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'assets') + '/'
W, H = 630, 500
FB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
cv = Image.new('RGB', (W, H), (20, 18, 42))
# (檔名, 裁切中心 x 比例, 上緣 y 比例, 縮放後寬)
heroes = [('lena_illust.jpg', 0.47, 0.02), ('erin_illust.jpg', 0.5, 0.02), ('vera_illust.jpg', 0.5, 0.03)]
slant = 46
for i, (f, cxr, tyr) in enumerate(heroes):
    im = Image.open(A + f).convert('RGB')
    sc = 470 / im.height * 1.25; im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    pw = W // 3 + slant + 4
    x0 = int(im.width * cxr - pw / 2); y0 = int(im.height * tyr)
    crop = im.crop((x0, y0, x0 + pw, y0 + H))
    mask = Image.new('L', (pw, H), 0); d = ImageDraw.Draw(mask)
    left = i * (W // 3) - slant // 2
    d.polygon([(slant if i else 0, 0), (pw, 0), (pw - slant if i < 2 else pw, H), (0, H)], fill=255)
    cv.paste(crop, (left, 0), mask)
# 分隔線（金色斜線）
d = ImageDraw.Draw(cv)
for i in (1, 2):
    x = i * (W // 3) - slant // 2
    d.line([(x + slant, 0), (x, H)], fill=(255, 209, 102), width=3)
# 下方漸層
grad = Image.new('L', (1, H)); [grad.putpixel((0, y), int(max(0, min(255, (y - H * 0.42) / (H * 0.4) * 245)))) for y in range(H)]
grad = grad.resize((W, H)); dark = Image.new('RGB', (W, H), (16, 12, 34)); cv = Image.composite(dark, cv, grad)
d = ImageDraw.Draw(cv)
def stroke_text(xy, s, size, fill, sw, anchor='mm'):
    f = ImageFont.truetype(FB, size, index=1)   # index 1 = TC
    # 外光
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    gd.text(xy, s, font=f, fill=(255, 170, 60, 160), anchor=anchor, stroke_width=sw + 6, stroke_fill=(255, 150, 40, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(8)); cv.paste(glow, (0, 0), glow)
    ImageDraw.Draw(cv).text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=sw, stroke_fill=(40, 18, 10))
stroke_text((W // 2, 372), '糧線守衛', 84, (255, 214, 110), 5)
stroke_text((W // 2, 438), '放逐騎士的黎明', 30, (255, 240, 210), 3)
f = ImageFont.truetype(FB, 15, index=1)
ImageDraw.Draw(cv).text((W // 2, 476), '塔防 × 村莊經營 × 英雄養成　｜　直式手機一指操作', font=f, fill=(200, 190, 230), anchor='mm')
# 外框
ImageDraw.Draw(cv).rectangle([1, 1, W - 2, H - 2], outline=(255, 209, 102), width=2)
os.makedirs('/workspace/itch', exist_ok=True)
cv.save('/workspace/itch/cover.png', optimize=True); print('ok', cv.size, os.path.getsize('/workspace/itch/cover.png'))
