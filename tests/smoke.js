const { chromium, devices } = require('playwright');
const OUT = '/workspace/game-proto/screenshots/';
async function run(b, label, mapCfg, url) {
  const ctx = await b.newContext({ ...devices['iPhone 12'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('requestfailed', r => errs.push('REQFAIL ' + r.url()));
  if (mapCfg) await p.route('**/js/config.js', async r => {
    const res = await r.fetch(); let t = await res.text();
    t = t.replace("MAP_BG: null,", `MAP_BG: '${mapCfg.bg}',`).replace("MAP_BG_OVERLAY: false,", `MAP_BG_OVERLAY: ${mapCfg.overlay},`);
    await r.fulfill({ response: res, body: t });
  });
  await p.goto(url); await p.evaluate(() => localStorage.clear());
  await p.waitForFunction(() => Art.loaded === Art.total && Light.rimReady, null, { timeout: 15000 }); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
  await p.evaluate(() => __game.start('erin'));
  // 英雄影格會變化（走路／攻擊）
  await p.evaluate(() => { moveHero(60, 300); });
  const frames = new Set();
  for (let i = 0; i < 25; i++) { frames.add(await p.evaluate(() => heroFrame(G.hero))); await p.waitForTimeout(60); }
  // 跑一個夜晚
  await p.evaluate(() => { __game.give(800, 800, 100); buildTower(2, 'archer'); buildTower(4, 'mage'); buildTower(8, 'barracks'); });
  await p.evaluate(() => { __game.skip(); __game.skip(); });
  const n0 = await p.evaluate(() => ({ phase: G.phase, night: G.night }));
  await p.evaluate(() => __game.speed(4));
  let maxEnemies = 0, sawSkill = false, shot = false;
  for (let i = 0; i < 200; i++) {
    const s = await p.evaluate(() => { if (G.hero && G.hero.cd <= 0 && G.enemies.length) { const e = G.enemies[0]; castSkill(e.x, e.y); } return { ph: G.phase, en: G.enemies.length, fr: G.hero ? heroFrame(G.hero) : '', scr: G.screen }; });
    maxEnemies = Math.max(maxEnemies, s.en); if (s.fr) frames.add(s.fr); if (s.fr === 'sk1' || s.fr === 'sk2') sawSkill = true;
    if (!shot && s.en >= 4 && mapCfg) { await p.screenshot({ path: `${OUT}${label}_night.png` }); shot = true; }
    if (s.ph !== 'night' || s.scr !== 'play') { n0.end = s.ph + '/' + s.scr; break; }
    await p.waitForTimeout(250);
  }
  if (mapCfg) { await p.evaluate(() => { __game.speed(1); }); }
  console.log(label, JSON.stringify({ start: n0, frames: [...frames], sawSkill, maxEnemies, errors: errs }));
  if (mapCfg) { await p.evaluate(() => { __game.start('lena'); }); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}${label}_day.png` }); }
  await ctx.close();
}
(async () => {
  const b = await chromium.launch();
  await run(b, 'smoke_http', null, 'http://127.0.0.1:8765/index.html?debug=1');
  await run(b, 'smoke_file', null, 'file:///workspace/game-proto/index.html?debug=1');
  await b.close();
})();
