# 英雄日常插畫：/workspace/daily-art/*.jpg → assets/daily/{id}.webp（1024×576）＋ {id}_t.webp（縮圖 200×113）
import glob, os
from PIL import Image
SRC = '/workspace/daily-art'; OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'daily')
os.makedirs(OUT, exist_ok=True)
tot = 0
for f in sorted(glob.glob(SRC + '/*_[0-9][0-9]_*.jpg')):
    k = os.path.basename(f)[:-4]
    im = Image.open(f).convert('RGB')
    im.resize((1024, 576), Image.LANCZOS).save(f'{OUT}/{k}.webp', 'WEBP', quality=78, method=6)
    im.resize((200, 113), Image.LANCZOS).save(f'{OUT}/{k}_t.webp', 'WEBP', quality=72, method=6)
    tot += os.path.getsize(f'{OUT}/{k}.webp') + os.path.getsize(f'{OUT}/{k}_t.webp')
print('files', len(os.listdir(OUT)), 'total KB', tot // 1024)
# 圖書館縮圖：基本立繪（直式，取上半部）與進化插畫
ASSETS = os.path.join(os.path.dirname(__file__), '..', 'assets')
for h in ['erin', 'lena', 'vera']:
    for src, dst in [(f'{h}_illust.jpg', f'{h}_base_t.webp'), (f'{h}_evo_panel.jpg', f'{h}_evo_t.webp')]:
        im = Image.open(os.path.join(ASSETS, src)).convert('RGB')
        w, hh = im.size; tw = w; th = round(w * 113 / 200)
        if th > hh: th = hh; tw = round(hh * 200 / 113)
        top = 0 if 'base' in dst else (hh - th) // 2
        im.crop(((w - tw) // 2, top, (w - tw) // 2 + tw, top + th)).resize((200, 113), Image.LANCZOS).save(os.path.join(OUT, dst), 'WEBP', quality=72, method=6)
print('library thumbs ok')
