const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 400, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8765/index.html?debug=1'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  await p.evaluate(() => { __game.start('vera'); __game.place(0,'lumber'); __game.place(1,'farm'); __game.place(2,'house'); __game.build(5,'archer'); __game.speed(8); });
  await p.waitForFunction(() => G.phase === 'dusk', null, { timeout: 30000 });
  console.log('dusk res', JSON.stringify(await p.evaluate(() => G.res)));
  await p.evaluate(() => { __game.build(6,'archer'); __game.build(3,'barracks'); __game.skip(); });
  let starvedSeen = false, raidSeen = false;
  for (let i = 0; i < 400; i++) {
    const s = await p.evaluate(() => ({ ph: G.phase, scr: G.screen, starving: G.starving, raid: G.enemies && G.enemies.some(e => e.type === 'raider'), hp: G.castleHp, n: G.night, stolen: G.stats.stolen }));
    if (s.starving && s.ph === 'night') starvedSeen = true; if (s.raid) raidSeen = true;
    if (s.ph === 'dawn') { console.log('dawn', JSON.stringify(s)); await p.evaluate(() => { __game.dawn(0); G.res.front = 0; G.res.food = 0; G.buildings.forEach(b => b.type==='farm' && demolish(b)); __game.skip(); __game.skip(); }); }
    if (s.scr === 'end') { console.log('end', JSON.stringify(s), JSON.stringify(await p.evaluate(() => [G.end, G.save]))); break; }
    await p.waitForTimeout(150);
  }
  console.log('starvedSeen', starvedSeen, 'raidSeen', raidSeen, 'errors', errs);
  await b.close();
})();
