const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 3 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(process.env.URL || 'http://127.0.0.1:8765/index.html'); await p.evaluate(() => localStorage.clear());
  await p.waitForFunction(() => Art.loaded === Art.total);
  if (process.env.DMGNUM === '0') await p.evaluate(() => { window.__noDmg = 1; });
  { const bx = await (await p.$('#game')).boundingBox(); await p.mouse.click(bx.x + 300, bx.y + 300); await p.waitForTimeout(1500); }   // 解鎖音訊：量測包含音效
  await p.evaluate(() => {
    if (window.__noDmg) setSetting('dmgNum', false);
    __game.start('vera', null, 'east', 4); G.lv = Object.assign({}, G.lv, { branches: true, towers: ['archer', 'barracks', 'mage', 'cannon'] }); __game.give(5000, 5000, 300);   // 第 4 關有 12 個塔位；量測時開放全部塔種與分支
    ['archer','barracks','mage','cannon','archer','mage','barracks','archer','cannon','archer','mage','archer'].forEach((t, i) => { buildTower(i, t); upgradeTower(G.towers[G.towers.length-1]); });
    // Phase 1：Lv3 塔分支（含亡靈骷髏、特斯拉連鎖、投石、毒箭）
    G.res.wood = G.res.stone = 9000;
    [[0,'ranger'],[1,'templar'],[2,'necro'],[3,'catapult'],[4,'musket'],[5,'arcane'],[6,'berserker'],[8,'tesla']].forEach(([i, br]) => { const t = towerAt(i); if (t) { upgradeTower(t); branchTower(t, br); } });
    G.night = 3; G.phase = 'dusk'; startNight(); G.speed = 1; useBeacon();
  });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { for (let i = 0; i < 40; i++) { const e = spawnEnemy(['goblin','wolf','shield','bat','raider'][i % 5]); if (!e.d.raider) e.dist = (40 + Math.random() * 500) * (CFG.WS || 1); } Boss.skip && Boss.skip(); spawnEnemy('boss'); Boss.skip && Boss.skip(); });
  await p.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(p);
  const measure = (label) => p.evaluate(() => new Promise(res => {
    let work = 0, n = 0, worst = 0; const oR = window.renderAll, oU = window.update; let fw = 0;
    window.renderAll = c => { const t = performance.now(); oR(c); const w = performance.now() - t; work += w; fw += w; };
    window.update = d => { const t = performance.now(); oU(d); const w = performance.now() - t; work += w; fw += w; };
    const t0 = performance.now(); let last = t0, maxGap = 0;
    (function f(now) { if (now) { maxGap = Math.max(maxGap, now - last); last = now; } worst = Math.max(worst, fw); fw = 0; n++;
      if (performance.now() - t0 < 4000) requestAnimationFrame(f);
      else { window.renderAll = oR; window.update = oU; const el = (performance.now() - t0) / 1000;
        res({ fps: +(n / el).toFixed(1), avgMsPerFrame: +(work / n).toFixed(2), worstMs: +worst.toFixed(2), maxFrameGapMs: +maxGap.toFixed(1), enemies: G.enemies.length, soldiers: G.soldiers.length, branched: G.towers.filter(t => t.br).length, boss: !!G.boss, sfxVoices: SFX.voices.length, skeletons: G.soldiers.filter(s => s.skeleton).length, projectiles: G.projectiles.length }); } })();
  })).then(r => console.log('PERF', label, JSON.stringify(r)));
  await measure('busy night (no throttle)');
  await p.screenshot({ path: '/workspace/game-proto/screenshots/extra_busy_night.png' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await measure('busy night (CPU x4 throttle ~ mid-range phone)');
  // v11：鏡頭縮到最小（整張地圖都在畫面上）、持續拖曳平移（背景快取不重建）、雙指縮放中（背景直接縮放繪製）
  const hasCam = await p.evaluate(() => typeof Cam !== 'undefined');
  if (hasCam) {
    await p.evaluate(() => Cam.reset(true)); await measure('busy night, zoomed out (CPU x4)');
    await p.evaluate(() => { Cam.set(Cam.posFor(CFG.WW / 2, CFG.WH / 2, 1)); window.__panI = setInterval(() => { const t = performance.now() / 1000; Cam.pan(Math.sin(t * 2) * 6, Math.cos(t * 1.3) * 8); }, 16); });
    await measure('busy night, panning (CPU x4)');
    await p.evaluate(() => { clearInterval(window.__panI); window.__panI = setInterval(() => { const t = performance.now() / 1000; Cam.zoomAt(180, 310, 1.35 + 0.6 * Math.sin(t * 2)); }, 16); });
    await measure('busy night, pinch-zooming (CPU x4)');
    await p.evaluate(() => clearInterval(window.__panI));
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
