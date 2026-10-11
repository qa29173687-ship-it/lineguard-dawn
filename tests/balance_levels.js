// 第 2 階段平衡：10 關 × 3 英雄自動玩家（不作弊，只用實際資源）。
// 頁面內直接以固定步長模擬（不靠 requestAnimationFrame），比即時快很多。
// 用法：node balance_levels.js [關卡,逗號分隔] [英雄,逗號] [每組次數] [分支：0 不用／1 第一個分支／2 第二個分支／r 隨機]
const { chromium, devices } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8765/index.html?debug=1';
const levels = (process.argv[2] || '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
const heroes = (process.argv[3] || 'erin,lena,vera').split(',');
const reps = +(process.argv[4] || 2), brMode = process.argv[5] || '1', useBranches = brMode !== '0';
// 試調用：HPMUL="4:1.3,5:1.3" → 暫時把該關敵人血量倍率乘上去（找到合適值後寫回 tools/levels_def.py）
const RAMP = Object.fromEntries((process.env.RAMP || '').split(',').filter(Boolean).map(x => x.split(':').map(Number)));   // RAMP="8:1.4"：第 1 夜 ×1，最後一夜 ×1.4（線性）
const HPMUL = Object.fromEntries((process.env.HPMUL || '').split(',').filter(Boolean).map(x => x.split(':').map(Number)));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 12'] }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL); await p.waitForFunction(() => Art.loaded === Art.total, null, { timeout: 20000 });
  const all = [];
  for (const L of levels) for (const hero of heroes) for (let r = 0; r < reps; r++) {
    await p.evaluate(() => localStorage.clear());
    const res = await p.evaluate(([L, hero, brMode, hpMul, ramp]) => {
      const useBranches = brMode !== '0';
      G.save = loadSave(); G.save.tutorial = { 1: 'skipped', 2: 'skipped' }; CFG.BOSS_INTRO = false; CFG.SKILL_CUTIN = false;   // 機器人＝熟練玩家：略過教學
      if (hpMul || ramp) { const lv = LEVELS[L - 1]; lv._hp0 = lv._hp0 || lv.hp.slice(); const n = lv._hp0.length; lv.hp = lv._hp0.map((v, i) => v * (hpMul || 1) * (1 + ((ramp || 1) - 1) * i / Math.max(1, n - 1))); }
      __game.start(hero, null, null, L); G.speed = 0;   // 主迴圈不推進；下面自己跑
      if (G.lv.supply) { G.supplyPick = G.lv.supply.default; confirmSupply(); }
      const log = []; let evoNight = null, lastKey = '';
      // 塔位排序：靠近路線越多段的越好
      const pads = CFG.TOWER_SPOTS.map((s, i) => { let c = 0; for (const P of G.paths) for (let d = 0; d < P.total; d += 2 * (CFG.WS || 1))   /* 細取樣：避免版面放大後的四捨五入造成同分塔位順序改變 */ { const q = pathAt(P, d); if (Math.hypot(q.x - s[0], q.y - s[1]) < 95 * (CFG.WS || 1)) c++; } return [i, c]; }).sort((a, b) => b[1] - a[1]).map(a => a[0]);
      const types = G.lv.towers, bats = G.lv.waves.flat(2).some(g => g[0] === 'bat');
      const cycle = ['archer', 'barracks', 'mage', 'cannon', 'archer', 'mage', 'barracks', 'archer', 'cannon', 'archer'].filter(t => types.includes(t));
      const plan = pads.map((s, k) => [s, bats && k % 3 === 0 ? 'archer' : cycle[k % cycle.length]]);
      const bplan = [['farm'], ['lumber', 'farm'], ['quarry', 'farm'], ['farm'], ['lumber', 'farm'], ['house', 'farm'], ['quarry', 'farm'], ['farm'], ['lumber', 'farm'], ['farm'], ['house', 'farm']];
      const bot = () => {
        const h = G.hero;
        if (G.phase === 'day') {
          for (let i = 0; i < CFG.PLOTS.length; i++) { if (buildingAt(i)) continue; const t = (bplan[i] || ['farm']).find(buildingAllowed); if (t && canAfford(CFG.BUILDINGS[t].cost)) placeBuilding(i, t); break; }
          for (const bd of G.buildings) if (bd.burned && canAfford(CFG.REPAIR_COST.building)) repairBuilding(bd);
        }
        if (G.granaryBurned && canAfford(CFG.REPAIR_COST.granary)) repairBuilding('granary');
        if (G.phase !== 'night' || G.enemies.length < 4) {
          for (const [s, t] of plan) if (!towerAt(s)) { if ((G.mod !== 'max4' || G.towers.length < 4) && canAfford(towerCost(CFG.TOWERS[t].cost[0]))) buildTower(s, t); break; }
          for (const t of G.towers) { if (t.lvl < 3 && canAfford(towerCost(t.def.cost[t.lvl]))) { upgradeTower(t); break; }
            if (useBranches && t.lvl === 3 && !t.br && G.lv.branches && G.night >= 2 && canAfford(towerCost(CFG.BRANCH_COST))) { branchTower(t, t.def.branches[brMode === '2' ? 1 : brMode === 'r' ? (Math.random() < 0.5 ? 0 : 1) : 0]); break; } }
        }
        if (h && !h.dead && h.evoReady && !h.evo) { evolveHero(); evoNight = `${G.phase}${G.night}`; }
        if (G.phase === 'night' && h && !h.dead && h.cd <= 0 && G.enemies.length && G.mod !== 'noHeroSkill') {
          let best = null, bs = 0; for (const e of G.enemies) { if (e.under) continue; const n = G.enemies.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 50 * (CFG.WS || 1)).length; if (n > bs) { bs = n; best = e; } }
          if (best && bs >= 2) castSkill(best.x, best.y);
        }
        if (G.phase === 'night' && h && !h.dead && G.enemies.length) { const can = e => !e.under && !(h.d.melee && e.d.flying);   /* 近戰英雄不去追打不到的飛行敵人 */ const side = G.enemies.find(e => offPath(e) && can(e)); const e = G.boss && live(G.boss) ? G.boss : side || G.enemies.find(can) || G.enemies[0]; h.hx = e.x; h.hy = e.y + 14; h.moving = true; }
        if (G.phase === 'night' && G.post && G.lv.beacon && !G.beaconUsed && G.enemies.length >= 12 && G.res.front >= beaconCost()) useBeacon();
        if (G.phase === 'dawn' && G.dawnChoices) { const i = G.dawnChoices.findIndex(e => !e.cost || canAfford(e.cost)); chooseDawn(Math.max(0, i)); }
        if (G.choosingSupply) { G.choosingSupply = false; }
        if (G.menu) G.menu = null;
      };
      let t = 0;
      while (G.screen === 'play' && t < 4000) {
        for (let k = 0; k < 5; k++) { update(0.05); t += 0.05; }
        bot();
        const key = G.phase + G.night;
        if (key !== lastKey) { if (G.phase === 'dawn' || G.phase === 'night') log.push(`${G.phase[0]}${G.night}:Lv${G.hero.lvl}${G.hero.evo ? '★' : ''} hp${G.castleHp}`); lastKey = key; }
      }
      return { L, hero, win: G.end && G.end.win, stars: G.end ? G.end.stars : 0, nights: G.end && G.end.nights, hp: G.castleHp, max: G.castleMax, lvl: G.hero.lvl, evo: G.hero.evo, evoNight, towers: G.towers.length, tw: G.towers.map(t => t.spot + (t.br || t.type).slice(0, 3) + t.lvl).join(" "), leak: G.stats.leakBy, kills: G.stats.kills, log: log.join(' ') };
    }, [L, hero, brMode, HPMUL[L] || 0, RAMP[L] || 0]);
    all.push(res); console.log(JSON.stringify(res));
  }
  // 匯總
  const sum = {};
  for (const r of all) { const s = sum[r.L] || (sum[r.L] = { n: 0, w: 0, st: 0, stars: [0, 0, 0, 0], lv: 0, evo: 0, en: {}, hp: 0 }); s.n++; if (r.win) { s.w++; s.st += r.stars; } s.stars[r.stars]++; s.lv += r.lvl; s.hp += r.hp; if (r.evo) { s.evo++; s.en[r.evoNight] = (s.en[r.evoNight] || 0) + 1; } }
  console.log('\n關卡 勝率 平均星(勝) 星數分布[0,1,2,3] 平均城堡血 平均Lv 進化率 進化時間');
  for (const L in sum) { const s = sum[L]; console.log(`L${L} ${s.w}/${s.n} ${(s.w ? s.st / s.w : 0).toFixed(2)} [${s.stars}] ${(s.hp / s.n).toFixed(1)} ${(s.lv / s.n).toFixed(1)} ${s.evo}/${s.n} ${JSON.stringify(s.en)}`); }
  // 各英雄
  console.log('\n關卡 ' + heroes.map(h => `${h}(勝/場 平均星含敗)`).join('  '));
  for (const L of levels) console.log(`L${L} ` + heroes.map(h => { const rs = all.filter(r => r.L === L && r.hero === h); return `${rs.filter(r => r.win).length}/${rs.length} ${(rs.reduce((a, r) => a + r.stars, 0) / rs.length).toFixed(1)}★`; }).join('  '));
  console.log('errors', errs.length ? errs.slice(0, 5) : 'none'); await b.close();
})();
