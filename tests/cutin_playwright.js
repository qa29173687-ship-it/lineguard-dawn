// 技能演出截圖（停留中段）＋ 演出期間 FPS
const { chromium, devices } = require('playwright');
const OUT = '/workspace/game-proto/screenshots/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 12'] }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await p.goto(process.env.URL || 'http://127.0.0.1:8765/index.html'); await p.evaluate(() => localStorage.clear());
  await p.waitForFunction(() => Art.loaded === Art.total && CutIn.ready.erin && CutIn.ready.lena && CutIn.ready.vera); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
  const box = await (await p.$('#game')).boundingBox();
  const res = {};
  for (const hid of ['erin', 'lena', 'vera']) {
    await p.evaluate(h => { __game.start(h); G.fx = []; __game.skip(); __game.skip(); }, hid);   // 夜晚
    await p.waitForTimeout(2500);
    // 透過 UI：點技能鈕進入瞄準 → 點地圖
    const t0 = await p.evaluate(() => G.time);
    await p.evaluate(() => { G.targeting = true; });
    await p.mouse.click(box.x + 200 / 360 * box.width, box.y + 300 / 640 * box.height);
    await p.waitForFunction(() => CutIn.active && CutIn.active.t > 0.5);
    await p.screenshot({ path: `${OUT}cutin_${hid}.png` });
    await p.waitForFunction(() => !CutIn.active);
    res[hid] = await p.evaluate(t0 => ({ fired: G.hero.cd > 0, gameTimeDuringCutin: +(G.time - t0).toFixed(3), zones: G.zones.map(z => z.kind), charge: !!G.hero.charge }), t0);
  }
  // 略過
  await p.evaluate(() => { G.hero.cd = 0; G.targeting = true; });
  await p.mouse.click(box.x + 200 / 360 * box.width, box.y + 300 / 640 * box.height);
  await p.waitForTimeout(150);
  await p.mouse.click(box.x + 180 / 360 * box.width, box.y + 400 / 640 * box.height);
  const skipT = Date.now(); await p.waitForFunction(() => !CutIn.active); res.skipMs = Date.now() - skipT;
  // FPS：演出期間 vs 一般（同一個忙碌夜晚），正常與 4 倍 CPU 降速
  const cdp = await ctx.newCDPSession(p);
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const r = await p.evaluate(async () => {
      for (let i = 0; i < 25; i++) spawnEnemy(['goblin', 'wolf', 'shield'][i % 3]);
      const count = ms => new Promise(res => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < ms) requestAnimationFrame(f); else res(n * 1000 / (performance.now() - s)); }; requestAnimationFrame(f); });
      const normal = await count(1000);
      const fps = [];
      for (let k = 0; k < 3; k++) { G.hero.cd = 0; CutIn.request(G.hero, () => castSkill(200, 300)); fps.push(await count(1050)); await new Promise(r => setTimeout(r, 300)); }
      return { normal: +normal.toFixed(1), cutin: fps.map(v => +v.toFixed(1)), enemies: G.enemies.length };
    });
    res['fps_x' + rate] = r;
  }
  console.log(JSON.stringify(res)); console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
