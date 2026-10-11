const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 3 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8765/index.html'); await p.evaluate(() => localStorage.clear());
  await p.waitForFunction(() => Art.loaded === Art.total); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
  { const bx = await (await p.$('#game')).boundingBox(); await p.mouse.click(bx.x + 60, bx.y + 60); await p.waitForTimeout(300); console.log('music', JSON.stringify(await p.evaluate(() => ({ unlocked: Music.unlocked, day: !Music.el.day.paused })))); }   // 先點一下：量測時背景音樂在播放
  await p.evaluate(() => {
    __game.start('vera'); __game.give(5000, 5000, 300);
    ['archer','barracks','mage','cannon','archer','mage','barracks','archer','cannon','archer','mage','archer'].forEach((t, i) => { buildTower(i, t); upgradeTower(G.towers[G.towers.length-1]); });
    G.night = 3; G.phase = 'dusk'; startNight(); G.speed = 1;
  });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { for (let i = 0; i < 40; i++) { const e = spawnEnemy(['goblin','wolf','shield','bat','raider'][i % 5]); if (!e.d.raider) e.dist = 40 + Math.random() * 500; } });
  const cdp = await ctx.newCDPSession(p);
  const measure = (label) => p.evaluate(() => new Promise(res => {
    let work = 0, n = 0, worst = 0; const oR = window.renderAll, oU = window.update; let fw = 0;
    window.renderAll = c => { const t = performance.now(); oR(c); const w = performance.now() - t; work += w; fw += w; };
    window.update = d => { const t = performance.now(); oU(d); const w = performance.now() - t; work += w; fw += w; };
    const t0 = performance.now(); let last = t0, maxGap = 0;
    (function f(now) { if (now) { maxGap = Math.max(maxGap, now - last); last = now; } worst = Math.max(worst, fw); fw = 0; n++;
      if (performance.now() - t0 < 4000) requestAnimationFrame(f);
      else { window.renderAll = oR; window.update = oU; const el = (performance.now() - t0) / 1000;
        res({ fps: +(n / el).toFixed(1), avgMsPerFrame: +(work / n).toFixed(2), worstMs: +worst.toFixed(2), maxFrameGapMs: +maxGap.toFixed(1), enemies: G.enemies.length, soldiers: G.soldiers.length, projectiles: G.projectiles.length }); } })();
  })).then(r => console.log('PERF', label, JSON.stringify(r)));
  await measure('busy night (no throttle)');
  await p.screenshot({ path: '/workspace/game-proto/screenshots/extra_busy_night.png' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await measure('busy night (CPU x4 throttle ~ mid-range phone)');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
