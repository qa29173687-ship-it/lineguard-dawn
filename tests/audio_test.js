// 音樂整合測試：素材載入、首次點擊解鎖、白天→夜晚→黎明切歌、靜音切換（含 localStorage）、結算短曲；server 與 file:// 各跑一次
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  for (const url of ['http://127.0.0.1:8765/index.html?debug=1', 'file:///workspace/game-proto/index.html?debug=1']) {
    const ctx = await b.newContext({ ...devices['iPhone 12'] }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    p.on('requestfailed', r => errs.push('FAIL ' + r.url())); p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
    await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => Art.loaded === Art.total); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
    await p.waitForFunction(() => Object.values(Music.el).every(a => a.readyState >= 2 || a.error), null, { timeout: 15000 }).catch(() => {});
    const r = {};
    r.beforeTap = await p.evaluate(() => __game.music());
    const box = await (await p.$('#game')).boundingBox();
    const tap = (x, y) => p.mouse.click(box.x + x / 360 * box.width, box.y + y / 640 * box.height);
    await tap(180, 100); await p.waitForTimeout(1800);              // 第一次點擊（解鎖）
    r.select = await p.evaluate(() => { const m = __game.music(); return { want: m.want, unlocked: m.unlocked, webaudio: m.webaudio, ext: m.ext, day: m.el.day, night: m.el.night }; });
    await p.evaluate(() => { __game.start('erin'); }); await p.waitForTimeout(300);
    await p.evaluate(() => { __game.skip(); }); await p.waitForTimeout(500);   // → 黃昏
    r.dusk = await p.evaluate(() => { const m = __game.music(); return { phase: G.phase, want: m.want, dusk: m.el.dusk, log: m.log }; });
    await p.evaluate(() => { __game.skip(); }); await p.waitForTimeout(1900);  // → 夜晚（交叉淡化 1.5 秒）
    r.night = await p.evaluate(() => { const m = __game.music(); return { phase: G.phase, want: m.want, day: m.el.day, night: m.el.night }; });
    // 靜音
    await tap(16, 54); await p.waitForTimeout(200);
    r.muted = await p.evaluate(() => ({ muted: Music.muted, ls: localStorage.getItem('lineguard_mute'), nightVol: Music.el.night.volume, gain: Music.gain.night ? Music.gain.night.gain.value : null }));
    await tap(16, 54); await p.waitForTimeout(200);
    r.unmuted = await p.evaluate(() => ({ muted: Music.muted, ls: localStorage.getItem('lineguard_mute'), gain: Music.gain.night ? +Music.gain.night.gain.value.toFixed(3) : +Music.el.night.volume.toFixed(3) }));
    // 黎明：快轉把夜晚打完
    await p.evaluate(() => { G.speed = 8; for (const e of G.enemies) e.hp = 0; G.spawnList = []; });
    await p.waitForFunction(() => G.phase !== 'night', null, { timeout: 60000 }).catch(() => {});
    await p.evaluate(() => { G.speed = 1; }); await p.waitForTimeout(1900);
    r.dawn = await p.evaluate(() => { const m = __game.music(); return { phase: G.phase, want: m.want, day: m.el.day, night: m.el.night }; });
    // 結算短曲
    await p.evaluate(() => __game.forceEnd(true)); await p.waitForTimeout(600);
    r.end = await p.evaluate(() => { const m = __game.music(); return { want: m.want, victory: m.el.victory, day: m.el.day, log: m.log.slice(-4) }; });
    // 靜音設定在重新載入後保留
    await tap(342, 16); await p.waitForTimeout(150);
    const m1 = await p.evaluate(() => Music.muted);
    await p.reload(); await p.waitForFunction(() => Art.loaded === Art.total); await p.evaluate(() => { G.levelId = 0; G.screen = 'select'; });   // 第 0 關＝第 1 階段原始試玩關（回歸測試用）
    r.persist = { before: m1, afterReload: await p.evaluate(() => Music.muted) };
    console.log(url.startsWith('file') ? 'FILE' : 'HTTP', JSON.stringify(r));
    console.log('errors', errs.length ? errs : 'none');
    await ctx.close();
  }
  await b.close();
})();
