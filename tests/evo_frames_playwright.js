// 進化英雄動作影格：進化後走路（四方向）／攻擊／技能都用 {id}_evo_* 影格與 {id}_evo_fx_* 特效；server 與 file:// 都可跑
// 用法：node evo_frames_playwright.js [URL]；截圖 → screenshots/v10/（OUT 環境變數可改）
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html?debug=1';
const OUT = process.env.OUT || path.join(__dirname, '..', 'screenshots', 'v10');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (name, c, info) => { if (c) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info !== undefined ? JSON.stringify(info) : ''); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 12'] }); const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errors.push(`requestfailed ${r.url()}`));
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total, null, { timeout: 20000 });
  const ev = (f, a) => page.evaluate(f, a);
  ok('art: no failed loads', await ev(() => Art.failed.length === 0), await ev(() => Art.failed));
  const want = { erin: { ws: 4, fx: ['atk2', 'sk1', 'sk2'] }, lena: { ws: 3, fx: ['atk2', 'sk2'] }, vera: { ws: 4, fx: ['atk2', 'sk1', 'sk2'] } };
  for (const id of ['erin', 'lena', 'vera']) {
    const r = await ev(id => ['walk1', 'walk2', 'atk1', 'atk2', 'sk1', 'sk2', 'wf1', 'wf2', 'wf3', 'wf4', 'wb1', 'wb2', 'wb3', 'wb4', 'ws1', 'ws2', 'ws3'].filter(f => !Art.img[`${id}_evo_${f}`]), id);
    ok(`${id}: evo action + 4-direction walk frames loaded`, r.length === 0, r);
    const fx = await ev(([id, l]) => l.filter(f => !Art.img[`${id}_evo_fx_${f}`]), [id, want[id].fx]);
    ok(`${id}: evo fx frames loaded (${want[id].fx})`, fx.length === 0, fx);
  }
  ok('lena evo side walk uses 3 frames (4th sheet frame was front-facing)', await ev(() => !Art.img.lena_evo_ws4 && !ART_MANIFEST.lena_evo_ws4));
  // 實際遊戲中：記錄 drawSprite 用到的 key/影格
  await ev(() => {
    window.__drawn = [];
    const orig = window.drawSprite;
    window.drawSprite = function (ctx, key, x, y, sc, fl, wh, variant) { if (/^(erin|lena|vera)/.test(key)) __drawn.push(Art.resolve(key, variant) || `${key}:${variant}:MISSING`); return orig.apply(this, arguments); };
    window.__fx = []; const of = HeroAnim.drawFx.bind(HeroAnim); HeroAnim.drawFx = (c, k) => { __fx.push(k + (Art.img[k] ? '' : ':MISSING')); return of(c, k); };
  });
  for (const id of ['erin', 'lena', 'vera']) {
    await ev(id => { localStorage.clear(); G.save = loadSave(); __game.start(id, null, null, 2); if (G.choosingSupply) { G.supplyPick = 'front'; confirmSupply(); }
      CFG.SKILL_CUTIN = false; CFG.BOSS_INTRO = false; const h = G.hero; h.lvl = 10; evolveHero(); G.fx = []; }, id);
    ok(`${id}: evolved hero has real evo frames (HeroAnim.evoReal)`, await ev(() => G.hero.evo && HeroAnim.evoReal(G.hero)));
    // 走四個方向
    const dirs = {};
    for (const [dx, dy, d] of [[0, 90, 'front'], [0, -90, 'back'], [90, 0, 'side'], [-90, 0, 'side']]) {
      await ev(([dx, dy]) => { const h = G.hero; __drawn = []; h.hx = Math.max(30, Math.min(330, h.x + dx)); h.hy = Math.max(120, Math.min(560, h.y + dy)); h.moving = true; }, [dx, dy]);
      await page.waitForTimeout(650);
      dirs[d] = (dirs[d] || []).concat(await ev(() => __drawn.slice()));
    }
    const pre = { front: 'wf', back: 'wb', side: 'ws' };
    for (const d of ['front', 'back', 'side']) {
      const used = [...new Set(dirs[d].filter(k => k.includes(`_evo_${pre[d]}`)))];
      ok(`${id}: walking ${d} cycles evo frames ${pre[d]}*`, used.length >= 3, { used, sample: [...new Set(dirs[d])].slice(0, 8) });
    }
    const all = [].concat(...Object.values(dirs));
    ok(`${id}: walking never falls back to base-hero frames`, !all.some(k => new RegExp(`^${id}_(w[fbs]\\d|walk\\d|front|side|back)$`).test(k)), [...new Set(all)].slice(0, 12));
    // 攻擊：生一隻打不死的敵人，英雄一直走向它
    await ev(() => { G.phase = 'night'; const e = spawnEnemy('goblin', 0); e.hp = e.max = 1e7; window.__tgt = e; __drawn = []; __fx = []; });
    for (let k = 0; k < 12; k++) { await ev(() => { const h = G.hero, e = __tgt; if (Math.hypot(h.x - e.x, h.y - e.y) > 16) { h.x = h.hx = e.x - 10; h.y = h.hy = e.y + 4; h.moving = false; } }); await page.waitForTimeout(220); }
    const ak = await ev(() => __drawn.slice());
    ok(`${id}: attack plays evo atk1/atk2 frames`, ak.some(k => k === `${id}_evo_atk2`) && !ak.some(k => /_(atk[12])$/.test(k) && !k.includes('_evo_')), [...new Set(ak)]);
    // 技能
    await ev(() => { __drawn = []; __fx = []; const h = G.hero; h.cd = 0; G.enemies.length = 0; castSkill(h.x + 40, h.y); });
    await page.waitForTimeout(900);
    const sk = await ev(() => ({ d: __drawn.slice(), fx: __fx.slice() }));
    ok(`${id}: skill plays evo sk1/sk2 frames`, sk.d.some(k => /_evo_sk[12]$/.test(k)) && !sk.d.some(k => /^(erin|lena|vera)_sk[12]$/.test(k)), [...new Set(sk.d)]);
    ok(`${id}: skill fx drawn are evo fx (none missing, no base fx)`, sk.fx.length > 0 && sk.fx.every(k => k.includes('_evo_fx_') && !k.includes(':MISSING')), [...new Set(sk.fx)]);
  }
  // 截圖：三位進化英雄每個影格（遊戲內 HeroAnim.draw，放大 3 倍）
  await ev(() => {
    const frames = ['front', 'wf1', 'wf2', 'wb1', 'wb2', 'side', 'ws1', 'ws2', 'walk1', 'atk1', 'atk2', 'sk1', 'sk2'];
    const fxOf = { erin: { atk2: 'atk2', sk1: 'sk1', sk2: 'sk2' }, lena: { atk2: 'atk2', sk2: 'sk2' }, vera: { atk2: 'atk2', sk1: 'sk1', sk2: 'sk2' } };
    const c = document.createElement('canvas'); c.width = frames.length * 60 * 3; c.height = 3 * 110 * 3; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = '#5a7846'; x.fillRect(0, 0, c.width, c.height);
    ['erin', 'lena', 'vera'].forEach((id, r) => frames.forEach((f, i) => {
      const h = { id, d: CFG.HEROES[id], evo: true, x: 0, y: 0, dead: false, flash: 0 };
      h.vis = { id, frame: f, fx: (fxOf[id] || {})[f] || null, dir: /^w[fb]|front|back/.test(f) ? (f.startsWith('wb') || f === 'back' ? 'back' : 'front') : 'side', face: 1, ox: 0, oy: 0, sx: 1, sy: 1, ghosts: [], cyc: 0 };
      x.save(); x.scale(3, 3); x.translate(i * 60 + 30, r * 110 + 95); HeroAnim.draw(x, Object.assign(h, { x: 0, y: 0 }), false); x.restore();
      x.fillStyle = '#fff'; x.font = '20px sans-serif'; x.fillText(f, i * 180 + 6, r * 330 + 322);
    }));
    try { window.__sheet = c.toDataURL('image/png'); } catch (e) { window.__sheet = null; }   // file:// 下畫布被視為跨來源 → 不匯出截圖
  });
  const data = await ev(() => __sheet);
  if (data) fs.writeFileSync(path.join(OUT, 'evo_frames_ingame.png'), Buffer.from(data.split(',')[1], 'base64'));
  // 遊戲畫面：進化薇拉施放技能中
  await ev(() => { G.fx = []; }); await page.screenshot({ path: path.join(OUT, 'evo_vera_play.png') });
  ok('no console errors', errors.length === 0, errors.slice(0, 5));
  console.log('ERRORS:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
  console.log(`RESULT ${pass}/${pass + fail} passed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
