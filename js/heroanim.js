'use strict';
// =============================================================
// 英雄動作表現（八方旅人風）：只影響「畫面」，不改任何遊戲邏輯／時間／傷害。
//  - 依移動方向切換 正面／側面（左右鏡像）／背面；走路上下彈跳、落地壓扁、輕微左右擺動、揚塵
//  - 待機呼吸（兩格，約 0.5 秒）
//  - 攻擊：蕾娜「後仰 → 衝刺（殘影）→ 出手（金色劍弧、頓格 0.05 秒、敵人閃白＋小擊退）→ 跳回原位」
//          艾琳「後跳半步 → 拉弓 → 放箭（披風揚起）」；薇拉「腳下魔法陣詠唱 → 出手射出魔彈」
//    預備動作利用攻擊冷卻倒數提前播放，出手影格剛好對上實際攻擊的那一刻。
//  - 技能：箭雨（朝天射 → 箭落下）、聖盾衝鋒（盾後蹲伏 → 金色速度線衝刺＋殘影）、隕石術（大魔法陣、畫面微暗、隕石落下）
// 所有位移都是「顯示偏移」：英雄的邏輯座標（阻擋、索敵）不受影響。
// =============================================================
const HeroAnim = {
  dust: [], rise: [],
  WIND: { lena: 0.25, erin: 0.2, vera: 0.3 },
  state(h) {
    if (!h.vis || h.vis.id !== h.id) h.vis = { id: h.id, dir: 'front', face: 1, step: 0, stepIdx: 0, breath: 0, ox: 0, oy: 0, sx: 1, sy: 1,
      px: h.x, py: h.y, t: G.time, prevAtk: 0, rel: 0, ret: 0, stop: 0, ghosts: [], gT: 0, frame: 'front', fx: null, vx: 0, vy: 0, spd: 0, still: 1, dirT: 1, cyc: 0, dashTo: null, chargeT: 0, prevSkill: 0 };
    return h.vis;
  },
  tick(h) {
    const v = this.state(h);
    let dt = G.time - v.t; v.t = G.time;
    if (!(dt > 0)) dt = 0; dt = Math.min(dt, 0.1);
    this.tickEnemies(dt);
    // 揚塵、上升箭（純特效）
    for (const d of this.dust) d.t += dt;
    this.dust = this.dust.filter(d => d.t < 0.4);
    for (const r of this.rise) r.t += dt;
    this.rise = this.rise.filter(r => r.t < 0.35);
    for (const g of v.ghosts) g.a -= dt * 2.2;
    v.ghosts = v.ghosts.filter(g => g.a > 0);
    if (v.stop > 0) { v.stop -= dt; v.px = h.x; v.py = h.y; return; }      // 頓格：畫面停住
    if (h.dead) { v.px = h.x; v.py = h.y; return; }
    const mvx = h.x - v.px, mvy = h.y - v.py, sp = dt > 0 ? Math.hypot(mvx, mvy) / dt : 0;
    v.px = h.x; v.py = h.y;
    const moving = !h.charge && sp > 8;
    if (dt > 0) { const k = Math.min(1, dt * 12); v.vx += (mvx / dt - v.vx) * k; v.vy += (mvy / dt - v.vy) * k; v.spd += (sp - v.spd) * k; }
    v.still = moving ? 0 : v.still + dt;
    const walking = !h.charge && v.still < 0.08 && v.spd > 4;     // 短暫停頓不打斷走路循環
    const tgt = h.tgtVis && live(h.tgtVis) ? h.tgtVis : null;
    let frame = null, fx = null, ox = 0, oy = 0, sx = 1, sy = 1;
    // ---- 出手偵測（攻擊計時器剛被重設）----
    if (h.atkAnim > v.prevAtk + 0.05) {
      v.rel = h.id === 'lena' ? 0.12 : 0.18;
      if (h.id === 'lena') {
        v.stop = 0.05; v.ret = 0.2;
        const e = h.tgtVis;
        if (e) { e.visStop = 0.05; e.visX = e.x; e.visY = e.y; e.kb = 0.16; e.kbx = Math.sign(e.x - h.x) || v.face; e.visFlash = 0.1; }
      } else if (h.id === 'erin') v.ret = 0.12;
    }
    v.prevAtk = h.atkAnim;
    // ---- 技能 ----
    const skillOn = h.skillAnim > 0 || h.charge;
    if (h.skillAnim > v.prevSkill + 0.3) {     // 剛施放
      v.skillStart = G.time;
      if (h.id === 'erin') for (let i = 0; i < 4; i++) this.rise.push({ x: h.x + (i - 1.5) * 4 + v.face * 6, y: h.y - 30, t: -i * 0.04 });
    }
    v.prevSkill = h.skillAnim;
    if (h.charge) v.chargeT += dt; else v.chargeT = 0;
    if (tgt && !walking) v.face = tgt.x >= h.x ? 1 : -1;
    if (skillOn) {
      v.face = h.face; v.dir = 'side';
      const el = G.time - (v.skillStart || G.time);
      if (h.id === 'lena') {
        frame = h.charge && v.chargeT < 0.15 ? 'sk1' : 'sk2';
        if (h.charge && frame === 'sk2') { fx = 'sk2'; this.ghost(v, h, frame); }
        if (h.charge && frame === 'sk1') { sy = 0.95; }
      } else if (h.id === 'erin') { frame = el < 0.22 ? 'sk1' : 'sk2'; if (frame === 'sk2' && el < 0.45) fx = 'sk2'; else if (frame === 'sk1' && this.evoReal(h)) fx = 'sk1'; }   // 進化：拉弓時頭上月牙
      else { frame = el < 0.3 ? 'sk1' : 'sk2'; if (frame === 'sk1') fx = 'sk1'; else if (this.evoReal(h) && el < 0.9) fx = 'sk2'; }      // 進化：紫色雷柱
    } else if (v.rel > 0) {                     // 出手影格
      v.rel -= dt; v.dir = 'side'; frame = 'atk2'; fx = h.id === 'erin' ? (v.rel > 0.08 ? 'atk2' : null) : 'atk2';
      if (h.id === 'lena' && v.dashTo) { ox = v.dashTo.x; oy = v.dashTo.y; }
      if (h.id === 'erin') ox = -v.face * 3;
    } else if (v.ret > 0) {                     // 跳回原位
      v.ret -= dt; v.dir = 'side';
      const k = Math.max(0, v.ret) / 0.2;
      if (h.id === 'lena' && v.dashTo) { ox = v.dashTo.x * k; oy = v.dashTo.y * k - Math.sin(Math.PI * (1 - k)) * 4; frame = 'walk1'; }
      else { ox = -v.face * 3 * (v.ret / 0.12); frame = 'side'; }
      if (v.ret <= 0) v.dashTo = null;
    } else if (tgt && !walking && h.atkT > 0 && h.atkT <= this.WIND[h.id] && dist(h, tgt) <= Math.max(h.d.range, 18) + 4) {
      // 預備動作（在實際出手前播放）
      v.dir = 'side'; frame = 'atk1';
      const w = this.WIND[h.id], k = 1 - h.atkT / w;       // 0 → 1
      if (h.id === 'lena') {
        if (h.atkT > 0.1) { ox = -v.face * 3 * Math.min(1, k * 2); sx = 0.97; }
        else {                                                      // 衝刺
          if (!v.dashTo) { const d = dist(h, tgt), m = Math.max(0, Math.min(16, d - 6)); v.dashTo = { x: (tgt.x - h.x) / (d || 1) * m, y: (tgt.y - h.y) / (d || 1) * m }; }
          const q = 1 - h.atkT / 0.1; ox = -v.face * 3 * (1 - q) + v.dashTo.x * q; oy = v.dashTo.y * q;
          this.ghost(v, h, 'atk1', ox, oy);
        }
      } else if (h.id === 'erin') { const q = Math.min(1, k * 2); ox = -v.face * 3 * q; oy = -Math.sin(Math.PI * q) * 2; }
      else fx = 'atk1';
    } else {
      v.dashTo = null;
      if (walking) {
        // 方向：主軸判斷＋遲滯（另一軸要明顯較大才換方向，且至少維持 0.12 秒）→ 斜走不會閃爍
        const ax = Math.abs(v.vx), ay = Math.abs(v.vy); v.dirT += dt;
        let want = v.dir;
        if (v.dir === 'side') { if (ay > ax * 1.35) want = v.vy > 0 ? 'front' : 'back'; }
        else if (ax > ay * 1.35) want = 'side';
        else want = v.vy > 0 ? 'front' : 'back';
        if (want !== v.dir && v.dirT > 0.12) { v.dir = want; v.dirT = 0; }
        if (v.dir === 'side' && ax > 6 && (v.vx >= 0 ? 1 : -1) !== v.face && v.dirT > 0.08) { v.face = v.vx >= 0 ? 1 : -1; v.dirT = 0; }
        // 走路循環：每格時間依實際速度（約 0.12–0.16 秒）
        const seq = this.cycle(h, v.dir), dur = Math.max(0.11, Math.min(0.16, 0.135 * 70 / Math.max(30, v.spd)));
        v.cyc += dt / dur;
        const fi = Math.floor(v.cyc), ph = v.cyc - fi, n = fi % seq.length, contact = n % 2 === 0;
        if (fi !== v.stepIdx) { v.stepIdx = fi; if (contact && this.dust.length < 14) this.dust.push({ x: h.x - (v.dir === 'side' ? v.face * 4 : 0) + rand(-2, 2), y: h.y, t: 0 }); }
        // 彈跳：踏地格低、過渡格高；踏地瞬間壓扁
        oy = -Math.sin(Math.PI * ph) * (contact ? 0.4 : 1.5);
        if (contact && ph < 0.25) { sy = 0.95; sx = 1.04; }
        ox = Math.sin(v.cyc / seq.length * Math.PI * 2) * 0.5;   // 左右輕擺
        frame = seq[n];
      } else {
        v.cyc = 0;
        if (tgt) v.dir = 'side';
        v.breath += dt;
        if (Math.floor(v.breath / 0.5) % 2) sy = 1.026;            // 呼吸（約 1 像素）
        frame = v.dir;
      }
    }
    // 位移平滑一點（避免瞬間跳格）
    v.ox += (ox - v.ox) * Math.min(1, dt * 40); v.oy += (oy - v.oy) * Math.min(1, dt * 40);
    v.sx = sx; v.sy = sy; v.frame = frame; v.fx = fx;
  },
  // 走路影格序列：正面／背面 4 格；側面依可用格數（3 格用來回 1-2-3-2）
  cycle(h, dir) {
    const sk = this.evoReal(h) ? h.d.sprite + '_evo' : h.d.sprite;
    const o = SPRITE_OVERRIDES[sk] || {}, p = dir === 'front' ? 'wf' : dir === 'back' ? 'wb' : 'ws';
    const c = this._cyc || (this._cyc = {}), key = sk + p;
    if (!c[key]) {
      const fs = [1, 2, 3, 4].map(i => p + i).filter(f => o[f] && Art.img[o[f]]);
      c[key] = fs.length === 3 ? [fs[0], fs[1], fs[2], fs[1]] : fs.length ? fs : [dir === 'side' ? 'walk1' : dir];
    }
    return c[key];
  },
  ghost(v, h, frame, ox = v.ox, oy = v.oy) {
    v.gT -= 1;
    if (v.gT > 0) return; v.gT = 2;
    v.ghosts.push({ x: h.x + ox, y: h.y + oy, frame, flip: v.face < 0, a: 0.4 });
    if (v.ghosts.length > 3) v.ghosts.shift();
  },
  // 敵人：頓格與擊退（只改畫的位置）
  enemyPos(e) {
    let x = e.x, y = e.y;
    if (e.visStop > 0) { x = e.visX; y = e.visY; }
    if (e.kb > 0) x += e.kbx * 4 * (e.kb / 0.16);
    return [x, y];
  },
  tickEnemies(dt) {
    for (const e of G.enemies) {
      if (e.visStop > 0) e.visStop -= dt;
      if (e.kb > 0) e.kb -= dt;
      if (e.visFlash > 0) e.visFlash -= dt;
    }
  },
  drawDust(ctx) {
    for (const d of this.dust) {
      const k = d.t / 0.4; ctx.globalAlpha = 0.35 * (1 - k); ctx.fillStyle = '#d8c8a0';
      const r = 1.5 + k * 3; ctx.fillRect(Math.round(d.x - r), Math.round(d.y - r * 0.6 - k * 2), Math.round(r * 2), Math.max(1, Math.round(r * 1.2)));
    }
    ctx.globalAlpha = 1;
  },
  drawRise(ctx) {
    ctx.strokeStyle = 'rgba(190,255,150,0.9)'; ctx.lineWidth = 1;
    for (const r of this.rise) {
      if (r.t < 0) continue;
      const y = r.y - r.t * 260; ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x, y + 8); ctx.stroke();
    }
  },
  // 畫英雄（含殘影、特效、邊緣光）
  // 進化光環粒子（純畫面）
  sparks: [],
  draw(ctx, h, night) {
    const v = this.state(h);
    // 進化圖：有進化動作影格（{id}_evo_walk1…）時與原英雄一樣逐格播放（彈跳、衝刺、殘影照舊），特效用 {id}_evo_fx_*；
    // 只有進化站姿 {id}_evo_{front,side,back} 時退回「進化站姿 + 程式動作」（走路擺動、攻擊後仰→前傾、技能蹲伏→前衝）
    const real = this.evoReal(h);
    const evoArt = h.evo && Art.img[h.d.sprite + '_evo_front'];
    const key = evoArt ? h.d.sprite + '_evo' : h.d.sprite;
    const stand = evoArt && !real;
    const frame = stand ? this.evoFrame(v.frame) : v.frame;
    let rot = 0, ex = 0, esy = 1;
    if (stand) {
      const f = v.frame || '';
      if (/^w[fbs]\d|^walk/.test(f)) rot = Math.sin(v.cyc * Math.PI) * 0.045;
      else if (f === 'atk1') { rot = -0.07; ex = -1; }
      else if (f === 'atk2') { rot = 0.09; ex = 2; }
      else if (f === 'sk1') { esy = 0.93; rot = -0.05; }
      else if (f === 'sk2') { rot = 0.12; ex = 3; }
    }
    const x = h.x + v.ox, y = h.y + v.oy, flip = v.face < 0 && v.dir === 'side';
    const es = h.evo ? (evoArt ? 1.06 : 1.12) : 1;   // 進化後稍微大一點（進化圖本身已較高）
    for (const g of v.ghosts) {
      ctx.globalAlpha = Math.max(0, g.a);
      drawSprite(ctx, key, g.x, g.y, 1, g.flip, false, stand ? this.evoFrame(g.frame) : g.frame);
    }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(Math.round(x + (flip ? -ex : ex)), Math.round(y)); ctx.scale((flip ? -v.sx : v.sx) * es, v.sy * es * esy);
    if (rot) ctx.rotate(rot);
    if (h.evo) this.drawGold(ctx, key, frame);
    const fxk = v.fx ? (real ? `${h.id}_evo_fx_${v.fx}` : `${h.id}_fx_${v.fx}`) : null, fxBehind = v.fx === 'atk1' || v.fx === 'sk1' || (h.id === 'lena' && v.fx === 'sk2');
    if (fxk && fxBehind) this.drawFx(ctx, fxk);
    drawSprite(ctx, key, 0, 0, 1, false, h.flash > 0, frame);
    Light.drawHeroRim(ctx, key, frame, 0, 0, false, night);
    if (fxk && !fxBehind) this.drawFx(ctx, fxk);
    ctx.restore();
  },
  // 進化英雄是否有完整動作影格（走路／攻擊／技能）
  evoReal(h) { return !!(h.evo && Art.img[h.d.sprite + '_evo_walk1'] && Art.img[h.d.sprite + '_evo_atk2']); },
  evoFrame(f) { return !f ? 'front' : (f === 'front' || f.startsWith('wf')) ? 'front' : (f === 'back' || f.startsWith('wb')) ? 'back' : 'side'; },
  drawGold(ctx, key, frame) {
    const ak = Art.resolve(key, frame); if (!ak) return;
    const halo = Light.goldHalo(ak); if (!halo) return;
    const m = Art.meta[ak], s = ART_DRAW_SCALE, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(G.time * 5);
    ctx.drawImage(halo, (-m.ax - 10) * s, (-m.ay - 10) * s, halo.width * s, halo.height * s);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = op;
  },
  // 進化光環：腳下金色光圈 + 往上飄的金色光點（在英雄之後、以加亮模式畫）
  drawAura(ctx, h) {
    if (!h.evo || h.dead) return;
    const dt = Math.min(0.1, Math.max(0, G.time - (this._at || G.time))); this._at = G.time;
    if (this.sparks.length < 14 && Math.random() < 0.5) this.sparks.push({ x: h.x + rand(-9, 9), y: h.y - rand(0, 10), t: 0, life: rand(0.6, 1.1), vy: rand(14, 26) });
    for (const p of this.sparks) { p.t += dt; p.y -= p.vy * dt; }
    this.sparks = this.sparks.filter(p => p.t < p.life);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    Light.glow1(ctx, 'gold', h.x, h.y - 2, 20, 0.45 + 0.15 * Math.sin(G.time * 4), 0.4);
    ctx.globalAlpha = 1;
    for (const p of this.sparks) { ctx.fillStyle = `rgba(255,220,110,${1 - p.t / p.life})`; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1.5, 1.5); }
    ctx.restore();
  },
  drawFx(ctx, k) {
    const im = Art.img[k], m = Art.meta[k]; if (!im) return;
    const s = ART_DRAW_SCALE, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(im, -m.ax * s, -m.ay * s, m.w * s, m.h * s);
    ctx.globalCompositeOperation = op;
  },
};
