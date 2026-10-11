// v11：鏡頭（拖曳平移、雙指／滾輪縮放、點擊門檻、HUD 固定、可捲到地圖頂端）與放大後的地圖
// 用法：node camera_playwright.js [URL] [shots=1]
const { chromium, devices } = require('playwright');
const OUT = '/workspace/game-proto/screenshots/v11';
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html?debug=1';
const SHOTS = process.argv[3] !== '0';
const results = []; const ok = (name, cond, extra) => { results.push([name, !!cond]); console.log(cond ? 'PASS' : 'FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); };
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/willReadFrequently/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total, null, { timeout: 20000 });
  const box = await (await page.$('#game')).boundingBox();
  const P = (x, y) => [box.x + x / 360 * box.width, box.y + y / 640 * box.height];
  const ev = (f, a) => page.evaluate(f, a);
  const wait = ms => page.waitForTimeout(ms);
  const tap = async (x, y) => { const [a, b] = P(x, y); await page.touchscreen.tap(a, b); await wait(120); };
  const wtap = async (x, y) => { const [sx, sy] = await ev(([x, y]) => __game.w2s(x, y), [x, y]); await tap(sx, sy); return [sx, sy]; };
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => { const [a, b] = P(x, y); return { x: a, y: b, id: i + 1 }; }) });
  const drag = async (x0, y0, x1, y1, steps = 8) => { await touch('touchStart', [[x0, y0]]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]]); await wait(16); } await touch('touchEnd', []); await wait(100); };
  const pinch = async (cx, cy, d0, d1, steps = 8) => {
    const pts = d => [[cx - d / 2, cy], [cx + d / 2, cy]];
    await touch('touchStart', pts(d0)); for (let i = 1; i <= steps; i++) { await touch('touchMove', pts(d0 + (d1 - d0) * i / steps)); await wait(16); } await touch('touchEnd', []); await wait(100);
  };
  const cam = o => ev(o => __game.cam(o), o);
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${OUT}/${n}` }); };

  // ---------- 世界尺寸 ----------
  const geo = await ev(() => ({ WW: CFG.WW, WH: CFG.WH, W: CFG.W, H: CFG.H, levels: LEVELS.map(l => { const xs = [], ys = []; for (const P of l.paths) for (const [x, y] of P) { xs.push(x); ys.push(y); } for (const [x, y] of l.pads) { xs.push(x); ys.push(y); } return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; }) }));
  ok('world larger than the 360×640 view (≥1.4× area)', geo.WW > geo.W && geo.WH > geo.H && geo.WW * geo.WH / (geo.W * geo.H) >= 1.4, geo.WW + '×' + geo.WH);
  ok('every level uses the larger world (layout extends past 360×640)', geo.levels.every(([x0, x1, y0, y1]) => x1 > 360 || y1 > 600), geo.levels);
  ok('map backgrounds are 2× world size', await ev(async () => { const r = []; for (const l of LEVELS) { const im = new Image(); im.src = l.map; await im.decode(); r.push(im.naturalWidth === CFG.WW * 2 && im.naturalHeight === CFG.WH * 2); } return r.every(Boolean); }));

  // ---------- 第 1 關：教學、點擊仍可蓋塔 ----------
  await ev(() => { __game.start('erin', null, null, 1); });
  await wait(500);
  let st = await cam();
  ok('starts at default zoom 1, HUD fixed', Math.abs(st.z - 1) < 1e-6, st);
  const pad0 = await ev(() => CFG.TOWER_SPOTS[0]);
  await cam({ center: [geo.WW / 2, geo.WH - 40] });   // 把塔位 0 移出畫面 → 教學自動帶過去
  await ev(() => { Cam.userAt = -1e9; }); await wait(900);
  const tg = await ev(p => __game.w2s(p[0], p[1] - 10), pad0);
  ok('tutorial auto-pans so the highlighted pad is on screen', tg[1] > 60 && tg[1] < 560 && tg[0] > 20 && tg[0] < 340, tg);
  await shot('tutorial_pan.png');
  await wtap(pad0[0], pad0[1] - 10);
  ok('tap on pad (camera transformed) opens build menu', await ev(() => G.menu && G.menu.kind === 'spot' && G.menu.i === 0));
  const o0 = await ev(() => UI.buttons.find(b => b.id === 'opt0'));
  await tap(o0.x + 20, o0.y + 20); await tap(o0.x + 20, o0.y + 20);
  ok('build via menu still works', await ev(() => G.towers.length === 1));

  // ---------- 拖曳平移（不觸發點擊） ----------
  await ev(() => { G.menu = null; G.tut = null; }); await cam({ home: true });
  const h0 = await ev(() => ({ hx: G.hero.hx, hy: G.hero.hy, moving: G.hero.moving }));
  st = await cam();
  await drag(200, 300, 170, 200);
  let st2 = await cam();
  ok('one-finger drag pans the camera (content follows the finger)', Math.abs((st2.x - st.x) - 30) < 3 && Math.abs((st2.y - st.y) - 100) < 3, [st, st2]);
  ok('drag does not move the hero / open menus', await ev(h0 => G.hero.hx === h0.hx && G.hero.hy === h0.hy && !G.menu, h0));
  // 小幅移動（< 門檻）仍是點擊 → 英雄移動
  await touch('touchStart', [[180, 330]]); await touch('touchMove', [[183, 332]]); await touch('touchEnd', []); await wait(120);
  const tw = await ev(() => __game.s2w(180, 330));
  ok('tiny movement under drag threshold still counts as a tap (hero moves)', await ev(tw => Math.abs(G.hero.hx - tw[0]) < 2 && Math.abs(G.hero.hy - tw[1]) < 2, tw), tw);
  // 滑鼠拖曳
  st = await cam();
  { const [a, b] = P(100, 350), [c, d] = P(160, 400); await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move(c, d, { steps: 6 }); await page.mouse.up(); await wait(100); }
  st2 = await cam();
  ok('mouse drag pans too', Math.abs((st.x - st2.x) - 60) < 3 && Math.abs((st.y - st2.y) - 50) < 3, [st, st2]);

  // ---------- 縮放 ----------
  await cam({ home: true });
  const anchor = await ev(() => __game.s2w(180, 300));
  await pinch(180, 300, 80, 160);
  st = await cam();
  const anchor2 = await ev(() => __game.s2w(180, 300));
  ok('two-finger pinch zooms in around the pinch center', st.z > 1.6 && Math.hypot(anchor[0] - anchor2[0], anchor[1] - anchor2[1]) < 4, [st.z, anchor, anchor2]);
  await pinch(180, 300, 200, 20);
  st = await cam();
  ok('pinch out clamps at min zoom (whole map fits between HUD bars)', Math.abs(st.z - st.zmin) < 1e-3 && st.zmin * geo.WH <= 540 + 1, st);
  { const [a, b] = P(180, 300); await page.mouse.move(a, b); for (let i = 0; i < 25; i++) await page.mouse.wheel(0, -200); await wait(150); }
  st = await cam();
  ok('mouse wheel zooms in and clamps at 2×', Math.abs(st.z - 2) < 1e-3, st.z);
  { for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 200); await wait(150); }
  ok('mouse wheel zooms out', (await cam()).z < 2);
  await shot('zoom_2x.png');

  // ---------- 範圍：每個塔位／地塊都能捲到 HUD 之外 ----------
  const reach = await ev(() => {
    const bad = [];
    for (const lv of LEVELS) {
      applyLevel(lv.id);
      const pts = lv.pads.map(p => [p[0], p[1] - 44, p[1] + 14, 'pad']).concat(CFG.PLOTS.map(p => [p[0], p[1] - 16, p[1] + 16, 'plot']));
      for (const z of [Cam.ZMIN, 1, 2]) {
        const b = Cam.bounds(z);
        for (const [x, top, bot, k] of pts) {
          // 可視區：x 0..360、y MAP_TOP..MAP_BOTTOM（畫面座標）；找得到鏡頭位置讓整個塔位進入可視區
          const yLo = bot - CFG.MAP_BOTTOM / z, yHi = top - CFG.MAP_TOP / z;   // 需要 cam.y 在 [yLo, yHi]
          const xLo = x + 18 - CFG.W / z, xHi = x - 18;
          if (Math.max(yLo, b.y0) > Math.min(yHi, b.y1) + 1e-6 || Math.max(xLo, b.x0) > Math.min(xHi, b.x1) + 1e-6) bad.push([lv.id, k, x, top, z]);
        }
      }
    }
    applyLevel(1);
    return bad;
  });
  ok('every pad/plot of every level can be scrolled fully clear of the top HUD and bottom bar (all zooms)', reach.length === 0, reach.slice(0, 6));

  // ---------- 捲到最上方：最上排塔位露出、可點 ----------
  await ev(() => { G.menu = null; }); await cam({ z: 1 });
  await drag(180, 120, 180, 560); await drag(180, 120, 180, 560); await drag(180, 120, 180, 560);
  st = await cam();
  ok('panning up reaches the top bound (world top just under the HUD)', Math.abs(st.y - st.b.y0) < 0.5 && (await ev(() => __game.w2s(0, 0)))[1] >= 40, st);
  const topPad = await ev(() => { let i = 0; CFG.TOWER_SPOTS.forEach((p, k) => { if (p[1] < CFG.TOWER_SPOTS[i][1]) i = k; }); return [i, CFG.TOWER_SPOTS[i]]; });
  const tps = await ev(p => __game.w2s(p[0], p[1] - 44), topPad[1]);
  ok('topmost pad sprite is fully below the HUD', tps[1] > 40, tps);
  await wtap(topPad[1][0], topPad[1][1] - 10);
  ok('topmost pad is tappable', await ev(i => G.menu && G.menu.kind === 'spot' && G.menu.i === i, topPad[0]));
  await shot('panned_top_l1.png');
  // 預覽按鈕不擋住（敵情鈕在 HUD 下緣、塔位已在其下）
  await ev(() => { G.menu = null; });

  // ---------- 回到預設視角按鈕 ----------
  await ev(() => G.menu = null); await wait(100);
  const rc = await ev(() => UI.buttons.find(b => b.id === 'recenter'));
  await tap(rc.x + rc.w / 2, rc.y + rc.h / 2); await wait(700);
  st = await cam(); const home = await ev(() => Cam.home());
  ok('recenter button returns to the default view', Math.abs(st.x - home.x) < 0.5 && Math.abs(st.y - home.y) < 0.5 && Math.abs(st.z - home.z) < 1e-3, [st, home]);

  // ---------- 補給站選擇（第 4 關）：整張地圖、旗幟可點 ----------
  await ev(() => { G.save.tutorial = { 1: 'skipped' }; G.levelId = 4; G.mod = null; newRun('lena'); });
  await wait(400);
  st = await cam();
  ok('supply choice opens zoomed out (whole map)', Math.abs(st.z - st.zmin) < 1e-3, st.z);
  const front = await ev(() => CFG.SUPPLY_SPOTS.find(s => s.id === 'front'));
  await wtap(front.x, front.y);
  ok('tap on supply flag (camera transformed) selects it', await ev(() => G.supplyPick === 'front'));
  await shot('supply_overview_l4.png');
  await ev(() => confirmSupply()); await wait(900);
  st = await cam();
  ok('after confirming, camera eases back to the default view', Math.abs(st.z - 1) < 0.02, st.z);

  // ---------- 夜晚光影跟著鏡頭 ----------
  await ev(() => { __game.give(); for (const i of [0, 3, 5, 8]) buildTower(i, 'archer'); G.phase = 'night'; G.phaseT = 60; G.spawnList = []; for (let i = 0; i < 6; i++) __game.spawn('goblin'); for (let i = 0; i < 30; i++) update(0.05); });
  // 同一個畫面點：夜色開／關的亮度比 → 光圈內接近 1、遠離光源處很暗（鏡頭平移／縮放後仍對齊）
  const ratio = (pts) => ev(async (pts) => {
    const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.getElementById('game'), k = c.width / CFG.W, x = c.getContext('2d');
    const L = () => pts.map(([sx, sy]) => { const d = x.getImageData(Math.round(sx * k) - 3, Math.round(sy * k) - 3, 6, 6).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3 + 1; });
    G.speed = 0; G.dialog = null; G.tip = null; G.notice = null; await raf(); const on = L(); Light.off.dark = true; await raf(); const off = L(); Light.off.dark = false; G.speed = 1;
    return on.map((v, i) => [+(v / off[i]).toFixed(2), Math.round(v), Math.round(off[i]), pts[i]]);
  }, pts);
  const res = [];
  for (const c of [{ home: true }, { center: [200, 560], z: 1.6 }, { over: true }]) {
    await cam(c); await wait(60);
    const pts = await ev(() => {
      const lights = [[CFG.CASTLE.x, CFG.CASTLE.y], [CFG.GRANARY.x, CFG.GRANARY.y], [G.post.x, G.post.y], [G.hero.x, G.hero.y], ...G.towers.map(t => [t.x, t.y])];
      const far = [];
      for (let sy = 170; sy <= 490; sy += 16) for (let sx = 15; sx <= 345; sx += 16) { const [wx, wy] = __game.s2w(sx, sy); if (wx < 5 || wy < 5 || wx > CFG.WW - 5 || wy > CFG.WH - 5) continue; if (Math.min(...lights.map(([lx, ly]) => Math.hypot(lx - wx, ly - wy))) > 150) far.push([sx, sy]); }
      return [__game.w2s(CFG.CASTLE.x + 45, CFG.CASTLE.y + 5), ...far];
    });
    let r; try { r = await ratio(pts); } catch (e) { res.push('skip'); continue; }   // file://：畫布被汙染無法讀像素
    const fr = r.slice(1).map(v => v[0]).sort((a, b) => a - b); res.push([r[0][0], fr[fr.length >> 1], fr.length]);
  }
  if (res.includes('skip')) { await ev(() => { Light.off.dark = false; G.speed = 1; }); console.log('SKIP night light pixel check (file:// tainted canvas)'); }
  else ok('night light hole around the castle stays aligned when panning/zooming', res.every(([a, b, n]) => n > 5 && a > b + 0.2), res);
  await cam({ over: true }); await wait(100); await shot('night_overview_l4.png');

  // ---------- 傷害數字、範圍圈在鏡頭座標 ----------
  await ev(() => { setSetting('dmgNum', true); const e = G.enemies.find(e => e.hp > 0); if (e) { hurt(e, 7, 'phys', 'tower'); } });
  ok('damage number fx created in world coords', await ev(() => G.fx.some(f => f.kind === 'dmg' && f.x > 0 && f.x < CFG.WW)));
  await cam({ z: 2, center: await ev(() => [G.towers[0].x, G.towers[0].y]) });
  await ev(() => { G.menu = { kind: 'spot', i: G.towers[0].spot !== undefined ? G.towers[0].spot : 0, pick: null }; });
  await wait(150); await shot('menu_range_zoom2.png');
  ok('tower menu opens while zoomed (panel in screen space)', await ev(() => { const b = UI.buttons.find(b => b.id === 'opt0'); return b && b.x >= 0 && b.x + b.w <= 360 && b.y > 40 && b.y < 580; }));
  await ev(() => { G.menu = null; });

  // ---------- 首領登場：鏡頭帶到首領 ----------
  await ev(() => { G.save.tutorial = { 1: 'skipped' }; G.levelId = 10; G.mod = null; newRun('vera'); G.supplyPick = 'east'; confirmSupply(); Cam.reset(false); });
  await wait(700);
  const y0 = (await cam()).y;
  await ev(() => { CFG.BOSS_INTRO = true; G.phase = 'night'; const e = spawnEnemy('boss', 0); G.boss = e; Boss.start(e); });
  await wait(1500);
  const bossFollow = await ev(() => { const b = G.boss, [sx, sy] = __game.w2s(b.x, b.y); return { follow: !!Cam.follow, sx, sy, camY: Cam.y }; });
  ok('boss entrance: camera follows the boss onto the screen', bossFollow.follow && bossFollow.camY < y0 - 20 && bossFollow.sy > 40 && bossFollow.sy < 580, { y0, ...bossFollow });
  await shot('boss_follow.png');
  await ev(() => { Boss.active = null; });

  // ---------- 截圖：全圖（縮到最小）＋ 捲到頂端 ----------
  for (const L of [1, 4, 7, 10]) {
    await ev(L => { G.save.tutorial = { 1: 'skipped' }; G.levelId = L; G.mod = null; newRun('erin'); if (G.lv.supply) { G.supplyPick = G.lv.supply.default; confirmSupply(); } G.tut = null; G.preview = null; G.fx = G.fx.filter(f => f.kind !== 'banner'); G.dialog = null; G.tip = null; }, L);
    await cam({ over: true }); await wait(250); await shot(`full_map_l${L}.png`);
    await cam({ z: 1, y: -9999, x: 0 }); await cam({ center: [geo.WW / 2, 0], z: 1 }); await wait(250); await shot(`panned_top_l${L}.png`);
  }
  ok('no console errors', errors.length === 0, errors.slice(0, 5));
  const fail = results.filter(r => !r[1]);
  console.log(`\n${results.length - fail.length}/${results.length} passed`);
  await browser.close(); process.exit(fail.length ? 1 : 0);
})();
