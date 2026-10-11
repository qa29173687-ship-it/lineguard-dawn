'use strict';
// =============================================================
// 遊戲邏輯：狀態、實體更新、戰鬥、補給線、晝夜循環
// =============================================================
const G = { screen: 'title', speed: 1, fx: [], levelId: 1, mod: null };
const SAVE_KEY = 'lxsw_save_v1';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const live = u => u && !u.dead && !u.remove;

// ---------- 存檔（第 3 階段：版本化、欄位驗證、損毀時改用備份） ----------
// v1：無 v 欄位（第 1～2 階段）；v2：加入 settings / seen（圖鑑）/ tutorial / last（繼續冒險）
const SAVE_VERSION = 3;   // v3：英雄日常 daily
const SETTINGS_DEF = { music: 1, sfx: 1, shake: true, vibrate: true, dmgNum: true, speed: 1 };
function defaultSave() {
  return { v: SAVE_VERSION, shards: 0, attempts: 0, lastResult: null, lossStreak: 0, bestStars: 0, wins: 0, talents: {}, levels: {}, evolved: {},
           settings: Object.assign({}, SETTINGS_DEF), seen: {}, tutorial: {}, tips: {}, last: null, daily: {} };
}
function sanitizeSave(o) {
  const d = defaultSave();
  if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
  const num = (v, def = 0) => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : def;
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  for (const k of ['shards', 'attempts', 'lossStreak', 'bestStars', 'wins']) d[k] = Math.floor(num(o[k]));
  d.lastResult = typeof o.lastResult === 'string' || (o.lastResult && typeof o.lastResult === 'object') ? o.lastResult : null;
  for (const n of CFG.TALENTS) if (obj(o.talents)[n.id] === true) d.talents[n.id] = true;
  for (const [id, r0] of Object.entries(obj(o.levels))) {
    if (!/^\d+$/.test(id)) continue;
    const r = obj(r0);
    d.levels[id] = Object.assign({}, r, { stars: Math.min(3, Math.floor(num(r.stars))), mods: obj(r.mods), wins: Math.floor(num(r.wins)), tries: Math.floor(num(r.tries)) });
  }
  for (const id in CFG.HEROES) if (obj(o.evolved)[id]) d.evolved[id] = true;
  d.altArt = {}; for (const id in CFG.HEROES) if (obj(o.altArt)[id]) d.altArt[id] = true;
  const st = obj(o.settings);
  for (const k in SETTINGS_DEF) if (typeof st[k] === typeof SETTINGS_DEF[k]) d.settings[k] = typeof st[k] === 'number' ? clamp(st[k], 0, k === 'speed' ? 2 : 1) : st[k];
  if (d.settings.speed !== 2) d.settings.speed = 1;
  for (const [k, v] of Object.entries(obj(o.seen))) if (CFG.ENEMIES[k]) d.seen[k] = v === 2 ? 2 : 1;
  for (const [k, v] of Object.entries(obj(o.tutorial))) if (typeof v === 'string') d.tutorial[k] = v;
  d.tips = {}; for (const [k, v] of Object.entries(obj(o.tips))) if (v) d.tips[k] = 1;
  for (const h in CFG.HEROES) { const src = obj(obj(o.daily)[h]), out = {}; for (const id of (typeof DAILY_IDS !== 'undefined' ? DAILY_IDS : Object.keys(src))) if (src[id] === true) out[id] = true; if (Object.keys(out).length) d.daily[h] = out; }
  const last = obj(o.last);
  if (typeof last.level === 'number' && CFG.HEROES[last.hero]) d.last = { level: last.level, hero: last.hero };
  if (typeof o.savedAt === 'number') d.savedAt = o.savedAt;
  return d;
}
function migrateSave(o) {
  if (o && typeof o === 'object' && !o.v) o.v = 1;   // v1 → v2 → v3：補上新欄位（sanitize 會填預設值；v3 加 daily）
  return sanitizeSave(o);
}
function loadSave() {
  let raw = null;
  try { raw = LS.getItem(SAVE_KEY); } catch (e) { return defaultSave(); }
  if (!raw) return defaultSave();
  try { return migrateSave(JSON.parse(raw)); }
  catch (e) {
    // 存檔損毀：保留一份原始內容，改讀上一次的備份
    try { LS.setItem(SAVE_KEY + '_corrupt', raw); const b = LS.getItem(SAVE_KEY + '_bak'); if (b) return migrateSave(JSON.parse(b)); } catch (e2) { /* ignore */ }
    return defaultSave();
  }
}
// 重置存檔（保留設定）
function resetSave() {
  const st = G.save && G.save.settings;
  G.save = defaultSave(); if (st) G.save.settings = st;
  try { LS.removeItem(SAVE_KEY + '_bak'); } catch (e) { /* ignore */ }
  writeSave();
}
function talent(id) { return !!(G.save && G.save.talents && G.save.talents[id]); }
function unlockTalent(id) {
  const n = CFG.TALENTS.find(t => t.id === id); if (!n || talent(id)) return false;
  if (n.req && !talent(n.req)) return false;
  if (G.save.shards < n.cost) return false;
  G.save.shards -= n.cost; G.save.talents[id] = true; writeSave(); return true;
}
function resetTalents() {
  for (const n of CFG.TALENTS) if (talent(n.id)) G.save.shards += n.cost;
  G.save.talents = {}; writeSave();
}
const sfx = (k, o) => { if (typeof SFX !== 'undefined') SFX.play(k, o); };
// 關卡進度：levels[id] = { stars, best, mods: { 挑戰 id: true }, wins, tries }；第 1 關永遠開放，其餘需要前一關通關（≥1 星）
function levelRec(id) { return (G.save.levels && G.save.levels[id]) || null; }
function levelUnlocked(id) { return id === 1 || !!(levelRec(id - 1) && levelRec(id - 1).stars > 0); }
// 繼續冒險：下一個尚未通關且已開放的關卡（全部通關時回到上次玩的關卡）
function continueLevel() {
  const any = Object.keys(G.save.levels || {}).some(k => +k > 0);
  if (!any) return null;
  const nx = LEVELS.find(l => levelUnlocked(l.id) && !(levelRec(l.id) && levelRec(l.id).stars > 0));
  return nx ? nx.id : (G.save.last && G.save.last.level) || LEVELS.length;
}
function totalStars() { let n = 0; for (const lv of LEVELS) { const r = levelRec(lv.id); if (r) n += r.stars || 0; } return n; }
function writeSave() {
  try {
    G.save.v = SAVE_VERSION; G.save.savedAt = Date.now();
    const s = JSON.stringify(G.save), prev = LS.getItem(SAVE_KEY);
    if (prev && prev[0] === '{') LS.setItem(SAVE_KEY + '_bak', prev);   // 上一份完整存檔當備份
    LS.setItem(SAVE_KEY, s);
  } catch (e) { /* 隱私模式／容量不足：忽略 */ }
}

// ---------- 路徑工具 ----------
function makePath(pts) {
  const segs = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len, start: total }); total += len;
  }
  return { pts, segs, total };
}
function pathAt(p, d) {
  d = clamp(d, 0, p.total);
  for (const s of p.segs) {
    if (d <= s.start + s.len) { const t = (d - s.start) / s.len; return { x: s.a[0] + (s.b[0] - s.a[0]) * t, y: s.a[1] + (s.b[1] - s.a[1]) * t }; }
  }
  const l = p.pts[p.pts.length - 1]; return { x: l[0], y: l[1] };
}
function nearestOnPath(p, x, y) {
  let best = null;
  for (const s of p.segs) {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
    const t = clamp(((x - s.a[0]) * dx + (y - s.a[1]) * dy) / (s.len * s.len), 0, 1);
    const px = s.a[0] + dx * t, py = s.a[1] + dy * t, d = Math.hypot(x - px, y - py);
    if (!best || d < best.dist) best = { x: px, y: py, dist: d, d: s.start + s.len * t };
  }
  return best;
}
function distToPath(p, x, y) { return nearestOnPath(p, x, y).dist; }
// 多條路線：取最近的一條
function nearestOnPaths(x, y) { let best = null; for (const p of (G.paths || [G.path])) { const n = nearestOnPath(p, x, y); if (!best || n.dist < best.dist) best = n; } return best; }
const offPath = e => e.d.raider || e.d.arsonist || e.d.sapper;     // 不走敵人道路的單位
const ePath = e => e.path || G.path;

// ---------- 關卡 ----------
// 進入關卡：把關卡資料套到 CFG（塔位、建地、波次、補給站…），其餘程式沿用 CFG
const CFG_BASE = { PLOTS: CFG.PLOTS.slice(), CASTLE_HP: CFG.CASTLE_HP };
// 第 0 關（除錯／回歸測試用，不在關卡地圖上）：第 1 階段的原始試玩關——全部塔種、分支、補給線、第 3 夜首領
const LEGACY_LEVEL = { id: 0, name: '試玩關', nights: CFG.NIGHTS, diff: '中', intro: '', tips: ['除錯用：第 1 階段試玩關'], paths: [CFG.PATH], pads: CFG.TOWER_SPOTS,
  plots: CFG.PLOTS.map((_, i) => i), towers: ['archer', 'barracks', 'mage', 'cannon'], buildings: ['farm', 'lumber', 'quarry', 'house'], branches: true, beacon: true,
  start: CFG.START, castle: CFG.CASTLE_HP, raid: [[CFG.RAIDER_SPAWN.x, CFG.RAIDER_SPAWN.y]], supply: { default: 'east', spots: CFG.SUPPLY_SPOTS },
  hp: CFG.NIGHT_HP_SCALE, xp: 1, waves: CFG.NIGHT_WAVES, mod: null, boss: 'boss', map: 'assets/maps/level_00.jpg' };
function applyLevel(id, mod) {
  const lv = id === 0 ? LEGACY_LEVEL : LEVELS[id - 1]; G.levelId = id; G.lv = lv; G.mod = mod || null;
  CFG.TOWER_SPOTS = lv.pads; CFG.PLOTS = lv.plots.map(i => CFG_BASE.PLOTS[i]);
  CFG.NIGHTS = lv.nights; CFG.NIGHT_WAVES = lv.waves; CFG.NIGHT_HP_SCALE = lv.hp; CFG.START = lv.start;
  CFG.CASTLE_HP = lv.castle; CFG.PATH = lv.paths[0]; CFG.PATHS = lv.paths;
  CFG.SUPPLY_SPOTS = lv.supply ? lv.supply.spots : []; CFG.RAIDS = lv.raid.map(([x, y]) => ({ x, y }));
  if (lv.supply) { const d = lv.supply.spots.find(s => s.id === lv.supply.default); CFG.DEPOT = { x: d.x, y: d.y }; CFG.ROAD = d.road; }
  if (CFG.MAP_BG !== lv.map) { CFG.MAP_BG = lv.map; if (typeof loadMapBg === 'function') loadMapBg(); }
}
function levelHas(k) { return !!(G.lv && G.lv[k]); }
function towerAllowed(type) { return (!G.lv || G.lv.towers.includes(type)) && !(G.mod === 'noBarracks' && type === 'barracks'); }
function buildingAllowed(type) { return !G.lv || G.lv.buildings.includes(type); }

// ---------- 資源 ----------
// 天賦「石匠」：防禦塔建造／升級費用 -10%
function towerCost(c) { if (!talent('d1')) return c; const o = {}; for (const k in c) o[k] = Math.round(c[k] * 0.9); return o; }
function canAfford(cost) { for (const k in cost) if ((G.res[k] || 0) < cost[k]) return false; return true; }
function pay(cost) { for (const k in cost) G.res[k] -= cost[k]; }
function costText(cost) { const n = { wood: '木', stone: '石', food: '糧' }; return Object.keys(cost).map(k => cost[k] + n[k]).join(' '); }

// ---------- 特效 ----------
function floatText(x, y, text, color = '#fff', life = 1.0) { G.fx.push({ kind: 'text', x, y, text, color, t: 0, life }); }
function banner(text, sub = '', life = 2.4) { G.fx = G.fx.filter(f => f.kind !== 'banner'); G.fx.push({ kind: 'banner', text, sub, t: 0, life }); }
function boom(x, y, r, color, life = 0.4) { G.fx.push({ kind: 'boom', x, y, r, color, t: 0, life }); }
function toast(text) { floatText(G.W / 2 || 180, 300, text, '#ffd166', 1.4); }

// ---------- 開局 ----------
function newRun(heroId, blessingId) {
  applyLevel(G.levelId === 0 ? 0 : (G.levelId || 1), G.mod);
  const s = CFG.START;
  Object.assign(G, {
    screen: 'play', phase: 'day', night: 1, phaseT: CFG.DAY_TIME, time: 0,
    res: { wood: s.wood, stone: s.stone, food: s.food, front: s.front },
    towers: [], buildings: [], enemies: [], soldiers: [], projectiles: [], fx: [], zones: [], villagers: [],
    menu: null, targeting: false, spawnList: [], nightT: 0, popSpawnT: 0, bonusPop: 0, shake: 0,
    mods: { archerRate: 1, heroDmg: 1, soldierHp: 1, soldierDmg: 1, towerDmg: 1, wagonSpeed: 1, wagonCap: CFG.WAGON.cap, castleHpMult: 1 },
    stats: { kills: 0, leaked: 0, stolen: 0 }, dawnChoices: null, end: null, heroId, blessingId, pity: false,
    upkeep: { front: 0, food: 0 }, dayCut: 0, beaconUsed: false, beaconT: 0, boss: null, lowFoodT: 0, preview: null,
    supplyPick: 'east', choosingSupply: true, shardsGained: 0, roadBreaks: [], granaryBurned: false, tipT: 0,
  });
  G.paths = G.lv.paths.map(makePath); G.path = G.paths[0];
  if (G.lv.supply) { G.supplyPick = G.lv.supply.default; setPost(G.lv.supply.default); }
  else { G.post = null; G.road = null; G.choosingSupply = false; G.res.front = 0; }
  if (blessingId) { const b = CFG.BLESSINGS.find(x => x.id === blessingId); if (b) b.apply(G); }
  if (G.save.lossStreak >= CFG.PITY_STREAK) { for (const k in CFG.PITY_BONUS) G.res[k] += CFG.PITY_BONUS[k]; G.pity = true; }
  if (talent('e1')) G.res.wood += 40;
  if (talent('e3')) G.mods.wagonSpeed *= 1.2;
  G.castleMax = Math.round(CFG.CASTLE_HP * G.mods.castleHpMult) + (talent('d2') ? 5 : 0);
  if (G.mod === 'halfCastle') G.castleMax = Math.ceil(G.castleMax / 2);
  G.castleHp = G.castleMax;
  G.wagon = G.lv.supply ? { state: 'load', d: 0, cargo: 0 } : null;
  G.hero = makeHero(heroId);
  for (let i = 0; i < CFG.BASE_POP; i++) spawnVillager();
  G.save.attempts++;
  const rec = G.save.levels[G.levelId] || (G.save.levels[G.levelId] = { stars: 0, mods: {}, wins: 0, tries: 0 }); rec.tries++;
  writeSave();
  if (!G.lv.supply) banner(`第 ${G.levelId} 關・${G.lv.name}`, G.lv.tips[0], 3);
  qolNewRun();
  if (talent('h2')) { G.hero.xp = CFG.HERO_XP[2]; heroLevelCheck(true); }
}
// ---------- 補給站 ----------
function setPost(id) {
  const p = CFG.SUPPLY_SPOTS.find(s => s.id === id) || CFG.SUPPLY_SPOTS[1];
  G.post = p; G.road = makePath(p.road);
  if (G.wagon) { G.wagon.d = 0; G.wagon.state = 'load'; if (G.wagon.cargo) { G.res.food += G.wagon.cargo; G.wagon.cargo = 0; } }
}
function postInfo(p) {
  const road = makePath(p.road);
  const cover = CFG.TOWER_SPOTS.filter(s => Math.hypot(s[0] - p.x, s[1] - p.y) <= CFG.SUPPLY_RADIUS).length;
  return { trip: road.total / (CFG.WAGON.speed * ((G.mods && G.mods.wagonSpeed) || 1)), cover, risk: p.risk };
}
function confirmSupply() {
  const first = G.choosingSupply === true;
  if (!first) {
    if (G.supplyPick === G.post.id) { G.choosingSupply = false; return; }
    const c = CFG.SUPPLY_MOVE_COST;
    if (!canAfford(c)) { toast('資源不足'); return; }
    pay(c);
  }
  setPost(G.supplyPick); G.choosingSupply = false; sfx('build');
  if (first) banner(`第 ${G.levelId} 關・${G.lv.name}`, G.lv.tips[0], 3);
  else banner('補給站已遷移', G.post.name, 1.6);
}
function spotSupplied(x, y) { return !G.post || Math.hypot(x - G.post.x, y - G.post.y) <= CFG.SUPPLY_RADIUS; }

function makeHero(id) {
  const d = CFG.HEROES[id];
  const x = CFG.CASTLE.x + 28, y = CFG.CASTLE.y - 34;
  const hp = Math.round(d.hp * (talent('h1') ? 1.15 : 1));
  return { id, d, x, y, hx: x, hy: y, hp, max: hp, atkT: 0, evo: false, evoReady: false, blocked: [], dead: false, respawnT: 0, inv: 0, cd: 0,
           lvl: 1, xp: 0, face: 1, lastHit: -10, charge: null, moving: false, anim: 0, isHero: true, flash: 0, atkAnim: 0, skillAnim: 0 };
}
const heroDmg = h => h.d.dmg * (1 + 0.08 * (h.lvl - 1)) * G.mods.heroDmg * (h.evo ? CFG.EVOLVE[h.id].dmg : 1);
const skillMul = () => G.mods.heroDmg * (G.hero && G.hero.evo ? CFG.EVOLVE[G.hero.id].dmg : 1);
function heroMax(h) { return Math.round(h.d.hp * (1 + 0.1 * (h.lvl - 1)) * (talent('h1') ? 1.15 : 1) * (h.evo ? CFG.EVOLVE[h.id].hp : 1)); }
function skillName(h) { return h.evo ? CFG.EVOLVE[h.id].skill : h.d.skill.name; }
function skillCd(h) { return h.d.skill.cd * (talent('h3') ? 0.8 : 1); }
// Lv10 進化（由進化演出結束時呼叫）
function evolveHero() {
  const h = G.hero; if (!h || h.evo || h.lvl < 10) return false;
  h.evo = true; h.evoReady = false; h.max = heroMax(h); h.hp = h.max; h.evoT = 0;
  G.save.evolved[h.id] = true; writeSave();      // 英雄選擇畫面解鎖進化插畫
  G.fx.push({ kind: 'pillar', x: h.x, y: h.y, t: 0, life: 1.6 });
  floatText(h.x, h.y - 40, `進化：${CFG.EVOLVE[h.id].title}`, '#ffd166', 2);
  vibe([40, 40, 120], true); Dialog.say('evolve', 0.6);
  return true;
}

// ---------- 晝夜循環 ----------
function startDusk() {
  G.phase = 'dusk'; G.phaseT = CFG.DUSK_TIME;
  banner('黃昏', '在路邊石台佈置防禦塔！');
  G.preview = { t: 0 };   // 自動顯示今夜敵情
}
// 今夜的波次（含補給站帶來的額外掠奪者）：[{ wave, groups: [[種類, 數量]] }]
function nightPlan(n = G.night) {
  const waves = CFG.NIGHT_WAVES[n - 1] || [];
  const extra = G.post && G.lv && G.lv.raid.length ? Math.max(0, G.post.risk - (n === 1 ? 1 : 0)) : 0;
  return waves.map((w, wi) => {
    const groups = w.map(g => [g[0], g[1], g[2], g[3]]);
    if (extra && wi === waves.length - 1) {
      const r = groups.find(g => g[0] === 'raider');
      if (r) r[1] += extra; else groups.splice(groups.findIndex(g => g[0] === 'boss') >= 0 ? groups.length - 1 : groups.length, 0, ['raider', extra, 1.6]);
    }
    return groups;
  });
}
function startNight() {
  G.phase = 'night'; G.nightT = 0; G.spawnList = []; G.beaconUsed = false; G.beaconT = 0; G.preview = null;
  const waves = nightPlan();
  G.waveStarts = [];
  waves.forEach((wave, wi) => {
    let t = 2 + wi * CFG.WAVE_GAP; G.waveStarts.push(t);
    // 交錯出怪：輪流從各組取一隻（首領在該波其他敵人出完後 3 秒登場）
    const np = G.paths.length;
    const groups = wave.filter(g => g[0] !== 'boss').map((g, gi) => ({ type: g[0], left: g[1], gap: g[2], lane: g[3] !== undefined && g[3] !== null ? g[3] % np : gi % np }));
    let any = true;
    while (any) {
      any = false;
      for (const g of groups) if (g.left > 0) { G.spawnList.push({ t, type: g.type, wave: wi, lane: g.lane }); t += g.gap; g.left--; any = true; }
    }
    for (const g of wave) if (g[0] === 'boss') for (let i = 0; i < g[1]; i++) G.spawnList.push({ t: t + 3 + i * 4, type: 'boss', wave: wi, lane: (g[3] || 0) % np });
  });
  // 每夜開銷（事件代價）
  if (G.upkeep.front && G.post) { G.res.front = Math.max(0, G.res.front - G.upkeep.front); floatText(G.post.x, G.post.y - 30, `傭兵 -${G.upkeep.front} 前線糧`, '#ff8080', 1.6); }
  if (G.upkeep.food) { G.res.food = Math.max(0, G.res.food - G.upkeep.food); floatText(CFG.GRANARY.x, CFG.GRANARY.y - 30, `-${G.upkeep.food} 糧`, '#ff8080', 1.6); }
  sfx('horn_night');
  G.spawnList.sort((a, b) => a.t - b.t);
  G.totalThisNight = G.spawnList.length;
  G.menu = null;
  const nplan = nightPlan(), has = k => nplan.some(w => w.some(g => g[0] === k));
  banner(`第 ${G.night} 夜`, has('boss') ? '⚠ 首領將在最後一波登場！' : has('sapper') ? '小心地鼠工兵挖斷補給道路！' : has('arsonist') ? '小心縱火狂燒毀後方建築！' : has('raider') ? '小心掠奪者偷襲補給線！' : '守住城堡！');
}
function endNight() {
  if (G.night >= CFG.NIGHTS) { endGame(true); return; }
  G.phase = 'dawn'; G.beaconT = 0;
  sfx('dawn');
  heroXp(CFG.DAWN_XP * G.night);
  if (talent('e4')) { G.res.wood += 30; G.res.stone += 20; floatText(CFG.CASTLE.x, CFG.CASTLE.y - 40, '商路 +30木 +20石', '#a7f070', 1.6); }
  const pool = CFG.EVENTS.filter(e => G.post || !e.supply); G.dawnChoices = [];
  while (G.dawnChoices.length < 2) G.dawnChoices.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  // 至少保證一個付得起
  if (!G.dawnChoices.some(e => !e.cost || canAfford(e.cost))) G.dawnChoices[1] = CFG.EVENTS.find(e => e.id === 'harvest');
}
function chooseDawn(i) {
  const ev = G.dawnChoices[i]; if (!ev) return;
  if (ev.cost && !canAfford(ev.cost)) { toast('資源不足，無法選擇'); return; }
  ev.apply(G); G.dawnChoices = null;
  G.night++; G.phase = 'day'; G.phaseT = CFG.DAY_TIME - (G.dayCut || 0); G.dayCut = 0;
  banner(`第 ${G.night} 天・白天`, `事件：${ev.name}`);
}
function skipPhase() {
  if (G.phase === 'day') startDusk();
  else if (G.phase === 'dusk') startNight();
}
function endGame(win) {
  const nights = win ? CFG.NIGHTS : G.night - 1;
  const ratio = G.castleHp / G.castleMax;
  const stars = win ? (ratio >= 0.8 ? 3 : ratio >= 0.4 ? 2 : 1) : 0;
  let shards = 0;
  const rec = G.save.levels[G.levelId] || (G.save.levels[G.levelId] = { stars: 0, mods: {}, wins: 0, tries: 1 });
  let modBonus = 0, firstClear = false;
  if (win) {
    firstClear = !rec.stars;
    shards = CFG.WIN_SHARDS + stars; G.save.lossStreak = 0; G.save.lastResult = 'win'; G.save.wins++; G.save.bestStars = Math.max(G.save.bestStars, stars);
    rec.stars = Math.max(rec.stars || 0, stars); rec.wins = (rec.wins || 0) + 1; rec.bestHp = Math.max(rec.bestHp || 0, G.castleHp);
    if (G.mod && !rec.mods[G.mod]) { modBonus = LEVEL_MODS[G.mod].shards; rec.mods[G.mod] = true; }   // 挑戰條件：第一次完成時額外碎片
    shards += modBonus; G.save.shards += shards;
  } else { shards = nights; G.save.shards += shards; G.save.lossStreak++; G.save.lastResult = 'lose'; rec.bestNights = Math.max(rec.bestNights || 0, nights); }
  if (G.levelId > 0) G.save.last = { level: G.levelId, hero: G.heroId };   // 繼續冒險
  writeSave();
  vibe(win ? [40, 60, 40, 60, 120] : [220, 100, 220], true); G.paused = false;
  if (typeof prepareOuting === 'function') prepareOuting(win);
  G.end = { win, stars, shards, nights, bonus: G.shardsGained, modBonus, firstClear, level: G.levelId };
  if (typeof Boss !== 'undefined') Boss.active = null;
  G.screen = 'end'; G.menu = null; G.targeting = false;
}

// ---------- 建造 ----------
function popCap() { return CFG.BASE_POP + G.bonusPop + G.buildings.filter(b => b.type === 'house').length * CFG.HOUSE_POP; }
function buildingAt(plot) { return G.buildings.find(b => b.plot === plot); }
function towerAt(spot) { return G.towers.find(t => t.spot === spot); }

function placeBuilding(plot, type) {
  const def = CFG.BUILDINGS[type];
  if (!buildingAllowed(type)) return false;
  if (G.phase !== 'day') { toast('後方建築只能在白天建造'); return false; }
  if (buildingAt(plot)) return false;
  if (!canAfford(def.cost)) { toast('資源不足'); return false; }
  pay(def.cost); sfx('build');
  const [x, y] = CFG.PLOTS[plot];
  G.buildings.push({ plot, type, def, x, y, workers: [] });
  boom(x, y, 18, 'rgba(255,255,255,0.6)', 0.3);
  return true;
}
function demolish(b) {
  b.removed = true; G.buildings = G.buildings.filter(x => x !== b);
  for (const v of b.workers) { v.job = null; v.state = 'idle'; }
}
function buildTower(spot, type) {
  if (towerAt(spot)) return false;
  if (!towerAllowed(type)) { toast('本關尚未開放'); return false; }
  if (G.mod === 'max4' && G.towers.length >= 4) { toast('挑戰條件：最多 4 座塔'); return false; }
  const def = CFG.TOWERS[type], cost = towerCost(def.cost[0]);
  if (!canAfford(cost)) { toast('資源不足'); return false; }
  pay(cost); sfx('build'); vibe(15);
  const [x, y] = CFG.TOWER_SPOTS[spot];
  const t = { spot, type, def, lvl: 1, x, y, atkT: 0.3, spent: Object.assign({}, cost), soldiers: [], br: null, bdef: null };
  if (type === 'barracks' || type === 'mage') { const r = nearestOnPaths(x, y); t.rally = { x: r.x, y: r.y }; t.skelT = 2; }
  if (type === 'barracks') {
    for (let i = 0; i < 3; i++) {
      const s = { tower: t, slot: i, x, y, dead: false, respawnT: 0, target: null, atkT: 0, inv: 0, flash: 0, anim: Math.random() * 5 };
      s.max = s.hp = soldierMax(t); t.soldiers.push(s); G.soldiers.push(s);
    }
  }
  G.towers.push(t); boom(x, y, 20, 'rgba(255,255,255,0.6)', 0.3);
  return true;
}
function upgradeTower(t) {
  if (t.lvl >= 3) return false;
  const c = towerCost(t.def.cost[t.lvl]);
  if (!canAfford(c)) { toast('資源不足'); return false; }
  pay(c); for (const k in c) t.spent[k] = (t.spent[k] || 0) + c[k];
  t.lvl++; sfx('upgrade');
  for (const s of t.soldiers) { s.max = soldierMax(t); if (!s.dead) s.hp = s.max; }
  boom(t.x, t.y - 10, 24, 'rgba(255,230,120,0.8)', 0.5); floatText(t.x, t.y - 40, `升級 Lv${t.lvl}`, '#ffd166');
  return true;
}
// 第 3 級 → 分支（永久）
function branchTower(t, br) {
  const b = CFG.BRANCHES[br];
  if (G.lv && !G.lv.branches) return false;
  if (!b || t.lvl !== 3 || t.br || b.base !== t.type) return false;
  const c = towerCost(CFG.BRANCH_COST);
  if (!canAfford(c)) { toast('資源不足'); return false; }
  pay(c); for (const k in c) t.spent[k] = (t.spent[k] || 0) + c[k];
  t.br = br; t.bdef = b; t.lvl = 4; sfx('branch');
  for (const s of t.soldiers) { s.max = soldierMax(t); if (!s.dead) s.hp = s.max; }
  boom(t.x, t.y - 10, 34, 'rgba(255,230,120,0.9)', 0.7); G.fx.push({ kind: 'pillar', x: t.x, y: t.y + 6, t: 0, life: 1.0, small: true });
  floatText(t.x, t.y - 46, b.name, '#ffd166', 1.6);
  return true;
}
// 塔的數值：分支塔用分支設定（單一值），否則依等級取陣列
function tStat(t, k) {
  if (t.bdef && t.bdef[k] !== undefined) return t.bdef[k];
  const v = t.def[k];
  return Array.isArray(v) ? v[Math.min(2, t.lvl - 1)] : v;
}
function towerName(t) { return t.bdef ? t.bdef.name : t.def.name; }
function sellTower(t) {
  sfx('sell');
  for (const k in t.spent) G.res[k] += Math.floor(t.spent[k] * CFG.SELL_REFUND);
  for (const s of t.soldiers) { s.remove = true; releaseBy(s); }
  G.soldiers = G.soldiers.filter(s => s.tower !== t);
  G.towers = G.towers.filter(x => x !== t);
}
function soldierMax(t) {
  return tStat(t, 'soldierHp') * G.mods.soldierHp * (G.heroId === 'lena' ? 1.2 : 1);
}
function towerRange(t) {
  let r = tStat(t, 'range');
  const h = G.hero;
  if (t.type === 'archer' && h && h.id === 'erin' && !h.dead && dist(h, t) < 120) r *= 1.15;
  if (talent('d3')) r *= 1.08;
  return r;
}
function towerFood(t) { return t.bdef ? t.bdef.food : t.def.food * (1 + 0.25 * (t.lvl - 1)); }
function towerStarving(t) { return G.phase === 'night' && (!t.supplied || G.starving); }

// ---------- 村民 ----------
function spawnVillager() {
  G.villagers.push({ x: CFG.CASTLE.x + rand(-12, 12), y: CFG.CASTLE.y + 26, job: null, state: 'idle', t: 0, anim: Math.random() * 5, carry: null, wx: 0, wy: 0 });
}
function moveToward(u, tx, ty, sp) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d <= sp) { u.x = tx; u.y = ty; return true; }
  u.x += dx / d * sp; u.y += dy / d * sp;
  if (Math.abs(dx) > 0.5) u.face = dx > 0 ? 1 : -1;
  return false;
}
function updateVillagers(dt) {
  G.popSpawnT -= dt;
  // 道路被挖斷：派最近的村民去修（每個缺口一人）
  for (const rb of G.roadBreaks) if (!rb.worker || rb.worker.state !== 'repair') {
    let best = null, bd = 1e9;
    for (const v of G.villagers) { if (v.state === 'repair') continue; const d = Math.hypot(v.x - rb.x, v.y - rb.y); if (d < bd) { bd = d; best = v; } }
    if (best) { if (best.job) { best.job.workers = best.job.workers.filter(w => w !== best); best.job = null; } best.carry = null; best.state = 'repair'; best.fix = rb; rb.worker = best; floatText(best.x, best.y - 16, '去修路！', '#ffe9a8'); }
  }
  if (G.villagers.length < popCap() && G.popSpawnT <= 0) { spawnVillager(); G.popSpawnT = 3; }
  const sp = CFG.VILLAGER_SPEED * dt;
  for (const v of G.villagers) {
    v.anim += dt;
    if (v.job && (v.job.removed || v.job.burned)) { v.job.workers = v.job.workers.filter(w => w !== v); v.job = null; v.state = 'idle'; v.carry = null; }
    if (v.state === 'repair') {   // 修補被地鼠工兵挖斷的道路
      const rb = v.fix;
      if (!rb || rb.done) { v.state = 'idle'; v.fix = null; continue; }
      if (moveToward(v, rb.x + 6, rb.y + 4, sp)) { rb.prog += dt / CFG.ROAD_REPAIR; v.face = -1; if (rb.prog >= 1) { rb.done = true; G.roadBreaks = G.roadBreaks.filter(r => r !== rb); floatText(rb.x, rb.y - 16, '道路修好了', '#a7f070'); sfx('build'); v.state = 'idle'; v.fix = null; } }
      continue;
    }
    if (!v.job) {
      const b = G.buildings.find(b => b.def.yield && !b.burned && b.workers.length < CFG.WORKERS_PER_BUILDING);
      if (b) { v.job = b; b.workers.push(v); v.state = 'toWork'; v.wx = rand(-8, 8); v.wy = rand(-4, 6); }
      else { // 閒置：在城堡附近晃
        if (!v.idleTo || moveToward(v, v.idleTo.x, v.idleTo.y, sp * 0.4)) v.idleTo = { x: CFG.CASTLE.x + rand(-40, 40), y: CFG.CASTLE.y + rand(28, 40) };
        continue;
      }
    }
    const b = v.job;
    if (v.state === 'toWork') { if (moveToward(v, b.x + v.wx, b.y + v.wy, sp)) { v.state = 'work'; v.t = b.def.workTime; } }
    else if (v.state === 'work') { v.t -= dt; if (v.t <= 0) { v.state = 'toDrop'; v.carry = b.def.yield; } }
    else if (v.state === 'toDrop') {
      const dp = b.def.drop === 'granary' ? CFG.GRANARY : { x: CFG.CASTLE.x, y: CFG.CASTLE.y + 22 };
      if (b.def.drop === 'granary' && G.granaryBurned) { if (moveToward(v, dp.x - 24, dp.y + 8, sp)) v.face = 1; continue; }   // 糧倉燒毀：等修好才能交糧
      if (moveToward(v, dp.x + rand(-1, 1), dp.y + 8, sp)) {
        sfx('coin_tick');
        for (const k in v.carry) { const amt = k === 'food' && talent('e2') ? Math.round(v.carry[k] * 1.25) : v.carry[k]; G.res[k] += amt; v.carry = Object.assign({}, v.carry, { [k]: amt }); floatText(dp.x, dp.y - 10, `+${v.carry[k]}${({ wood: '木', stone: '石', food: '糧' })[k]}`, k === 'food' ? '#ffd166' : k === 'wood' ? '#d9a066' : '#c2d3e0', 0.8); }
        v.carry = null; v.state = 'toWork';
      }
    }
  }
}

// ---------- 補給車隊 ----------
function wagonPos() { return pathAt(G.road, G.wagon.d); }
function updateWagon(dt) {
  const w = G.wagon; if (!w || !G.road) return;
  const sp = CFG.WAGON.speed * G.mods.wagonSpeed * dt;
  // 道路缺口：車隊過不去（停在缺口前）
  const gap = G.roadBreaks.length ? Math.min(...G.roadBreaks.map(r => r.d)) : Infinity;
  w.blocked = false;
  if ((w.state === 'go' && w.d < gap && w.d + sp > gap - 8) || (w.state === 'back' && w.d > gap && w.d - sp < gap + 8)) { w.blocked = true; const p = wagonPos(); w.x = p.x; w.y = p.y; return; }
  if (w.state === 'load') {
    if (!G.granaryBurned && G.res.food >= CFG.WAGON.minLoad && G.res.front < CFG.FRONT_CAP) {
      const c = Math.min(G.mods.wagonCap, Math.floor(G.res.food));
      G.res.food -= c; w.cargo = c; w.state = 'go';
    }
  } else if (w.state === 'go') {
    w.d += sp;
    if (w.d >= G.road.total) {
      w.d = G.road.total;
      if (w.cargo > 0) { G.res.front += w.cargo; floatText(G.post.x - 10, G.post.y - 24, `+${w.cargo} 前線糧`, '#ffd166'); }
      w.cargo = 0; w.state = 'back';
    }
  } else if (w.state === 'back') { w.d -= sp; if (w.d <= 0) { w.d = 0; w.state = 'load'; } }
  const p = wagonPos(); w.x = p.x; w.y = p.y;
}
// 尚未開放補給線的關卡（第 1～3 關）：塔直接吃糧倉（後方糧）的糧
function foodKey() { return G.post ? 'front' : 'food'; }
function updateFood(dt) {
  for (const t of G.towers) t.supplied = spotSupplied(t.x, t.y);
  const fk = foodKey();
  if (G.phase === 'night') {
    let use = 0; for (const t of G.towers) if (t.supplied) use += towerFood(t);
    G.foodUse = use;
    G.res[fk] = Math.max(0, G.res[fk] - use * dt);
    // 糧快見底：警告音（每 8 秒最多一次）
    G.lowFoodT -= dt;
    if (use > 0 && G.res[fk] < Math.max(6, use * 12) && G.lowFoodT <= 0) { G.lowFoodT = 8; sfx('low_food'); }
  } else G.foodUse = 0;
  G.starving = G.res[fk] <= 0.01 && G.towers.some(t => t.supplied);
  if (G.beaconT > 0) G.beaconT = Math.max(0, G.beaconT - dt);
}
// 烽火：每夜一次，所有塔攻速提升
function beaconCost() { return CFG.BEACON.cost - (talent('d4') ? 10 : 0); }
function useBeacon() {
  if (G.phase !== 'night' || G.beaconUsed || !levelHas('beacon') || !G.post) return false;
  const c = beaconCost();
  if (G.res.front < c) { toast(`前線糧不足（需要 ${c}）`); return false; }
  G.res.front -= c; G.beaconUsed = true; G.beaconT = CFG.BEACON.dur + (talent('d4') ? 5 : 0);
  sfx('beacon'); G.shake = 0.25;
  for (const t of G.towers) boom(t.x, t.y - 26, 16, 'rgba(255,140,40,0.9)', 0.6);
  banner('烽火燃起！', `所有防禦塔攻速 +${Math.round((CFG.BEACON.rate - 1) * 100)}%（${Math.round(G.beaconT)} 秒）`, 1.6);
  return true;
}

// ---------- 敵人 ----------
function raidPoint() { const r = CFG.RAIDS && CFG.RAIDS.length ? CFG.RAIDS[Math.floor(Math.random() * CFG.RAIDS.length)] : CFG.RAIDER_SPAWN; return r; }
function spawnEnemy(type, lane = 0) {
  const d = CFG.ENEMIES[type];
  const sc = CFG.NIGHT_HP_SCALE[G.night - 1] || 1;
  const e = { type, d, hp: d.hp * sc, max: d.hp * sc, dist: 0, x: 0, y: 0, blocker: null, atkT: 0.5, flash: 0, dead: false,
              anim: Math.random() * 10, carry: 0, mode: 'seek', ox: rand(-5, 5), oy: rand(-3, 3), face: 1 };
  e.path = G.paths ? G.paths[lane % G.paths.length] : G.path;
  bestiarySeen(type);
  if (offPath(e)) {
    const r = raidPoint(); e.home = r; e.x = r.x; e.y = r.y + rand(-14, 14);
    floatText(clamp(e.x, 30, 330), e.y - 20, d.raider ? '掠奪者！' : d.arsonist ? '縱火狂！' : '', '#ff6b6b');
    if (d.sapper) { e.under = true; e.x = clamp(r.x, 8, 352); e.dig = 0; }
  }
  else { const p = pathAt(e.path, 0); e.x = p.x + e.ox; e.y = p.y + e.oy; }
  if (d.boss) { e.ox = 0; e.oy = 0; e.hornIdx = 0; e.hornT = 0; G.boss = e; if (typeof Boss !== 'undefined') Boss.start(e); vibe([80, 50, 160], true); }
  G.enemies.push(e);
  return e;
}
// 首領吹號：召喚掠奪者攻擊補給線
function bossHorn(e) {
  e.hornT = 1.4; G.shake = 0.5; sfx('boss_roar'); vibe([60, 40, 60]);
  G.fx.push({ kind: 'horn', x: e.x, y: e.y - 30, t: 0, life: 1.2 });
  banner('格魯姆吹響戰號！', `${e.d.hornRaiders} 名掠奪者衝向補給線`, 1.8);
  for (let i = 0; i < e.d.hornRaiders; i++) { const r = spawnEnemy('raider'); r.x += (r.x < 180 ? -1 : 1) * i * 14; }
}
// 盾兵正面：攻擊來源在敵人前進方向的前方
function fromFront(e, from) {
  if (!from) return false;
  let hx = e.face, hy = 0;
  if (!offPath(e)) { const a = pathAt(ePath(e), e.dist), b = pathAt(ePath(e), e.dist + 6); hx = b.x - a.x; hy = b.y - a.y; }
  return (from.x - e.x) * hx + (from.y - e.y) * hy > 0;
}
// 傷害類型：phys（物理，吃護甲與盾兵正面減傷）、magic（魔法，對重甲 ×MAGIC_VS_HEAVY）、true（毒等，無視防禦）
// from = 攻擊來源座標（判斷盾兵正面）；pierce = 貫穿護甲
function hurt(e, amt, type, src, from, pierce) {
  if (!live(e) || e.under) return;   // 地底的地鼠工兵打不到
  if (type === 'phys' && !pierce) { amt *= 1 - (e.d.armor || 0); if (e.d.frontArmor && fromFront(e, from)) { amt *= 1 - e.d.frontArmor; e.blockFx = 0.12; } }
  if (type === 'magic' && e.d.heavy) amt *= CFG.MAGIC_VS_HEAVY;
  e.hp -= amt; if (type !== 'true') e.flash = 0.08;
  dmgNumber(e, amt, type, src);
  if (e.d.boss) while (e.hornIdx < e.d.hornAt.length && e.hp > 0 && e.hp / e.max <= e.d.hornAt[e.hornIdx]) { e.hornIdx++; bossHorn(e); }
  if (e.hp <= 0) {
    e.dead = true; G.stats.kills++;
    for (const k in e.d.bounty) G.res[k] += e.d.bounty[k];
    if (e.carry > 0) { G.res.front += e.carry; floatText(e.x, e.y - 24, `奪回 ${e.carry} 糧`, '#ffd166'); }
    boom(e.x, e.y - 6, e.d.boss ? 40 : 10, 'rgba(255,255,255,0.7)', e.d.boss ? 0.8 : 0.25);
    sfx(e.d.sfx || 'die_goblin');
    if (e.d.boss) { G.boss = null; G.save.shards += e.d.shards; G.shardsGained += e.d.shards; writeSave(); banner('格魯姆被擊倒！', `遺物碎片 +${e.d.shards}`, 2.2); G.shake = 0.6; vibe([100, 60, 200], true); }
    const h = G.hero;
    if (src === 'hero') heroXp(e.d.xp || 1);
    else if (h && !h.dead && Math.hypot(e.x - h.x, e.y - h.y) < CFG.HERO_XP_NEAR) heroXp(1);
  } else if (type !== 'true') sfx('enemy_hurt');
}
// 蕾娜被動「聖光鼓舞」：她附近的塔傷害提升（CFG aura／auraR）
function lenaAura(t) { const h = G.hero; return h && h.d.aura && !h.dead && Math.hypot(h.x - t.x, h.y - t.y) < (h.d.auraR || 110) ? 1 + h.d.aura : 1; }
function heroXp(n = 1) {
  const h = G.hero; if (!h) return;
  h.xp += n * (talent('h4') ? 1.3 : 1) * ((G.lv && G.lv.xp) || 1);
  heroLevelCheck();
}
function heroLevelCheck(silent) {
  const h = G.hero, X = CFG.HERO_XP;
  let lv = 1; while (lv < 10 && h.xp >= X[lv]) lv++;
  if (lv > h.lvl) {
    h.lvl = lv; h.max = heroMax(h); h.hp = h.max;
    if (!silent) { floatText(h.x, h.y - 30, `英雄 Lv${lv}`, '#7cf'); sfx('level_up'); G.fx.push({ kind: 'lvl', x: h.x, y: h.y, t: 0, life: 0.8 }); }
    if (lv >= 10 && !h.evo) { h.evoReady = true; if (!silent) banner(`${h.d.name} 可以進化了！`, '點左下角英雄頭像的「進化」', 2.2); }
  }
}
function heroXpNext(h) { const X = CFG.HERO_XP; return h.lvl >= 10 ? null : [h.xp - X[h.lvl - 1], X[h.lvl] - X[h.lvl - 1]]; }
function damageUnit(u, amt) {
  if (!live(u) || u.inv > 0) return;
  if (u.tower && !u.skeleton) amt *= 1 - (tStat(u.tower, 'soldierDR') || 0);
  if (u.isHero && u.d.dr) amt *= 1 - u.d.dr;   // 蕾娜：聖騎士重鎧減傷
  u.hp -= amt; u.flash = 0.08; u.lastHit = G.time;
  if (u.hp <= 0) {
    u.dead = true; releaseBy(u);
    if (u.isHero) { u.respawnT = CFG.HERO_RESPAWN; u.blocked = []; floatText(u.x, u.y - 20, '英雄倒下！', '#ff6b6b'); sfx('hero_down'); vibe(80, true); }
    else if (u.skeleton) { u.remove = true; u.target = null; }
    else { u.respawnT = tStat(u.tower, 'respawn'); u.target = null; }
  }
}
function releaseBy(u) { for (const e of G.enemies) if (e.blocker === u) e.blocker = null; }

function enemyFight(e, dt) {
  if (e.blocker && !live(e.blocker)) e.blocker = null;
  if (!e.blocker) return false;
  e.face = e.blocker.x > e.x ? 1 : -1;
  e.atkT -= dt;
  if (e.atkT <= 0) { e.atkT = e.d.atkRate || 1; damageUnit(e.blocker, e.d.dmg); if (e.d.boss) { G.shake = 0.12; sfx('lena_atk', { pitch: 0.6 }); } }   // 可能擊倒擋路者並解除阻擋
  return true;
}
function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (!live(e)) continue;
    e.anim += dt; e.flash = Math.max(0, e.flash - dt); if (e.blockFx > 0) e.blockFx -= dt;
    if (e.poison) { e.poison.t -= dt; hurt(e, e.poison.dps * dt, 'true', e.poison.src); if (e.poison && e.poison.t <= 0) e.poison = null; if (!live(e)) continue; }
    if (e.d.raider) { updateRaider(e, dt); continue; }
    if (e.d.arsonist) { updateArsonist(e, dt); continue; }
    if (e.d.sapper) { updateSapper(e, dt); continue; }
    if (e.hornT > 0) { e.hornT -= dt; continue; }   // 首領吹號時停下
    if (!e.d.flying && enemyFight(e, dt)) continue;
    e.dist += e.d.speed * dt;
    const p = pathAt(ePath(e), e.dist);
    e.face = p.x + e.ox >= e.x ? 1 : -1;
    e.x = p.x + e.ox; e.y = p.y + e.oy;
    if (e.dist >= ePath(e).total) {
      e.remove = true; G.castleHp -= e.d.castleDmg; G.stats.leaked++; G.stats.leakBy = G.stats.leakBy || {}; G.stats.leakBy[e.type] = (G.stats.leakBy[e.type] || 0) + e.d.castleDmg; G.shake = 0.3; sfx('castle_alarm'); vibe(40);
      if (e.d.boss) G.boss = null;
      floatText(CFG.CASTLE.x, CFG.CASTLE.y - 40, `-${e.d.castleDmg}`, '#ff6b6b');
    }
  }
}
function updateRaider(e, dt) {
  if (enemyFight(e, dt)) return;
  let tx, ty;
  const fleeX = e.home && e.home.x > 180 ? 400 : -40;
  if (e.mode === 'flee') { tx = fleeX; ty = e.y; }
  else {
    const w = G.wagon;
    if (w && w.cargo > 0) { tx = w.x; ty = w.y; e.tgt = 'wagon'; }
    else if (G.post && G.res.front > 1) { tx = G.post.x; ty = G.post.y; e.tgt = 'depot'; }
    else { tx = CFG.GRANARY.x; ty = CFG.GRANARY.y; e.tgt = 'granary'; }
  }
  moveToward(e, tx, ty, e.d.speed * (e.mode === 'flee' ? 1.1 : 1) * dt);
  if (e.mode !== 'flee' && Math.hypot(tx - e.x, ty - e.y) < 10) {
    let take = 0;
    if (e.tgt === 'wagon') { take = G.wagon.cargo; G.wagon.cargo = 0; G.wagon.state = 'back'; floatText(e.x, e.y - 24, '車隊被劫！', '#ff6b6b'); }
    else if (e.tgt === 'depot') { take = Math.min(15, Math.floor(G.res.front)); G.res.front -= take; floatText(e.x, e.y - 24, '補給站被搶！', '#ff6b6b'); }
    else { take = Math.min(15, Math.floor(G.res.food)); G.res.food -= take; floatText(e.x, e.y - 24, '糧倉被搶！', '#ff6b6b'); }
    e.carry = take; G.stats.stolen += take; e.mode = 'flee';
  }
  if (e.mode === 'flee' && (e.x < -30 || e.x > 390)) e.remove = true;
}
// 縱火狂：燒毀後方建築（農田、伐木場…）與糧倉；燒完 2 處後逃走。被燒的建築停止生產，點一下花木頭修復
function updateArsonist(e, dt) {
  if (enemyFight(e, dt)) return;
  const fleeX = e.home && e.home.x > 180 ? 400 : -40;
  if (e.mode === 'flee' || (e.burns || 0) >= 2) { e.mode = 'flee'; moveToward(e, fleeX, e.y, e.d.speed * 1.15 * dt); if (e.x < -30 || e.x > 390) e.remove = true; return; }
  if (!e.tgt || e.tgt.burned || e.tgt.removed) {
    let best = null, bd = 1e9;
    for (const b of G.buildings) { if (b.burned) continue; const d = Math.hypot(b.x - e.x, b.y - e.y); if (d < bd) { bd = d; best = b; } }
    if (!best && !G.granaryBurned) best = { granary: true, x: CFG.GRANARY.x, y: CFG.GRANARY.y };
    e.tgt = best; e.burnT = 0;
    if (!best) { e.mode = 'flee'; return; }
  }
  const t = e.tgt;
  if (moveToward(e, t.x, t.y + 6, e.d.speed * dt)) {
    e.burnT += dt; e.face = 1;
    if (e.burnT >= CFG.ARSON_TIME) {
      if (t.granary) { G.granaryBurned = true; const lost = Math.floor(G.res.food * 0.4); G.res.food -= lost; floatText(t.x, t.y - 30, `糧倉起火！-${lost} 糧`, '#ff6b6b', 1.6); }
      else { t.burned = true; floatText(t.x, t.y - 24, `${t.def.name}被燒毀！`, '#ff6b6b', 1.6); }
      boom(t.x, t.y - 8, 26, 'rgba(255,120,40,0.9)', 0.6); sfx('explosion', { pitch: 0.7 }); G.shake = 0.2;
      e.burns = (e.burns || 0) + 1; e.tgt = null;
    }
  }
}
function repairCost(b) { return b === 'granary' ? CFG.REPAIR_COST.granary : CFG.REPAIR_COST.building; }
function repairBuilding(b) {
  const c = repairCost(b);
  if (!canAfford(c)) { toast('木頭不足'); return false; }
  pay(c); sfx('upgrade');
  if (b === 'granary') { G.granaryBurned = false; floatText(CFG.GRANARY.x, CFG.GRANARY.y - 30, '糧倉修好了', '#a7f070'); }
  else { b.burned = false; floatText(b.x, b.y - 24, '修復完成', '#a7f070'); }
  return true;
}
// 地鼠工兵：在地底移動（打不到）→ 在補給道路上鑽出、挖路（此時打得到）→ 挖斷道路後鑽回地底離開
function updateSapper(e, dt) {
  if (!G.road) { e.remove = true; return; }
  if (!e.goal) { const d = G.road.total * rand(0.3, 0.8), p = pathAt(G.road, d); e.goal = { x: p.x, y: p.y, d }; }
  if (e.mode === 'leave') { e.under = true; moveToward(e, e.home.x > 180 ? 400 : -40, e.y, e.d.speed * 1.3 * dt); if (e.x < -30 || e.x > 390) e.remove = true; return; }
  if (e.under) {
    if (moveToward(e, e.goal.x, e.goal.y, e.d.speed * dt)) { e.under = false; e.dig = 0; boom(e.x, e.y, 14, 'rgba(160,120,70,0.9)', 0.4); floatText(e.x, e.y - 24, '地鼠鑽出來了！', '#ffb070'); sfx('bones', { pitch: 0.7 }); }
    if (Math.random() < dt * 8) G.fx.push({ kind: 'dirt', x: e.x + rand(-4, 4), y: e.y + rand(-2, 2), t: 0, life: 0.6 });
    return;
  }
  e.dig += dt;
  if (e.dig >= CFG.SAPPER_DIG) {
    const g = e.goal; G.roadBreaks.push({ x: g.x, y: g.y, d: g.d, prog: 0, worker: null });
    boom(g.x, g.y, 18, 'rgba(120,90,50,0.95)', 0.5); floatText(g.x, g.y - 22, '補給道路被挖斷！', '#ff6b6b', 1.6); sfx('explosion', { pitch: 0.6, vol: 0.7 });
    e.mode = 'leave';
  }
}

// ---------- 防禦塔 ----------
function pickTarget(x, y, range, air) {
  let best = null, bp = -1;
  for (const e of G.enemies) {
    if (!live(e) || e.under || (e.d.flying && !air)) continue;
    if (Math.hypot(e.x - x, e.y - y) > range) continue;
    const prog = offPath(e) ? 600 : e.dist;   // 掠奪者、縱火狂、地鼠優先
    if (prog > bp) { bp = prog; best = e; }
  }
  return best;
}
// 死靈塔：在路邊召喚骷髏兵（沿用士兵的擋路邏輯，死亡後消失、不重生）
function summonSkeleton(t) {
  const sk = t.bdef.skeletons, alive = t.soldiers.filter(s => !s.dead && !s.remove);
  if (alive.length >= sk.max) return false;
  const slot = [0, 1, 2].find(i => !alive.some(s => s.slot === i));
  const s = { tower: t, slot, x: t.rally.x + rand(-6, 6), y: t.rally.y + rand(-4, 4), dead: false, respawnT: 0, target: null, atkT: 0, inv: 0, flash: 0, anim: Math.random() * 5, skeleton: true, rise: 0.4 };
  s.max = s.hp = sk.hp; t.soldiers.push(s); G.soldiers.push(s);
  G.fx.push({ kind: 'boom', x: s.x, y: s.y, r: 12, color: 'rgba(140,255,140,0.7)', t: 0, life: 0.5 });
  sfx('bones');
  return true;
}
function updateTowers(dt) {
  const beacon = G.beaconT > 0 ? CFG.BEACON.rate : 1;
  for (const t of G.towers) {
    if (t.br === 'necro') {
      t.soldiers = t.soldiers.filter(s => !s.remove);
      t.skelT -= dt;
      if (t.skelT <= 0 && G.phase === 'night' && G.enemies.length) { t.skelT = t.bdef.skeletons.every; summonSkeleton(t); }
    }
    if (t.type === 'barracks') continue;
    t.atkT -= dt; t.fireAnim = Math.max(0, (t.fireAnim || 0) - dt);
    if (t.atkT > 0) continue;
    const range = towerRange(t);
    const e = pickTarget(t.x, t.y - 10, range, tStat(t, 'air'));
    if (!e) continue;
    let rate = tStat(t, 'rate');
    if (t.type === 'archer') rate /= G.mods.archerRate;
    if (towerStarving(t)) rate /= CFG.STARVE_RATE_MULT;
    rate /= beacon;
    t.atkT = rate; t.fireAnim = 0.15;
    const dmg = tStat(t, 'dmg') * G.mods.towerDmg * lenaAura(t);
    const sx = t.x, sy = t.y - 30, from = { x: t.x, y: t.y };
    const kind = t.br || t.type;
    if (kind === 'archer' || kind === 'ranger') { G.projectiles.push({ kind: 'arrow', x: sx, y: sy, target: e, tx: e.x, ty: e.y, speed: 320, dmg, type: 'phys', from, poison: t.br === 'ranger' ? t.bdef.poison : null }); sfx('arrow_shoot'); }
    else if (kind === 'musket') { G.projectiles.push({ kind: 'bullet', x: sx, y: sy, target: e, tx: e.x, ty: e.y, speed: 700, dmg, type: 'phys', from }); sfx('musket'); G.fx.push({ kind: 'boom', x: sx + Math.sign(e.x - sx) * 8, y: sy, r: 6, color: 'rgba(255,230,150,0.9)', t: 0, life: 0.12 }); }
    else if (kind === 'mage' || kind === 'arcane' || kind === 'necro') {
      G.projectiles.push({ kind: 'bolt', x: sx, y: sy - 4, target: e, tx: e.x, ty: e.y, speed: 220, dmg, type: 'magic', from, chain: G.heroId === 'vera' && Math.random() < 0.3,
                           kill: t.br === 'arcane' ? t.bdef.instakill : 0, necro: t.br === 'necro' ? t : null, col: t.br === 'necro' ? 'green' : t.br === 'arcane' ? 'arcane' : null });
      sfx('magic_cast');
    } else if (kind === 'tesla') {
      // 連鎖閃電：立即命中，跳到附近目標，每跳傷害 ×0.8
      let cur = e, px = sx, py = sy - 6, d = dmg; const hit = new Set();
      for (let i = 0; i < t.bdef.chain && cur; i++) {
        hit.add(cur); G.fx.push({ kind: 'zap', x1: px, y1: py, x2: cur.x, y2: cur.y - 7, t: 0, life: 0.22, big: true });
        hurt(cur, d, 'magic', 'tower', from); px = cur.x; py = cur.y - 7; d *= 0.8;
        let nx = null, nd = 60;
        for (const o of G.enemies) { if (!live(o) || hit.has(o) || o.d.flying) continue; const dd = Math.hypot(o.x - px, o.y - py); if (dd < nd) { nd = dd; nx = o; } }
        cur = nx;
      }
      sfx('tesla');
    } else if (kind === 'cannon' || kind === 'catapult') {
      const cat = kind === 'catapult', dur = cat ? 1.1 : 0.7;
      const lead = e.d.speed * dur * 0.6; const p = offPath(e) ? { x: e.x, y: e.y } : pathAt(ePath(e), e.dist + lead);
      G.projectiles.push({ kind: cat ? 'rock' : 'ball', sx, sy, x: sx, y: sy, tx: p.x, ty: p.y, t: 0, dur, dmg, splash: tStat(t, 'splash'), type: 'phys', arc: cat ? 70 : 34 });
      sfx(cat ? 'catapult' : 'cannon_fire');
    }
  }
}
function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    if (p.kind === 'ball' || p.kind === 'rock') {
      p.t += dt; const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * p.arc;
      if (k >= 1) {
        p.done = true; boom(p.tx, p.ty, p.splash, 'rgba(255,170,60,0.8)', p.kind === 'rock' ? 0.5 : 0.35); sfx('explosion', p.kind === 'rock' ? { pitch: 0.75 } : undefined);
        if (p.kind === 'rock') G.shake = Math.max(G.shake, 0.15);
        for (const e of G.enemies) if (live(e) && !e.d.flying && Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash) hurt(e, p.dmg, 'phys', p.src);
      }
      continue;
    }
    const tg = p.target;
    if (live(tg)) { p.tx = tg.x; p.ty = tg.y - 7; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
    p.ang = Math.atan2(dy, dx);
    if (d <= step) {
      p.done = true;
      if (live(tg)) {
        if (p.kill && !tg.d.boss && Math.random() < p.kill) {
          G.fx.push({ kind: 'boom', x: tg.x, y: tg.y - 8, r: 16, color: 'rgba(200,120,255,0.9)', t: 0, life: 0.45 }); floatText(tg.x, tg.y - 22, '秒殺！', '#d3a8ff', 0.8);
          sfx('arcane_kill'); hurt(tg, tg.hp + 1, 'true', p.src);
        } else hurt(tg, p.dmg, p.type, p.src, p.from);
        if (p.kind === 'arrow' || p.kind === 'bullet') sfx('arrow_hit'); else sfx('magic_hit');
        if (p.poison && live(tg)) { const fresh = !tg.poison; tg.poison = { dps: p.poison.dps, t: p.poison.t, src: p.src }; if (fresh) sfx('poison'); }
        if (p.necro && !live(tg) && p.necro.bdef) summonSkeleton(p.necro);
        if (p.chain && live(tg)) {
          const o = G.enemies.find(o => live(o) && o !== tg && !o.d.flying && Math.hypot(o.x - tg.x, o.y - tg.y) < 55);
          if (o) { hurt(o, p.dmg * 0.6, 'magic'); G.fx.push({ kind: 'zap', x1: tg.x, y1: tg.y - 7, x2: o.x, y2: o.y - 7, t: 0, life: 0.2 }); }
        }
      }
    } else { p.x += dx / d * step; p.y += dy / d * step; }
  }
  G.projectiles = G.projectiles.filter(p => !p.done);
}

// ---------- 士兵 ----------
function updateSoldiers(dt) {
  for (const s of G.soldiers) {
    const t = s.tower; s.anim += dt; s.flash = Math.max(0, s.flash - dt); s.inv = Math.max(0, s.inv - dt);
    if (s.rise > 0) { s.rise -= dt; continue; }   // 骷髏從地底爬出
    if (s.dead) {
      if (s.skeleton) { s.remove = true; continue; }
      if (!towerStarving(t)) s.respawnT -= dt;   // 前線斷糧（或在補給範圍外）：兵營停止補兵
      if (s.respawnT <= 0) { s.dead = false; s.max = s.hp = soldierMax(t); s.x = t.x; s.y = t.y; s.target = null; }
      continue;
    }
    const off = [[-10, -2], [10, -2], [0, 8]][s.slot];
    const rx = t.rally.x + off[0], ry = t.rally.y + off[1];
    if (s.target && (!live(s.target) || s.target.blocker !== s)) s.target = null;
    if (!s.target) {
      let best = null, bd = 1e9;
      for (const e of G.enemies) {
        if (!live(e) || e.under || e.d.flying || e.blocker) continue;
        const d = Math.hypot(e.x - t.rally.x, e.y - t.rally.y);
        if (d < tStat(t, 'range') && d < bd) { bd = d; best = e; }
      }
      if (best) { best.blocker = s; s.target = best; }
    }
    if (s.target) {
      const e = s.target;
      if (Math.hypot(e.x - s.x, e.y - s.y) > 12) moveToward(s, e.x - (e.x > s.x ? 9 : -9), e.y, 62 * dt);
      else {
        s.face = e.x > s.x ? 1 : -1;
        s.atkT -= dt;
        if (s.atkT <= 0) {
          const sd = s.skeleton ? t.bdef.skeletons.dmg : tStat(t, 'soldierDmg');
          s.atkT = s.skeleton ? 1 : (tStat(t, 'soldierRate') || 0.9); s.swing = 0.15;
          hurt(e, sd * G.mods.soldierDmg, 'phys', 'soldier', s); sfx('sword_slash', { vol: 0.7 });
        }
      }
    } else {
      moveToward(s, rx, ry, 55 * dt);
      s.hp = Math.min(s.max, s.hp + s.max * 0.1 * dt);
    }
  }
}

// ---------- 英雄 ----------
function moveHero(x, y) {
  const h = G.hero; if (h.dead) { toast('英雄復活中…'); return; }
  if (h.charge) return;
  h.hx = clamp(x, 10, 350); h.hy = clamp(y, CFG.MAP_TOP + 14, CFG.MAP_BOTTOM - 4); h.moving = true;
  releaseBy(h); h.blocked = [];
  G.fx.push({ kind: 'mark', x: h.hx, y: h.hy, t: 0, life: 0.5 });
}
function castSkill(x, y) {
  const h = G.hero;
  if (h.dead || h.cd > 0 || G.mod === 'noHeroSkill') return false;
  h.cd = skillCd(h); h.skillAnim = 0.6; if (G.qol) G.qol.skillUsed = true;
  h.face = x >= h.x ? 1 : -1;
  sfx('skill_' + h.id);
  if (h.id === 'erin') G.zones.push(h.evo ? { kind: 'rain', x, y, r: 70, t: 3.5, acc: 0, evo: true } : { kind: 'rain', x, y, r: 50, t: 3, acc: 0 });
  else if (h.id === 'vera') {
    if (h.evo) for (const [ox, oy, d] of [[0, 0, 0.7], [-36, 22, 0.9], [36, 22, 1.1]]) G.zones.push({ kind: 'meteor', x: x + ox, y: y + oy, r: 50, t: d, life: d, evo: true });
    else G.zones.push({ kind: 'meteor', x, y, r: 54, t: 0.7, life: 0.7 });
  }
  else if (h.id === 'lena') { releaseBy(h); h.blocked = []; h.charge = { x, y }; h.inv = h.evo ? 5.5 : 3.5; h.moving = false; }
  return true;
}
function chargeImpact() {
  const h = G.hero; h.hx = h.x; h.hy = h.y;
  const R = h.evo ? 56 : 46; G.shake = Math.max(G.shake, 0.15); vibe(30);
  boom(h.x, h.y, R, 'rgba(255,240,150,0.9)', 0.45); sfx('explosion', { pitch: 1.3, vol: 0.6 });
  for (const e of G.enemies) {
    if (!live(e) || Math.hypot(e.x - h.x, e.y - h.y) > R) continue;
    hurt(e, (h.d.chargeDmg || 35) * skillMul(), 'phys', 'hero', h);
    if (live(e) && !e.d.flying && !offPath(e) && !e.d.boss) { e.dist = Math.max(0, e.dist - 36); e.blocker = null; }
  }
  for (const s of G.soldiers) if (live(s) && dist(s, h) < 80) { s.inv = h.evo ? 5 : 3; if (h.evo) s.hp = s.max; }
  if (!h.evo && h.d.chargeHeal) { h.hp = Math.min(h.max, h.hp + h.max * h.d.chargeHeal); floatText(h.x, h.y - 34, '聖光守護', '#fff2a8'); }
  if (h.evo) { h.hp = Math.min(h.max, h.hp + h.max * 0.4); floatText(h.x, h.y - 34, '聖光治療', '#fff2a8'); G.fx.push({ kind: 'pillar', x: h.x, y: h.y, t: 0, life: 0.8, small: true }); }
}
function updateHero(dt) {
  const h = G.hero; h.anim += dt; h.atkAnim = Math.max(0, h.atkAnim - dt); h.skillAnim = Math.max(0, h.skillAnim - dt); h.cd = Math.max(0, h.cd - dt); h.inv = Math.max(0, h.inv - dt); h.flash = Math.max(0, h.flash - dt);
  if (h.dead) {
    h.respawnT -= dt;
    if (h.respawnT <= 0) { h.dead = false; h.hp = h.max; h.x = h.hx = CFG.CASTLE.x + 28; h.y = h.hy = CFG.CASTLE.y - 34; h.moving = false; floatText(h.x, h.y - 30, '英雄復活', '#7cf'); }
    return;
  }
  h.tgtVis = null;   // 只給畫面用（預備動作）：目前攻擊目標
  if (h.charge) { if (moveToward(h, h.charge.x, h.charge.y, 280 * dt)) { h.charge = null; chargeImpact(); } return; }
  if (h.moving) { if (moveToward(h, h.hx, h.hy, h.d.speed * dt)) h.moving = false; return; }
  h.blocked = h.blocked.filter(e => live(e) && e.blocker === h);
  while (h.blocked.length < h.d.maxBlock) {
    const e = G.enemies.find(e => live(e) && !e.under && !e.d.flying && !e.blocker && Math.hypot(e.x - h.x, e.y - h.y) < 38);
    if (!e) break; e.blocker = h; h.blocked.push(e);
  }
  let tgt = h.blocked[0];
  if (!tgt) {
    let bd = 1e9;
    for (const e of G.enemies) { if (!live(e) || e.under) continue; const d = Math.hypot(e.x - h.x, e.y - h.y); if (d < h.d.range && d < bd) { bd = d; tgt = e; } }
  }
  if (h.d.melee && h.blocked[0] && dist(h, h.blocked[0]) > 14) moveToward(h, h.blocked[0].x - 10 * Math.sign(h.blocked[0].x - h.x || 1), h.blocked[0].y, h.d.speed * dt);
  else if (!h.blocked.length && dist(h, { x: h.hx, y: h.hy }) > 2) moveToward(h, h.hx, h.hy, h.d.speed * dt);
  h.tgtVis = tgt || null;
  h.atkT -= dt;
  if (tgt && h.atkT <= 0 && dist(h, tgt) <= Math.max(h.d.range, 18)) {
    h.atkT = h.d.rate; h.atkAnim = 0.22; h.face = tgt.x > h.x ? 1 : -1;
    sfx(h.id + '_atk');
    if (h.d.melee) { hurt(tgt, heroDmg(h), 'phys', 'hero', h); boom(tgt.x, tgt.y - 8, 6, 'rgba(255,255,200,0.9)', 0.15); }
    else G.projectiles.push({ kind: h.d.proj, x: h.x, y: h.y - 14, target: tgt, tx: tgt.x, ty: tgt.y, speed: h.d.proj === 'bolt' ? 240 : 340, dmg: heroDmg(h), type: h.d.dmgType, src: 'hero', from: { x: h.x, y: h.y } });
  }
  if (G.time - h.lastHit > 3) h.hp = Math.min(h.max, h.hp + h.max * 0.04 * dt);
  else if (h.d.regen) h.hp = Math.min(h.max, h.hp + h.max * h.d.regen * dt);   // 蕾娜：戰鬥中也緩慢回復
}

// ---------- 技能區域 ----------
function updateZones(dt) {
  for (const z of G.zones) {
    z.t -= dt;
    if (z.kind === 'rain') {
      z.acc += dt;
      while (z.acc >= 0.15) {
        z.acc -= 0.15;
        for (const e of G.enemies) if (live(e) && Math.hypot(e.x - z.x, e.y - z.y) <= z.r) hurt(e, (z.evo ? 7 : 5) * skillMul(), 'phys', 'hero', null, z.evo);
        for (let i = 0; i < 3; i++) { const a = rand(0, 6.28), r = rand(0, z.r); G.fx.push({ kind: 'arrowfall', x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r * 0.6, t: 0, life: 0.25 }); }
      }
    } else if (z.kind === 'meteor' && z.t <= 0) {
      boom(z.x, z.y, z.r, 'rgba(255,120,40,0.95)', 0.6); G.shake = 0.35; sfx('explosion');
      for (const e of G.enemies) if (live(e) && Math.hypot(e.x - z.x, e.y - z.y) <= z.r) hurt(e, 75 * skillMul(), 'magic', 'hero');
      G.zones.push({ kind: 'burn', x: z.x, y: z.y, r: 42, t: 4, acc: 0, life: 4 });
    } else if (z.kind === 'burn') {
      z.acc += dt;
      if (z.acc >= 0.5) { z.acc -= 0.5; for (const e of G.enemies) if (live(e) && !e.d.flying && Math.hypot(e.x - z.x, e.y - z.y) <= z.r) hurt(e, 6 * skillMul(), 'magic', 'hero'); }
    }
  }
  G.zones = G.zones.filter(z => z.t > 0);
}

function updateFx(dt) {
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.life);
  G.shake = Math.max(0, (G.shake || 0) - dt);
}

// ---------- 主更新 ----------
function update(dt) {
  if (G.screen !== 'play') { updateFx(dt); return; }
  G.time += dt;
  updateFx(dt);
  qolUpdate(dt);
  if (G.phase === 'dawn') return;
  if (G.choosingSupply) return;   // 選補給站時暫停
  if (G.preview) G.preview.t += dt;
  if (G.phase === 'day') { G.phaseT -= dt; if (G.phaseT <= 0) startDusk(); }
  else if (G.phase === 'dusk') { G.phaseT -= dt; if (G.phaseT <= 0) startNight(); }
  else if (G.phase === 'night') {
    G.nightT += dt;
    while (G.spawnList.length && G.spawnList[0].t <= G.nightT) { const s = G.spawnList.shift(); spawnEnemy(s.type, s.lane || 0); }
  }
  updateVillagers(dt); updateWagon(dt); updateFood(dt);
  updateTowers(dt); updateSoldiers(dt); updateHero(dt);
  if (G.soldiers.some(s => s.remove)) { for (const s of G.soldiers) if (s.remove) releaseBy(s); G.soldiers = G.soldiers.filter(s => !s.remove); } updateEnemies(dt); updateProjectiles(dt); updateZones(dt);
  // 清除
  if (G.enemies.some(e => e.dead || e.remove)) {
    for (const e of G.enemies) if (e.dead || e.remove) { if (e.blocker) e.blocker = null; }
    G.enemies = G.enemies.filter(e => !e.dead && !e.remove);
  }
  if (G.castleHp <= 0) { G.castleHp = 0; endGame(false); return; }
  if (G.phase === 'night' && !G.spawnList.length && !G.enemies.length) endNight();
}
