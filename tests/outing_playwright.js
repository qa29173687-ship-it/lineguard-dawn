// v9 測試：英雄日常（出遊選單、只從未解鎖地點隨機、揭曉、存檔與遷移）與圖書館（立繪／敵人分頁、全螢幕檢視器）
// 用法：node outing_playwright.js [URL] [shots=1]
const { chromium, devices } = require('playwright');
const OUT = process.env.SHOTDIR || '/workspace/game-proto/screenshots/v9';
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html?debug=1';
const SHOTS = process.argv[3] !== '0';
const results = []; const ok = (name, cond, extra) => { results.push([name, !!cond]); console.log(cond ? 'PASS' : 'FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => errors.push(`requestfailed ${r.url()} ${r.failure() && r.failure().errorText}`));
  const ev = (f, a) => page.evaluate(f, a);
  const fresh = async (saveObj) => {
    await page.goto(URL);
    await ev(s => { localStorage.clear(); if (s) for (const k in s) localStorage.setItem(k, s[k]); }, saveObj || null);
    await page.reload();
    await page.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total, null, { timeout: 20000 });
  };
  await fresh();
  const box = await (await page.$('#game')).boundingBox();
  const P = (x, y) => [box.x + x / 360 * box.width, box.y + y / 640 * box.height];
  const tap = async (x, y) => { const [a, b] = P(x, y); await page.touchscreen.tap(a, b); await page.waitForTimeout(120); };
  const tapId = async id => { const b = await ev(id => UI.buttons.find(b => b.id === id), id); if (!b) return false; await tap(b.x + b.w / 2, b.y + b.h / 2); return true; };
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${OUT}/${n}` }); };
  const wait = ms => page.waitForTimeout(ms);
  const winLevel = (lv, hero) => ev(([lv, hero]) => { clearOverlay(); __game.start(hero, null, null, lv); __game.forceEnd(true); return { scr: G.screen, outing: G.outing && { opts: G.outing.opts, all: !!G.outing.all } }; }, [lv, hero]);

  ok('fresh save is v3 with empty daily', await ev(() => G.save.v === 3 && JSON.stringify(G.save.daily) === '{}'));
  // ---------- 存檔遷移 ----------
  await fresh({ lxsw_save_v1: JSON.stringify({ v: 2, shards: 9, levels: { 4: { stars: 2 } }, seen: { goblin: 2 }, settings: { music: 0.4 } }) });
  let st = await ev(() => ({ v: G.save.v, daily: G.save.daily, shards: G.save.shards, music: G.save.settings.music, seen: G.save.seen }));
  ok('v2 save migrates to v3 (daily added, old data kept)', st.v === 3 && JSON.stringify(st.daily) === '{}' && st.shards === 9 && st.music === 0.4 && st.seen.goblin === 2, st);
  await fresh({ lxsw_save_v1: JSON.stringify({ v: 3, daily: { erin: { '01_onsen': true, bogus: true, '02_cafe': 'yes' }, nobody: { '01_onsen': true } } }) });
  st = await ev(() => G.save.daily);
  ok('daily entries sanitized (unknown scene / hero / non-true dropped)', JSON.stringify(st) === JSON.stringify({ erin: { '01_onsen': true } }), st);
  await fresh({ lxsw_save_v1: JSON.stringify({ shards: 1, levels: { 1: { stars: 1 } } }) });
  ok('v1 save migrates straight to v3', await ev(() => G.save.v === 3 && G.save.daily && G.save.levels[1].stars === 1));

  // ---------- 出遊選單 ----------
  await fresh();
  st = await winLevel(3, 'erin');
  ok('winning level 3 does not offer an outing', st.scr === 'end' && !st.outing, st);
  await ev(() => { G.save.levels[3] = { stars: 3 }; });
  st = await winLevel(4, 'vera');
  ok('winning level 4 prepares 3 options from locked scenes', st.outing && st.outing.opts.length === 3 && new Set(st.outing.opts).size === 3, st);
  await wait(1300);
  ok('outing popup opens automatically after the win screen', await ev(() => UI.overlay === 'outing' && UI.buttons.filter(b => /^outing_\d$/.test(b.id)).length === 3));
  await shot('outing_popup.png');
  const lines = await ev(() => G.outing.opts.map(id => DAILY_LINES.vera[id]));
  ok('each option has a persona line (繁中)', lines.every(l => l && /[\u4e00-\u9fff]/.test(l)), lines);
  const picked = await ev(() => G.outing.opts[1]);
  await tapId('outing_1');
  ok('picking an option unlocks it and plays the reveal', await ev(p => UI.overlay === 'reveal' && G.reveal.id === p && G.save.daily.vera[p] === true, picked));
  await page.waitForFunction(p => DImg.ok(dailySrc('vera', p)), picked, { timeout: 8000 }).catch(() => {});
  await wait(800);
  ok('full illustration loaded for reveal', await ev(p => !!DImg.ok(dailySrc('vera', p)) && DImg.ok(dailySrc('vera', p)).naturalWidth === 1024, picked));
  await shot('outing_reveal.png');
  await tap(180, 320);
  ok('tap closes the reveal back to the win screen', await ev(() => !UI.overlay && G.screen === 'end' && !G.reveal));
  // 重玩也能出遊；只從未解鎖中挑
  await ev(() => { for (const id of ['01_onsen', '02_cafe', '03_animals', '04_market', '05_reading', '06_nap', '07_beach']) unlockDaily('lena', id); });
  st = await winLevel(6, 'lena');
  ok('replays/later wins offer outings too; only locked scenes offered', st.outing && st.outing.opts.length === 3 && st.outing.opts.every(id => ['08_cooking', '09_festival', '10_rain'].includes(id)), st);
  st = await ev(() => { const bad = []; for (let i = 0; i < 40; i++) { prepareOuting(true); for (const id of G.outing.opts) if (dailyUnlocked('lena', id)) bad.push(id); } return { bad, n: G.outing.opts.length }; });
  ok('40 random rolls never include unlocked scenes', st.bad.length === 0, st);
  await ev(() => { unlockDaily('lena', '08_cooking'); unlockDaily('lena', '09_festival'); });
  st = await winLevel(7, 'lena');
  ok('fewer options when fewer remain (1 left → 1 option)', st.outing && st.outing.opts.length === 1 && st.outing.opts[0] === '10_rain', st);
  await wait(1300);
  await tapId('outing_skip');
  ok('"下次再說" closes without unlocking', await ev(() => !UI.overlay && !G.save.daily.lena['10_rain']));
  await ev(() => unlockDaily('lena', '10_rain'));
  st = await winLevel(8, 'lena');
  await wait(1300);
  ok('all 10 collected → no popup, "全部收集" note instead', st.outing && st.outing.all && await ev(() => UI.overlay === null));
  await shot('outing_all_collected.png');
  await page.reload(); await page.waitForFunction(() => typeof Art !== 'undefined' && Art.loaded + Art.failed.length >= Art.total, null, { timeout: 20000 });
  st = await ev(() => ({ lena: Object.keys(G.save.daily.lena || {}).length, vera: Object.keys(G.save.daily.vera || {}).length }));
  ok('unlocked scenes persist across reload', st.lena === 10 && st.vera === 1, st);

  // ---------- 圖書館 ----------
  await ev(() => { G.screen = 'title'; G.save.evolved.erin = true; unlockDaily('erin', '01_onsen'); unlockDaily('erin', '05_reading'); unlockDaily('erin', '10_rain'); }); await wait(150);
  await tapId('title_library');
  ok('title → library (立繪 tab)', await ev(() => UI.overlay === 'library' && UI.libTab === 'art'));
  await tapId('lib_hero_erin');
  await page.waitForFunction(() => libItems('erin').every(it => DImg.ok(it.thumb)), null, { timeout: 8000 }).catch(() => {});
  await wait(200);
  st = await ev(() => ({ n: libItems('erin').filter(it => it.open).length, label: UI.buttons.find(b => b.id === 'lib_hero_erin') && libItems('erin').length, lena: libItems('lena').filter(it => it.open).length }));
  ok('counts: erin 5/12 (base + evolved + 3 daily), lena 11/12', st.n === 5 && st.label === 12 && st.lena === 11, st);
  await shot('library_illustrations.png');
  await tapId('lib_item_3');   // 02_cafe 未解鎖
  ok('locked item does not open the viewer', await ev(() => UI.overlay === 'library'));
  await tapId('lib_item_2');   // 01_onsen
  ok('unlocked item opens fullscreen viewer', await ev(() => UI.overlay === 'viewer' && Viewer.cur().key === '01_onsen'));
  await page.waitForFunction(() => DImg.ok(Viewer.cur().full), null, { timeout: 8000 }).catch(() => {});
  await wait(200); await shot('library_viewer.png');
  await tapId('viewer_next');
  ok('▶ goes to next unlocked image', await ev(() => Viewer.cur().key === '05_reading'));
  const [sx, sy] = P(300, 320), [ex] = P(60, 320);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(ex, sy, { steps: 6 }); await page.mouse.up(); await wait(150);
  ok('swipe left → next', await ev(() => Viewer.cur().key === '10_rain'));
  await page.keyboard.press('ArrowRight');
  ok('arrow key wraps around to first', await ev(() => Viewer.cur().key === 'base'));
  await tapId('viewer_prev');
  ok('◀ wraps back to last', await ev(() => Viewer.cur().key === '10_rain' && UI.viewer.i === 4));
  await tapId('viewer_close');
  ok('close viewer → back to library', await ev(() => UI.overlay === 'library'));
  await tapId('lib_hero_vera'); await wait(100);
  ok('vera evolved art locked (never evolved)', await ev(() => !libItems('vera')[1].open && libItems('vera')[0].open));
  await tapId('lib_tab_enemy'); await wait(250);
  ok('敵人 tab shows bestiary content', await ev(() => UI.libTab === 'enemy' && UI.buttons.some(b => /^best_/.test(b.id))));
  await shot('library_enemies.png');
  await tapId('lib_close');
  ok('close library', await ev(() => !UI.overlay && G.screen === 'title'));
  // 暫停選單的圖鑑仍可用
  await ev(() => { __game.start('erin', null, null, 4); pauseGame(); }); await wait(100);
  await tapId('pause_bestiary');
  ok('bestiary still reachable from the pause menu', await ev(() => UI.overlay === 'bestiary'));
  await ev(() => clearOverlay());

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ERRORS: none');
  const pass = results.filter(r => r[1]).length;
  console.log(`RESULT ${pass}/${results.length} passed`);
  await browser.close();
  process.exit(pass === results.length && !errors.length ? 0 : 1);
})();
