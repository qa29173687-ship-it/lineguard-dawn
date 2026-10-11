const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8765/index.html'); await p.evaluate(() => localStorage.clear());
  await p.waitForFunction(() => Art.loaded === Art.total && R.mapImg); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
  const box = await (await p.$('#game')).boundingBox();
  const clip = (x, y, w, h) => ({ x: box.x + x / 360 * box.width, y: box.y + y / 640 * box.height, width: w / 360 * box.width, height: h / 640 * box.height });
  // v11：世界座標（v10 版面 × WS）的區域 → 先把鏡頭移過去，再換成畫面座標
  const wclip = async (x, y, w, h) => { const r = await p.evaluate(([x, y, w, h]) => { const k = CFG.WS; Cam.set(Cam.posFor((x + w / 2) * k, (y + h / 2) * k, 1)); const [a, b] = Cam.w2s(x * k, y * k); return [a, b, w * k, h * k]; }, [x, y, w, h]); await p.waitForTimeout(150); return clip(Math.max(0, r[0]), Math.max(0, r[1]), Math.min(360, r[2]), Math.min(640, r[3])); };
  await p.evaluate(() => { __game.start('erin'); __game.give(3000, 3000, 300);
    buildTower(2, 'archer'); buildTower(3, 'mage'); buildTower(4, 'cannon'); buildTower(9, 'barracks'); G.towers[1].lvl = 3; G.towers[2].lvl = 2;
    __game.place(3, 'farm'); __game.place(4, 'house'); __game.place(9, 'lumber'); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '/workspace/art-review/map/align_towers.png', clip: await wclip(80, 100, 200, 80) });
  await p.screenshot({ path: '/workspace/art-review/map/align_rear.png', clip: await wclip(0, 440, 360, 140) });
  await p.evaluate(() => { __game.skip(); __game.skip(); __game.speed(3); });
  for (let i = 0; i < 40; i++) { const st = await p.evaluate(() => [G.phase, G.enemies.length, G.speed, G.screen]); if (i % 5 == 0) console.log(st); if (st[1] >= 4) break; await p.waitForTimeout(500); } await p.evaluate(() => __game.speed(0.0001));
  await p.screenshot({ path: '/workspace/art-review/map/align_enemies.png', clip: await wclip(0, 40, 360, 400) });
  const off = await p.evaluate(() => {
    // 檢查每個敵人是否站在烘焙道路上（像素顏色偏土色）
    return G.enemies.filter(e => !e.d.flying).map(e => Math.round(e.ox || 0) + ',' + Math.round(e.oy || 0));
  });
  console.log('enemy offsets', off.join(' '));
  await b.close();
})();
