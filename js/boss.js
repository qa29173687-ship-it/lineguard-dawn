'use strict';
// =============================================================
// 首領登場演出：畫面轉暗 → 紅色警告橫幅「首領來襲！格魯姆」→ 鏡頭震動（對上鼓點）→ 首領大圖從右側滑入
// 約 3.8 秒，期間遊戲暫停；點擊畫面可略過（0.6 秒後）。開關：CFG.BOSS_INTRO
// =============================================================
const Boss = {
  active: null, DUR: 3.8,
  HITS: [0.0, 1.55, 1.95, 2.35, 2.75, 3.1],   // 與 boss_intro 音效的鼓點對齊
  start(e) {
    if (typeof Cam !== 'undefined') Cam.followEntity(e, (CFG.BOSS_INTRO ? this.DUR : 0) + 2.8);   // 鏡頭帶到首領身上、短暫跟隨
    if (!CFG.BOSS_INTRO) { sfx('boss_roar'); banner('首領來襲！格魯姆', '', 2); return; }
    this.active = { e, t: 0 };
    G.targeting = false; G.menu = null;
    sfx('boss_intro');
    if (typeof Music !== 'undefined') Music.duckT = 4.5;
  },
  skip() { const a = this.active; if (a && a.t > 0.6 && a.t < this.DUR - 0.45) a.t = this.DUR - 0.45; },
  update(dt) {
    const a = this.active; if (!a) return;
    a.t += dt;
    if (a.t >= this.DUR || G.screen !== 'play') this.active = null;
  },
  timeScale() { return this.active ? 0 : 1; },
  // 鏡頭震動量（邏輯像素）
  shake() {
    const a = this.active; if (!a) return 0;
    let s = 0; for (const h of this.HITS) { const d = a.t - h; if (d >= 0 && d < 0.35) s = Math.max(s, (1 - d / 0.35) * (h === 3.1 ? 7 : 4.5)); }
    return s;
  },
  draw(ctx) {
    const a = this.active; if (!a) return;
    const W = CFG.W, H = CFG.H, t = a.t;
    const ease = k => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
    const inK = ease(t / 0.4), outK = t > this.DUR - 0.45 ? ease((t - (this.DUR - 0.45)) / 0.45) : 0;
    ctx.save();
    // 1) 轉暗 + 紅色暗角
    ctx.fillStyle = `rgba(12,2,6,${0.72 * inK * (1 - outK)})`; ctx.fillRect(0, 0, W, H);
    const pulse = 0.25 + 0.15 * Math.sin(t * 9);
    ctx.fillStyle = `rgba(160,10,20,${pulse * inK * (1 - outK)})`;
    ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, H - 26, W, 26); ctx.fillRect(0, 0, 16, H); ctx.fillRect(W - 16, 0, 16, H);
    // 2) 首領大圖：右側滑入、在 1.0 秒（咆哮）時放大一下、最後往左淡出
    const im = Art.img.boss_big, m = Art.meta.boss_big;
    if (im) {
      const slide = ease((t - 0.35) / 0.7);
      const roar = t > 1.0 && t < 1.6 ? Math.sin((t - 1.0) / 0.6 * Math.PI) * 0.06 : 0;
      const dh = 250 * (1 + roar), dw = m.w * dh / m.h;
      const x = W * 0.52 - dw / 2 + (1 - slide) * W * 0.9 - outK * W * 0.4, y = H * 0.18 + (250 - dh) / 2;
      ctx.globalAlpha = Math.min(1, slide * 1.4) * (1 - outK);
      // 背光（紅色光暈，預先產生的光暈圖）
      ctx.globalCompositeOperation = 'lighter';
      Light.glow1(ctx, 'orange', x + dw / 2, y + dh * 0.55, dh * 0.75, 0.55 * (0.7 + 0.3 * Math.sin(t * 6)));
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, slide * 1.4) * (1 - outK);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(im, x, y, dw, dh); ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
    }
    // 3) 警告橫幅（斜向警示條紋 + 大字）
    const bk = ease((t - 0.15) / 0.3) * (1 - outK), by = H * 0.6;
    if (bk > 0) {
      ctx.globalAlpha = bk;
      ctx.fillStyle = 'rgba(120,8,16,0.92)'; ctx.fillRect(0, by, W, 92);
      ctx.fillStyle = '#ffcc33';
      for (let i = -2; i < 14; i++) { const x0 = ((i * 30 + t * 60) % (W + 60)) - 30; ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x0 + 14, by); ctx.lineTo(x0 + 4, by + 8); ctx.lineTo(x0 - 10, by + 8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x0, by + 84); ctx.lineTo(x0 + 14, by + 84); ctx.lineTo(x0 + 4, by + 92); ctx.lineTo(x0 - 10, by + 92); ctx.fill(); }
      const tx = W / 2 + (1 - ease((t - 0.2) / 0.35)) * -W;
      const flash = t > 1.0 && t < 1.15 ? '#ffffff' : '#ffd166';
      text(ctx, '⚠ 首領來襲！', tx, by + 28, 26, flash, 'center');
      text(ctx, '酋長 格魯姆', W / 2 - (1 - ease((t - 0.45) / 0.35)) * -W, by + 58, 18, '#ff8a8a', 'center');
      text(ctx, '每損失 25% 血量會吹號召喚掠奪者突襲補給線', W / 2, by + 77, 9, '#fff', 'center', false);
      ctx.globalAlpha = 1;
    }
    if (t > 0.6 && t < this.DUR - 0.45) text(ctx, '點擊略過', W - 22, H * 0.6 - 8, 9, 'rgba(255,255,255,0.6)', 'right', false);
    ctx.restore();
  },
};
