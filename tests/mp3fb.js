// 模擬不支援 OGG 的瀏覽器（iOS Safari 舊版）：應改用 MP3
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 12'] }); const p = await ctx.newPage(); const errs = [];
  await p.addInitScript(() => { const o = HTMLMediaElement.prototype.canPlayType; HTMLMediaElement.prototype.canPlayType = function (t) { return /ogg/.test(t) ? '' : o.call(this, t); }; });
  p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 400) errs.push(r.url()); });
  for (const url of ['http://127.0.0.1:8765/index.html', 'file:///workspace/game-proto/index.html']) {
    await p.goto(url); await p.waitForFunction(() => Object.values(Music.el).every(a => a.readyState >= 2 || a.error), null, { timeout: 15000 });
    const box = await (await p.$('#game')).boundingBox(); await p.mouse.click(box.x + 100, box.y + 100); await p.waitForTimeout(800);
    const m = await p.evaluate(() => __game.music()); console.log(url.slice(0, 5), m.ext, Object.values(m.el).map(e => e.src + ':' + e.ready + (e.err ? ' err' : '')).join(' '), 'dayPlaying', !m.el.day.paused);
    await p.waitForTimeout(1500);
    const sx = await p.evaluate(() => { SFX.play('click'); return { ext: SFX.ext, mode: SFX.mode, ready: SFX.ready(), total: Object.keys(SFX.DEF).length, played: SFX.counts.click || 0 }; });
    console.log('  sfx', JSON.stringify(sx));
  }
  console.log('errors', errs.length ? errs : 'none'); await b.close();
})();
