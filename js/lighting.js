'use strict';
// =============================================================
// HD-2D 風格光影（只影響畫面，不影響遊戲規則）
// - 柔和橢圓投影（英雄／敵人／士兵／村民）
// - 英雄邊緣光（rim light）：預先算好的「迎光邊緣」遮罩，疊加暖色
// - 夜晚英雄光圈、技能與投射物的加亮光暈
// 所有光暈/投影都是預先產生的小圖，每幀只做 drawImage，成本很低
// =============================================================
const Light = {
  off: {},   // 效能測試用開關：{ shadow, rim, glow }
  shadow: null, glow: {}, rim: {}, rimReady: false,
  init() {
    // 投影：橢圓徑向漸層
    const s = document.createElement('canvas'); s.width = 64; s.height = 32;
    const x = s.getContext('2d');
    const g = x.createRadialGradient(32, 16, 0, 32, 16, 32);
    g.addColorStop(0, 'rgba(10,8,20,0.55)'); g.addColorStop(0.55, 'rgba(10,8,20,0.28)'); g.addColorStop(1, 'rgba(10,8,20,0)');
    x.save(); x.scale(1, 0.5); x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.restore();
    this.shadow = s;
    // 暗幕光洞：不透明中心→透明邊緣，用 destination-out 挖光
    const hcv = document.createElement('canvas'); hcv.width = hcv.height = 32;
    const hx = hcv.getContext('2d'), hg = hx.createRadialGradient(16, 16, 0, 16, 16, 16);
    hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)'); hx.fillStyle = hg; hx.fillRect(0, 0, 32, 32);
    this.hole = hcv;
    // 光暈（加亮用）
    const glows = { warm: '255,190,110', green: '140,255,140', gold: '255,225,120', orange: '255,140,50',
                    purple: '200,140,255', cyan: '120,240,255', white: '255,250,230' };
    for (const k in glows) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const cx = c.getContext('2d'), gg = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gg.addColorStop(0, `rgba(${glows[k]},1)`); gg.addColorStop(0.25, `rgba(${glows[k]},0.55)`); gg.addColorStop(1, `rgba(${glows[k]},0)`);
      cx.fillStyle = gg; cx.fillRect(0, 0, 64, 64); this.glow[k] = c;
    }
  },
  // 英雄素材載入後，預先產生每一格的邊緣光遮罩（光從左上方來）與夜晚外圈光暈（英雄代表色）
  buildRims() {
    const tint = { erin: '150,255,150', lena: '255,215,120', vera: '170,150,255' };
    for (const hid of ['erin', 'lena', 'vera']) for (const k of new Set(Object.values(SPRITE_OVERRIDES[hid]))) {
      const im = Art.img[k];
      if (!im || this.rim[k]) continue;
      const w = im.width, h = im.height;
      // 迎光邊緣：剪影往右下位移 1 像素（存檔解析度）後挖掉，只留左上方細邊
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgb(255,226,170)'; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-out'; x.drawImage(im, 1, 1);
      this.rim[k] = c;
      // 外圈柔光：模糊的英雄色剪影，挖掉本體
      const o = document.createElement('canvas'); o.width = w + 20; o.height = h + 20;
      const ox = o.getContext('2d');
      ox.shadowColor = `rgba(${tint[hid]},0.9)`; ox.shadowBlur = 8;
      ox.drawImage(im, 10, 10);
      ox.globalCompositeOperation = 'destination-out'; ox.shadowBlur = 0; ox.drawImage(im, 10, 10);
      this.rim[k + '_halo'] = o;
    }
    this.rimReady = true;
  },
  // 批次投影：英雄、敵人、士兵、村民
  // 投影以「裝置像素」預先縮放並內含透明度的小圖快取，每幀 1:1 貼上（不需逐張縮放取樣）
  _shCache: {}, _shScale: 0,
  _sh(w, s) {
    if (this._shScale !== s) { this._shCache = {}; this._shScale = s; }
    let c = this._shCache[w];
    if (!c) {
      c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(w / 2 * s));
      const x = c.getContext('2d'); x.globalAlpha = w >= 28 ? 1 : 0.8; x.drawImage(this.shadow, 0, 0, c.width, c.height);
      this._shCache[w] = c;
    }
    return c;
  },
  shadowBatch(ctx) {
    if (this.off.shadow) return;
    const top = CFG.MAP_TOP - 10, bot = CFG.MAP_BOTTOM + 10, m = ctx.getTransform(), s = m.a;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const put = (x, y, w) => {
      if (y < top || y > bot || x < -20 || x > CFG.W + 20) return;
      const c = this._sh(w, s);
      ctx.drawImage(c, Math.round(m.e + (x - w / 2) * s), Math.round(m.f + (y - w / 4) * s));
    };
    for (const v of G.villagers) put(v.x, v.y, 14);
    for (const so of G.soldiers) if (!so.dead && !so.remove && !(so.flash > 0)) put(so.x, so.y, 16);
    for (const e of G.enemies) if (!(e.flash > 0)) put(e.x, e.y, e.d.boss ? 50 : e.type === 'wolf' ? 26 : e.d.flying ? 12 : 18);
    const h = G.hero; if (h && !h.dead) put(h.x + 2 + (h.vis ? h.vis.ox : 0), h.y + 1, 28);
    ctx.restore();
  },
  // 單一光暈（呼叫端負責先設 'lighter'）
  glow1(ctx, color, x, y, r, alpha = 1, squash = 1) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(this.glow[color], x - r, y - r * squash, r * 2, r * 2 * squash);
  },
  // 進化英雄：金色外框光（模糊金色剪影挖掉本體），每個影格第一次用到時產生
  gold: {},
  goldHalo(ak) {
    if (this.gold[ak] !== undefined) return this.gold[ak];
    const im = Art.img[ak]; if (!im) return (this.gold[ak] = null);
    const o = document.createElement('canvas'); o.width = im.width + 20; o.height = im.height + 20;
    const x = o.getContext('2d');
    x.shadowColor = 'rgba(255,214,90,1)'; x.shadowBlur = 5;
    for (let i = 0; i < 3; i++) x.drawImage(im, 10, 10);
    x.globalCompositeOperation = 'destination-out'; x.shadowBlur = 0; x.drawImage(im, 10, 10);
    return (this.gold[ak] = o);
  },
  // 柔和投影
  drawShadow(ctx, x, y, w, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.drawImage(this.shadow, x - w / 2, y - w / 4, w, w / 2); ctx.globalAlpha = 1;
  },
  // 加亮光暈（呼叫前不需設定合成模式）
  drawGlow(ctx, color, x, y, r, alpha = 1, squash = 1) {
    const g = this.glow[color]; if (!g) return;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
    ctx.drawImage(g, x - r, y - r * squash, r * 2, r * 2 * squash);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  // 英雄邊緣光：疊在英雄圖上（與 drawSprite 相同的錨點/翻轉）
  drawHeroRim(ctx, key, frame, x, y, flip, night) {
    if (this.off.rim) return;
    const ak = Art.resolve(key, frame); if (!ak || !this.rim[ak]) return;
    const m = Art.meta[ak], s = ART_DRAW_SCALE, halo = this.rim[ak + '_halo'];
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (flip) ctx.scale(-1, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = night ? 0.6 : 0.18;     // 夜晚：英雄色外圈光；白天：很淡
    ctx.drawImage(halo, (-m.ax - 10) * s, (-m.ay - 10) * s, halo.width * s, halo.height * s);
    ctx.globalAlpha = night ? 0.3 : 0.5;      // 迎光邊緣（暖色細邊）
    ctx.drawImage(this.rim[ak], -m.ax * s, -m.ay * s, m.w * s, m.h * s);
    ctx.restore();
  },
};
