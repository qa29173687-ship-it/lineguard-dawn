'use strict';
// =============================================================
// 背景音樂：白天（田園）／夜戰兩首循環曲＋黃昏提示、勝利、失敗短曲（原創，見 tools/music/）
//  - 用 <audio> 元素播放（file:// 也能用）；http(s) 下若有 Web Audio，接上增益節點做淡入淡出（iOS 的 audio.volume 無法調整）
//  - 手機瀏覽器需使用者手勢才能出聲：第一次點擊畫面時解鎖
//  - 白天／黃昏／黎明 → 白天曲；夜晚 → 夜戰曲；切換時 1.5 秒交叉淡化；結算畫面播勝利／失敗短曲
//  - 靜音設定存在 localStorage（lineguard_mute）
// 不影響遊戲邏輯；每幀只做幾個數值比較。
// =============================================================
const Music = {
  el: {}, gain: {}, ctx: null, vol: {}, unlocked: false, muted: false, want: null, cur: null,
  loops: ['day', 'night'], stings: ['dusk', 'victory', 'defeat', 'whoosh'], lastPhase: null, lastScreen: null, duck: 1, duckT: 0, log: [],
  init() {
    try { this.muted = LS.getItem('lineguard_mute') === '1'; } catch (e) {}
    const probe = document.createElement('audio');
    const ext = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    this.ext = ext;
    for (const k of [...this.loops, ...this.stings]) {
      const a = new Audio(); a.preload = this.loops.includes(k) ? 'auto' : 'auto'; a.loop = this.loops.includes(k);
      a.src = `assets/audio/${k}.${ext}`;
      a.addEventListener('error', () => { if (ext === 'ogg' && !a.dataset.fb) { a.dataset.fb = 1; a.src = `assets/audio/${k}.mp3`; } });
      this.el[k] = a; this.vol[k] = 0;
    }
    // 第一次點擊／按鍵就解鎖。手機瀏覽器（含 itch.io 的 iframe）認定的「使用者手勢」事件不同（pointerdown／touchend／click），
    // 全部都聽；解鎖後每次手勢再「補踢」一次：AudioContext 還在 suspended 就 resume、該播的循環曲沒在播就 play
    const unlock = () => this.unlock();
    for (const t of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(t, unlock, { capture: true, passive: true });
  },
  kick() {
    if (this.ctx && this.ctx.state === 'suspended') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    const a = this.want && this.el[this.want];
    if (a && a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
  },
  unlock() {
    if (this.unlocked) { this.kick(); return; }
    this.unlocked = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && /^https?:/.test(location.protocol) && window.origin !== 'null') {   // 沙盒 iframe：媒體算跨來源，接 Web Audio 會變無聲 → 只用元素音量
      try {
        this.ctx = new AC();
        for (const k in this.el) { const s = this.ctx.createMediaElementSource(this.el[k]), g = this.ctx.createGain(); g.gain.value = 0; s.connect(g).connect(this.ctx.destination); this.gain[k] = g; }
      } catch (e) { this.ctx = null; this.gain = {}; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    // 在手勢裡先對每個元素 play/pause 一次（iOS 之後才能由程式播放）
    for (const k in this.el) { this.setVol(k, 0); const a = this.el[k]; const p = a.play(); if (p && p.then) p.then(() => { if (!(this.loops.includes(k) && k === this.want)) a.pause(); }).catch(() => {}); }
    this.cur = null;
    if (typeof SFX !== 'undefined') SFX.unlocked();
  },
  setVol(k, v) {
    const a = this.el[k], out = this.muted ? 0 : v * CFG.MUSIC_VOLUME * (this.stings.includes(k) ? (k === 'whoosh' ? CFG.SFX_VOLUME : CFG.STING_VOLUME) / CFG.MUSIC_VOLUME : 1);
    if (this.gain[k]) { this.gain[k].gain.value = out; a.volume = 1; } else a.volume = Math.max(0, Math.min(1, out));
  },
  sting(k) {
    if (!this.unlocked) return;
    const a = this.el[k]; a.currentTime = 0; this.setVol(k, 1); const p = a.play(); if (p && p.catch) p.catch(() => {});
    this.log.push(k);
  },
  toggle() {
    this.muted = !this.muted;
    try { LS.setItem('lineguard_mute', this.muted ? '1' : '0'); } catch (e) {}
    for (const k in this.el) this.setVol(k, this.vol[k]);
    if (this.muted) { for (const k of this.stings) this.el[k].pause(); if (typeof SFX !== 'undefined') SFX.stopAll(); }
  },
  // 每幀呼叫（真實時間 dt，秒）
  update(dt) {
    // 事件：黃昏、結算
    if (G.screen === 'play' && G.phase !== this.lastPhase) { if (G.phase === 'dusk' && this.lastPhase === 'day') { this.sting('dusk'); this.duckT = 3.5; } this.lastPhase = G.phase; }
    if (G.screen !== this.lastScreen) {
      if (G.screen === 'end' && G.end) this.sting(G.end.win ? 'victory' : 'defeat');
      if (G.screen !== 'play') this.lastPhase = null;
      this.lastScreen = G.screen;
    }
    // 想播的循環曲
    let want = 'day';
    if (G.screen === 'play' && G.phase === 'night') want = 'night';
    if (G.screen === 'end') want = null;
    if (want !== this.want) {
      this.log.push('want:' + want); this.want = want;
      if (want && this.unlocked) { const a = this.el[want]; if (want === 'night') a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); }
    }
    if (!this.unlocked) return;
    this.duckT = Math.max(0, this.duckT - dt);
    const duck = this.duckT > 0 ? 0.55 : 1;
    const step = dt / (CFG.MUSIC_FADE || 1.5);
    for (const k of this.loops) {
      const target = k === want ? duck : 0, v0 = this.vol[k];
      let v = v0 + Math.max(-step, Math.min(step, target - v0));
      if (Math.abs(v - v0) > 1e-4 || this._lastMute !== this.muted) { this.vol[k] = v; this.setVol(k, v); }
      const a = this.el[k];
      if (v <= 0 && k !== want && !a.paused) a.pause();
      if (k === want && a.paused && !this.muted) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
    }
    this._lastMute = this.muted;
    this.cur = want;
  },
  // 靜音按鈕（喇叭圖示）：選英雄畫面在右上角，遊戲中在地圖左上角
  drawButton(ctx) {
    const x = G.screen === 'play' ? 4 : 330, y = G.screen === 'play' ? CFG.MAP_TOP + 4 : 6, w = 24, h = 20;
    ctx.fillStyle = 'rgba(20,18,36,0.75)'; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x + 5, y + 8); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 12, y + 4); ctx.lineTo(x + 12, y + 16); ctx.lineTo(x + 8, y + 12); ctx.lineTo(x + 5, y + 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = this.muted ? '#ef7d57' : '#fff'; ctx.lineWidth = 1.5; ctx.beginPath();
    if (this.muted) { ctx.moveTo(x + 14, y + 7); ctx.lineTo(x + 20, y + 13); ctx.moveTo(x + 20, y + 7); ctx.lineTo(x + 14, y + 13); }
    else { ctx.arc(x + 12, y + 10, 4, -0.9, 0.9); ctx.moveTo(x + 18.5, y + 4.5); ctx.arc(x + 12, y + 10, 7.5, -0.8, 0.8); }
    ctx.stroke();
    UI.buttons.push({ x: x - 2, y: y - 2, w: w + 4, h: h + 4, onTap: () => this.toggle(), id: 'mute' });
  },
};
