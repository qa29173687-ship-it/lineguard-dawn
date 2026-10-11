// Phase 1 平衡：自動玩家（不作弊，只用實際資源）：英雄 Lv、進化時間、第 3 夜首領是否可勝
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 12'] }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const runs = (process.argv[2] || 'erin,lena,vera,erin,lena,vera').split(',');
  const results = [];
  for (const hero of runs) {
    await p.goto('http://127.0.0.1:8765/index.html?debug=1'); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => Art.loaded === Art.total); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
    await p.evaluate(h => { CFG.BOSS_INTRO = false; __game.start(h); }, hero);
    const log = [];
    // 每個遊戲 tick 外的「玩家」邏輯（每 0.5 秒實時）
    await p.evaluate(() => {
      window.__bot = setInterval(() => {
        if (G.screen !== 'play') return;
        const h = G.hero;
        if (G.phase === 'day') {
          for (const [i, t] of [[0, 'farm'], [1, 'lumber'], [2, 'quarry'], [3, 'lumber'], [4, 'farm'], [5, 'house'], [6, 'quarry']]) if (!buildingAt(i) && canAfford(CFG.BUILDINGS[t].cost)) { placeBuilding(i, t); break; }
        }
        if (G.phase !== 'night' || G.enemies.length < 4) {
          const plan = [[5, 'archer'], [3, 'mage'], [6, 'barracks'], [8, 'cannon'], [2, 'archer'], [4, 'mage'], [9, 'archer'], [7, 'cannon']];
          for (const [s, t] of plan) if (!towerAt(s)) { if (canAfford(towerCost(CFG.TOWERS[t].cost[0]))) buildTower(s, t); break; }
          for (const t of G.towers) { if (t.lvl < 3 && canAfford(towerCost(t.def.cost[t.lvl]))) { upgradeTower(t); break; }
            if (t.lvl === 3 && !t.br && G.night >= 2 && canAfford(towerCost(CFG.BRANCH_COST))) { branchTower(t, t.def.branches[0]); break; } }
        }
        if (h && !h.dead && h.lvl >= 10 && !h.evo) evolveHero();
        if (G.phase === 'night' && h && !h.dead && h.cd <= 0 && G.enemies.length) {
          let best = null, bs = 0; for (const e of G.enemies) { const n = G.enemies.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 50).length; if (n > bs) { bs = n; best = e; } }
          if (best && bs >= 2) castSkill(best.x, best.y);
        }
        if (G.phase === 'night' && h && !h.dead && G.enemies.length) { const e = G.boss && live(G.boss) ? G.boss : G.enemies[0]; h.hx = e.x; h.hy = e.y + 14; h.moving = true; }
        if (G.phase === 'night' && !G.beaconUsed && G.enemies.length >= 12 && G.res.front >= beaconCost()) useBeacon();
        if (G.phase === 'dawn' && G.dawnChoices) { const i = G.dawnChoices.findIndex(e => !e.cost || canAfford(e.cost)); chooseDawn(Math.max(0, i)); }
        if (G.menu) G.menu = null;
      }, 125);
      G.speed = 4;
    });
    let last = '';
    for (let k = 0; k < 400; k++) {
      await p.waitForTimeout(500);
      const s = await p.evaluate(() => ({ scr: G.screen, ph: G.phase, n: G.night, lvl: G.hero.lvl, evo: G.hero.evo, hp: G.castleHp, towers: G.towers.length, br: G.towers.filter(t => t.br).length, boss: G.boss ? Math.round(G.boss.hp) : null, end: G.end }));
      const key = s.ph + s.n;
      if (key !== last) { log.push(`${s.ph}${s.n}:Lv${s.lvl}${s.evo ? '★' : ''} hp${s.hp} t${s.towers}/${s.br}`); last = key; }
      if (s.scr === 'end') { results.push({ hero, win: s.end.win, stars: s.end.stars, lvl: s.lvl, evo: s.evo, hp: s.hp, log: log.join(' | ') }); break; }
    }
    await p.evaluate(() => clearInterval(window.__bot));
  }
  for (const r of results) console.log(JSON.stringify(r));
  console.log('errors', errs.length ? errs : 'none'); await b.close();
})();
