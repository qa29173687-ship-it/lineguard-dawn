// itch.io 頁面用遊戲截圖（720×1280，直式）→ /workspace/itch/screenshot_*.png
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/workspace/itch';
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';   // 不加 debug=1：畫面上沒有除錯字
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total);
  const ev = (f, a) => p.evaluate(f, a);
  const shot = async n => { await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/${n}` }); console.log('shot', n); };
  const prep = () => ev(() => { G.save.tutorial = { done: true, l1: true }; G.save.tips = Object.fromEntries(['barracks', 'mage', 'dusk', 'cannon', 'supply', 'beacon', 'skill', 'preview', 'branch', 'raider', 'farm', 'house'].map(k => [k, 1])); CFG.SKILL_CUTIN = false; CFG.BOSS_INTRO = false; });
  // 跑模擬（不畫圖）直到條件成立
  const sim = (cond, max = 400) => ev(([c, max]) => { const f = new Function('return ' + c); G.speed = 0; let t = 0; while (!f() && t < max && G.screen === 'play') { G.res.front = Math.max(G.res.front, 300); update(0.05); t += 0.05; if (G.dawnChoices) chooseDawn(0); G.tip = null; G.dialog = null; } G.speed = 1; return t; }, [cond, max]);
  // 1) 白天建設（第 5 關：塔＋農田＋補給線）
  await prep();
  await ev(() => { __game.start('erin', null, 'east', 5); __game.give(3000, 3000, 600); G.res.front += 200;
    CFG.TOWER_SPOTS.forEach((s, i) => { if (i < 6) { buildTower(i, G.lv.towers[i % G.lv.towers.length]); const t = towerAt(i); if (t && i % 2) upgradeTower(t); } });
    CFG.PLOTS.forEach((pl, i) => { if (i < 6) placeBuilding(i, ['farm', 'lumber', 'house', 'quarry', 'farm', 'granary'][i]); });
    G.tip = null; G.dialog = null; });
  await sim('false', 3.5);
  await shot('screenshot_1_day_build.png');
  // 2) 夜戰：進化艾琳箭雨（第 6 關）
  await prep();
  await ev(() => { __game.start('erin', null, 'east', 6); __game.give(5000, 5000, 900);
    CFG.TOWER_SPOTS.forEach((s, i) => { buildTower(i, G.lv.towers[i % G.lv.towers.length]); const t = towerAt(i); if (t) { upgradeTower(t); upgradeTower(t); if (G.lv.branches && i % 3 === 0) branchTower(t, t.def.branches[i % 2]); } });
    G.hero.lvl = 10; evolveHero(); G.fx = []; });
  await sim("G.phase === 'night' && G.enemies.length >= 14", 400);
  await ev(() => { const e = G.enemies.filter(e => !e.under).sort((a, b) => b.dist - a.dist)[0]; if (e) { G.hero.x = G.hero.hx = e.x - 30; G.hero.y = G.hero.hy = e.y + 10; G.hero.cd = 0; castSkill(e.x, e.y); } });
  await p.waitForTimeout(500); await shot('screenshot_2_night_evo_skill.png');
  // 3) 首領戰（第 10 關）
  await prep();
  await ev(() => { __game.start('lena', null, 'east', 10); __game.give(6000, 6000, 900);
    CFG.TOWER_SPOTS.forEach((s, i) => { buildTower(i, G.lv.towers[i % G.lv.towers.length]); const t = towerAt(i); if (t) { upgradeTower(t); upgradeTower(t); if (G.lv.branches) branchTower(t, t.def.branches[i % 2]); } });
    G.hero.lvl = 10; evolveHero(); });
  await sim("(G.castleHp = G.castleMax, G.boss && G.boss.dist > 150)", 2000);
  await ev(() => { const e = G.boss; if (e) { G.hero.x = G.hero.hx = e.x - 18; G.hero.y = G.hero.hy = e.y + 6; } });
  await p.waitForTimeout(700); await shot('screenshot_3_boss.png');
  // 4) 關卡地圖
  await ev(() => { localStorage.clear(); G.save = loadSave(); for (let i = 1; i <= 6; i++) G.save.levels[i - 1] = { stars: i < 5 ? 3 : 2, wins: 1, tries: 1, mods: {} }; G.screen = 'map'; UI.lvSel = 7; });
  await shot('screenshot_4_level_map.png');
  // 5) 英雄日常
  await prep();
  await ev(() => { clearOverlay(); __game.start('vera', null, 'east', 4); G.tip = null; G.dialog = null; endGame(true); });
  await p.waitForFunction(() => UI.overlay === 'outing', null, { timeout: 5000 }).catch(() => {});
  await shot('screenshot_5_outing.png');
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
