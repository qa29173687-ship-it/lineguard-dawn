"""產生地圖版面參考圖 tools/layout_guide.png（給 AI 生成整張地圖背景用）。
尺寸 720×1280 = 遊戲邏輯畫布 360×640 的 2 倍（9:16）。只有平塗色塊，沒有任何圖示/文字。
座標全部讀自 js/config.js 的同一組數值（此處手動同步）。"""
from PIL import Image, ImageDraw
S = 2
W, H = 360 * S, 640 * S
PATH = [[180,40],[180,90],[60,90],[60,190],[290,190],[290,290],[110,290],[110,370],[180,370],[180,412]]
ROAD = [[334,548],[342,548],[342,240]]
TOWER_SPOTS = [[120,62],[240,66],[110,146],[180,146],[245,146],[150,246],[230,246],[60,252],[170,336],[245,336],[60,348],[250,404]]
CASTLE = (180, 432); DEPOT = (342, 236); GRANARY = (318, 556)
GRASS, REAR, PATHC, ROADC, PAD, KEEP = (86,150,56), (150,200,110), (122,84,44), (214,188,138), (128,128,128), (90,90,105)
im = Image.new('RGB', (W, H), GRASS); d = ImageDraw.Draw(im)
d.rectangle([0, 458 * S, W, H], fill=REAR)                       # 後方建築地塊區
def poly(pts, w, col):
    p = [(x * S, y * S) for x, y in pts]
    d.line(p, fill=col, width=w * S)
    for x, y in p: d.ellipse([x - w * S / 2, y - w * S / 2, x + w * S / 2, y + w * S / 2], fill=col)
poly([[180, 0]] + PATH, 24, PATHC)                               # 敵人道路（從畫面頂端進入，終點城堡）
poly(ROAD, 10, ROADC)                                            # 補給道路（糧倉→補給站）
for x, y in TOWER_SPOTS: r = 13 * S; d.ellipse([x*S-r, y*S-r*0.75, x*S+r, y*S+r*0.75], fill=PAD)  # 塔位
def box(c, w, h): d.rectangle([(c[0]-w/2)*S, (c[1]-h)*S, (c[0]+w/2)*S, (c[1]+4)*S], fill=KEEP)
box(CASTLE, 64, 60); box(DEPOT, 36, 30); box(GRANARY, 40, 32)   # 城堡／補給站／糧倉位置
im.save('/workspace/game-proto/tools/layout_guide.png'); print(im.size)
