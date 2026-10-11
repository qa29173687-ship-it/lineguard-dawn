// 英雄動作截圖：四方向走路、蕾娜衝刺攻擊、艾琳/薇拉攻擊、三個技能 → screenshots/moves_*.png（連續格拼成一排）＋ moves.gif
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const OUT = '/workspace/game-proto/screenshots/', TMP = '/tmp/moves/';
require('fs').mkdirSync(TMP, { recursive: true });
for (const f of require('fs').readdirSync(TMP)) require('fs').unlinkSync(TMP + f);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 3 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await p.goto(process.env.URL || 'http://127.0.0.1:8765/index.html'); await p.evaluate(() => localStorage.clear());
  await p.waitForFunction(() => Art.loaded === Art.total && Light.rimReady && (!CFG.MAP_BG || R.mapImg)); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
  const box = await (await p.$('#game')).boundingBox();
  const clipAt = (x, y, w, h) => ({ x: box.x + (x - w / 2) / 360 * box.width, y: box.y + (y - h / 2) / 640 * box.height, width: w / 360 * box.width, height: h / 640 * box.height });
  // 以固定遊戲時間逐格推進（G.speed = 0 暫停即時迴圈，每格手動 update），截圖不受截圖延遲影響
  const seq = async (name, n, step, clipFn) => {
    const files = [];
    await p.evaluate(() => { G.speed = 0; });
    for (let i = 0; i < n; i++) {
      await p.evaluate(st => { for (let k = 0; k < 2; k++) update(st / 2); }, step);
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const c = await clipFn(); const f = `${TMP}${name}_${String(i).padStart(2, '0')}.png`;
      await p.screenshot({ path: f, clip: c }); files.push(f);
    }
    await p.evaluate(() => { G.speed = 1; });
    return files;
  };
  const scenes = [];
  const follow = (w, h, dy = -16) => async () => { const [x, y] = await p.evaluate(() => [G.hero.x + (G.hero.vis ? G.hero.vis.ox : 0), G.hero.y]); return clipAt(x, y + dy, w, h); };
  // 1) 四方向走路
  await p.evaluate(h => { __game.start(h); G.fx = []; }, process.env.WALK_HERO || 'erin');
  for (const [dir, tx, ty, sx, sy] of [['right', 300, 250, 150, 250], ['left', 60, 250, 210, 250], ['down', 205, 330, 205, 200], ['up', 205, 160, 205, 300], ['diag', 290, 330, 150, 220]]) {
    await p.evaluate(([sx, sy]) => { const h = G.hero; h.x = h.hx = sx; h.y = h.hy = sy; h.moving = false; G.speed = 1; }, [sx, sy]);
    await p.waitForTimeout(150);
    await p.evaluate(([tx, ty]) => { moveHero(tx, ty); G.fx = []; }, [tx, ty]);
    scenes.push(['walk_' + dir, await seq('walk_' + dir, 12, 0.045, follow(56, 56))]);
  }
  if (process.env.ONLY_WALK) { console.log('walk only'); await b.close(); return; }
  // 2) 攻擊：每位英雄擋住／瞄準一隻高血量哥布林
  for (const hid of ['lena', 'erin', 'vera']) {
    await p.evaluate(h => {
      __game.start(h); G.fx = []; G.speed = 1;
      const e = spawnEnemy('goblin'); e.hp = e.max = 99999; e.dist = 300; const q = pathAt(G.path, 300); e.x = q.x + e.ox; e.y = q.y + e.oy;
      if (h === 'lena') { const hp = pathAt(G.path, 318); G.hero.x = G.hero.hx = hp.x; G.hero.y = G.hero.hy = hp.y; }
      else { G.hero.x = G.hero.hx = e.x + 52; G.hero.y = G.hero.hy = e.y + 26; e.d = Object.assign({}, e.d, { speed: 0 }); }   // 遠程：站在敌人右下方
      G.hero.moving = false; G.spawnList = [];
    }, hid);
    await p.waitForTimeout(1200);
    await p.evaluate(() => { G.hero.atkT = 0.36; });
    const cx = await p.evaluate(() => { const e = G.enemies[0], h = G.hero; return [(e.x + h.x) / 2, (e.y + h.y) / 2 + 4]; });
    scenes.push(['attack_' + hid, await seq('attack_' + hid, 20, 0.04, async () => clipAt(cx[0], cx[1] - 16, 90, 64))]);
  }
  // 3) 技能
  for (const hid of ['erin', 'lena', 'vera']) {
    await p.evaluate(h => {
      __game.start(h); G.fx = []; G.speed = 1; G.spawnList = [];
      for (let i = 0; i < 5; i++) { const e = spawnEnemy('goblin'); e.hp = e.max = 99999; e.dist = 290 + i * 10; const q = pathAt(G.path, e.dist); e.x = q.x + e.ox; e.y = q.y + e.oy; }
      G.hero.x = G.hero.hx = 150; G.hero.y = G.hero.hy = 250; G.hero.moving = false; G.hero.cd = 0;
    }, hid);
    await p.waitForTimeout(500);
    await p.evaluate(() => { const es = G.enemies; const x = es.reduce((s, e) => s + e.x, 0) / es.length, y = es.reduce((s, e) => s + e.y, 0) / es.length; castSkill(x, y); });
    scenes.push(['skill_' + hid, await seq('skill_' + hid, 18, 0.06, async () => clipAt(180, 220, 200, 150))]);
  }
  // 4) 技能演出（cut-in）：即時擷取
  for (const hid of ['erin', 'lena', 'vera']) {
    await p.evaluate(h => { __game.start(h); G.fx = []; G.speed = 1; G.hero.cd = 0; }, hid);
    await p.waitForFunction(() => CutIn.ready.erin && CutIn.ready.lena && CutIn.ready.vera);
    await p.waitForTimeout(300);
    await p.evaluate(() => __game.skill(200, 260));
    const files = [];
    for (let i = 0; i < 14; i++) {
      const done = await p.evaluate(() => !CutIn.active); if (done && i > 2) break;
      const f = `${TMP}cutin_${hid}_${String(i).padStart(2, '0')}.png`; await p.screenshot({ path: f, clip: clipAt(180, 320, 360, 640), scale: 'css' }); files.push(f);
    }
    scenes.push(['cutin_' + hid, files]);
  }
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
  require('fs').writeFileSync(TMP + 'scenes.json', JSON.stringify(scenes));
  execFileSync('/workspace/.artenv/bin/python', ['/workspace/pwtest/moves_sheet.py'], { stdio: 'inherit' });
})();
