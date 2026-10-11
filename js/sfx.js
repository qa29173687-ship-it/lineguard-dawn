'use strict';
// =============================================================
// 音效（原創合成，見 tools/sfx/make_sfx.py）
//  - http(s)：Web Audio（AudioBuffer，可同時多聲部、可變音高），與背景音樂共用 Music.ctx
//  - file://：fetch 讀不到本機檔 → 每個音效 2–3 個 <audio> 元素輪流用（playbackRate 做音高變化）
//  - 靜音沿用 Music.muted；音量 CFG.SFX_VOLUME（與音樂分開）
//  - 節流：同一音效最短間隔、同時最多幾個；全域同時最多 CFG.SFX_MAX_VOICES 個
//  - 每次播放隨機微調音高（±pitch）
// =============================================================
const SFX = {
  // 名稱: [相對音量, 最短間隔秒, 同時上限, 音高隨機幅度]
  DEF: {
    arrow_shoot: [0.55, 0.06, 3, 0.08], arrow_hit: [0.5, 0.05, 3, 0.1], sword_slash: [0.6, 0.08, 2, 0.08],
    magic_cast: [0.5, 0.08, 2, 0.06], magic_hit: [0.55, 0.06, 2, 0.08], cannon_fire: [0.75, 0.12, 2, 0.06],
    explosion: [0.7, 0.1, 2, 0.08], enemy_hurt: [0.45, 0.05, 2, 0.15], die_goblin: [0.55, 0.08, 2, 0.1],
    die_wolf: [0.55, 0.1, 2, 0.08], die_bat: [0.5, 0.08, 2, 0.1], castle_alarm: [0.8, 0.8, 1, 0.02],
    low_food: [0.7, 3, 1, 0], erin_atk: [0.6, 0.08, 2, 0.06], lena_atk: [0.65, 0.08, 2, 0.06], vera_atk: [0.55, 0.08, 2, 0.06],
    skill_erin: [0.8, 0.5, 1, 0], skill_lena: [0.8, 0.5, 1, 0], skill_vera: [0.8, 0.5, 1, 0],
    hero_down: [0.8, 1, 1, 0], level_up: [0.75, 0.4, 1, 0], evolve: [0.95, 1, 1, 0],
    build: [0.7, 0.1, 2, 0.04], upgrade: [0.7, 0.1, 1, 0.03], sell: [0.6, 0.1, 1, 0.05], coin_tick: [0.35, 0.09, 1, 0.12],
    click: [0.5, 0.04, 2, 0.05], horn_night: [0.9, 1, 1, 0], dawn: [0.75, 1, 1, 0],
    musket: [0.6, 0.1, 2, 0.06], tesla: [0.5, 0.08, 2, 0.1], catapult: [0.65, 0.15, 2, 0.06], poison: [0.4, 0.15, 1, 0.1],
    arcane_kill: [0.6, 0.2, 1, 0.05], bones: [0.5, 0.2, 1, 0.08], beacon: [0.9, 1, 1, 0], branch: [0.85, 0.5, 1, 0],
    boss_roar: [1, 0.5, 1, 0.03], boss_intro: [1, 2, 1, 0],
  },
  buf: {}, raw: {}, pool: {}, last: {}, live: {}, voices: [], log: [], mode: null, counts: {},
  init() {
    const probe = document.createElement('audio');
    this.ext = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    // 沙盒 iframe（origin 為 'null'）抓同站檔案也會被 CORS 擋 → 跟 file:// 一樣用 <audio> 元素
    this.web = /^https?:/.test(location.protocol) && window.origin !== 'null' && !!(window.AudioContext || window.webkitAudioContext) && !!window.fetch;
    if (this.web) {
      // 先抓檔案（不建立 AudioContext，避免自動播放警告）；解鎖後再解碼
      for (const k in this.DEF) this.fetchOne(k, this.ext);
    } else {
      this.mode = 'element';
      for (const k in this.DEF) {
        const n = Math.min(3, this.DEF[k][2] + 1); this.pool[k] = [];
        for (let i = 0; i < n; i++) {
          const a = new Audio(); a.preload = 'auto'; a.src = `assets/audio/sfx/${k}.${this.ext}`;
          a.addEventListener('error', () => { if (this.ext === 'ogg' && !a.dataset.fb) { a.dataset.fb = 1; a.src = `assets/audio/sfx/${k}.mp3`; } });
          if ('preservesPitch' in a) a.preservesPitch = false; else if ('webkitPreservesPitch' in a) a.webkitPreservesPitch = false;
          this.pool[k].push(a);
        }
      }
    }
  },
  fetchOne(k, ext) {
    fetch(`assets/audio/sfx/${k}.${ext}`).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => { this.raw[k] = b; if (Music.ctx) this.decode(k); })
      .catch(() => { if (ext === 'ogg') this.fetchOne(k, 'mp3'); });
  },
  decode(k) {
    const b = this.raw[k]; if (!b || this.buf[k]) return; this.raw[k] = null;
    const ok = d => { this.buf[k] = d; };
    try { const p = Music.ctx.decodeAudioData(b, ok, () => {}); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  },
  // Music.unlock() 之後呼叫（同一個手勢內）
  unlocked() {
    if (this.web && Music.ctx) {
      this.mode = 'web';
      this.out = Music.ctx.createGain(); this.out.gain.value = 1; this.out.connect(Music.ctx.destination);
      for (const k in this.raw) this.decode(k);
    } else if (this.web) {   // http 但沒有 AudioContext：退回元素模式
      this.web = false; this.init();
    }
    if (this.mode === 'element') for (const k in this.pool) for (const a of this.pool[k]) { a.muted = true; const p = a.play(); if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; }); }
  },
  // 播放：opts.pitch 指定音高倍率、opts.vol 額外音量
  play(k, opts = {}) {
    const d = this.DEF[k]; if (!d) return false;
    this.counts[k] = (this.counts[k] || 0) + 1;
    if (!Music.unlocked || Music.muted || !(CFG.SFX_VOLUME > 0)) return false;
    const now = performance.now() / 1000;
    if (now - (this.last[k] || -9) < d[1]) return false;
    // 清掉已結束的聲部
    this.voices = this.voices.filter(v => v.end > now);
    const same = this.voices.filter(v => v.k === k).length;
    if (same >= d[2]) return false;
    if (this.voices.length >= (CFG.SFX_MAX_VOICES || 10) && d[0] < 0.8) return false;   // 太吵：只放重要音效
    this.last[k] = now;
    const rate = opts.pitch || (1 + (Math.random() * 2 - 1) * d[3]);
    const vol = Math.min(1, d[0] * (opts.vol || 1) * CFG.SFX_VOLUME);
    let dur = 1;
    if (this.mode === 'web') {
      const b = this.buf[k]; if (!b) return false;
      const ctx = Music.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g).connect(this.out); s.start();
      dur = b.duration / rate;
      const v = { k, end: now + dur, s }; this.voices.push(v);
    } else if (this.mode === 'element') {
      const pool = this.pool[k]; const a = pool.find(a => a.paused || a.ended) || pool[0];
      if (a.readyState < 2) return false;
      try { a.currentTime = 0; } catch (e) {}
      a.playbackRate = rate; a.volume = vol;
      const p = a.play(); if (p && p.catch) p.catch(() => {});
      dur = (a.duration || 1) / rate;
      this.voices.push({ k, end: now + dur, a });
    } else return false;
    if (this.log.length < 400) this.log.push(k);
    return true;
  },
  stopAll() {
    for (const v of this.voices) { try { if (v.s) v.s.stop(); if (v.a) v.a.pause(); } catch (e) {} }
    this.voices = [];
  },
  ready() { return this.mode === 'web' ? Object.keys(this.buf).length : this.mode === 'element' ? Object.values(this.pool).filter(p => p[0].readyState >= 2).length : 0; },
};
