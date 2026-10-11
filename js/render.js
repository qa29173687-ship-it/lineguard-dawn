'use strict';
// =============================================================
// 繪圖：地圖、單位、夜晚光影、HUD
// =============================================================
const R = { bg: null, dark: null };

// ---------- 選用：整張地圖背景圖（CFG.MAP_BG） ----------
// CFG.MAP_BG（每關由 applyLevel 換成 LEVELS[i].map）＝以單張靜態圖取代程序產生的地面與裝飾；
// CFG.MAP_BG_OVERLAY = true 時再依設定在上面畫路徑／道路（塔位一律照常畫）。
// 圖片載入失敗（或未設定）時自動退回程序產生背景。
R.mapImg = null; R.maps = {};
// 每關一張背景（assets/maps/level_XX.jpg）；載過的圖留在 R.maps，切換關卡時立即生效
function loadMapBg() {
  if (!CFG.MAP_BG) return;
  const src = CFG.MAP_BG, have = R.maps[src];
  if (have && have.complete && have.naturalWidth) { R.mapImg = have; buildBackground(); return; }
  const im = have || new Image(); R.maps[src] = im;
  im.onload = () => { if (CFG.MAP_BG === src) { R.mapImg = im; buildBackground(); } };
  im.onerror = () => { if (CFG.MAP_BG === src) R.mapImg = null; };
  if (!have) im.src = src;
}
function preloadMaps() { if (typeof LEVELS === 'undefined') return; for (const lv of LEVELS) if (!R.maps[lv.map]) { const im = new Image(); im.src = lv.map; R.maps[lv.map] = im; } }
function paintRoads(x) {
  // 依設定畫路徑（敵人道路，棕）與補給道路（淺黃褐）：給 MAP_BG 疊加或版面參考用
  const line = (pts, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke(); };
  line(CFG.PATH, 26, 'rgba(127,98,54,0.9)'); line(CFG.PATH, 22, '#b08850'); line(CFG.ROAD, 10, '#d8c08a');
}
function buildBackground() {
  R.bgFit = null;   // 裝置解析度快取，下次繪製時重建
  // 夜色層：世界的 1/2 解析度（2 世界像素一格），跟著鏡頭一起變換
  if (!R.dark || R.dark.width !== CFG.WW / 2) { R.dark = document.createElement('canvas'); R.dark.width = CFG.WW / 2; R.dark.height = CFG.WH / 2; R.darkStatic = null; R.darkKey = ''; }
  if (R.mapImg) {
    const W = CFG.WW, H = CFG.WH, c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
    const x = c.getContext('2d'); x.scale(2, 2); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(R.mapImg, 0, 0, W, H);
    if (CFG.MAP_BG_OVERLAY) paintRoads(x);
    R.bg = c; return;
  }
  // 背景以 2 倍解析度繪製（正式素材是 2 倍圖），固定亂數種子：素材載入後重畫時版面不變
  let seed = 1234567; const rand = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
  const rnd = () => rand(0, 1);
  const W = CFG.WW, H = CFG.WH, c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const x = c.getContext('2d'); x.scale(2, 2); x.imageSmoothingEnabled = false;
  const path = makePath(CFG.PATH), road = makePath(CFG.ROAD);
  const grass = ['#5a9e3a', '#63a83f', '#559636', '#6bb045'], rear = ['#7aa84a', '#82b051', '#73a145'];
  const dirt = ['#b08850', '#a67f48', '#bb935a'], roadC = ['#d8c08a', '#cfb57d'];
  const cell = 3;
  for (let j = 0; j < H; j += cell) for (let i = 0; i < W; i += cell) {
    const cx = i + cell / 2, cy = j + cell / 2;
    const dp = distToPath(path, cx, cy), dr = distToPath(road, cx, cy);
    let col;
    if (dp < 11) col = dirt[(rnd() * 3) | 0];
    else if (dp < 13) col = '#7f6236';
    else if (dr < 5) col = roadC[(rnd() * 2) | 0];
    else if (cy > 458 * CFG.WS) col = rear[(rnd() * 3) | 0];
    else col = grass[(rnd() * 4) | 0];
    x.fillStyle = col; x.fillRect(i, j, cell, cell);
  }
  // 河流裝飾（後方左側小池塘）
  // 樹林：避開路徑、塔位、地塊、道路、城堡
  const avoid = (tx, ty) => distToPath(path, tx, ty) < 22 || distToPath(road, tx, ty) < 14
    || CFG.TOWER_SPOTS.some(s => Math.hypot(s[0] - tx, s[1] - ty) < 24)
    || CFG.PLOTS.some(s => Math.abs(s[0] - tx) < 26 && Math.abs(s[1] - ty) < 26)
    || Math.hypot(CFG.CASTLE.x - tx, CFG.CASTLE.y - ty) < 44 || Math.hypot(CFG.DEPOT.x - tx, CFG.DEPOT.y - ty) < 26
    || Math.hypot(CFG.GRANARY.x - tx, CFG.GRANARY.y - ty) < 30;
  const trees = [];
  for (let n = 0; n < 900 && trees.length < 70; n++) {
    const tx = rand(4, W - 4), ty = rand(CFG.WTOP + 10, 470 * CFG.WS);
    const dense = ty < 75 ? 0.9 : 0.35;
    if (rnd() > dense || avoid(tx, ty) || trees.some(t => Math.hypot(t.x - tx, t.y - ty) < 16)) continue;
    const r = rnd();
    trees.push({ x: tx, y: ty, kind: ty < 75 ? (r < 0.8 ? 'pine' : 'oak') : r < 0.45 ? 'pine' : r < 0.72 ? 'oak' : r < 0.88 ? 'bush' : 'rock' });
  }
  trees.sort((a, b) => a.y - b.y).forEach(t => drawSprite(x, 'tree', t.x, t.y, 1.4, rnd() < 0.5, false, t.kind));
  // 花草點綴
  for (let n = 0; n < 160; n++) {
    const tx = rand(0, W), ty = rand(CFG.WTOP, CFG.WBOT);
    if (avoid(tx, ty)) continue;
    x.fillStyle = ['#a7f070', '#ffcd75', '#f4f4f4', '#3b7d2a'][(rnd() * 4) | 0]; x.fillRect(tx | 0, ty | 0, 2, 2);
  }
  R.bg = c;
}
// 背景：鏡頭縮放倍率固定時，依「目前裝置像素／世界單位」預先縮放整張背景一次，之後每幀 1:1 貼上（省去每幀整張縮放取樣）；
// 縮放進行中（雙指／滾輪／鏡頭動畫）或快取會太大時，直接縮放繪製
function drawBg(ctx) {
  const m = ctx.getTransform(), sc = m.a, cw = Math.round(CFG.WW * sc), ch = Math.round(CFG.WH * sc);
  const zooming = Cam.zooming();
  if (zooming || cw * ch > 8e6) {
    if (R.bgFit && (R.bgFit.width !== cw || R.bgFit.height !== ch)) R.bgFit = null;   // 釋放舊快取
    ctx.imageSmoothingEnabled = !zooming && !!R.mapImg;   // 縮放中：最近鄰（較快；停下後換回高品質快取）；快取太大（平板放大）：直接平滑縮放
    ctx.drawImage(R.bg, 0, 0, CFG.WW, CFG.WH); ctx.imageSmoothingEnabled = false; return;
  }
  if (!R.bgFit || R.bgFit.width !== cw || R.bgFit.height !== ch) {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = !!R.mapImg; x.imageSmoothingQuality = 'high'; x.drawImage(R.bg, 0, 0, cw, ch);
    R.bgFit = c;
  }
  ctx.setTransform(1, 0, 0, 1, Math.round(m.e), Math.round(m.f)); ctx.drawImage(R.bgFit, 0, 0); ctx.setTransform(m);
}

function hpBar(ctx, x, y, w, ratio, col = '#5fd16b') {
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
  ctx.fillStyle = '#5d275d'; ctx.fillRect(x - w / 2, y, w, 2);
  ctx.fillStyle = ratio > 0.5 ? col : ratio > 0.25 ? '#ffcd75' : '#ef7d57'; ctx.fillRect(x - w / 2, y, w * clamp(ratio, 0, 1), 2);
}
function text(ctx, s, x, y, size = 12, color = '#fff', align = 'left', bold = true, outline = true) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,10,25,0.85)'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function darkness() {
  if (G.phase === 'night') return 0.74;
  if (G.phase === 'dusk') return 0.12 + 0.4 * (1 - G.phaseT / CFG.DUSK_TIME);
  if (G.phase === 'dawn') return 0.3;
  return 0;
}

function renderWorld(ctx) {
  ctx.save();
  ctx.fillStyle = '#16200f'; ctx.fillRect(0, 0, CFG.W, CFG.H);   // 世界外（捲到邊緣時）
  if (setting('shake')) {   // 輕微畫面震動（設定可關閉）
    if (G.shake > 0) ctx.translate(rand(-2, 2), rand(-2, 2));
    const bsh = Boss.shake(); if (bsh) ctx.translate(rand(-bsh, bsh), rand(-bsh, bsh));
  }
  Cam.apply(ctx);   // 之後全部以世界座標繪製（直到本函式結尾）
  ctx.imageSmoothingEnabled = false;
  drawBg(ctx);
  const day = G.phase === 'day';
  // 塔位
  CFG.TOWER_SPOTS.forEach((s, i) => {
    if (towerAt(i)) return;
    if (R.mapImg && !CFG.MAP_BG_OVERLAY) { ctx.fillStyle = 'rgba(255,209,102,0.55)'; ctx.fillRect(s[0] - 2, s[1] - 2, 4, 4); return; }
    if (Art.resolve('pad')) { drawSprite(ctx, 'pad', s[0], s[1] + 7); ctx.fillStyle = 'rgba(255,209,102,0.8)'; ctx.fillRect(s[0] - 1, s[1] - 1, 2, 2); return; }
    ctx.fillStyle = '#4a4a5a'; ctx.beginPath(); ctx.ellipse(s[0], s[1], 13, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8b93a5'; ctx.beginPath(); ctx.ellipse(s[0], s[1] - 1, 11, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.fillRect(s[0] - 1, s[1] - 2, 2, 2);
  });
  // 補給道路（預設的東崖道路已畫在背景圖上；其他補給站另外畫）
  if (G.post && G.lv && G.lv.supply && G.post.id !== G.lv.supply.default) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, c] of [[9, 'rgba(110,84,48,0.55)'], [6, '#d8c08a']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); G.post.road.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  }
  // 今夜敵情：入口箭頭（黃昏預覽時閃爍）
  if (G.preview && (G.phase === 'dusk' || G.phase === 'day')) drawEntryArrows(ctx);
  // 後方空地
  CFG.PLOTS.forEach((p, i) => {
    if (buildingAt(i)) return;
    ctx.strokeStyle = day ? 'rgba(255,240,180,0.85)' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]); ctx.strokeRect(p[0] - 14, p[1] - 14, 28, 28); ctx.setLineDash([]);
    if (day) text(ctx, '+', p[0], p[1], 12, 'rgba(255,240,180,0.9)', 'center');
  });
  // 投影：一次批次畫完（都在地面上，不需要和單位一起排序）；略過畫面外與受擊閃白中的單位
  if (G.hero) HeroAnim.tick(G.hero);
  Light.shadowBatch(ctx);
  HeroAnim.drawDust(ctx);
  // 可排序物件
  const list = [];
  list.push({ y: CFG.CASTLE.y + 22, draw: () => drawSprite(ctx, 'castle', CFG.CASTLE.x, CFG.CASTLE.y + 24, 2) });
  list.push({ y: CFG.GRANARY.y + 14, draw: () => { drawSprite(ctx, 'granary', CFG.GRANARY.x, CFG.GRANARY.y + 16, 2); text(ctx, '糧倉', CFG.GRANARY.x, CFG.GRANARY.y + 12 - spriteHeight('granary', 2), 9, '#ffe9a8', 'center'); if (G.granaryBurned) drawBurned(ctx, CFG.GRANARY.x, CFG.GRANARY.y + 16, 30, true); } });
  const P = G.post;
  if (P) list.push({ y: P.y + 14, draw: () => { drawSprite(ctx, 'depot', P.x, P.y + 16, 2); text(ctx, '補給站', P.x - 4, P.y + 22, 9, '#ffe9a8', 'center'); } });
  for (const b of G.buildings) list.push({ y: b.y + 12, draw: () => { drawSprite(ctx, b.def.sprite, b.x, b.y + 16, 2); if (b.burned) drawBurned(ctx, b.x, b.y + 16, 24, true); } });
  for (const rb of G.roadBreaks || []) list.push({ y: rb.y - 4, draw: () => drawRoadBreak(ctx, rb) });
  for (const t of G.towers) list.push({ y: t.y + 6, draw: () => drawTower(ctx, t) });
  const w = G.wagon;
  if (w && G.road) list.push({ y: w.y, draw: () => { if (w.blocked) text(ctx, '道路中斷！', w.x, w.y - 26, 8, '#ff8080', 'center'); drawSprite(ctx, 'wagon', w.x, w.y + 4, 1.4, Art.resolve('wagon') ? w.state !== 'back' : w.state === 'back'); /* 正式圖朝左：去程（往右上）翻轉 */ if (w.cargo > 0) text(ctx, `${w.cargo}`, w.x, w.y - 16, 8, '#ffd166', 'center'); } });
  for (const v of G.villagers) list.push({ y: v.y, draw: () => {
    const bob = (v.state === 'work' ? Math.abs(Math.sin(v.anim * 8)) * 2 : Math.abs(Math.sin(v.anim * 10)) * 1);
    drawSprite(ctx, 'villager', v.x, v.y - bob, 0.9, v.face < 0, false, v.carry ? 'carry' : v.job ? v.job.type : 'idle');
    if (v.carry && !Art.resolve('villager')) { ctx.fillStyle = v.carry.food ? '#ffcd75' : v.carry.wood ? '#8b5a2b' : '#94b0c2'; ctx.fillRect(v.x - 2, v.y - 17, 4, 4); }
  } });
  for (const s of G.soldiers) if (!s.dead && !s.remove) list.push({ y: s.y, draw: () => {
    if (s.skeleton) {   // 骷髏兵（暫代點陣圖；從地底升起）
      const up = s.rise > 0 ? s.rise / 0.4 : 0;
      ctx.save(); if (up > 0) { ctx.beginPath(); ctx.rect(s.x - 12, s.y - 30, 24, 30); ctx.clip(); }
      drawSprite(ctx, 'skeleton', s.x, s.y + up * 16 - Math.abs(Math.sin(s.anim * 9)) * (s.target ? 0 : 1), 1.05, s.face < 0, s.flash > 0);
      ctx.restore();
      if (s.hp < s.max) hpBar(ctx, s.x, s.y - 20, 12, s.hp / s.max, '#a7f070');
      return;
    }
    const br = s.tower.br;
    const sv = br === 'berserker' ? ((s.target && s.atkT > 0.3) ? 'attack' : 'idle') : s.tower.lvl >= 3 ? 'knight' : (s.target && s.atkT > 0.55) ? 'attack' : 'idle';
    drawSprite(ctx, 'soldier', s.x, s.y - Math.abs(Math.sin(s.anim * 9)) * (s.target ? 0 : 1), br ? 1.12 : 1, s.face < 0, s.flash > 0, sv);
    if (br === 'templar') { ctx.fillStyle = 'rgba(120,170,255,0.9)'; ctx.fillRect(s.x - 1, s.y - 22, 3, 3); }
    else if (br === 'berserker') { ctx.fillStyle = 'rgba(255,90,60,0.95)'; ctx.fillRect(s.x - 1, s.y - 22, 3, 3); }
    if (s.inv > 0) { ctx.strokeStyle = 'rgba(255,240,150,0.8)'; ctx.beginPath(); ctx.arc(s.x, s.y - 8, 9, 0, 7); ctx.stroke(); }
    if (s.hp < s.max) hpBar(ctx, s.x, s.y - spriteHeight('soldier', 1, 'idle') - 3, 12, s.hp / s.max, '#41a6f6');
  } });
  for (const e of G.enemies) list.push({ y: e.d.flying ? e.y + 40 : e.y, draw: () => {
    const [ex, ey] = HeroAnim.enemyPos(e);
    const fly = e.d.flying ? 12 + Math.sin(e.anim * 6) * 3 : 0;
    const walk = e.blocker ? 0 : Math.abs(Math.sin(e.anim * (e.type === 'wolf' ? 16 : 10))) * 1.5;
    const sc = e.type === 'wolf' ? 1.2 : e.type === 'shield' ? 1.1 : 1;
    if (e.under) {   // 地底移動的地鼠工兵：只看得到土堆
      ctx.fillStyle = 'rgba(70,48,26,0.85)'; ctx.beginPath(); ctx.ellipse(ex, ey, 8, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(150,112,66,0.95)'; ctx.beginPath(); ctx.ellipse(ex, ey - 2, 6, 3, 0, 0, 7); ctx.fill();
      return;
    }
    if (e.d.boss) {   // 首領：吹號時抬身 + 紅色光暈
      const horn = e.hornT > 0 ? Math.sin(Math.min(1, (1.4 - e.hornT) / 0.3) * Math.PI / 2) : 0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; Light.glow1(ctx, 'orange', ex, ey - 20, 34, 0.25 + 0.2 * horn, 0.8); ctx.restore(); ctx.globalAlpha = 1;
      drawSprite(ctx, 'boss', ex, ey - walk * 0.5 - horn * 3, 2.6, e.face < 0, e.flash > 0 || e.visFlash > 0);
      const bh = spriteHeight('boss', 2.6); hpBar(ctx, ex, ey - bh - 6, 30, e.hp / e.max, '#ef7d57');
      return;
    }
    drawSprite(ctx, e.d.sprite, ex, ey - fly - walk, sc, e.face < 0, e.flash > 0 || e.visFlash > 0);
    const eh = spriteHeight(e.d.sprite, sc);
    if (e.carry > 0) { ctx.fillStyle = '#ffcd75'; ctx.fillRect(e.x + 4, e.y - eh * 0.8, 5, 5); }
    if (e.poison) { ctx.fillStyle = 'rgba(140,240,90,0.9)'; const k = (G.time * 2 + e.anim) % 1; ctx.fillRect(ex - 3 + Math.sin(e.anim * 7) * 3, ey - eh * 0.5 - k * 10, 2, 2); ctx.fillRect(ex + 3, ey - eh * 0.3 - ((k + 0.5) % 1) * 10, 2, 2); }
    if (e.blockFx > 0) { ctx.strokeStyle = 'rgba(200,230,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ex + e.face * 6, ey - eh * 0.5, 6, -1, 1); ctx.stroke(); }
    hpBar(ctx, ex, ey - fly - eh - 4, 14, e.hp / e.max, e.poison ? '#8cf05a' : '#ef7d57');
    if (e.d.sapper && e.dig > 0 && e.mode !== 'leave') { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ex - 9, ey + 3, 18, 3); ctx.fillStyle = '#ffb070'; ctx.fillRect(ex - 9, ey + 3, 18 * e.dig / CFG.SAPPER_DIG, 3); }
    if (e.d.arsonist && e.burnT > 0 && e.tgt) { ctx.fillStyle = '#ff7a2a'; ctx.fillRect(ex - 2 + Math.sin(G.time * 30) * 2, ey - eh - 10, 4, 5); }
  } });
  const h = G.hero;
  if (h && !h.dead) list.push({ y: h.y, draw: () => {
    const v = HeroAnim.state(h), x = h.x + v.ox;
    HeroAnim.draw(ctx, h, darkness() > 0.3);
    HeroAnim.drawAura(ctx, h);
    const hh = spriteHeight(h.d.sprite, 1.35, 'idle');
    if (h.inv > 0) { ctx.strokeStyle = 'rgba(255,240,150,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, h.y - hh / 2, hh * 0.45, hh * 0.6, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = h.d.color; ctx.beginPath(); ctx.moveTo(x - 3, h.y - hh - 8); ctx.lineTo(x + 3, h.y - hh - 8); ctx.lineTo(x, h.y - hh - 4); ctx.fill();
    hpBar(ctx, x, h.y - hh - 4, 18, h.hp / h.max, h.d.color);
  } });
  list.sort((a, b) => a.y - b.y).forEach(o => o.draw());
  HeroAnim.drawRise(ctx);
  // 隕石術：畫面微暗（詠唱到隕石落地）
  { const mz = G.zones.find(z => z.kind === 'meteor'); const vh = G.hero && G.hero.id === 'vera' && G.hero.skillAnim > 0;
    if (mz || vh) { const k = mz ? 1 - Math.max(0, mz.t) / mz.life * 0.3 : 0.7; ctx.fillStyle = `rgba(20,5,40,${0.2 * k})`; ctx.fillRect(-40, -40, CFG.WW + 80, CFG.WH + 80); } }

  // 技能區域
  for (const z of G.zones) {
    if (z.kind === 'rain') { ctx.strokeStyle = z.evo ? 'rgba(190,220,255,0.75)' : 'rgba(160,255,160,0.5)'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (z.kind === 'meteor') {
      const k = 1 - z.t / z.life;
      ctx.strokeStyle = 'rgba(255,90,40,0.8)'; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, 7); ctx.stroke();
      const my = z.y - 140 * (1 - k), mx = z.x + 60 * (1 - k);
      if (Art.img.vera_fx_sk2) { const m = Art.meta.vera_fx_sk2, im = Art.img.vera_fx_sk2, s2 = 0.42; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(im, mx - m.w * s2 / 2, my - m.h * s2 / 2, m.w * s2, m.h * s2); ctx.restore(); }
      else { ctx.fillStyle = '#ffd84a'; ctx.fillRect(mx - 5, my - 5, 10, 10); ctx.fillStyle = '#ff7a00'; ctx.fillRect(mx - 3 + 6, my - 3 - 6, 6, 6); }
    }
    if (z.kind === 'burn') {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + G.time * 2, r = (i % 3 + 1) * 11;
        const fx = z.x + Math.cos(a) * r, fy = z.y + Math.sin(a) * r * 0.6;
        ctx.fillStyle = i % 2 ? '#ff7a00' : '#ffd84a'; ctx.fillRect(fx - 2, fy - 4 - Math.abs(Math.sin(G.time * 9 + i)) * 3, 4, 5);
      }
    }
  }
  // 投射物
  for (const p of G.projectiles) {
    if (p.kind === 'arrow') {
      ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(p.ang || 0) * 7, p.y - Math.sin(p.ang || 0) * 7); ctx.stroke();
    } else if (p.kind === 'bolt') {
      const [c1, c2] = p.col === 'green' ? ['#4fbf4f', '#c8ff9a'] : p.col === 'arcane' ? ['#8f4fe0', '#ffffff'] : ['#c58cf2', '#73eff7'];
      ctx.fillStyle = c1; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); ctx.fillStyle = c2; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else if (p.kind === 'ball') {
      ctx.fillStyle = '#1a1c2c'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); ctx.fillStyle = '#566c86'; ctx.fillRect(p.x - 2, p.y - 2, 2, 2);
    } else if (p.kind === 'rock') {
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(p.x - 4, p.y - 4, 8, 8); ctx.fillStyle = '#8b7a66'; ctx.fillRect(p.x - 3, p.y - 3, 3, 3);
    } else if (p.kind === 'bullet') {
      ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(p.ang || 0) * 10, p.y - Math.sin(p.ang || 0) * 10); ctx.stroke();
    }
  }
  // 特效（橫幅除外）
  for (const f of G.fx) {
    const k = f.t / f.life;
    if (f.kind === 'boom') { ctx.fillStyle = f.color; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.5 + k * 0.6), f.r * 0.6 * (0.5 + k * 0.6), 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    else if (f.kind === 'zap') { ctx.strokeStyle = f.big ? `rgba(160,220,255,${1 - k * 0.6})` : '#73eff7'; ctx.lineWidth = f.big ? 2.5 : 2; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo((f.x1 + f.x2) / 2 + rand(-5, 5), (f.y1 + f.y2) / 2 + rand(-5, 5)); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
    else if (f.kind === 'arrowfall') { ctx.strokeStyle = '#e8ffd0'; ctx.lineWidth = 1.5; const yy = f.y - 30 * (1 - k); ctx.beginPath(); ctx.moveTo(f.x, yy - 8); ctx.lineTo(f.x, yy); ctx.stroke(); }
    else if (f.kind === 'pillar') {   // 進化／分支升級：金色光柱
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85, w = (f.small ? 14 : 26) * (1 - k * 0.4);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,220,120,${0.55 * a})`; ctx.fillRect(f.x - w / 2, Cam.y, w, f.y - Cam.y);
      ctx.fillStyle = `rgba(255,255,230,${0.75 * a})`; ctx.fillRect(f.x - w / 6, Cam.y, w / 3, f.y - Cam.y);
      Light.glow1(ctx, 'gold', f.x, f.y - 6, f.small ? 26 : 46, a, 0.6); ctx.restore(); ctx.globalAlpha = 1;
    }
    else if (f.kind === 'horn') { ctx.strokeStyle = `rgba(255,120,90,${1 - k})`; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const r = 10 + ((k + i / 3) % 1) * 46; ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.6, 0, 0, 7); ctx.stroke(); } }
    else if (f.kind === 'lvl') { ctx.strokeStyle = `rgba(120,200,255,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y, 8 + k * 18, 4 + k * 9, 0, 0, 7); ctx.stroke(); }
    else if (f.kind === 'mark') { ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(f.x, f.y, 8 + k * 6, 4 + k * 3, 0, 0, 7); ctx.stroke(); }
  }

  renderLighting(ctx);
  renderGlowFx(ctx);

  drawDmgNumbers(ctx);
  for (const f of G.fx) if (f.kind === 'text') text(ctx, f.text, f.x, f.y - f.t * 22, 10, f.color, 'center');
  ctx.restore();
}

// 英雄動作影格（只影響顯示）：技能 > 攻擊 > 走路（走路/待機交替）> 待機
function heroFrame(h) { return (h.vis && h.vis.frame) || 'front'; }   // 目前畫面上的英雄影格（見 heroanim.js）

// 塔的圖：分支塔用分支圖（沒有圖時退回第 3 級圖）
function towerSpriteKey(t) { return t.bdef && Art.resolve(t.bdef.sprite) ? [t.bdef.sprite, null] : [t.def.sprite, Math.min(3, t.lvl)]; }
function drawTower(ctx, t, ghost) {
  const [sp, v] = towerSpriteKey(t);
  drawSprite(ctx, sp, t.x, t.y + 8 + (t.fireAnim > 0 ? 1 : 0), 1.8, false, false, v);
  if (ghost) return;
  if (G.beaconT > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; Light.glow1(ctx, 'orange', t.x, t.y - 28, 14 + Math.sin(G.time * 14 + t.x) * 2, 0.8); ctx.restore(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffb347'; ctx.fillRect(t.x - 1 + Math.sin(G.time * 20 + t.y) * 1.5, t.y - spriteHeight(sp, 1.8, v) + 2 - (G.time * 30 % 6), 2, 3); }
  // 等級標記（分支塔：金色星）
  if (t.bdef) { text(ctx, '★', t.x, t.y + 12, 10, '#ffd166', 'center'); }
  else for (let i = 0; i < t.lvl; i++) { ctx.fillStyle = '#1a1c2c'; ctx.fillRect(t.x - 9 + i * 7, t.y + 9, 6, 5); ctx.fillStyle = '#ffd166'; ctx.fillRect(t.x - 8 + i * 7, t.y + 10, 4, 3); }
  if (towerStarving(t)) text(ctx, t.supplied ? '缺糧' : '補給外', t.x, t.y + 6 - spriteHeight(sp, 1.8, v), 8, '#ff8080', 'center');
  if (t.type === 'barracks' && t.rally) { ctx.fillStyle = 'rgba(65,166,246,0.5)'; ctx.fillRect(t.rally.x - 1, t.rally.y - 1, 3, 3); }
}

// 夜晚光影（效能版）：
// - 靜態光源（城堡、糧倉、補給站、塔）先畫進快取層 R.darkStatic，只有在夜色濃度／塔的配置改變時才重畫
// - 動態光源（英雄、車隊、技能、爆炸、法術彈）每 2 幀才更新一次夜色層（30Hz，肉眼幾乎看不出差別）
R.darkFrame = 0; R.darkKey = '';
const GLOW_IN_DARK = 2.0;   // 光暈改成畫在夜色層裡（一般混合），稍微加強以接近原本 lighter 疊加的亮度
function renderLighting(ctx) {
  const a = darkness(); if (a <= 0 || Light.off.dark) return;
  const d = R.dark, dx = d.getContext('2d'), sx = d.width / CFG.WW, sy = d.height / CFG.WH;
  const hole = (c, x, y, r, s) => { c.globalAlpha = Math.min(1, s); c.drawImage(Light.hole, (x - r) * sx, (y - r) * sy, r * 2 * sx, r * 2 * sy); };
  const aq = Math.round(a * 50) / 50;
  const key = `${G.phase === 'dusk'}|${aq}|${G.starving}|${G.beaconT > 0}|${G.post ? G.post.id : ''}|${G.towers.map(t => t.type[0] + t.x + ',' + t.y).join(';')}`;
  let st = R.darkStatic;
  if (!st) { st = R.darkStatic = document.createElement('canvas'); st.width = d.width; st.height = d.height; }
  const rebuilt = key !== R.darkKey;
  if (rebuilt) {
    R.darkKey = key;
    const c = st.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, st.width, st.height);
    c.fillStyle = G.phase === 'dusk' ? `rgba(60,20,50,${aq})` : `rgba(8,10,34,${aq})`; c.fillRect(0, 0, st.width, st.height);
    c.globalCompositeOperation = 'destination-out';
    hole(c, CFG.CASTLE.x, CFG.CASTLE.y, 70, 1);
    if (G.post) hole(c, G.post.x, G.post.y, 34, 0.8);
    hole(c, CFG.GRANARY.x, CFG.GRANARY.y, 34, 0.8);
    for (const t of G.towers) hole(c, t.x, t.y - 10, t.type === 'mage' ? 52 : 44, G.starving ? 0.6 : 0.95);
    // 塔與城堡的暖色光暈也畫進快取層（取代每幀在主畫布上的 lighter 疊加）
    c.globalCompositeOperation = 'source-over'; c.setTransform(sx, 0, 0, sy, 0, 0);
    const k = Math.min(1, aq * 2) * GLOW_IN_DARK;
    for (const t of G.towers) Light.glow1(c, G.beaconT > 0 ? 'orange' : t.type === 'mage' ? (t.br === 'necro' ? 'green' : 'cyan') : 'warm', t.x, t.y - 24, G.beaconT > 0 ? 34 : 24, (G.beaconT > 0 ? 0.65 : 0.4) * k);
    Light.glow1(c, 'warm', CFG.CASTLE.x, CFG.CASTLE.y - 6, 40, 0.25 * k);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  if (rebuilt || (R.darkFrame++ & 1) === 0 || Light.fullRate) {
    dx.globalCompositeOperation = 'copy'; dx.globalAlpha = 1; dx.drawImage(st, 0, 0);
    dx.globalCompositeOperation = 'destination-out';
    if (G.hero && !G.hero.dead) hole(dx, G.hero.x, G.hero.y - 10, 62, 1);
    if (G.wagon && G.road) hole(dx, G.wagon.x, G.wagon.y, 22, 0.8);
    for (const z of G.zones) hole(dx, z.x, z.y, z.r + 10, 0.9);
    for (const f of G.fx) if (f.kind === 'boom' && f.r > 20) hole(dx, f.x, f.y, f.r * 1.6, 0.9 * (1 - f.t / f.life));
    for (const p of G.projectiles) if (p.kind === 'bolt') hole(dx, p.x, p.y, 14, 0.7);
    dx.globalCompositeOperation = 'source-over'; dx.setTransform(sx, 0, 0, sy, 0, 0);
    const k = Math.min(1, aq * 2) * GLOW_IN_DARK, h = G.hero;
    if (G.boss && live(G.boss)) Light.glow1(dx, 'orange', G.boss.x, G.boss.y - 20, 40, 0.35 * k);
    if (h && !h.dead) Light.glow1(dx, 'warm', h.x, h.y - 6, 34, 0.28 * k, 0.7);
    dx.setTransform(1, 0, 0, 1, 0, 0);
    dx.globalAlpha = 1;
  }
  // 夜色遮罩：世界 1/2 解析度的小畫布以「最近鄰」放大（在鏡頭變換下）；只貼目前看得到的部分。世界外的邊緣另外補暗
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const v = Cam.view(4), x0 = Math.max(0, Math.floor(v.x0 * sx)), y0 = Math.max(0, Math.floor(v.y0 * sy)), x1 = Math.min(d.width, Math.ceil(v.x1 * sx)), y1 = Math.min(d.height, Math.ceil(v.y1 * sy));
  if (x1 > x0 && y1 > y0) ctx.drawImage(d, x0, y0, x1 - x0, y1 - y0, x0 / sx, y0 / sy, (x1 - x0) / sx, (y1 - y0) / sy);
  if (v.x0 < 0 || v.y0 < 0 || v.x1 > CFG.WW || v.y1 > CFG.WH) {
    ctx.fillStyle = G.phase === 'dusk' ? `rgba(60,20,50,${aq})` : `rgba(8,10,34,${aq})`; ctx.beginPath();
    ctx.rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0); ctx.rect(CFG.WW, 0, -CFG.WW, CFG.WH); ctx.fill('evenodd');
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// 技能與投射物的加亮光暈（白天也有，夜晚更明顯）
function renderGlowFx(ctx) {
  if (Light.off.glow) return;
  const night = darkness(), boost = 0.55 + night * 0.8;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const z of G.zones) {
    if (z.kind === 'rain') { Light.glow1(ctx, 'green', z.x, z.y, z.r * 1.3, 0.45 * boost, 0.65); Light.glow1(ctx, 'white', z.x, z.y, z.r * 0.5, 0.15 * boost, 0.65); }
    else if (z.kind === 'meteor') {
      const kk = 1 - z.t / z.life, my = z.y - 140 * (1 - kk), mx = z.x + 60 * (1 - kk);
      Light.glow1(ctx, 'orange', mx, my, 26, 0.9 * boost); Light.glow1(ctx, 'orange', z.x, z.y, z.r * 1.1, 0.35 * kk * boost, 0.65);
    } else if (z.kind === 'burn') Light.glow1(ctx, 'orange', z.x, z.y - 4, z.r * 1.3, (0.35 + 0.08 * Math.sin(G.time * 12)) * boost, 0.7);
  }
  const h = G.hero;
  if (h && !h.dead) {
    if (h.charge || (h.id === 'lena' && h.inv > 0)) Light.glow1(ctx, 'gold', h.x, h.y - 12, 40, (h.charge ? 0.5 : 0.35) * boost, 0.9);
    if (h.skillAnim > 0) Light.glow1(ctx, h.id === 'erin' ? 'green' : h.id === 'lena' ? 'gold' : 'orange', h.x + h.face * 10, h.y - 16, 30, 0.6 * boost);
  }
  for (const s of G.soldiers) if (!s.dead && s.inv > 0) Light.glow1(ctx, 'gold', s.x, s.y - 8, 14, 0.4 * boost);
  for (const f of G.fx) if (f.kind === 'boom' && f.r > 20) Light.glow1(ctx, f.color.includes('255,120') || f.color.includes('255,170') ? 'orange' : 'gold', f.x, f.y, f.r * 1.4, 0.4 * (1 - f.t / f.life) * boost, 0.7);
  for (const p of G.projectiles) {
    if (p.kind === 'bolt') Light.glow1(ctx, p.src === 'hero' ? 'orange' : 'purple', p.x, p.y, 10, 0.8 * boost);
    else if (p.kind === 'arrow' && p.src === 'hero') Light.glow1(ctx, 'green', p.x, p.y, 7, 0.6 * boost);
    else if (p.kind === 'arrow' && night > 0.3) Light.glow1(ctx, 'warm', p.x, p.y, 5, 0.4);
  }
  ctx.restore();
}

// 入口箭頭：北方道路（一般敵人）、西側（掠奪者）
// 被縱火狂燒毀：變暗 + 火苗 + 濃煙 +「點擊修復」
function drawBurned(ctx, x, y, w, label) {
  ctx.fillStyle = 'rgba(20,10,6,0.55)'; ctx.beginPath(); ctx.ellipse(x, y - w * 0.45, w * 0.62, w * 0.5, 0, 0, 7); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const k = (G.time * 1.4 + i * 0.33) % 1, fx = x - w * 0.3 + i * w * 0.3;
    ctx.fillStyle = `rgba(255,${120 + i * 40},40,${0.9 - k * 0.6})`; ctx.fillRect(fx - 2, y - w * 0.5 - k * 8, 4, 5);
    ctx.fillStyle = `rgba(60,60,60,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(fx + k * 4, y - w * 0.8 - k * 18, 3 + k * 5, 0, 7); ctx.fill();
  }
  if (label && G.phase !== 'night') text(ctx, '點擊修復', x, y + 4, 8, '#ffb070', 'center');
}
function drawRoadBreak(ctx, rb) {
  ctx.fillStyle = 'rgba(40,24,12,0.9)'; ctx.beginPath(); ctx.ellipse(rb.x, rb.y, 9, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#8a6a40'; for (const [dx, dy] of [[-10, -3], [9, 2], [-6, 5], [7, -5]]) ctx.fillRect(rb.x + dx - 2, rb.y + dy - 1, 4, 3);
  if (rb.prog > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(rb.x - 10, rb.y - 14, 20, 3); ctx.fillStyle = '#a7f070'; ctx.fillRect(rb.x - 10, rb.y - 14, 20 * rb.prog, 3); }
  else text(ctx, '斷路', rb.x, rb.y - 12, 8, '#ff8080', 'center');
}
function drawEntryArrows(ctx) {
  const k = 0.55 + 0.45 * Math.sin(G.time * 6);
  const arrow = (x, y, ang, col, label) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = k;
    ctx.fillStyle = col; ctx.strokeStyle = '#1a1028'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-2, -9); ctx.lineTo(-2, -4); ctx.lineTo(-12, -4); ctx.lineTo(-12, 4); ctx.lineTo(-2, 4); ctx.lineTo(-2, 9); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
    if (label) text(ctx, label, x + (ang === 0 ? 4 : 18), y + (ang === 0 ? -14 : 2), 9, col, ang === 0 ? 'left' : 'left');
  };
  const plan = nightPlan();
  const has = k => plan.some(w => w.some(g => g[0] === k));
  for (const p of G.paths || [G.path]) {   // 每條路線的入口：沿著路線第一段的方向
    const [a, b] = [p.pts[0], p.pts[1]], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const x = clamp(a[0] + Math.cos(ang) * 30, 14, CFG.WW - 14), y = clamp(a[1] + Math.sin(ang) * 30, 14, CFG.WBOT);
    arrow(x, y, ang, '#ff6b6b', '敵軍入口');
  }
  const side = [has('raider') && '掠奪者', has('arsonist') && '縱火狂', has('sapper') && '地鼠'].filter(Boolean).join('、');
  if (side) for (const r of CFG.RAIDS || []) { const rt = r.x > CFG.WW / 2; arrow(rt ? r.x - 14 : r.x + 14, r.y, rt ? Math.PI : 0, '#ffb070', ''); text(ctx, side, rt ? r.x - 30 : r.x + 30, r.y - 14, 9, '#ffb070', rt ? 'right' : 'left'); }
}
