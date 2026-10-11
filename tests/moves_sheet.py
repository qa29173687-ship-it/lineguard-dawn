import json
from PIL import Image, ImageDraw
OUT = '/workspace/game-proto/screenshots/'
scenes = json.load(open('/tmp/moves/scenes.json'))
gif = []
for name, files in scenes:
    ims = [Image.open(f).convert('RGB') for f in files]
    h = 200; ims = [i.resize((round(i.width * h / i.height), h), Image.NEAREST) for i in ims]
    sheet = Image.new('RGB', (sum(i.width + 4 for i in ims), h + 20), (20, 20, 30)); x = 0
    for i in ims: sheet.paste(i, (x, 20)); x += i.width + 4
    ImageDraw.Draw(sheet).text((4, 4), name, fill=(255, 255, 255))
    sheet.save(OUT + f'moves_{name}.png')
    for i in ims:
        c = Image.new('RGB', (320, 240), (20, 20, 30)); j = i.copy(); j.thumbnail((320, 220), Image.NEAREST)
        c.paste(j, ((320 - j.width) // 2, 20)); ImageDraw.Draw(c).text((4, 4), name, fill=(255, 255, 255)); gif.append(c)
gif[0].save(OUT + 'moves.gif', save_all=True, append_images=gif[1:], duration=110, loop=0)
print('sheets', len(scenes), 'gif frames', len(gif))
