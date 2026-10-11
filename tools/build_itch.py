"""itch.io HTML5 上傳包：/workspace/game-proto-itch.zip（index.html 在 zip 根目錄、只含可玩檔案）＋ 版本完整包（VERSION）。
檢查：檔案數 < 1000、單檔 < 200MB、所有程式／HTML 參照的 assets 路徑存在且大小寫正確、沒有絕對路徑／localhost 網址。
執行：/workspace/.artenv/bin/python tools/build_itch.py"""
import os, re, json, zipfile, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
files = ['index.html'] + [os.path.join(r, f) for d in ('js', 'assets') for r, _, fs in os.walk(d) for f in sorted(fs)]
files = [f.replace(os.sep, '/') for f in files if not f.endswith(('.DS_Store', 'Thumbs.db'))]
code = {f: open(f, encoding='utf-8').read() for f in files if f.endswith(('.js', '.html'))}
errs = []
# 1) 沒有絕對網址／根目錄路徑
for f, t in code.items():
    for m in re.finditer(r'''(?:src|href)\s*=\s*["'](/|https?:|file:)|["'`](?:https?://(?:localhost|127\.0\.0\.1)|file:///|/workspace/|/home/)''', t):
        errs.append(f'{f}: absolute/localhost reference near "{t[max(0, m.start() - 30):m.end() + 30]}"')
# 2) 參照的 assets 路徑（字面字串；含 ${} 的樣板展開成既有檔名比對）
have = set(files)
for f, t in code.items():
    for m in re.finditer(r'''["'`](assets/[^"'`]+)["'`]''', t):
        p = m.group(1)
        if '${' in p:
            if p.count('${') != p.count('}'): p = p[:p.rindex('${')] + '${x}'   # 樣板裡有引號（三元運算）→ 只比對前段
            rx = '^' + re.sub(r'\\\$\\\{[^}]*\\\}', '[^/]+', re.escape(p)) + ('$' if not p.endswith('${x}') else '')
            if not any(re.match(rx, h) for h in have): errs.append(f'{f}: template {p} matches no file')
        elif p not in have:
            lower = {h.lower(): h for h in have}
            errs.append(f'{f}: missing {p}' + (f' (case mismatch: {lower[p.lower()]})' if p.lower() in lower else ''))
# 美術清單
t = code['js/art_manifest.js']; man = json.loads(t[t.index('{'):t.rindex('}') + 1])
for k, m in man.items():
    if m['src'] not in have: errs.append(f'art_manifest {k}: missing {m["src"]}')
# 3) 數量／大小
big = [f for f in files if os.path.getsize(f) > 200e6]
if len(files) >= 1000: errs.append(f'{len(files)} files (itch limit 1000)')
if big: errs.append(f'files over 200MB: {big}')
if errs:
    print('\n'.join(errs)); sys.exit(1)

def build(out, prefix):
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files: z.write(f, prefix + f)
        if prefix: z.write('README.md', prefix + 'README.md')
    z = zipfile.ZipFile(out); assert z.testzip() is None
    return len(z.namelist()), os.path.getsize(out)
n, sz = build('/workspace/game-proto-itch.zip', '')
print(f'itch zip: {n} files, {sz / 1e6:.1f} MB, raw {sum(os.path.getsize(f) for f in files) / 1e6:.1f} MB, index.html at root')
VERSION = sys.argv[1] if len(sys.argv) > 1 else "v11"
n, sz = build(f"/workspace/game-proto-{VERSION}.zip", "game-proto/")
print(f"{VERSION} zip: {n} files, {sz / 1e6:.1f} MB")
