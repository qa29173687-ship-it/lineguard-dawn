// 第 2 階段：關卡系統測試（10 關載入／可勝／可敗、解鎖流程、存檔讀檔、挑戰條件、縱火狂／地鼠工兵、進化插畫切換）
// 用法：node levels_playwright.js [URL] [shots=1]
const { chromium, devices } = require('playwright');
const path = require('path');
const OUT = '/workspace/game-proto/screenshots/v6';
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
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total, null, { timeout: 20000 });
  const box = await (await page.$('#game')).boundingBox();
  const tap = async (x, y) => { await page.touchscreen.tap(box.x + x / 360 * box.width, box.y + y / 640 * box.height); await page.waitForTimeout(120); };
  // v11：點世界座標（wtap = v10 版面座標 ×WS；wtapW = 世界座標）。先等鏡頭動畫結束；目標不在畫面內時先把鏡頭移過去
  const wtapW = async (x, y) => { await page.waitForFunction(() => !Cam.anim, null, { timeout: 3000 }).catch(() => {}); const [sx, sy] = await page.evaluate(([x, y]) => { let [a, b] = Cam.w2s(x, y); if (a < 20 || a > 340 || b < 70 || b > 550) { Cam.set(Cam.posFor(x, y, Cam.z)); [a, b] = Cam.w2s(x, y); } return [a, b]; }, [x, y]); await page.waitForTimeout(60); return tap(sx, sy); };
  const wtap = (x, y) => wtapW(x * 1.25, y * 1.25);
  const ev = (f, a) => page.evaluate(f, a);
  const tapId = async id => { const b = await ev(id => UI.buttons.find(b => b.id === id), id); if (!b) return false; await tap(b.x + b.w / 2, b.y + b.h / 2); return true; };
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${OUT}/${n}` }); };
  // 頁面內快速模擬到結束（不畫圖）
  const simToEnd = (strong) => ev(strong => {
    CFG.BOSS_INTRO = false; CFG.SKILL_CUTIN = false; G.speed = 0; let t = 0;
    while (G.screen === 'play' && t < 5000) {
      for (let k = 0; k < 10; k++) { update(0.05); t += 0.05; }
      if (G.phase === 'dawn' && G.dawnChoices) chooseDawn(0);
      if (G.choosingSupply) G.choosingSupply = false;
      if (strong) { const h = G.hero; if (h && !h.dead && G.enemies.length) { const e = G.enemies.find(e => !e.under) || G.enemies[0]; h.hx = e.x; h.hy = e.y + 12; h.moving = true; } }
      else if (G.hero) { G.hero.hx = 20; G.hero.hy = CFG.WBOT - 10; G.hero.moving = true; }
    }
    G.speed = 1; return { screen: G.screen, end: G.end, t: Math.round(t) };
  }, strong);

  ok('art loaded, no failures', await ev(() => Art.failed.length === 0 && ['arsonist', 'sapper', 'erin_evo_portrait', 'lena_evo_portrait', 'vera_evo_portrait'].every(k => Art.img[k])));
  ok('evo cut-in panels loaded (full illustrations, with background)', await ev(() => ['erin', 'lena', 'vera'].every(h => CutIn.ready[h + '_evo'] && /_evo_panel\.jpg$/.test(CutIn.img[h + '_evo'].src))));
  ok('starts on title screen', await ev(() => G.screen === 'title'));
  await shot('title.png');

  // ---- 標題 → 關卡地圖 → 關卡卡片 → 英雄選擇 → 開打 ----
  await tapId('title_start');
  ok('title → level map', await ev(() => G.screen === 'map'));
  ok('fresh save: only level 1 unlocked', await ev(() => LEVELS.map(l => levelUnlocked(l.id)).join() === [true, ...Array(9).fill(false)].join()));
  await tapId('lv_3');
  ok('locked level does not open card', await ev(() => UI.lvSel === null));
  await tapId('lv_1');
  ok('level 1 card opens', await ev(() => UI.lvSel === 1));
  await tapId('mod_toggle');
  ok('challenge modifier toggles on', await ev(() => UI.modOn === true));
  await shot('level_card_1.png');
  await tapId('mod_toggle');
  await tapId('card_go');
  ok('card → hero select for level 1', await ev(() => G.screen === 'select' && G.levelId === 1 && G.mod === null));
  await tapId('hero_vera'); await tapId('start');
  const l1 = await ev(() => ({ scr: G.screen, lv: G.levelId, hero: G.hero.id, nights: CFG.NIGHTS, supply: !!G.post, cs: G.choosingSupply, towers: G.lv.towers, map: CFG.MAP_BG }));
  ok('level 1 starts: 2 nights, archer only, no supply line', l1.scr === 'play' && l1.lv === 1 && l1.hero === 'vera' && l1.nights === 2 && !l1.supply && !l1.cs && l1.towers.join() === 'archer', l1);
  // 塔選單只列出開放的塔
  await ev(() => { G.fx = []; }); await wtap(130, 162);   // 第 1 關塔位 0
  ok('tower menu lists only unlocked towers (archer)', await ev(() => G.menu && G.menu.kind === 'spot' && UI.buttons.filter(b => /^opt/.test(b.id)).length === 1));
  ok('cannot build locked tower type', await ev(() => buildTower(1, 'mage') === false && buildTower(1, 'barracks') === false));
  await ev(() => { G.menu = null; });

  // ---- 每關：載入、地圖、白天截圖、可勝（除錯資源）----
  for (let L = 1; L <= 10; L++) {
    await ev(L => { localStorage.clear(); G.save = loadSave(); __game.start(['erin', 'lena', 'vera'][L % 3], null, null, L); if (G.choosingSupply) { G.supplyPick = 'front'; confirmSupply(); } G.fx = []; }, L);
    await page.waitForFunction(() => R.mapImg && R.mapImg.src.endsWith(CFG.MAP_BG.replace(/^assets/, 'assets')) || (R.mapImg && R.mapImg.src.includes(CFG.MAP_BG)), null, { timeout: 8000 }).catch(() => {});
    const info = await ev(() => ({ id: G.levelId, map: CFG.MAP_BG, img: R.mapImg && R.mapImg.src.split('/').slice(-2).join('/'), paths: G.paths.length, pads: CFG.TOWER_SPOTS.length, plots: CFG.PLOTS.length, nights: CFG.NIGHTS, waves: CFG.NIGHT_WAVES.length, post: G.post && G.post.id }));
    ok(`L${L} loads (map ${info.img}, ${info.paths} lane(s), ${info.pads} pads, ${info.nights} nights)`, info.id === L && info.map.endsWith(info.img) && info.waves === info.nights && info.pads >= 6, info);
    await page.waitForTimeout(150); await shot(`level_${String(L).padStart(2, '0')}.png`);
    await ev(() => { __game.give(9000, 9000, 900); G.res.front += 900; const bats = G.lv.waves.flat(2).some(g => g[0] === 'bat'); CFG.TOWER_SPOTS.forEach((s, i) => { const ty = bats && i % 2 === 0 ? 'archer' : G.lv.towers[i % G.lv.towers.length]; buildTower(i, ty); const t = towerAt(i); if (t) { upgradeTower(t); upgradeTower(t); if (G.lv.branches) branchTower(t, t.def.branches[i % 2]); } }); });   // 除錯：全部塔位升滿（分支交錯；v9 難度後全選同一分支可能守不住）
    const r = await simToEnd(true);
    ok(`L${L} can be won (debug resources)`, r.screen === 'end' && r.end.win, { stars: r.end && r.end.stars, t: r.t });
  }
  // 敗北
  for (const L of [1, 5, 10]) {
    await ev(L => { __game.start('erin', null, null, L); G.choosingSupply = false; }, L);
    const r = await simToEnd(false);
    ok(`L${L} can be lost (no defence)`, r.screen === 'end' && !r.end.win, { nights: r.end && r.end.nights });
  }

  // ---- 解鎖流程與存檔 ----
  await ev(() => { localStorage.clear(); G.save = loadSave(); });
  await ev(() => { __game.start('lena', null, null, 1, 'halfCastle'); });
  ok('halfCastle modifier halves castle HP', await ev(() => G.castleMax === Math.ceil(LEVELS[0].castle / 2)));
  await ev(() => { __game.give(9000, 9000, 900); CFG.TOWER_SPOTS.forEach((s, i) => { buildTower(i, 'archer'); upgradeTower(towerAt(i)); upgradeTower(towerAt(i)); }); });
  const w1 = await simToEnd(true);
  ok('win L1 with modifier → extra shards', w1.end.win && w1.end.modBonus === 2, w1.end);
  ok('L2 unlocked after clearing L1, L3 still locked', await ev(() => levelUnlocked(2) && !levelUnlocked(3)));
  await ev(() => { G.screen = 'end'; });
  await page.waitForTimeout(100); await shot('level_end_win.png');
  await tapId('next');
  ok('end screen "next level" opens L2 card on the map', await ev(() => G.screen === 'map' && UI.lvSel === 2));
  await ev(() => { UI.lvSel = null; }); await page.waitForTimeout(100); await shot('level_map.png');
  const saved = await ev(() => JSON.parse(localStorage.getItem(SAVE_KEY)));
  await page.reload(); await page.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total, null, { timeout: 20000 });
  const after = await ev(() => ({ lv1: G.save.levels[1], unl2: levelUnlocked(2), unl3: levelUnlocked(3), shards: G.save.shards, stars: totalStars() }));
  ok('save/load: stars, modifier completion, unlocks and shards persist across reload', after.lv1 && after.lv1.stars === saved.levels[1].stars && after.lv1.mods.halfCastle && after.unl2 && !after.unl3 && after.shards === saved.shards, after);

  // ---- 挑戰條件 ----
  const mods = await ev(() => {
    const o = {};
    __game.start('erin', null, null, 3, 'noBarracks'); __game.give(9000, 9000, 0); o.noBarracks = buildTower(0, 'barracks') === false && buildTower(0, 'archer') === true;
    __game.start('erin', null, null, 6, 'max4'); G.choosingSupply = false; __game.give(9000, 9000, 0); for (let i = 0; i < 6; i++) buildTower(i, 'archer'); o.max4 = G.towers.length === 4;
    __game.start('erin', null, null, 9, 'noHeroSkill'); G.choosingSupply = false; o.noSkill = castSkill(180, 200) === false;
    return o;
  });
  ok('modifiers: 不准蓋兵營 / 最多 4 座塔 / 不能施放技能', mods.noBarracks && mods.max4 && mods.noSkill, mods);

  // ---- 縱火狂與地鼠工兵 ----
  const side = await ev(() => {
    __game.start('vera', null, null, 9); G.supplyPick = 'east'; confirmSupply(); __game.give(900, 900, 300);
    placeBuilding(0, 'farm'); placeBuilding(1, 'lumber');
    G.phase = 'night'; G.nightT = 0; G.spawnList = []; G.waveStarts = [0]; G.speed = 0;
    __game.spawn('arsonist'); __game.spawn('sapper'); G.hero.x = 20; G.hero.y = 60; G.hero.hx = null;
    const o = { underUntargetable: false, burned: 0, broke: false, blocked: false, repaired: false, wood0: 0 };
    const sp = G.enemies.find(e => e.type === 'sapper'); const hp0 = sp.hp; hurt(sp, 50, 'phys'); o.underUntargetable = sp.hp === hp0 && pickTarget(sp.x, sp.y, 50, true) !== sp;
    for (let i = 0; i < 1200; i++) {
      update(0.05); G.hero.x = 20; G.hero.y = 60; G.hero.moving = false; G.hero.hx = null; if (G.phase === 'dawn' && G.dawnChoices) chooseDawn(0);   // 黎明：繼續到白天（村民白天也會修路）
      o.burned = Math.max(o.burned, G.buildings.filter(b => b.burned).length);
      if (G.roadBreaks.length) o.broke = true;
      if (G.wagon.blocked) o.blocked = true;
      if (o.broke && !G.roadBreaks.length) { o.repaired = true; break; }
    }
    G.phase = 'day'; G.enemies = [];
    const b = G.buildings.find(b => b.burned); o.wood0 = G.res.wood;
    o.repairOk = b ? repairBuilding(b) && !b.burned && G.res.wood === o.wood0 - CFG.REPAIR_COST.building.wood : false;
    G.speed = 1; return o;
  });
  ok('sapper underground is untargetable', side.underUntargetable, side);
  ok('arsonist burns rear buildings; repair costs wood', side.burned >= 1 && side.repairOk, side);
  ok('sapper breaks supply road, wagon blocked, villager repairs it', side.broke && side.blocked && side.repaired, side);
  await ev(() => { __game.start('vera', null, null, 8); G.choosingSupply = false; __game.give(900, 900, 300); placeBuilding(0, 'farm'); placeBuilding(2, 'farm'); G.phase = 'night'; G.spawnList = []; G.waveStarts = [0]; __game.spawn('arsonist'); __game.spawn('arsonist'); G.fx = []; G.speed = 0; for (let i = 0; i < 260; i++) { update(0.05); G.hero.x = 20; G.hero.y = 60; } G.speed = 1; });
  await page.waitForTimeout(150); await shot('arsonist_burn.png');

  // ---- 進化：存檔旗標、英雄選擇卡切換進化插畫 ----
  await ev(() => { __game.start('lena', null, null, 2); __game.evolve(); });
  await page.waitForTimeout(1300); await shot('evo_cutin_lena_check.png');
  await page.waitForFunction(() => !CutIn.active, null, { timeout: 15000 });
  ok('evolving sets the evolved-ever flag in save', await ev(() => G.save.evolved.lena === true && JSON.parse(localStorage.getItem(SAVE_KEY)).evolved.lena === true));
  await ev(() => { G.screen = 'select'; G.levelId = 2; });
  await page.waitForTimeout(100);
  ok('alt-art toggle shown only for evolved heroes', await ev(() => !!UI.buttons.find(b => b.id === 'alt_lena') && !UI.buttons.find(b => b.id === 'alt_erin')));
  await tapId('alt_lena');
  ok('toggle switches to evolved illustration and persists', await ev(() => G.save.altArt.lena === true && JSON.parse(localStorage.getItem(SAVE_KEY)).altArt.lena === true));
  await page.waitForTimeout(100); await shot('select_evo_alt.png');

  console.log('ERRORS:', errors.length ? errors : 'none');
  const pass = results.filter(r => r[1]).length;
  console.log(`RESULT ${pass}/${results.length} passed`);
  await browser.close();
  process.exit(pass === results.length && !errors.length ? 0 : 1);
})();
