// 第 3 階段 QoL 測試：存檔版本／遷移／損毀備份、繼續冒險、新手教學（第 1 關 3 步）＋情境小提示、暫停與設定、重置存檔、速度鈕、傷害數字、敵人圖鑑、英雄對話、震動回饋、蕾娜強化
// 用法：node phase3_playwright.js [URL] [shots=1]
const { chromium, devices } = require('playwright');
const OUT = process.env.SHOTDIR || '/tmp/p3shots';
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html?debug=1';
const SHOTS = process.argv[3] !== '0';
const results = []; const ok = (name, cond, extra) => { results.push([name, !!cond]); console.log(cond ? 'PASS' : 'FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 2 });
  // 記錄 navigator.vibrate 呼叫（無頭瀏覽器沒有震動馬達）
  await ctx.addInitScript(() => { window.__vib = []; navigator.vibrate = p => { window.__vib.push(p); return true; }; });
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
  const tap = async (x, y) => { await page.touchscreen.tap(box.x + x / 360 * box.width, box.y + y / 640 * box.height); await page.waitForTimeout(120); };
  const tapId = async id => { const b = await ev(id => UI.buttons.find(b => b.id === id), id); if (!b) return false; await tap(b.x + b.w / 2, b.y + b.h / 2); return true; };
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${OUT}/${n}` }); };
  const wait = ms => page.waitForTimeout(ms);
  // 透過介面開始某關（標題 → 地圖 → 關卡卡片 → 英雄 → 開始）
  const playLevel = async (lv, hero = 'erin') => {
    await ev(() => { G.screen = 'title'; UI.overlay = null; G.paused = false; });
    await wait(80);
    if (!(await tapId('title_continue'))) await tapId('title_start');
    await ev(lv => { UI.lvSel = lv; }, lv); await wait(80);
    await tapId('card_go'); await tapId('hero_' + hero); await tapId('start');
    await ev(() => { if (G.choosingSupply) { G.supplyPick = G.lv.supply.default; confirmSupply(); } });
  };

  // ---------- 存檔 ----------
  let st = await ev(() => ({ v: G.save.v, set: G.save.settings, seen: G.save.seen, tut: G.save.tutorial, cont: continueLevel(), raw: localStorage.getItem(SAVE_KEY) }));
  ok('fresh save is current version (v3) with default settings', st.v === 3 && st.set.music === 1 && st.set.shake === true && st.set.vibrate === true && st.set.dmgNum === true && st.cont === null, st);
  ok('title shows 開始遊戲 (no continue) on fresh save', await ev(() => !!UI.buttons.find(b => b.id === 'title_start') && !UI.buttons.find(b => b.id === 'title_continue')));
  // v1 遷移
  await fresh({ lxsw_save_v1: JSON.stringify({ shards: 7, attempts: 3, talents: { h1: true, bogus: true }, levels: { 1: { stars: 2, mods: {}, wins: 1, tries: 2 }, 2: { stars: 9 } }, evolved: { vera: true }, altArt: { vera: true } }) });
  st = await ev(() => ({ v: G.save.v, shards: G.save.shards, talents: G.save.talents, l1: G.save.levels[1], l2: G.save.levels[2], evo: G.save.evolved, alt: G.save.altArt, set: G.save.settings, cont: continueLevel() }));
  ok('v1 save migrates to current version (fields kept, bogus talent dropped, stars clamped)', st.v === 3 && st.shards === 7 && st.talents.h1 && !st.talents.bogus && st.l1.stars === 2 && st.l2.stars === 3 && st.evo.vera && st.alt.vera && st.set.music === 1, st);
  // 損毀 → 讀備份
  await fresh({ lxsw_save_v1: '{"shards": 3, "lev', lxsw_save_v1_bak: JSON.stringify({ v: 2, shards: 42, levels: { 1: { stars: 3 } } }) });
  st = await ev(() => ({ shards: G.save.shards, stars: totalStars(), corrupt: !!localStorage.getItem(SAVE_KEY + '_corrupt') }));
  ok('corrupted save falls back to backup and keeps a copy', st.shards === 42 && st.stars === 3 && st.corrupt, st);
  await fresh({ lxsw_save_v1: 'garbage!!' });
  ok('corrupted save without backup → clean default save (no crash)', await ev(() => G.save.v === 3 && G.save.shards === 0 && G.screen === 'title'));
  ok('writeSave keeps previous save as backup', await ev(() => { G.save.shards = 1; writeSave(); G.save.shards = 2; writeSave(); return JSON.parse(localStorage.getItem(SAVE_KEY + '_bak')).shards === 1 && JSON.parse(localStorage.getItem(SAVE_KEY)).shards === 2; }));

  // ---------- 繼續冒險 ----------
  await fresh({ lxsw_save_v1: JSON.stringify({ v: 2, shards: 10, levels: { 1: { stars: 3, wins: 1, tries: 1 }, 2: { stars: 1, wins: 1, tries: 2 } }, last: { level: 2, hero: 'vera' }, tutorial: { 1: 'done', 2: 'done' } }) });
  ok('title shows 繼續冒險 → next level', await ev(() => !!UI.buttons.find(b => b.id === 'title_continue') && continueLevel() === 3));
  ok('last hero preselected', await ev(() => UI.selHero === 'vera'));
  await shot('title_continue.png');
  await tapId('title_continue');
  ok('continue → level map with level 3 card open', await ev(() => G.screen === 'map' && UI.lvSel === 3));

  // ---------- 新手教學（第 1 關 3 步）＋情境小提示 ----------
  await fresh();
  await playLevel(1, 'erin');
  st = await ev(() => ({ scr: G.screen, lv: G.levelId, tut: G.tut && G.tut.step, n: TUTORIAL[1].length, texts: TUTORIAL[1].map(s => s.text), l2: !!TUTORIAL[2] }));
  ok('level 1 tutorial: 3 short steps (≤14 chars), none for other levels', st.scr === 'play' && st.lv === 1 && st.tut === 0 && st.n === 3 && st.texts.every(t => [...t].length <= 14) && !st.l2, st);
  await wait(400);
  ok('tutorial hint + skip button drawn', await ev(() => !!UI.buttons.find(b => b.id === 'tut_skip')));
  await shot('tutorial_l1.png');
  const t0 = await ev(() => G.phaseT); await wait(1500);
  ok('day timer briefly paused while tutorial asks to build', await ev(t0 => Math.abs(G.phaseT - t0) < 0.2, t0));
  const pad = await ev(() => CFG.TOWER_SPOTS[0]);
  await tap(pad[0], pad[1] - 10); await wait(150);
  await ev(() => buildTower(0, 'archer')); await wait(200);
  ok('building the tower auto-advances to step 2', await ev(() => G.towers.length === 1 && G.tut && G.tut.step === 1));
  await ev(() => { G.menu = null; }); await wait(200);
  await shot('tutorial_l1_step2.png');
  await ev(() => placeBuilding(0, 'farm')); await wait(200);
  ok('farm auto-advances to step 3 (move hero)', await ev(() => G.tut && G.tut.step === 2));
  await shot('tutorial_l1_step3.png');
  await tap(200, 300); await wait(250);
  st = await ev(() => ({ tut: G.tut, save: G.save.tutorial }));
  ok('tapping the map finishes the tutorial → saved "done"', !st.tut && st.save[1] === 'done', st);
  await page.waitForFunction(() => G.tip && G.tip.id === 'dusk', null, { timeout: 8000 }).catch(() => {});
  ok('contextual tip "進入黃昏" pops after the tutorial', await ev(() => G.tip && G.tip.id === 'dusk' && !UI.buttons.some(b => /tip/.test(b.id || ''))));
  await wait(500); await shot('tip_dusk.png');
  await wait(2200);
  ok('tip disappears after ~2.5s', await ev(() => !G.tip || G.tip.id !== 'dusk'));
  // 暫停上限：什麼都不做時，白天倒數最多只暫停 10 秒
  st = await ev(() => { G.save.tutorial = {}; newRun('erin'); const p0 = G.phaseT; for (let i = 0; i < 400; i++) update(0.05); return { lost: p0 - G.phaseT, step: G.tut && G.tut.step }; });
  ok('tutorial pause capped at ~10s', st.lost >= 9.5 && st.lost <= 10.5 && st.step === 0, st);
  await ev(() => { G.menu = null; }); await wait(100);
  await tapId('tut_skip');
  st = await ev(() => ({ tut: G.tut, save: G.save.tutorial }));
  ok('skip tutorial saves "skipped"', !st.tut && st.save[1] === 'skipped', st);
  await ev(() => newRun('erin'));
  ok('restarting level 1 does not show tutorial again', await ev(() => !G.tut));
  // 第 2 關：沒有強制步驟，只有一次性提示（兵營）
  await ev(() => { G.save.levels[1] = { stars: 3, mods: {}, wins: 1, tries: 1 }; writeSave(); });
  await playLevel(2, 'lena');
  await wait(600);
  st = await ev(() => ({ tut: G.tut, tip: G.tip && G.tip.id, log: G.tipLog }));
  ok('level 2: no forced tutorial, one-time "barracks" tip instead', !st.tut && st.log.includes('barracks'), st);
  await wait(300); await shot('tip_barracks.png');
  await ev(() => { __game.give(); buildTower(3, 'barracks'); G.night = 2; for (let i = 0; i < 120; i++) update(0.05); });
  ok('more tips queue one at a time (upgrade after barracks)', await ev(() => G.save.tips.barracks && G.save.tips.upgrade));
  await ev(() => newRun('lena')); await wait(800);
  ok('tips are one-time (not shown again on restart)', await ev(() => !(G.tipLog || []).includes('barracks')));
  st = await ev(() => { G.choosingSupply = false; G.phase = 'dusk'; G.phaseT = 5; for (let i = 0; i < 4; i++) update(0.05); return G.tipLog.slice(); });
  ok('preview tip on first dusk', st.includes('preview') || (await ev(() => !!G.save.tips.preview)), st);
  await page.reload(); await page.waitForFunction(() => typeof Art !== 'undefined' && Art.loaded + Art.failed.length >= Art.total, null, { timeout: 20000 });
  ok('tutorial + tip flags persist across reload', await ev(() => G.save.tutorial[1] === 'skipped' && G.save.tips.barracks === 1 && G.save.tips.dusk === 1));
  await ev(() => { G.screen = 'title'; }); await wait(100);
  await tapId('title_settings'); await tapId('set_tutorial');
  ok('"重看新手教學與提示" resets tutorial + tips', await ev(() => Object.keys(G.save.tutorial).length === 0 && Object.keys(G.save.tips).length === 0));
  await ev(() => { closeOverlay(); G.save.tutorial = { 1: 'skipped' }; G.save.tips = Object.fromEntries(TIPS.map(t => [t.id, 1])); writeSave(); });

  // ---------- 英雄對話 ----------
  await page.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total, null, { timeout: 20000 });
  await playLevel(3, 'lena');
  await wait(1800);
  st = await ev(() => ({ d: G.dialog, log: G.dialogLog }));
  ok('level-start dialogue line (繁中)', st.d && st.d.kind === 'start' && /[\u4e00-\u9fff]/.test(st.d.text), st);
  await shot('dialogue_start.png');
  await ev(() => { G.castleHp = Math.floor(G.castleMax * 0.25); }); await wait(300);
  ok('low castle HP dialogue', await ev(() => G.dialog && G.dialog.kind === 'lowHp'));
  await shot('dialogue_lowhp.png');
  await ev(() => { CFG.SKILL_CUTIN = true; __game.evolve(); }); await wait(200);
  await ev(() => { while (CutIn.active) CutIn.update(0.1); });
  await wait(900);
  st = await ev(() => ({ evo: G.hero.evo, d: G.dialog && G.dialog.kind, log: G.dialogLog }));
  ok('evolve dialogue', st.evo && st.log.includes('evolve'), st);
  await shot('dialogue_evolve.png');

  // ---------- 速度鈕 ----------
  await ev(() => { G.castleHp = G.castleMax; });
  await tapId('speed');
  ok('speed button → 2x and saved', await ev(() => G.speed === 2 && G.save.settings.speed === 2));
  await shot('speed_2x.png');
  for (let i = 0; i < 4 && (await ev(() => G.speed)) !== 1; i++) await tapId('speed');   // 除錯模式另有 4x／8x
  ok('speed button → back to 1x', await ev(() => G.speed === 1 && G.save.settings.speed === 1));

  // ---------- 暫停／設定 ----------
  await tapId('pause');
  ok('pause button opens pause menu', await ev(() => G.paused && UI.overlay === 'pause'));
  const pt = await ev(() => G.time); await wait(800);
  ok('game time frozen while paused', await ev(pt => G.time === pt, pt));
  await shot('pause.png');
  await tap(20, 560);   // 點覆蓋層以外不應穿透到地圖
  ok('taps do not leak through the pause menu', await ev(() => UI.overlay === 'pause' && !G.menu));
  await tapId('pause_settings');
  ok('settings opened from pause', await ev(() => UI.overlay === 'settings' && UI.ovStack.join() === 'pause'));
  await tapId('set_music_5'); await tapId('set_sfx_3');
  st = await ev(() => ({ m: G.save.settings.music, s: G.save.settings.sfx, mv: CFG.MUSIC_VOLUME, sv: CFG.SFX_VOLUME }));
  ok('volume sliders change music/SFX volume', Math.abs(st.m - 0.5) < 1e-6 && Math.abs(st.s - 0.3) < 1e-6 && Math.abs(st.mv - 0.275) < 1e-3 && Math.abs(st.sv - 0.21) < 1e-3, st);
  await tapId('set_shake'); await tapId('set_dmgNum');
  ok('shake + damage-number toggles', await ev(() => G.save.settings.shake === false && G.save.settings.dmgNum === false));
  await shot('settings.png');
  await tapId('set_reset');
  ok('reset asks for confirmation', await ev(() => UI.overlay === 'reset'));
  await shot('reset_confirm.png');
  await tapId('reset_cancel');
  ok('cancel returns to settings, save intact', await ev(() => UI.overlay === 'settings' && G.save.levels[1] && G.save.levels[1].stars === 3));
  await tapId('set_close');
  ok('close settings → back to pause menu', await ev(() => UI.overlay === 'pause' && G.paused));
  await tapId('resume'); await wait(400);
  ok('resume continues the game', await ev(pt => !G.paused && !UI.overlay && G.time > pt, pt));
  await ev(() => setSetting('dmgNum', true));
  // Esc 鍵、切到背景自動暫停
  await page.keyboard.press('Escape');
  ok('Esc toggles pause', await ev(() => G.paused && UI.overlay === 'pause'));
  await page.keyboard.press('Escape');
  await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  ok('auto-pause when the tab goes to background', await ev(() => G.paused && UI.overlay === 'pause'));
  await ev(() => { delete document.hidden; clearOverlay(); });
  ok('settings persist across reload', await ev(() => { const s = JSON.parse(localStorage.getItem(SAVE_KEY)).settings; return s.music === 0.5 && s.shake === false; }));

  // ---------- 傷害數字 ----------
  await ev(() => { __game.give(); for (let i = 0; i < CFG.TOWER_SPOTS.length; i++) if (!towerAt(i)) buildTower(i, 'archer'); for (let i = 0; i < 10; i++) { const e = spawnEnemy(['goblin', 'wolf', 'shield'][i % 3]); e.dist = e.path.total * (0.3 + i * 0.04); } G.notice = null; const h = G.hero; h.x = h.hx = 180; h.y = h.hy = 330; });
  await ev(() => { const e = G.enemies[4]; if (e) castSkill(e.x, e.y); });
  await page.waitForFunction(() => G.fx.filter(f => f.kind === 'dmg').length >= 6, null, { timeout: 6000 }).catch(() => {});
  st = await ev(() => G.fx.filter(f => f.kind === 'dmg').map(f => Math.round(f.v)));
  ok('damage numbers appear on hits', st.length >= 2, st);
  await shot('damage_numbers.png');
  await ev(() => { setSetting('dmgNum', false); G.fx = G.fx.filter(f => f.kind !== 'dmg'); }); await wait(1200);
  ok('damage numbers off → none spawned', await ev(() => G.fx.filter(f => f.kind === 'dmg').length === 0));
  await ev(() => setSetting('dmgNum', true));
  ok('damage-number count capped', await ev(() => { const e = spawnEnemy('boss'); for (let i = 0; i < 200; i++) { const g = spawnEnemy('goblin'); hurt(g, 1, 'phys'); } return G.fx.filter(f => f.kind === 'dmg').length <= 40; }));
  await ev(() => { for (const e of G.enemies) e.remove = true; G.boss = null; Boss.active = null; });

  // ---------- 敵人圖鑑 ----------
  st = await ev(() => G.save.seen);
  ok('bestiary unlocks enemies on first encounter (wolf/goblin/boss seen)', st.goblin && st.wolf && st.boss && !st.bat, st);
  await ev(() => { G.save.seen.shield = 0; delete G.save.seen.shield; spawnEnemy('shield'); });
  ok('first encounter shows notice', await ev(() => G.notice && /盾兵/.test(G.notice.text)));
  await wait(300); await shot('bestiary_notice.png');
  await tapId('pause'); await tapId('pause_bestiary');
  ok('bestiary opens from pause', await ev(() => UI.overlay === 'bestiary'));
  await tapId('best_shield'); await wait(150);
  ok('select entry marks it viewed', await ev(() => UI.bestSel === 'shield' && G.save.seen.shield === 2));
  await shot('bestiary.png');
  await tapId('best_bat');
  ok('locked entry cannot be opened', await ev(() => UI.bestSel === 'shield'));
  await tapId('best_close');
  ok('close bestiary → back to pause', await ev(() => UI.overlay === 'pause'));
  await tapId('quit');
  ok('quit → level map', await ev(() => G.screen === 'map' && !G.paused && !UI.overlay));
  await ev(() => { UI.lvSel = null; }); await wait(80);
  await tapId('map_bestiary');
  ok('bestiary reachable from level map', await ev(() => UI.overlay === 'bestiary'));
  await ev(() => closeOverlay());

  // ---------- 震動 ----------
  await ev(() => { window.__vib.length = 0; Vibe.last = 0; newRun('erin'); G.choosingSupply = false; const e = spawnEnemy('goblin'); e.dist = e.path.total; update(0.05); });
  st = await ev(() => window.__vib.slice());
  ok('vibration on castle hit (navigator.vibrate called)', st.length >= 1, st);
  await ev(() => { setSetting('vibrate', false); window.__vib.length = 0; Vibe.last = 0; const e = spawnEnemy('goblin'); e.dist = e.path.total; update(0.05); });
  ok('vibration toggle off → no calls', await ev(() => window.__vib.length === 0));
  await ev(() => setSetting('vibrate', true));

  // ---------- 重置存檔 ----------
  await ev(() => { G.screen = 'title'; }); await wait(100);
  await tapId('title_settings'); await tapId('set_reset'); await tapId('reset_confirm');
  st = await ev(() => ({ scr: G.screen, lv: Object.keys(G.save.levels).length, shards: G.save.shards, seen: Object.keys(G.save.seen).length, set: G.save.settings, stored: JSON.parse(localStorage.getItem(SAVE_KEY)) }));
  ok('reset save wipes progress, keeps settings', st.scr === 'title' && st.lv === 0 && st.shards === 0 && st.seen === 0 && st.set.music === 0.5 && st.stored.shards === 0, { scr: st.scr, lv: st.lv });

  // ---------- 蕾娜強化 ----------
  st = await ev(() => { newRun('lena'); G.choosingSupply = false; const h = G.hero, hp0 = h.hp; damageUnit(h, 100); const dmg = hp0 - h.hp; h.hp = h.max * 0.5; const before = h.hp; h.x = 180; h.y = 300; chargeImpact(); return { dmg, healed: h.hp - before, max: h.max }; });
  ok('Lena buff: -20% damage taken, charge heals 15%', Math.abs(st.dmg - 80) < 0.01 && Math.abs(st.healed - st.max * 0.15) < 0.6, st);

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ERRORS: none');
  const pass = results.filter(r => r[1]).length;
  console.log(`RESULT ${pass}/${results.length} passed`);
  await browser.close();
  process.exit(pass === results.length && !errors.length ? 0 : 1);
})();
