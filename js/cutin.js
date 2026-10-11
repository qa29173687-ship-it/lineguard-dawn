'use strict';
// =============================================================
// 技能演出（八方旅人／手遊風 cut-in）：畫面變暗 → 英雄色斜帶掃入 → 全身立繪從右側滑入（速度線）
// → 停留並顯示技能名 → 滑出，約 1.1 秒；演出期間遊戲時間放慢（CFG.CUTIN_SLOW），結束時才真正施放技能。
// 遊戲暫停時（CUTIN_SLOW = 0）背景用快照，不重畫場景。點擊畫面可略過。開關：CFG.SKILL_CUTIN。圖：assets/{id}_cutin.webp（失敗時改用 .png）；進化演出與進化後的技能演出改用整張進化插畫面板 assets/{id}_evo_panel.jpg（含背景）
// =============================================================
const CutIn = {
  img: {}, ready: {}, active: null, DUR: 1.1,
  COLORS: { erin: ['#2f9e44', '#a9f5a0'], lena: ['#b8322e', '#ffd166'], vera: ['#5a2ea6', '#d3a8ff'] },
  init() {
    // 一般立繪 {id}_cutin（去背全身）；進化演出與進化後的技能演出用 {id}_evo_panel（整張進化插畫含背景，做成畫框面板）
    for (const id of ['erin', 'lena', 'vera', 'erin_evo', 'lena_evo', 'vera_evo']) {
      const im = new Image();
      im.onload = () => {
        // 預先解碼並上傳一次（畫到小畫布），第一次施放時不會卡頓
        this.ready[id] = true; this.prep(id);
      };
      const evo = id.endsWith('_evo');
      im.onerror = () => { if (!evo && !im.dataset.fb) { im.dataset.fb = 1; im.src = `assets/${id}_cutin.png`; } };
      im.src = evo ? `assets/${id}_panel.jpg` : `assets/${id}_cutin.webp`;   // 進化：整張場景插畫（含背景）做成畫框面板
      this.img[id] = im;
    }
    // 速度線（固定亂數，避免每幀產生）
    this.lines = Array.from({ length: 26 }, (_, i) => ({ y: (i * 37) % 300 - 150 + Math.random() * 10, len: 40 + Math.random() * 120, sp: 0.6 + Math.random() * 0.8, off: Math.random() }));
  },
  // 依目前畫布解析度預先畫好：立繪（高品質縮放一次，之後每幀 1:1 貼上）、技能名文字
  cache: {},
  prep(id) {
    const im = this.img[id], vs = view.s;
    if (!this.ready[id] || (this.cache[id] && this.cache[id].s === vs)) return this.cache[id];
    const hid = id.replace('_evo', '');
    if (id.endsWith('_evo')) return (this.cache[id] = Object.assign(this.makePanel(im, hid, vs), { s: vs, text: this.makeText(hid), panel: true }));
    const dh = Math.min(CFG.H * 0.74, (CFG.W - 8) * im.naturalHeight / im.naturalWidth), dw = im.naturalWidth * dh / im.naturalHeight;   // 寬的立繪（薇拉的法杖）縮小到放得下
    const c = document.createElement('canvas'); c.width = Math.round(dw * vs); c.height = Math.round(dh * vs);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
    return (this.cache[id] = { s: vs, char: c, dw, dh, text: this.makeText(hid) });
  },
  // 進化插畫面板：整張 16:9 場景，裁掉左右各一點讓角色更大，加上金框與英雄色外光（預先畫好，每幀 1:1 貼上）
  makePanel(im, hid, vs) {
    const dw = CFG.W - 16, dh = Math.round(dw * 0.62), pad = 6;
    const c = document.createElement('canvas'); c.width = Math.round((dw + pad * 2) * vs); c.height = Math.round((dh + pad * 2) * vs);
    const x = c.getContext('2d'); x.scale(vs, vs);
    const col = (this.COLORS[hid] || ['#b8860b'])[0];
    x.shadowColor = col; x.shadowBlur = 10; x.fillStyle = '#1a1028'; x.fillRect(pad, pad, dw, dh); x.shadowBlur = 0;
    const sw = im.naturalHeight * dw / dh, sx = Math.max(0, Math.min(im.naturalWidth - sw, (im.naturalWidth - sw) * ({ erin: 0.62, lena: 0.45, vera: 0.5 }[hid] || 0.5)));
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(im, sx, 0, Math.min(sw, im.naturalWidth), im.naturalHeight, pad, pad, dw, dh);
    const g = x.createLinearGradient(0, pad + dh * 0.55, 0, pad + dh); g.addColorStop(0, 'rgba(10,6,20,0)'); g.addColorStop(1, 'rgba(10,6,20,0.75)');
    x.fillStyle = g; x.fillRect(pad, pad, dw, dh);
    x.strokeStyle = '#ffd166'; x.lineWidth = 3; x.strokeRect(pad, pad, dw, dh);
    x.strokeStyle = '#fff2a8'; x.lineWidth = 1; x.strokeRect(pad + 4, pad + 4, dw - 8, dh - 8);
    return { char: c, dw: dw + pad * 2, dh: dh + pad * 2 };
  },
  // 技能名文字圖（施放時重畫一次，確保網頁字型已載入）
  makeText(id, evo) {
    const vs = view.s;
    const d = CFG.HEROES[id], name = evo ? '進化！' : (G.hero && G.hero.id === id ? skillName(G.hero) : d.skill.name);
    const t = document.createElement('canvas'); t.width = Math.round(300 * vs); t.height = Math.round(150 * vs);
    const y = t.getContext('2d'); y.scale(vs, vs); y.translate(10, 120); y.rotate(-0.2);
    y.font = `900 46px ${FONT}`; y.textAlign = 'left'; y.textBaseline = 'alphabetic';
    y.lineJoin = 'round'; y.strokeStyle = '#1a1028'; y.lineWidth = 8; y.strokeText(name, 0, 0);
    const tg = y.createLinearGradient(0, -40, 0, 4); tg.addColorStop(0, '#fffbe6'); tg.addColorStop(0.5, '#ffd166'); tg.addColorStop(1, '#e07a1f');
    y.fillStyle = tg; y.fillText(name, 0, 0);
    const sub = evo ? `${d.name} → ${CFG.EVOLVE[id].title}` : `${d.name}・技能`;
    y.font = `700 14px ${FONT}`; y.lineWidth = 4; y.strokeText(sub, 4, -48); y.fillStyle = '#fff'; y.fillText(sub, 4, -48);
    return t;
  },
  // 施放技能：有演出就先播演出，結束時呼叫 fire()
  key(h) { return h.evo && this.ready[h.id + '_evo'] ? h.id + '_evo' : h.id; },
  request(h, fire) {
    if (this.active) return;
    if (!CFG.SKILL_CUTIN || !h || h.dead || h.cd > 0 || !this.ready[h.id]) { fire(); return; }
    const key = this.key(h), cc = this.prep(key); if (cc) cc.text = this.makeText(h.id);
    this.active = { id: h.id, key, name: skillName(h), hero: h.d.name, t: 0, fire, fired: false, dur: this.DUR, at: 0.85 };
    if (typeof Music !== 'undefined') Music.sting('whoosh');
  },
  // 進化演出：同樣的全身立繪 cut-in，金色斜帶、較長（約 2 秒）、播放進化號角曲；結束前呼叫 fire()（真正進化）
  evolve(h, fire) {
    if (this.active || !h || h.dead) return false;
    const key = this.ready[h.id + '_evo'] ? h.id + '_evo' : h.id;
    if (!this.ready[key]) { fire(); sfx('evolve'); return true; }
    const cc = this.prep(key); if (cc) cc.evoText = this.makeText(h.id, true);
    this.active = { id: h.id, key, evo: true, t: 0, fire, fired: false, dur: 2.1, at: 1.85 };
    sfx('evolve');
    if (typeof Music !== 'undefined') Music.duckT = 3;
    return true;
  },
  skip() { const a = this.active; if (a && a.t < a.at) a.t = a.at; },
  // 真實時間 dt
  update(dt) {
    const a = this.active; if (!a) return;
    a.t += dt;
    if (!a.fired && a.t >= a.at) { a.fired = true; a.fire(); }     // 立繪滑出時技能發動
    if (a.t >= a.dur) { this.active = null; this.snap = null; }
  },
  snap: null, _snapC: null,
  takeSnap(cv) {
    const c = this._snapC || (this._snapC = document.createElement('canvas'));
    if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; }
    c.getContext('2d').drawImage(cv, 0, 0); this.snap = c;
  },
  timeScale() { return this.active ? CFG.CUTIN_SLOW : 1; },
  draw(ctx) {
    const a = this.active; if (!a) return;
    const W = CFG.W, H = CFG.H, [c1, c2] = a.evo ? ['#b8860b', '#fff2a8'] : (this.COLORS[a.id] || ['#333', '#fff']);
    // 進化演出：時間軸拉長（停留較久），其餘動作相同
    const t = a.evo ? (a.t < 0.3 ? a.t : a.t < a.at ? 0.3 + (a.t - 0.3) * (0.55 / (a.at - 0.3)) : 0.85 + (a.t - a.at)) : a.t;
    const ease = k => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
    const inK = ease(t / 0.22), outK = t > 0.85 ? ease((t - 0.85) / 0.25) : 0;
    ctx.save();
    // 1) 畫面變暗
    ctx.fillStyle = `rgba(8,6,20,${0.5 * inK * (1 - outK)})`; ctx.fillRect(0, 0, W, H);
    // 2) 斜帶（從左掃入、往右掃出）：純色矩形（不用漸層，省效能）
    const cy = H * 0.52, bandH = 230;
    ctx.translate(W / 2, cy); ctx.rotate(-0.2);
    const bx = (-1 + inK) * W * 1.6 + outK * W * 1.6;
    ctx.fillStyle = c1; ctx.globalAlpha = 0.9; ctx.fillRect(bx - W, -bandH / 2, W * 2, bandH);
    ctx.fillStyle = c2; ctx.globalAlpha = 0.85; ctx.fillRect(bx - W, -bandH / 2, W * 2, 14); ctx.fillRect(bx - W, bandH / 2 - 14, W * 2, 14);
    ctx.globalAlpha = 1; ctx.fillRect(bx - W, -bandH / 2 - 6, W * 2, 3); ctx.fillRect(bx - W, bandH / 2 + 3, W * 2, 3);
    // 速度線（一次描完）
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (const l of this.lines) {
      const x = W * 0.9 - (((t * l.sp * 3 + l.off) % 1) * W * 2);
      ctx.moveTo(bx + x, l.y * 0.75); ctx.lineTo(bx + x + l.len, l.y * 0.75);
    }
    ctx.stroke();
    ctx.restore(); ctx.save();
    // 進化：金色光柱
    if (a.evo) {
      const pk = Math.min(1, a.t / 0.5) * (1 - outK);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,210,90,${0.35 * pk})`; ctx.fillRect(W * 0.58 - 70, 0, 140, H);
      ctx.fillStyle = `rgba(255,255,220,${0.45 * pk})`; ctx.fillRect(W * 0.58 - 22, 0, 44, H);
      for (let i = 0; i < 18; i++) { const yy = H - ((a.t * 260 + i * 53) % H), xx = W * 0.58 + Math.sin(i * 7.3) * 60; ctx.fillStyle = `rgba(255,230,140,${0.8 * pk})`; ctx.fillRect(xx, yy, 2, 6); }
      ctx.globalCompositeOperation = 'source-over';
    }
    // 3) 全身立繪：右側滑入、停留時微微前移、滑出到左邊並淡出（預先縮放好的圖 1:1 貼上）
    const cc = this.prep(a.key || a.id), vs = view.s;
    if (cc) {
      const dw = cc.dw, dh = cc.dh;
      const slideIn = ease((t - 0.04) / 0.26);
      const x = (cc.panel ? (W - dw) / 2 : Math.min(W * 0.58 - dw / 2, W - 4 - dw)) + (1 - slideIn) * W * 0.9 - (t - 0.3) * (cc.panel ? 6 : 12) - outK * W * 1.1;
      const y = cy - dh * (cc.panel ? 0.62 : 0.56);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const al = Math.min(1, slideIn * 1.5) * (1 - outK * 0.8);
      if (slideIn < 1 || outK > 0) { ctx.globalAlpha = al * 0.25; ctx.drawImage(cc.char, Math.round((x + 26 * (1 - slideIn + outK)) * vs), Math.round(y * vs)); }   // 移動中的殘影
      ctx.globalAlpha = al; ctx.drawImage(cc.char, Math.round(x * vs), Math.round(y * vs));
      // 4) 技能名（預先畫好的文字圖，彈出）
      const tk = ease((t - 0.18) / 0.18);
      if (tk > 0) {
        ctx.globalAlpha = tk * (1 - outK);
        const sc = 1 + (1 - tk) * 0.6, tx = 12, ty = cc.panel ? cy + 40 - 120 : cy + 78 - 120;
        const txt = a.evo && cc.evoText ? cc.evoText : cc.text;
        if (sc > 1.001) ctx.drawImage(txt, Math.round(tx * vs), Math.round(ty * vs), txt.width * sc, txt.height * sc);
        else ctx.drawImage(txt, Math.round(tx * vs), Math.round(ty * vs));
      }
    }
    ctx.restore();
  },
};
