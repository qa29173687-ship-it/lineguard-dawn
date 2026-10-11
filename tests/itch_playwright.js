// itch.io 上傳包測試：把 /workspace/game-proto-itch.zip 解到 CDN 樣式的子路徑（/html/<id>/），
// 由另一個網域（localhost vs 127.0.0.1，跨站）的頁面用 450×800 iframe 嵌入（itch 的 allow 屬性），檢查：
// 無 404／主控台錯誤、畫布貼合直式 iframe 與手機全螢幕、第一次點擊後音樂開始、iframe 內 localStorage 存檔可保存、
// 沙盒 iframe（封鎖儲存空間）時改用記憶體存檔且不出錯。用法：node itch_playwright.js
const { chromium, devices } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const ZIP = process.env.ZIP || '/workspace/game-proto-itch.zip';
const DIR = '/tmp/itchsrv', SUB = 'html/1234567', OUT = process.env.OUT || path.join(__dirname, '..', 'screenshots', 'v10');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, i !== undefined ? JSON.stringify(i) : ''); } };
(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(path.join(DIR, SUB), { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  execSync(`/workspace/.artenv/bin/python -m zipfile -e ${ZIP} ${path.join(DIR, SUB)}`);
  ok('zip has index.html at root', fs.existsSync(path.join(DIR, SUB, 'index.html')));
  const host = path.join(DIR, 'host'); fs.mkdirSync(host);
  const allow = 'autoplay; fullscreen *; geolocation; microphone; camera; midi; monetization; xr-spatial-tracking; gamepad; gyroscope; accelerometer; xr; cross-origin-isolated; web-share';
  const game = `http://cdn.test:8796/${SUB}/index.html`;
  fs.writeFileSync(path.join(host, 'embed.html'), `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#222;display:flex;justify-content:center;padding-top:20px">
<iframe id=g src="${game}" width=450 height=800 frameborder=0 allow="${allow}" allowfullscreen></iframe>`);
  fs.writeFileSync(path.join(host, 'phone.html'), `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0">
<iframe id=g src="${game}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0" allow="${allow}" allowfullscreen></iframe>`);
  fs.writeFileSync(path.join(host, 'sandbox.html'), `<!doctype html><body style="margin:0"><iframe id=g src="${game}" width=450 height=800 sandbox="allow-scripts"></iframe>`);
  const s1 = spawn('python3', ['-m', 'http.server', '8796', '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' });
  const s2 = spawn('python3', ['-m', 'http.server', '8797', '--bind', '127.0.0.1'], { cwd: host, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required', '--host-resolver-rules=MAP itch.test 127.0.0.1, MAP cdn.test 127.0.0.1'] });
  const watch = (page, errors) => {
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on('requestfailed', r => errors.push(`requestfailed ${r.url()} ${r.failure() && r.failure().errorText}`));
  };
  const frameOf = async page => { const f = await (await page.$('#g')).contentFrame(); await f.waitForFunction(() => typeof Art !== 'undefined' && Art.loaded + Art.failed.length >= Art.total && Art.total > 0, null, { timeout: 30000 }); return f; };
  try {
    // ---- 桌面：450×800 iframe（跨站）----
    { const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } }); const page = await ctx.newPage(); const errors = []; watch(page, errors);
      await page.goto('http://itch.test:8797/embed.html'); let f = await frameOf(page);
      ok('desktop iframe: all art loaded from CDN subpath', await f.evaluate(() => Art.failed.length === 0 && Art.loaded === Art.total), await f.evaluate(() => Art.failed.slice(0, 5)));
      ok('served from subpath (relative paths)', f.url().includes(`/${SUB}/index.html`));
      const fit = await f.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left, y: r.top, iw: innerWidth, ih: innerHeight }; });
      ok('canvas fills 450×800 portrait iframe (9:16, no scroll)', Math.abs(fit.w - 450) <= 1 && Math.abs(fit.h - 800) <= 1, fit);
      ok('LS uses real localStorage inside cross-site iframe', await f.evaluate(() => LS.persistent === true));
      ok('music not started before first tap', await f.evaluate(() => !Music.unlocked && Object.values(Music.el).every(a => a.paused)));
      await page.mouse.click(500, 20 + 400); await page.waitForTimeout(1200);
      const au = await f.evaluate(() => ({ un: Music.unlocked, ctx: Music.ctx && Music.ctx.state, day: !Music.el.day.paused, t: Music.el.day.currentTime }));
      ok('first tap inside iframe starts audio (context running, day loop playing)', au.un && (au.ctx === 'running' || au.ctx === null) && au.day && au.t > 0, au);
      // 存檔：寫入 → 重新整理 iframe → 還在
      await f.evaluate(() => { G.save.shards = 77; G.save.daily.erin = { '01_onsen': true }; writeSave(); });
      await page.reload(); f = await frameOf(page);
      ok('save persists across reload inside iframe', await f.evaluate(() => G.save.shards === 77 && G.save.daily.erin && G.save.daily.erin['01_onsen'] === true));
      await f.evaluate(() => { localStorage.clear(); });
      await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, 'itch_embed_450x800.png') });
      ok('desktop iframe: no 404s / console errors', errors.length === 0, errors.slice(0, 5));
      await ctx.close(); }
    // ---- 手機：iPhone 12，iframe 佔滿整個畫面（itch 的手機全螢幕）----
    for (const dev of ['iPhone 12', 'Pixel 5']) {
      const ctx = await b.newContext({ ...devices[dev] }); const page = await ctx.newPage(); const errors = []; watch(page, errors);
      await page.goto('http://itch.test:8797/phone.html'); const f = await frameOf(page);
      const fit = await f.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left, y: r.top, iw: innerWidth, ih: innerHeight }; });
      const full = (Math.abs(fit.w - fit.iw) <= 1 || Math.abs(fit.h - fit.ih) <= 1) && fit.w <= fit.iw + 1 && fit.h <= fit.ih + 1 && Math.abs(fit.w / fit.h - 360 / 640) < 0.01;
      ok(`${dev}: canvas fits fullscreen phone viewport, centered, 9:16`, full && Math.abs(fit.x - (fit.iw - fit.w) / 2) <= 1, fit);
      await page.touchscreen.tap(fit.iw / 2, 30); await page.waitForTimeout(1000);
      ok(`${dev}: first touch starts audio`, await f.evaluate(() => Music.unlocked && !Music.el.day.paused));
      await page.screenshot({ path: path.join(OUT, `itch_phone_${dev.replace(/\s/g, '')}.png`) });
      // 轉橫向：重新貼合（不超出畫面）
      await page.setViewportSize({ width: fit.ih, height: fit.iw }); await page.waitForTimeout(400);
      const land = await f.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; });
      ok(`${dev}: rotate → canvas refits inside viewport`, land.h <= land.ih + 1 && Math.abs(land.h - land.ih) <= 1, land);
      ok(`${dev}: no errors`, errors.length === 0, errors.slice(0, 5));
      await ctx.close();
    }
    // ---- 沙盒 iframe：儲存空間被封鎖 → 記憶體存檔，不出錯 ----
    { const ctx = await b.newContext({ viewport: { width: 500, height: 840 } }); const page = await ctx.newPage(); const errors = []; watch(page, errors);
      await page.goto('http://itch.test:8797/sandbox.html'); const f = await frameOf(page);
      const r = await f.evaluate(() => { G.save.shards = 5; writeSave(); return { p: LS.persistent, back: loadSave().shards }; });
      ok('storage blocked (sandboxed iframe): falls back to in-memory save', r.p === false && r.back === 5, r);
      await page.mouse.click(250, 400); await page.waitForTimeout(300);
      ok('storage blocked: no console errors', errors.filter(e => !/localStorage|SecurityError/.test(e)).length === 0 && errors.length === 0, errors.slice(0, 5));
      await page.screenshot({ path: path.join(OUT, 'itch_sandbox_nostorage.png') });
      await ctx.close(); }
  } finally { await b.close(); s1.kill(); s2.kill(); }
  console.log(`RESULT ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
