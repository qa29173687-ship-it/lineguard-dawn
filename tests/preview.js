const { chromium, devices } = require('playwright');
const OUT = '/workspace/game-proto/screenshots/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 3 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await p.goto('http://127.0.0.1:8765/index.html'); await p.evaluate(() => localStorage.clear());
  await p.waitForFunction(() => Art.loaded === Art.total && Light.rimReady); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
  const box = await (await p.$('#game')).boundingBox();
  const clipAt = (x, y, w, h) => ({ x: box.x + (x - w / 2) / 360 * box.width, y: box.y + (y - h / 2) / 640 * box.height, width: w / 360 * box.width, height: h / 640 * box.height });
  for (const hid of ['erin', 'lena', 'vera']) {
    await p.evaluate(h => { __game.start(h); G.fx = []; moveHero(205, 245); }, hid);
    await p.waitForTimeout(2200);
    const pos = await p.evaluate(() => [G.hero.x, G.hero.y]);
    await p.screenshot({ path: `${OUT}hero_preview_day_${hid}.png`, clip: clipAt(pos[0], pos[1] - 14, 80, 64) });
  }
  // 夜晚施放技能
  const target = { erin: [110, 205], lena: [100, 192], vera: [120, 200] };
  for (const hid of ['erin', 'lena', 'vera']) {
    await p.evaluate(h => { __game.start(h); __game.give(2000, 2000, 200);
      buildTower(2, 'archer'); buildTower(4, 'mage'); buildTower(8, 'barracks'); buildTower(7, 'cannon');
      G.hero.x = G.hero.hx = 196; G.hero.y = G.hero.hy = 236; G.fx = [];
      G.phase = 'dusk'; startNight(); G.fx = []; G.speed = 1;
      G.spawnList = [{ t: 9999, type: 'goblin' }];
      ['goblin','wolf','shield','goblin','bat','goblin','wolf','shield'].forEach((t, i) => { const e = spawnEnemy(t); e.dist = 320 + i * 18; const q = pathAt(G.path, e.dist); e.x = q.x + e.ox; e.y = q.y + e.oy; });
      G.time = 0; }, hid);
    await p.waitForTimeout(600);
    await p.evaluate(() => { G.speed = 1; });
    await p.evaluate(([h, t]) => { const es = G.enemies.filter(e => e.dist > 300 && e.dist < 470); const x = es.reduce((s, e) => s + e.x, 0) / es.length, y = es.reduce((s, e) => s + e.y, 0) / es.length; castSkill(x, y); }, [hid, target[hid]]);
    await p.waitForTimeout(hid === 'vera' ? 900 : hid === 'lena' ? 250 : 700);
    await p.evaluate(() => { G.fx = G.fx.filter(f => f.kind !== 'text'); }); await p.waitForTimeout(40);
    await p.screenshot({ path: `${OUT}hero_preview_night_${hid}.png`, clip: clipAt(190, 215, 220, 170) });
  }
  // 夜晚全畫面一張
  await p.screenshot({ path: `${OUT}hero_preview_night_full.png` });
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
