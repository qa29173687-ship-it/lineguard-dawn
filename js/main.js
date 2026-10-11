'use strict';
// =============================================================
// 進入點：畫布縮放（直式 360×640 邏輯解析度）、主迴圈、輸入
// =============================================================
const DEBUG = /[?&]debug=1/.test(location.search);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let view = { s: 1, ox: 0, oy: 0 };

function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  const s = Math.min(ww / CFG.W, wh / CFG.H);
  const cw = Math.floor(CFG.W * s), ch = Math.floor(CFG.H * s);
  const dpr = Math.min(2, window.devicePixelRatio || 1);   // 上限 2x：手機高解析螢幕上畫素量減半以上，效能較穩
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  view.s = canvas.width / CFG.W;
}
window.addEventListener('resize', resize);
// 嵌入 iframe（itch.io）：全螢幕切換、手機轉向、網址列收合時 innerWidth/innerHeight 會變 → 重新貼合
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
document.addEventListener('fullscreenchange', resize);
document.addEventListener('webkitfullscreenchange', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ---------- 輸入：點擊／拖曳平移／雙指縮放（v11 鏡頭） ----------
// 遊戲中（地圖可捲動時）：按下時若在按鈕上 → 立即觸發；否則等放開：移動 < DRAG_PX 算「點擊」（蓋塔、移動英雄），超過就是拖曳平移。
// 第二根手指按下 → 雙指縮放（以兩指中點為中心）。滑鼠滾輪縮放（以游標為中心）。其他畫面：按下即點擊（與 v10 相同）。
const DRAG_PX = 8;                      // 邏輯像素
const ptrs = new Map(); let gest = null;
function evPos(ev) { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * CFG.W, (ev.clientY - r.top) / r.height * CFG.H]; }
function camActive() { return G.screen === 'play' && !UI.overlay && !CutIn.active && !Boss.active; }
function onButton(x, y) { for (let i = UI.buttons.length - 1; i >= 0; i--) { const b = UI.buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true; } return false; }
function pinchInfo() { const [a, b] = [...ptrs.values()]; return { d: Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; }
canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  if (window.focus) window.focus();   // iframe 內：點畫面後方向鍵／Esc 才收得到
  const [x, y] = evPos(ev);
  ptrs.set(ev.pointerId, [x, y]);
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 合成事件 */ }
  if (!camActive()) { gest = null; handleTap(x, y); return; }
  if (ptrs.size >= 2) { const p = pinchInfo(); gest = { mode: 'pinch', d0: p.d, z0: Cam.z, mx: p.mx, my: p.my }; return; }
  if (onButton(x, y)) { gest = null; handleTap(x, y); return; }   // HUD／選單按鈕：照舊按下即觸發
  gest = { mode: 'pending', id: ev.pointerId, x0: x, y0: y, lx: x, ly: y };
});
canvas.addEventListener('pointermove', ev => {
  if (!ptrs.has(ev.pointerId)) return;
  const [x, y] = evPos(ev); ptrs.set(ev.pointerId, [x, y]);
  if (!gest || !camActive()) return;
  if (gest.mode === 'pinch' && ptrs.size >= 2) {
    const p = pinchInfo();
    Cam.zoomAt(p.mx, p.my, gest.z0 * p.d / gest.d0);
    Cam.pan(p.mx - gest.mx, p.my - gest.my); gest.mx = p.mx; gest.my = p.my;
    return;
  }
  if (ev.pointerId !== gest.id) return;
  if (gest.mode === 'pending' && Math.hypot(x - gest.x0, y - gest.y0) > DRAG_PX) gest.mode = 'pan';
  if (gest.mode === 'pan') { Cam.pan(x - gest.lx, y - gest.ly); }
  gest.lx = x; gest.ly = y;
});
function pointerEnd(ev) {
  if (!ptrs.has(ev.pointerId)) return;
  ptrs.delete(ev.pointerId);
  const g = gest;
  if (g && g.mode === 'pinch') { gest = ptrs.size ? { mode: 'done' } : null; return; }   // 放開一指後不接續拖曳（避免畫面跳動）
  if (!g || g.id !== ev.pointerId) { if (!ptrs.size) gest = null; return; }
  gest = null;
  if (g.mode === 'pending' && ev.type === 'pointerup' && camActive()) handleTap(g.x0, g.y0);
}
// iOS Safari：雙指手勢不要縮放整個網頁（遊戲自己處理縮放）
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, e => e.preventDefault(), { passive: false });
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('wheel', ev => {
  if (!camActive()) return;
  ev.preventDefault();
  const [x, y] = evPos(ev), k = Math.exp(-Math.max(-120, Math.min(120, ev.deltaY * (ev.deltaMode === 1 ? 16 : 1))) * 0.0022);
  Cam.zoomAt(x, y, Cam.z * k);
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
// 圖書館檢視器：左右滑動切換
let swipe0 = null;
canvas.addEventListener('pointerdown', ev => { swipe0 = { x: ev.clientX, y: ev.clientY }; });
canvas.addEventListener('pointerup', ev => {
  if (!swipe0) return; const r = canvas.getBoundingClientRect(), dx = (ev.clientX - swipe0.x) / r.width * CFG.W, dy = (ev.clientY - swipe0.y) / r.height * CFG.H; swipe0 = null;
  if (UI.overlay === 'viewer' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) Viewer.step(dx < 0 ? 1 : -1);
});
window.addEventListener('keydown', e => {
  if (UI.overlay === 'viewer' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { Viewer.step(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (e.key === 'Escape' || e.key === 'p') { if (UI.overlay) closeOverlay(); else pauseGame(); return; }
  if (G.screen !== 'play' || UI.overlay) return;
  if (e.key === ' ') skipPhase();
  if (e.key === 'q' && G.hero) { G.targeting = !G.targeting; }
  // 鏡頭：方向鍵平移、+/- 縮放、Home／c 回預設視角
  const pan = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
  if (pan && camActive()) { Cam.pan(pan[0], pan[1]); e.preventDefault(); }
  if ((e.key === '+' || e.key === '=') && camActive()) Cam.zoomAt(CFG.W / 2, Cam.mid(), Cam.z * 1.2);
  if ((e.key === '-' || e.key === '_') && camActive()) Cam.zoomAt(CFG.W / 2, Cam.mid(), Cam.z / 1.2);
  if ((e.key === 'Home' || e.key === 'c') && camActive()) Cam.recenter();
});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);   // 先排下一幀：單一錯誤不會讓整個遊戲停住
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  Music.update(dt);
  if (G.screen === 'play') Cam.update(dt);   // 鏡頭用真實時間（暫停／演出時也能移動）
  if (G.paused && G.screen === 'play') dt = 0;   // 暫停：遊戲世界與演出都停住（音樂照常）
  else if (G.paused) G.paused = false;
  CutIn.update(dt);
  Boss.update(dt);
  dt *= G.speed * CutIn.timeScale() * Boss.timeScale();
  while (dt > 0) { const step = Math.min(0.05, dt); update(step); dt -= step; }
  ctx.setTransform(view.s, 0, 0, view.s, 0, 0);
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  renderAll(ctx);
  if (DEBUG) { ctx.font = `9px ${FONT}`; ctx.fillStyle = '#0f0'; ctx.textAlign = 'left'; ctx.fillText(`DEBUG ${G.screen}/${G.phase || ''}`, 4, CFG.H - 4); }
}

function boot() {
  G.save = loadSave();
  applySettings();
  G.speed = setting('speed');
  if (G.save.last) UI.selHero = G.save.last.hero;
  Sprites.init();
  buildBackground();
  Light.init();
  loadMapBg();
  preloadMaps();
  Music.init();
  SFX.init();
  CutIn.init();
  Art.onReady = () => { buildBackground(); Light.buildRims(); };   // 正式素材載入後：重畫背景、產生英雄邊緣光
  resize();
  requestAnimationFrame(frame);
}
boot();

// ---------- 測試／除錯介面（瀏覽器主控台可用） ----------
window.__game = {
  G,
  // level：關卡編號（1～10），mod：挑戰條件 id；沒有補給線的關卡忽略 post
  start: (hero = 'erin', bless = null, post = 'east', level = null, mod = null) => { if (level !== null) G.levelId = level; G.mod = mod; newRun(hero, bless); if (post && G.lv.supply) { G.supplyPick = post; confirmSupply(); } return G.levelId; },
  level: () => ({ id: G.levelId, name: G.lv && G.lv.name, nights: CFG.NIGHTS, paths: G.paths && G.paths.length, mod: G.mod, roadBreaks: (G.roadBreaks || []).length, granaryBurned: G.granaryBurned, burned: (G.buildings || []).filter(b => b.burned).length }),
  progress: () => ({ levels: G.save.levels, evolved: G.save.evolved, shards: G.save.shards, unlocked: LEVELS.map(l => levelUnlocked(l.id)) }),
  spawn: (type, lane = 0) => { const e = spawnEnemy(type, lane); return e && e.type; },
  screen: s => { G.screen = s; },
  skip: skipPhase,
  skill: (x, y) => CutIn.request(G.hero, () => castSkill(x, y)),   // 與玩家點擊相同（含演出）
  speed: n => { G.speed = n; },
  // v9：英雄日常／圖書館
  outing: () => ({ outing: G.outing && { hero: G.outing.hero, opts: G.outing.opts, all: !!G.outing.all, shown: G.outing.shown }, reveal: G.reveal && { hero: G.reveal.hero, id: G.reveal.id }, daily: G.save.daily, overlay: UI.overlay, viewer: UI.viewer ? { hero: UI.viewer.hero, i: UI.viewer.i, key: Viewer.cur() && Viewer.cur().key, n: Viewer.list().length } : null }),
  // 第 3 階段
  pause: (on = true) => { if (on) pauseGame(); else clearOverlay(); return G.paused; },
  overlay: k => { if (k) openOverlay(k); else clearOverlay(); return UI.overlay; },
  settings: (o) => { if (o) for (const k in o) setSetting(k, o[k]); return Object.assign({}, G.save.settings); },
  qol: () => ({ paused: !!G.paused, overlay: UI.overlay || null, tut: G.tut ? { lv: G.tut.lv, step: G.tut.step } : null, tutorialSave: G.save.tutorial, tip: G.tip ? G.tip.id : null, tipLog: (G.tipLog || []).slice(), tipsSave: G.save.tips,
                dialog: G.dialog ? { kind: G.dialog.kind, text: G.dialog.text } : null, dialogLog: (G.dialogLog || []).slice(), seen: G.save.seen,
                vibes: Vibe.log.length, dmgFx: (G.fx || []).filter(f => f.kind === 'dmg').length, speed: G.speed, saveV: G.save.v, cont: continueLevel(),
                vol: { music: CFG.MUSIC_VOLUME, sfx: CFG.SFX_VOLUME } }),
  music: () => ({ want: Music.want, unlocked: Music.unlocked, muted: Music.muted, ext: Music.ext, webaudio: !!Music.ctx, log: Music.log.slice(),
                  el: Object.fromEntries(Object.entries(Music.el).map(([k, a]) => [k, { ready: a.readyState, paused: a.paused, vol: +Music.vol[k] ? +Music.vol[k].toFixed(2) : 0, err: a.error ? a.error.code : 0, src: a.currentSrc.split('/').pop() }])) }),
  tap: (x, y) => handleTap(x, y),
  // v11 鏡頭：世界座標 → 畫面座標（測試用：點世界上的塔位等）；cam() 讀取／設定鏡頭
  w2s: (x, y) => Cam.w2s(x, y),
  s2w: (x, y) => Cam.s2w(x, y),
  cam: (o) => { if (o) { if (o.home) Cam.reset(false); else if (o.over) Cam.reset(true); else Cam.set({ x: o.x ?? Cam.x, y: o.y ?? Cam.y, z: o.z ?? Cam.z }); if (o.center) Cam.set(Cam.posFor(o.center[0], o.center[1], o.z ?? Cam.z)); } return { x: Cam.x, y: Cam.y, z: Cam.z, zmin: Cam.ZMIN, zmax: Cam.ZMAX, b: Cam.bounds(Cam.z) }; },
  give: (w = 999, s = 999, f = 200) => { G.res.wood += w; G.res.stone += s; G.res.food += f; },
  build: (spot, type) => buildTower(spot, type),
  place: (plot, type) => placeBuilding(plot, type),
  forceEnd: win => endGame(win),
  dawn: i => chooseDawn(i),
  // 第 1 階段除錯指令
  boss: () => { if (G.screen !== 'play') newRun('erin'); G.choosingSupply = false; if (G.phase !== 'night') { G.phase = 'night'; G.nightT = 0; G.spawnList = []; G.waveStarts = [0]; } return spawnEnemy('boss'); },
  xp: (n = 50) => { heroXp(n); return { lvl: G.hero.lvl, xp: G.hero.xp, evoReady: G.hero.evoReady }; },
  evolve: () => { if (G.hero.lvl < 10) { G.hero.xp = Math.max(G.hero.xp, CFG.HERO_XP[9]); heroLevelCheck(true); } return CutIn.evolve(G.hero, evolveHero); },
  supply: id => { G.supplyPick = id; if (G.choosingSupply) confirmSupply(); else { setPost(id); } return G.post.id; },
  branch: (spot, br) => { const t = towerAt(spot); return t ? branchTower(t, br) : false; },
  beacon: () => useBeacon(),
  sfx: () => ({ mode: SFX.mode, ready: SFX.ready(), total: Object.keys(SFX.DEF).length, log: SFX.log.slice(), counts: Object.assign({}, SFX.counts) }),
  talents: () => G.save.talents,
  state: () => ({ screen: G.screen, phase: G.phase, night: G.night, castleHp: G.castleHp, enemies: G.enemies ? G.enemies.length : 0,
                  pending: G.spawnList ? G.spawnList.length : 0, types: G.enemies ? [...new Set(G.enemies.map(e => e.type))] : [],
                  res: G.res, towers: G.towers ? G.towers.length : 0, kills: G.stats ? G.stats.kills : 0, end: G.end, save: G.save,
                  wagon: G.wagon && { state: G.wagon.state, cargo: G.wagon.cargo }, starving: G.starving, post: G.post && G.post.id, choosingSupply: G.choosingSupply,
                  hero: G.hero && { lvl: G.hero.lvl, xp: Math.round(G.hero.xp), evo: G.hero.evo, evoReady: G.hero.evoReady, max: G.hero.max },
                  boss: G.boss ? { hp: Math.round(G.boss.hp), max: G.boss.max, horns: G.boss.hornIdx } : null, bossIntro: !!Boss.active,
                  art: { loaded: Art.loaded, total: Art.total, failed: Art.failed } }),
};
