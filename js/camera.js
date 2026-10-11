'use strict';
// =============================================================
// v11 鏡頭：世界（CFG.WW×CFG.WH）可拖曳平移、雙指／滾輪縮放；HUD 固定在畫面座標
//  - 畫面座標 = (世界座標 - Cam.x/y) × Cam.z（再乘上 view.s 變成裝置像素）
//  - 可平移範圍：世界四邊都能完全捲到上方 HUD／下方操作列之外（再多 MARGIN 畫面像素）
// =============================================================
const Cam = {
  x: 0, y: 0, z: 1,
  Z0: 1, ZMAX: 2, MARGIN: 14,
  anim: null,        // 平滑移動 { x0,y0,z0, x1,y1,z1, t, dur }
  follow: null,      // 跟隨目標 { e, t }
  zoomedAt: -1e9,    // 最後一次縮放的時間（背景快取：縮放中直接縮放繪製，停下後才重建）
  userAt: -1e9,      // 最後一次玩家手動操作的時間（自動鏡頭不搶玩家的操作）
  get ZMIN() { return Math.min(0.8, (CFG.MAP_BOTTOM - CFG.MAP_TOP) / CFG.WH); },   // 最小縮放：整張地圖放得進 HUD 之間
  mid() { return (CFG.MAP_TOP + CFG.MAP_BOTTOM) / 2; },
  w2s(wx, wy) { return [(wx - this.x) * this.z, (wy - this.y) * this.z]; },
  s2w(sx, sy) { return [sx / this.z + this.x, sy / this.z + this.y]; },
  apply(ctx) { ctx.transform(this.z, 0, 0, this.z, -this.x * this.z, -this.y * this.z); },
  // 目前看得到的世界範圍（含 pad 世界單位的外框），給剔除用
  view(pad = 0) { return { x0: this.x - pad, y0: this.y - pad, x1: this.x + CFG.W / this.z + pad, y1: this.y + CFG.H / this.z + pad }; },
  bounds(z) {
    const M = this.MARGIN;
    let x0 = -M / z, x1 = CFG.WW - (CFG.W - M) / z;
    if (x0 > x1) x0 = x1 = (CFG.WW - CFG.W / z) / 2;
    let y0 = -(CFG.MAP_TOP + M) / z, y1 = CFG.WH - (CFG.MAP_BOTTOM - M) / z;
    if (y0 > y1) y0 = y1 = CFG.WH / 2 - this.mid() / z;
    return { x0, x1, y0, y1 };
  },
  clampZ(z) { return Math.max(this.ZMIN, Math.min(this.ZMAX, z)); },
  clamp() { const b = this.bounds(this.z); this.x = Math.max(b.x0, Math.min(b.x1, this.x)); this.y = Math.max(b.y0, Math.min(b.y1, this.y)); },
  // 讓世界點 (wx,wy) 出現在地圖可視區中央時的鏡頭位置
  posFor(wx, wy, z) { const b = this.bounds(z); return { x: Math.max(b.x0, Math.min(b.x1, wx - CFG.W / 2 / z)), y: Math.max(b.y0, Math.min(b.y1, wy - this.mid() / z)), z }; },
  home() { return this.posFor(CFG.WW / 2, CFG.WH / 2, this.Z0); },
  overview() { return this.posFor(CFG.WW / 2, CFG.WH / 2, this.ZMIN); },
  set(p) { this.x = p.x; this.y = p.y; this.z = p.z; this.anim = null; this.clamp(); this.zoomedAt = performance.now(); },
  reset(over) { this.follow = null; this.set(over ? this.overview() : this.home()); },
  moveTo(p, dur = 0.45) { this.anim = { x0: this.x, y0: this.y, z0: this.z, x1: p.x, y1: p.y, z1: p.z, t: 0, dur }; },
  recenter() { this.follow = null; this.moveTo(this.home()); },
  // 世界點不在畫面（扣掉 HUD 與 pad 邊距）內時，平滑移過去
  ensureVisible(wx, wy, pad = 48) {
    const [sx, sy] = this.w2s(wx, wy);
    if (sx > pad && sx < CFG.W - pad && sy > CFG.MAP_TOP + pad && sy < CFG.MAP_BOTTOM - pad) return false;
    if (this.anim) return false;
    this.moveTo(this.posFor(wx, wy, this.z)); return true;
  },
  // 玩家操作
  pan(dsx, dsy) { this.anim = null; this.follow = null; this.x -= dsx / this.z; this.y -= dsy / this.z; this.clamp(); this.userAt = performance.now(); },
  zoomAt(sx, sy, nz) {
    nz = this.clampZ(nz); if (Math.abs(nz - this.z) < 1e-4) return;
    const [wx, wy] = this.s2w(sx, sy);
    this.anim = null; this.z = nz; this.x = wx - sx / nz; this.y = wy - sy / nz; this.clamp();
    this.zoomedAt = this.userAt = performance.now();
  },
  followEntity(e, dur) { this.follow = { e, t: dur }; this.anim = null; },
  zooming() { return performance.now() - this.zoomedAt < 180 || (this.anim && Math.abs(this.anim.z1 - this.anim.z0) > 1e-4); },
  update(dt) {
    const a = this.anim;
    if (a) {
      a.t += dt; const k = Math.min(1, a.t / a.dur), e = 1 - Math.pow(1 - k, 3);
      this.z = a.z0 + (a.z1 - a.z0) * e; this.x = a.x0 + (a.x1 - a.x0) * e; this.y = a.y0 + (a.y1 - a.y0) * e;
      if (a.z1 !== a.z0) this.zoomedAt = performance.now();
      if (k >= 1) this.anim = null;
      this.clamp();
    }
    const f = this.follow;
    if (f) {
      f.t -= dt;
      if (f.t <= 0 || !f.e || f.e.remove || f.e.hp <= 0) this.follow = null;
      else { const p = this.posFor(f.e.x, f.e.y - 20, this.z), k = Math.min(1, dt * 4); this.x += (p.x - this.x) * k; this.y += (p.y - this.y) * k; this.clamp(); }
    }
  },
};
