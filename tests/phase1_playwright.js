// 第 1 階段功能測試：音效、首領、分支塔、傷害類型、敵情預覽、補給站、烽火、黎明事件、天賦樹、射程圈、英雄進化
// 用法：node phase1_playwright.js [URL] [shots=1]
const { chromium, devices } = require('playwright');
const OUT = '/workspace/game-proto/screenshots';
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
  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('lxsw_save_v1', JSON.stringify({ shards: 9, attempts: 1, lastResult: null, lossStreak: 0, bestStars: 0, wins: 0, talents: {} })); });
  await page.reload();
  await page.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total, null, { timeout: 15000 }); await page.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
  const box = await (await page.$('#game')).boundingBox();
  const tap = async (x, y) => { await page.touchscreen.tap(box.x + x / 360 * box.width, box.y + y / 640 * box.height); await page.waitForTimeout(120); };
  // v11：點世界座標（wtap = v10 版面座標 ×WS；wtapW = 世界座標）。先等鏡頭動畫結束；目標不在畫面內時先把鏡頭移過去
  const wtapW = async (x, y) => { await page.waitForFunction(() => !Cam.anim, null, { timeout: 3000 }).catch(() => {}); const [sx, sy] = await page.evaluate(([x, y]) => { let [a, b] = Cam.w2s(x, y); if (a < 20 || a > 340 || b < 70 || b > 550) { Cam.set(Cam.posFor(x, y, Cam.z)); [a, b] = Cam.w2s(x, y); } return [a, b]; }, [x, y]); await page.waitForTimeout(60); return tap(sx, sy); };
  const wtap = (x, y) => wtapW(x * 1.25, y * 1.25);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (n, keepBanner) => { if (!SHOTS) return; if (!keepBanner) await ev(() => { G.fx = G.fx.filter(f => f.kind !== 'banner'); }); await page.waitForTimeout(60); await page.screenshot({ path: `${OUT}/${n}` }); };
  ok('art loaded (incl. branch towers + boss)', await ev(() => Art.failed.length === 0 && ['tower_ranger', 'tower_tesla', 'boss_big', 'boss'].every(k => Art.img[k])));

  // ---- 天賦樹 ----
  await tap(305, 554);                       // 天賦樹按鈕（同時解鎖音訊）
  ok('talent screen opens', await ev(() => G.screen === 'talents'));
  await tap(62, 122 + 37); await tap(120, 532);       // 開墾
  await tap(180, 122 + 37); await tap(120, 532);      // 石匠
  await tap(298, 122 + 37); await tap(120, 532);      // 鍛鍊
  await tap(298, 218 + 37); await tap(120, 532);      // 傳承
  await tap(62, 218 + 37);                            // 選「豐饒」（顯示說明）
  const tal = await ev(() => ({ t: G.save.talents, s: G.save.shards }));
  ok('talents unlocked & shards spent', tal.t.e1 && tal.t.d1 && tal.t.h1 && tal.t.h2 && tal.s === 9 - 1 - 1 - 1 - 2, tal);
  ok('talents persisted in localStorage', await ev(() => JSON.parse(localStorage.getItem('lxsw_save_v1')).talents.h2 === true));
  await tap(298, 314 + 37);                           // 專注（碎片不足 → 不可買）
  await page.waitForTimeout(150); await shot('talent_tree.png');
  await tap(180, 598);                                // 返回
  ok('back to select', await ev(() => G.screen === 'select'));

  // ---- 開局：補給站選擇 ----
  await tap(202, 554);
  ok('supply choice shown at start', await ev(() => G.screen === 'play' && G.choosingSupply === true));
  const t0 = await ev(() => G.phaseT); await page.waitForTimeout(500);
  ok('day timer paused while choosing', await ev(t0 => G.phaseT === t0, t0));
  await wtap(196, 226);                                // 前線中樞旗幟
  ok('select front post', await ev(() => G.supplyPick === 'front'));
  await page.waitForTimeout(100); await shot('supply_choice.png');
  await tap(180, 553);                                // 確定
  const post = await ev(() => ({ id: G.post.id, road: Math.round(G.road.total), wood: G.res.wood, lvl: G.hero.lvl, max: G.hero.max }));
  ok('front post chosen, road longer than east', post.id === 'front' && post.road > 500, post);
  ok('talent effects applied (wood+40, hero Lv3, hp+15%)', post.wood === 210 && post.lvl === 3, post);
  ok('postInfo: front covers all spots, rear does not', await ev(() => postInfo(CFG.SUPPLY_SPOTS[2]).cover === 12 && postInfo(CFG.SUPPLY_SPOTS[0]).cover < 12));

  // ---- 建塔：射程預覽（幽靈）----
  await ev(() => __game.give(3000, 3000, 200));
  await wtap(120, 62);                                 // 塔位 0
  ok('spot menu open', await ev(() => G.menu && G.menu.kind === 'spot'));
  const menuOpt = await ev(() => UI.buttons.filter(b => /^opt/.test(b.id)).map(b => [b.id, Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)]));
  const o0 = menuOpt.find(b => b[0] === 'opt0');
  await tap(o0[1], o0[2]);
  ok('first tap = preview (no build yet)', await ev(() => G.towers.length === 0 && G.menu && G.menu.pick === 'archer'));
  await shot('tower_range_ghost.png');
  await tap(o0[1], o0[2]);
  ok('second tap builds archer', await ev(() => G.towers.length === 1 && G.towers[0].type === 'archer'));
  ok('talent 石匠 discount applied', await ev(() => G.towers[0].spent.wood === 54));
  // 選取塔：射程圈 + 升級預覽
  await wtap(120, 50);
  ok('tower menu open with range', await ev(() => G.menu && G.menu.kind === 'spot' && !!towerAt(0)));
  await shot('tower_range.png');
  // 升到 3 級 → 分支
  await ev(() => { upgradeTower(towerAt(0)); upgradeTower(towerAt(0)); G.menu = null; });
  await wtap(120, 50);
  const brOpt = await ev(() => UI.buttons.filter(b => /^opt/.test(b.id)).map(b => [b.id, Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)]));
  await tap(brOpt[0][1], brOpt[0][2]);
  ok('branch modal opens at Lv3', await ev(() => G.menu && G.menu.kind === 'branch'));
  await tap(98, 300);                                  // 左卡：遊俠塔
  ok('branch pick ranger', await ev(() => G.menu.pick === 'ranger'));
  await shot('branch_choice.png');
  await tap(120, 474);                                 // 確定
  ok('tower became ranger (Lv4, permanent)', await ev(() => towerAt(0).br === 'ranger' && towerAt(0).lvl === 4 && G.menu === null));
  ok('cannot branch again', await ev(() => branchTower(towerAt(0), 'musket') === false));

  // 其他分支塔（除錯指令）
  await ev(() => {
    const L = [[1, 'archer', 'musket'], [2, 'barracks', 'templar'], [4, 'barracks', 'berserker'], [3, 'mage', 'arcane'], [5, 'mage', 'necro'], [6, 'cannon', 'catapult'], [8, 'cannon', 'tesla']];
    for (const [s, ty, br] of L) { buildTower(s, ty); const t = towerAt(s); upgradeTower(t); upgradeTower(t); branchTower(t, br); }
  });
  ok('all 8 branches built', await ev(() => G.towers.filter(t => t.br).map(t => t.br).sort().join() === 'arcane,berserker,catapult,musket,necro,ranger,templar,tesla'));

  // ---- 傷害類型 ----
  const dmg = await ev(() => {
    G.phase = 'night'; G.choosingSupply = false;
    const out = {};
    const s1 = spawnEnemy('shield'); s1.dist = 300; const p = pathAt(G.path, 300); s1.x = p.x; s1.y = p.y;
    const a = pathAt(G.path, 330), b = pathAt(G.path, 270);
    let h0 = s1.hp; hurt(s1, 20, 'phys', 'tower', a); out.front = +(h0 - s1.hp).toFixed(1);
    h0 = s1.hp; hurt(s1, 20, 'phys', 'tower', b); out.back = +(h0 - s1.hp).toFixed(1);
    h0 = s1.hp; hurt(s1, 20, 'magic', 'tower', a); out.magicHeavy = +(h0 - s1.hp).toFixed(1);
    const g = spawnEnemy('goblin'); h0 = g.hp; hurt(g, 20, 'magic', 'tower'); out.magicLight = +(h0 - g.hp).toFixed(1);
    const bat = spawnEnemy('bat'); bat.x = 130; bat.y = 70;
    out.mageHitsBat = pickTarget(130, 70, 50, tStat(towerAt(3), 'air')) === bat;
    out.archerHitsBat = pickTarget(130, 70, 50, tStat(towerAt(0), 'air')) === bat;
    out.teslaAir = tStat(towerAt(8), 'air');
    G.enemies = []; G.phase = 'day';
    return out;
  });
  ok('shield: front phys -50%, back full', dmg.front === 10 && dmg.back === 20, dmg);
  ok('magic x1.5 vs heavy, x1 vs light', dmg.magicHeavy === 30 && dmg.magicLight === 20, dmg);
  ok('flying only archer-line', dmg.archerHitsBat && !dmg.mageHitsBat && dmg.teslaAir === false, dmg);

  // ---- 敵情預覽（黃昏）----
  await ev(() => { G.night = 2; skipPhase(); });
  ok('preview auto-shown at dusk', await ev(() => !!G.preview && G.phase === 'dusk'));
  ok('extra raiders from front post (risk 2)', await ev(() => nightPlan()[2].find(g => g[0] === 'raider')[1] === 1 + 2));
  await page.waitForTimeout(250); await ev(() => { G.fx = G.fx.filter(f => f.kind !== 'pillar' && f.kind !== 'text'); }); await shot('wave_preview.png');

  // ---- 夜晚：號角音效、烽火 ----
  await ev(() => skipPhase());
  ok('night started', await ev(() => G.phase === 'night'));
  const f0 = await ev(() => G.res.front = 80);
  await tap(215, 610);
  const bc = await ev(() => ({ t: G.beaconT, used: G.beaconUsed, front: G.res.front }));
  ok('beacon used: timer on, front food spent', bc.t > 9 && bc.used && bc.front <= 80 - 30, bc);
  ok('beacon only once per night', await ev(() => useBeacon() === false));
  ok('towers fire faster during beacon', await ev(() => { const t = towerAt(1); t.atkT = 0; const e = spawnEnemy('goblin'); e.x = t.x; e.y = t.y + 20; e.dist = 999; updateTowers(0.01); const r = t.atkT; G.enemies = []; return Math.abs(r - CFG.BRANCHES.musket.rate / CFG.BEACON.rate) < 0.05; }));
  await page.evaluate(() => __game.speed(4)); await page.waitForTimeout(4000); await page.evaluate(() => __game.speed(1));
  // 特斯拉塔、投石車：放一隻敵人在射程內，確認開火（連鎖閃電、投石）
  const fire = await ev(() => { const r = {}; for (const s of [8, 6]) { const t = towerAt(s); t.atkT = 0; const e = spawnEnemy('shield'); const p = nearestOnPath(G.path, t.x, t.y); e.dist = p.d; e.x = p.x; e.y = p.y; const h0 = e.hp; updateTowers(0.01); r[t.br] = t.atkT > 0; } return r; });
  ok('tesla & catapult fire', fire.tesla && fire.catapult, fire);
  ok('skeletons summoned by necro', await ev(() => G.soldiers.some(s => s.skeleton)));
  await page.screenshot({ path: `${OUT}/extra_branches_night.png` });

  // ---- 英雄進化 ----
  await ev(() => __game.xp(400));
  const hx = await ev(() => G.hero.evoReady);
  ok('Lv10 -> evolution ready', hx && await ev(() => G.hero.lvl === 10));
  const preMax = await ev(() => G.hero.max);
  await tap(100, 610);                                // 進化按鈕
  ok('evolution cut-in active', await ev(() => CutIn.active && CutIn.active.evo));
  await page.waitForTimeout(1100); await shot('evolution.png');
  await page.waitForTimeout(1300);
  const evo = await ev(() => ({ evo: G.hero.evo, max: G.hero.max, sk: skillName(G.hero) }));
  ok('evolved: +HP, skill renamed', evo.evo && evo.max > preMax * 1.3 && evo.sk === '月光箭雨', evo);
  await ev(() => { G.hero.hx = G.hero.x = 200; G.hero.hy = G.hero.y = 330; });
  await page.waitForTimeout(500);
  await ev(() => Cam.set(Cam.posFor(200, 300, 1))); await page.waitForTimeout(200);
  { const [cx, cy] = await ev(() => Cam.w2s(200 - 40, 330 - 70)); await page.screenshot({ path: `${OUT}/extra_evolved_hero.png`, clip: { x: box.x + (cx / 360) * box.width, y: box.y + (cy / 640) * box.height, width: box.width * 160 / 360, height: box.height * 110 / 640 } }); }
  ok('evolved skill: wider pierce rain', await ev(() => { G.hero.cd = 0; castSkill(180, 300); const z = G.zones[G.zones.length - 1]; return z.r === 70 * CFG.WS && z.evo; }));

  // ---- 首領 ----
  await ev(() => { G.enemies = []; G.spawnList = []; G.night = 3; });
  await ev(() => __game.boss());
  ok('boss intro active & game paused', await ev(() => !!Boss.active && Boss.timeScale() === 0));
  await page.waitForTimeout(1900); await shot('boss_intro.png');
  await page.waitForTimeout(2300);
  ok('boss intro finished', await ev(() => !Boss.active && G.boss && live(G.boss)));
  const horn = await ev(() => { const b = G.boss, n0 = G.enemies.filter(e => e.d.raider).length; hurt(b, b.max * 0.3, 'true'); return { horns: b.hornIdx, raiders: G.enemies.filter(e => e.d.raider).length - n0, hornT: b.hornT }; });
  ok('boss horn at 75% summons 3 raiders and pauses', horn.horns === 1 && horn.raiders === 3 && horn.hornT > 0, horn);
  await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/extra_boss_horn.png` });
  const kill = await ev(() => { const s0 = G.save.shards; hurt(G.boss, 1e6, 'true'); return { shards: G.save.shards - s0, boss: G.boss }; });
  ok('boss kill grants shards', kill.shards === 2 && kill.boss === null, kill);
  ok('night 3 last wave contains boss', await ev(() => nightPlan(3)[2].some(g => g[0] === 'boss')));

  // ---- 黎明事件（取捨）----
  await ev(() => { G.enemies = []; G.spawnList = []; G.night = 1; G.phase = 'night'; endNight(); });
  ok('dawn choices have pro/con', await ev(() => G.dawnChoices.length === 2 && G.dawnChoices.every(e => e.pro && e.con)));
  const evt = await ev(() => { G.res.stone = 0; G.dawnChoices = [CFG.EVENTS.find(e => e.id === 'merchant'), CFG.EVENTS.find(e => e.id === 'merc')]; chooseDawn(0); const blocked = G.phase === 'dawn'; chooseDawn(1); return { blocked, phase: G.phase, upkeep: G.upkeep.front }; });
  ok('unaffordable event blocked; merc adds upkeep', evt.blocked && evt.phase === 'day' && evt.upkeep === 12, evt);
  await ev(() => { G.night = 1; G.phase = 'dawn'; G.dawnChoices = [CFG.EVENTS[0], CFG.EVENTS[1]]; });
  await page.waitForTimeout(150); await shot('extra_dawn_tradeoff.png');
  await ev(() => { G.res.stone = 100; chooseDawn(0); });

  // ---- 音效 ----
  await page.waitForTimeout(300);
  const sx = await ev(() => __game.sfx());
  const want = ['arrow_shoot', 'musket', 'magic_cast', 'tesla', 'catapult', 'build', 'upgrade', 'branch', 'click', 'horn_night', 'beacon', 'boss_intro', 'boss_roar', 'evolve', 'level_up', 'enemy_hurt', 'dawn'];
  ok(`sfx mode ${sx.mode}, all ${sx.total} loaded`, sx.ready === sx.total, { ready: sx.ready, total: sx.total });
  const missing = want.filter(k => !sx.log.includes(k));
  ok('sfx actually played', missing.length === 0, { missing, played: [...new Set(sx.log)].length });
  // 靜音時不播
  await ev(() => { Music.toggle(); }); const before = (await ev(() => SFX.log.length));
  await ev(() => { SFX.last = {}; SFX.play('build'); }); const after = await ev(() => SFX.log.length);
  ok('muted => no sfx', before === after);
  await ev(() => Music.toggle());
  // 節流：同一音效連發
  const thr = await ev(() => { SFX.last = {}; SFX.voices = []; let n = 0; for (let i = 0; i < 10; i++) if (SFX.play('arrow_shoot')) n++; return n; });
  ok('sfx throttled (10 rapid calls -> 1)', thr === 1, thr);

  // ---- 遷移補給站（白天）----
  await ev(() => { G.phase = 'day'; G.menu = null; G.res.wood = 500; });
  await wtap(196, 222);
  ok('tap post opens post menu', await ev(() => G.menu && G.menu.kind === 'post'));
  const pm = await ev(() => UI.buttons.find(b => b.id === 'opt0')); await tap(pm.x + 20, pm.y + 20);
  ok('relocate overlay', await ev(() => G.choosingSupply === 'move'));
  await wtap(342, 236);
  const rel = await ev(() => { const w0 = G.res.wood; G.speed = 1; confirmSupply(); return { post: G.post.id, cost: w0 - G.res.wood, cs: G.choosingSupply }; });
  ok('relocated to east (costs 40 wood)', rel.post === 'east' && rel.cost === 40 && !rel.cs, rel);

  console.log('ERRORS:', errors.length ? errors : 'none');
  const fails = results.filter(r => !r[1]);
  console.log(`RESULT ${results.length - fails.length}/${results.length} passed`);
  await browser.close();
})();
