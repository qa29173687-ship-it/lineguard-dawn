const { chromium, devices } = require('playwright');
const OUT = '/workspace/game-proto/screenshots';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => errors.push(`requestfailed ${r.url()} ${r.failure() && r.failure().errorText}`));
  const perf = async (label, secs = 4) => {
    const r = await page.evaluate(secs => new Promise(res => {
      let work = 0, n = 0; const oR = window.renderAll, oU = window.update;
      window.renderAll = c => { const t = performance.now(); oR(c); work += performance.now() - t; };
      window.update = d => { const t = performance.now(); oU(d); work += performance.now() - t; };
      const t0 = performance.now();
      (function f() { n++; if (performance.now() - t0 < secs * 1000) requestAnimationFrame(f); else { window.renderAll = oR; window.update = oU;
        const el = (performance.now() - t0) / 1000; res({ fps: +(n / el).toFixed(1), msPerFrame: +(work / n).toFixed(2), enemies: G.enemies.length, proj: G.projectiles.length }); } })();
    }), secs);
    console.log('PERF', label, JSON.stringify(r)); return r;
  };
  const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html?debug=1';
  await page.goto(URL);
  await page.waitForTimeout(800);
  const box = await (await page.$('#game')).boundingBox();
  const tap = async (x, y) => page.touchscreen.tap(box.x + x / 360 * box.width, box.y + y / 640 * box.height);
  const st = () => page.evaluate(() => __game.state());
  const log = async (l) => { const s = await st(); console.log(l, JSON.stringify({ screen: s.screen, phase: s.phase, night: s.night, hp: s.castleHp, en: s.enemies, pend: s.pending, types: s.types, towers: s.towers, kills: s.kills, end: s.end, wagon: s.wagon, starving: s.starving, res: s.res && Object.fromEntries(Object.entries(s.res).map(([k,v])=>[k,Math.floor(v)])) })); return s; };
  const waitFor = async (fn, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(200); } console.log('TIMEOUT', label); return false; };

  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(600);
  await page.waitForFunction(() => Art.loaded + Art.failed.length >= Art.total, null, { timeout: 10000 }); await page.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
  console.log('ART', JSON.stringify(await page.evaluate(() => ({ loaded: Art.loaded, total: Art.total, failed: Art.failed }))));
  await page.screenshot({ path: `${OUT}/1_hero_select.png` });
  // 選蕾娜再選艾琳（測試切換）
  await tap(180, 136 + 128 + 60); await page.waitForTimeout(100);
  console.log('selHero', await page.evaluate(() => UI.selHero));
  await tap(180, 136 + 60); await page.waitForTimeout(100);
  await tap(180, 554); await page.waitForTimeout(300);
  console.log('choosingSupply', await page.evaluate(() => G.choosingSupply));
  await tap(180, 553); await page.waitForTimeout(200); // 確認補給站
  let s = await log('after start');
  console.log('hero', await page.evaluate(() => G.hero.id));
  // 實際點擊建造：地塊0 → 農田
  await tap(30, 486); await page.waitForTimeout(150);
  await tap(37, 425); await page.waitForTimeout(150);
  console.log('buildings', await page.evaluate(() => G.buildings.map(b => b.type)));
  // 實際點擊建塔：塔位1 → 弓箭塔
  await tap(240, 66); await page.waitForTimeout(150);
  const ob = await page.evaluate(() => UI.buttons.find(b => b.id === 'opt0'));
  await tap(ob.x + ob.w / 2, ob.y + ob.h / 2); await page.waitForTimeout(150);
  await tap(ob.x + ob.w / 2, ob.y + ob.h / 2); await page.waitForTimeout(150); // 第二下確認建造
  console.log('towers', await page.evaluate(() => G.towers.map(t => t.type)));
  await page.evaluate(() => { __game.give(400, 300, 60); __game.place(1, 'lumber'); __game.place(2, 'quarry'); __game.place(3, 'house'); __game.place(5, 'farm'); __game.place(4, 'lumber');
    __game.build(3, 'barracks'); __game.build(6, 'mage'); __game.build(8, 'cannon'); __game.build(5, 'archer'); });
  // 移動英雄
  await tap(200, 230);
  await page.evaluate(() => __game.speed(4)); await page.waitForTimeout(2500); await page.evaluate(() => __game.speed(1));
  // 打開一個建造選單給截圖看
  await tap(130, 548); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/2_day_building.png` });
  await log('day');
  await tap(300, 300); // 關閉選單
  // 進入黃昏、夜晚（點按鈕）
  await tap(215, 610); await page.waitForTimeout(200); await log('dusk');
  await tap(215, 610); await page.waitForTimeout(200); await log('night start');
  await page.evaluate(() => __game.speed(8));
  await waitFor(() => G.enemies.length >= 8, 20000, 'enemies');
  await page.evaluate(() => __game.speed(1));
  // 施放技能
  await tap(316, 610); await page.waitForTimeout(100);
  const tgt = await page.evaluate(() => { const e = G.enemies[0]; return e ? [e.x, e.y] : [180, 200]; });
  await tap(tgt[0], tgt[1]); await page.waitForTimeout(700);
  await log('night battle');
  await page.screenshot({ path: `${OUT}/3_night_battle.png` });
  await perf('night1 normal');
  await page.evaluate(() => __game.speed(8));
  await waitFor(() => G.phase === 'dawn' || G.screen === 'end', 60000, 'night1 end');
  s = await log('after night1');
  if (s.phase === 'dawn') { await page.screenshot({ path: `${OUT}/extra_dawn_event.png` }); await tap(180, 270); await page.waitForTimeout(200); await log('day2'); }
  // 夜 2、3：加強防線看能否勝利
  for (let n = 2; n <= 3; n++) {
    await page.evaluate(() => { __game.give(500, 400, 100); for (const t of G.towers) { upgradeTower(t); upgradeTower(t); } for (const i of [0, 2, 4, 7, 9, 10, 11]) buildTower(i, ['archer', 'mage', 'archer', 'cannon', 'barracks', 'archer', 'archer'][[0, 2, 4, 7, 9, 10, 11].indexOf(i)]); __game.skip(); __game.skip(); });
    await waitFor(() => G.phase === 'dawn' || G.screen === 'end', 90000, 'night end ' + n);
    s = await log('after night' + n);
    if (s.screen === 'end') break;
    await page.evaluate(() => __game.dawn(0));
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/extra_win.png` });
  // 失敗流程：真的沒蓋防禦，放怪進城
  await tap(104, 402); await page.waitForTimeout(200); await log('back to select');   // 結算「再玩一次」
  await tap(180, 554); await page.waitForTimeout(200);
  await tap(180, 553); await page.waitForTimeout(200);
  await page.evaluate(() => { G.hero.hx = 20; G.hero.hy = 560; G.hero.moving = true; __game.skip(); __game.skip(); __game.speed(8); });
  await waitFor(() => G.screen === 'end', 60000, 'lose');
  s = await log('lose');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/extra_lose.png` });
  await tap(104, 402); await page.waitForTimeout(200);
  await tap(180, 554); await page.waitForTimeout(300);
  console.log('screen after retry:', await page.evaluate(() => G.screen), await page.evaluate(() => UI.blessChoices.map(b => b.name)));
  await page.screenshot({ path: `${OUT}/extra_blessing.png` });
  await tap(180, 146 + 58); await page.waitForTimeout(300);
  await tap(180, 553); await page.waitForTimeout(200);
  await log('retry with blessing');
  console.log('blessing applied:', await page.evaluate(() => G.blessingId), 'save', JSON.stringify(await page.evaluate(() => G.save)));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})();
