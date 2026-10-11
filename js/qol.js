'use strict';
// =============================================================
// 第 3 階段 QoL：設定、暫停、震動回饋、傷害數字、敵人圖鑑、英雄對話、新手教學
// （存檔版本化在 game.js：loadSave / sanitizeSave / writeSave）
// =============================================================

// ---------- 面板快取：對話框／教學／通知的文字與頭像每幀重畫很貴（measureText、縮放大圖），先畫進離屏畫布 ----------
const PanelCache = new Map();
function cachedPanel(key, w, h, draw) {
  const S = (typeof view !== 'undefined' && view.s) || 2, k = key + '|' + S;
  let c = PanelCache.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = Math.ceil(w * S); c.height = Math.ceil(h * S);
    const x = c.getContext('2d'); x.scale(S, S); x.imageSmoothingEnabled = false; draw(x);
    PanelCache.set(k, c); if (PanelCache.size > 12) PanelCache.delete(PanelCache.keys().next().value);
  }
  return c;
}

// ---------- 設定 ----------
const BASE_VOL = { music: CFG.MUSIC_VOLUME, sting: CFG.STING_VOLUME, sfx: CFG.SFX_VOLUME };
function setting(k) { const s = G.save && G.save.settings; return s && k in s ? s[k] : SETTINGS_DEF[k]; }
function setSetting(k, v) { (G.save.settings = G.save.settings || Object.assign({}, SETTINGS_DEF))[k] = v; applySettings(); writeSave(); }
function applySettings() {
  CFG.MUSIC_VOLUME = Math.max(1e-4, BASE_VOL.music * setting('music'));
  CFG.STING_VOLUME = BASE_VOL.sting * setting('music');
  CFG.SFX_VOLUME = BASE_VOL.sfx * setting('sfx');
  if (typeof Music !== 'undefined') Music._lastMute = null;   // 下一幀重新套用循環曲音量
}

// ---------- 震動回饋（navigator.vibrate；iOS Safari 不支援時安靜略過） ----------
const Vibe = {
  log: [], last: 0,
  supported() { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; },
  go(p, important) {
    if (!setting('vibrate')) return false;
    const now = performance.now();
    if (!important && now - this.last < 150) return false;   // 太密集的小震動合併
    this.last = now; this.log.push(p); if (this.log.length > 60) this.log.shift();
    // Chrome 規定使用者互動後才能震動；未互動時不呼叫（避免主控台警告）
    const ua = navigator.userActivation;
    if (this.supported() && (!ua || ua.hasBeenActive)) { try { navigator.vibrate(p); } catch (e) { /* ignore */ } }
    return true;
  },
};
function vibe(p, important) { return Vibe.go(p, important); }

// ---------- 傷害數字 ----------
// 同一個敵人 0.25 秒內的傷害合併成一個數字（箭雨／毒不會洗版）；上限避免拖慢效能
const DMG_COL = { phys: '#ffffff', magic: '#e0b8ff', true: '#a8f07a', hero: '#ffd166' };
function dmgNumber(e, amt, type, src) {
  if (!setting('dmgNum') || !(amt > 0)) return;
  const f = e._dn;
  if (f && f.t < 0.25) { f.v += amt; f.big = f.v >= 40 || !!e.d.boss; return; }
  if (G.dmgN >= 36) return;
  const n = { kind: 'dmg', x: e.x + rand(-5, 5), y: e.y - (e.d.boss ? 56 : e.d.flying ? 30 : 22), v: amt, t: 0, life: 0.75,
              col: src === 'hero' ? DMG_COL.hero : DMG_COL[type] || '#fff', big: amt >= 40 || !!e.d.boss };
  e._dn = n; G.fx.push(n); G.dmgN = (G.dmgN || 0) + 1;
}
// 數字圖集：每種顏色／大小把 0～9（含陰影）先畫好，之後每個數字只要幾次 drawImage（比每幀 fillText 便宜）
const DigitAtlas = {};
function digitAtlas(col, size) {
  const S = (typeof view !== 'undefined' && view.s) || 2, key = col + size + '|' + S;
  if (DigitAtlas[key]) return DigitAtlas[key];
  const c = document.createElement('canvas'), x = c.getContext('2d'), font = `bold ${size}px ${FONT}`;
  x.font = font; const ws = [...'0123456789'].map(d => Math.ceil(x.measureText(d).width));
  const cw = Math.max(...ws) + 2, h = size + 4;
  c.width = Math.ceil(cw * 10 * S); c.height = Math.ceil(h * S);
  x.scale(S, S); x.font = font; x.textAlign = 'left'; x.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(10,10,25,0.9)'; x.fillText(String(i), i * cw + 1, h / 2 + 1); x.fillStyle = col; x.fillText(String(i), i * cw, h / 2); }
  return (DigitAtlas[key] = { c, ws, cw, h, S });
}
function drawDmgNumbers(ctx) {
  let n = 0;
  for (const f of G.fx) {
    if (f.kind !== 'dmg') continue;
    if (!f.big) n++;
    const k = f.t / f.life, y = Math.round(f.y - f.t * 26 - (k < 0.15 ? (0.15 - k) * 20 : 0)), s = String(Math.max(1, Math.round(f.v)));
    const A = f.big ? digitAtlas('#ffd166', 13) : digitAtlas(f.col, 10);
    let tw = 0; for (const ch of s) tw += A.ws[ch.charCodeAt(0) - 48] + 1;
    let x = Math.round(f.x - tw / 2);
    ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
    for (const ch of s) { const d = ch.charCodeAt(0) - 48, w = A.ws[d] + 1; ctx.drawImage(A.c, d * A.cw * A.S, 0, w * A.S, A.h * A.S, x, y - A.h / 2, w, A.h); x += w; }
  }
  ctx.globalAlpha = 1;
  G.dmgN = n;
}

// ---------- 敵人圖鑑 ----------
const BESTIARY_ORDER = ['goblin', 'wolf', 'shield', 'bat', 'raider', 'arsonist', 'sapper', 'boss'];
const BESTIARY = {
  goblin:   { desc: '邊境最常見的哥布林雜兵，數量多但很脆弱。', weak: '任何攻擊都有效；弓箭塔最划算。' },
  wolf:     { desc: '騎著野狼高速衝鋒，容易穿過稀疏的防線。', weak: '兵營士兵擋路後集火；範圍傷害。' },
  shield:   { desc: '舉著大盾的重甲兵，正面物理傷害減半。', weak: '魔法傷害 ×1.5（法師塔、薇拉）；從側面或背後攻擊。' },
  bat:      { desc: '飛行單位，無視地面阻擋，兵營與近戰都擋不住。', weak: '弓箭塔、艾琳；砲塔與法師塔打不到。' },
  raider:   { desc: '不攻打城堡，專門搶劫補給馬車與前線糧倉。', weak: '在補給道路旁蓋塔、英雄巡邏；擊殺可奪回糧食。' },
  arsonist: { desc: '潛入後方放火，被燒毀的建築需要木頭修復。', weak: '在後方建築附近留一座塔或讓英雄攔截。' },
  sapper:   { desc: '鑽進地底挖斷補給道路，在地底時無法被攻擊。', weak: '冒出地面時集火；村民會自動修路。' },
  boss:     { desc: '哥布林酋長格魯姆。重甲、血量極高，每損失 25% 血量吹號召喚掠奪者。', weak: '魔法傷害與英雄技能；吹號時保護補給線。' },
};
function bestiarySeen(type) {
  if (!G.save || !BESTIARY[type]) return;
  if (!G.save.seen) G.save.seen = {};
  if (G.save.seen[type]) return;
  G.save.seen[type] = 1; writeSave();
  G.notice = { text: `📖 圖鑑新增：${CFG.ENEMIES[type].name}`, t: 0, life: 2.6 };
}
const Silh = {};
function silhouette(ak) {
  if (Silh[ak]) return Silh[ak];
  const im = Art.img[ak], m = Art.meta[ak]; if (!im || !m) return null;
  const c = document.createElement('canvas'); c.width = m.w; c.height = m.h;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0, m.w, m.h); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#0d0d1a'; x.fillRect(0, 0, m.w, m.h);
  return (Silh[ak] = c);
}
function drawEnemyArt(ctx, type, cx, by, maxW, maxH, seen) {
  const d = CFG.ENEMIES[type], ak = Art.resolve(d.sprite);
  if (!ak) { if (seen) drawSprite(ctx, d.sprite, cx, by, 2, false, false, null, maxH, maxW); return; }
  const m = Art.meta[ak], s = Math.min(maxH / m.h, maxW / m.w, ART_DRAW_SCALE * 3);
  const im = seen ? Art.img[ak] : silhouette(ak); if (!im) return;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(im, Math.round(cx - m.w * s / 2), Math.round(by - m.h * s), m.w * s, m.h * s);
  ctx.imageSmoothingEnabled = false;
}
function speedLabel(v) { return v < 22 ? '慢' : v < 38 ? '普通' : v < 50 ? '快' : '極快'; }
// inLib：嵌在圖書館「敵人」分頁（外框、標題、關閉鈕由圖書館畫）
function renderBestiary(ctx, inLib) {
  const seen = G.save.seen || {};
  const nSeen = BESTIARY_ORDER.filter(k => seen[k]).length;
  if (!inLib) {
    panel(ctx, 6, 44, 348, 560, 'rgba(22,22,38,0.97)', '#c58cf2');
    text(ctx, '敵人圖鑑', CFG.W / 2, 64, 18, '#d3a8ff', 'center');
    text(ctx, `已發現 ${nSeen}/${BESTIARY_ORDER.length}`, CFG.W / 2, 84, 10, '#aaa', 'center', false);
    btn(ctx, 312, 50, 34, 26, '×', closeOverlay, { bg: '#333c57', id: 'best_close', size: 14 });
  } else text(ctx, `已發現 ${nSeen}/${BESTIARY_ORDER.length}`, CFG.W / 2, 86, 10, '#aaa', 'center', false);
  if (!UI.bestSel || !seen[UI.bestSel]) UI.bestSel = BESTIARY_ORDER.find(k => seen[k]) || null;
  BESTIARY_ORDER.forEach((k, i) => {
    const x = 16 + (i % 4) * 83, y = 96 + Math.floor(i / 4) * 92, s = !!seen[k], sel = UI.bestSel === k;
    ctx.fillStyle = sel ? 'rgba(197,140,242,0.25)' : 'rgba(255,255,255,0.05)'; ctx.strokeStyle = sel ? '#ffd166' : s ? '#6a5a8a' : '#333';
    ctx.lineWidth = sel ? 2 : 1; ctx.beginPath(); ctx.roundRect(x, y, 78, 86, 6); ctx.fill(); ctx.stroke();
    drawEnemyArt(ctx, k, x + 39, y + 64, 66, 56, s);
    text(ctx, s ? CFG.ENEMIES[k].name : '？？？', x + 39, y + 76, 9, s ? '#fff' : '#666', 'center', true, false);
    if (seen[k] === 1) text(ctx, 'NEW', x + 62, y + 9, 8, '#ff6b6b', 'center');
    UI.buttons.push({ x, y, w: 78, h: 86, id: 'best_' + k, onTap: () => { if (!s) { toastScreen('尚未遭遇：在關卡中遇到後解鎖'); return; } UI.bestSel = k; G.save.seen[k] = 2; writeSave(); } });
  });
  const k = UI.bestSel, y0 = 286;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(16, y0, 328, 304);
  if (!k) { text(ctx, '還沒有遭遇任何敵人', CFG.W / 2, y0 + 140, 12, '#888', 'center'); return; }
  if (seen[k] === 1) { G.save.seen[k] = 2; writeSave(); }
  const d = CFG.ENEMIES[k], b = BESTIARY[k];
  drawEnemyArt(ctx, k, 76, y0 + 120, 110, 110, true);
  text(ctx, d.name, 140, y0 + 18, 16, d.boss ? '#ff8a8a' : '#ffd166');
  const tags = [d.flying && '飛行', d.heavy && '重甲', d.frontArmor && '盾牌', d.raider && '搶糧', d.arsonist && '縱火', d.sapper && '鑽地', d.boss && '首領'].filter(Boolean);
  text(ctx, tags.length ? tags.join('・') : '地面步兵', 140, y0 + 38, 10, '#c58cf2');
  const rows = [['血量', String(d.hp)], ['速度', speedLabel(d.speed)],
                ['護甲', d.armor ? `物理 -${Math.round(d.armor * 100)}%` : '無'],
                ['盾牌', d.frontArmor ? `正面物理 -${Math.round(d.frontArmor * 100)}%` : '—'],
                ['魔法', d.heavy ? `重甲：受魔法 ×${CFG.MAGIC_VS_HEAVY}` : '普通'],
                ['攻城', d.castleDmg ? `城堡 -${d.castleDmg}` : '不攻城']];
  rows.forEach(([a, v], i) => { text(ctx, a, 140, y0 + 58 + i * 15, 10, '#9aa', 'left', false, false); text(ctx, v, 176, y0 + 58 + i * 15, 10, '#fff', 'left', false, false); });
  text(ctx, '說明', 26, y0 + 160, 11, '#ffd166');
  wrapText(ctx, b.desc, 26, y0 + 178, 308, 11, '#ddd');
  text(ctx, '弱點', 26, y0 + 222, 11, '#5fd16b');
  wrapText(ctx, b.weak, 26, y0 + 240, 308, 11, '#ddd');
  const lv = LEVELS.find(l => l.waves && JSON.stringify(l.waves).includes(`"${k}"`) || (k === 'boss' && l.boss));
  if (lv) text(ctx, `首次出現：第 ${lv.id} 關・${lv.name}`, 26, y0 + 286, 9, '#888', 'left', false, false);
}

// ---------- 英雄對話 ----------
const DIALOGUE = {
  erin: { start: ['森林的風在警告我……牠們要來了。', '弓弦已經上好，這片土地由我來守！', '別擔心，我的箭從不落空。'],
          evolve: ['星辰之力……回應我吧！', '這就是精靈遊俠真正的力量！'],
          lowHp: ['城堡撐不住了！快加強防線！', '可惡……不能再讓牠們靠近城門！'],
          boss: ['那就是格魯姆……瞄準牠的要害！'] },
  lena: { start: ['以騎士之名，此路不通！', '雖然被放逐了，守護人民的誓言還在。', '列陣！跟我一起守住黎明！'],
          evolve: ['聖光啊，賜予我守護的力量！', '我的誓言……從未熄滅！'],
          lowHp: ['城牆在崩塌……但我還站得住！', '再撐一下！我們就是最後的防線！'],
          boss: ['酋長格魯姆……來吧，正面一決勝負！'] },
  vera: { start: ['哼，一群哥布林而已，全部燒成灰。', '元素在躁動……今晚會很熱鬧。', '準備好了嗎？我的魔法可不等人。'],
          evolve: ['元素之環，全數解放！', '感受吧……這才是真正的魔導！'],
          lowHp: ['城堡快撐不住了！先處理漏網之魚！', '糟糕……得省著用魔力了。'],
          boss: ['好大的個子，正好當隕石的靶子！'] },
};
const Dialog = {
  say(kind, delay = 0) {
    const h = G.hero; if (!h) return;
    const lines = (DIALOGUE[h.id] || {})[kind]; if (!lines) return;
    G.dialog = { id: h.id, kind, text: lines[Math.floor(Math.random() * lines.length)], t: -delay, life: 3.4 };
    (G.dialogLog = G.dialogLog || []).push(kind);
  },
  update(dt) { const d = G.dialog; if (d) { d.t += dt; if (d.t > d.life) G.dialog = null; } },
  draw(ctx) {
    const d = G.dialog; if (!d || d.t < 0 || G.screen !== 'play') return;
    const hd = CFG.HEROES[d.id], k = d.t / d.life, a = k < 0.08 ? k / 0.08 : k > 0.88 ? (1 - k) / 0.12 : 1;
    const y = CFG.MAP_BOTTOM - 68 + (k < 0.08 ? (1 - a) * 12 : 0);
    const evo = !!(G.hero && G.hero.evo && Art.resolve(d.id + '_evo_portrait'));
    const c = cachedPanel(`dlg|${d.id}|${evo}|${d.text}`, 348, 54, x => {
      panel(x, 2, 2, 344, 50, 'rgba(18,16,30,0.9)', hd.color);
      drawPortrait(x, d.id, hd, 7, 6, 42, 42, evo);
      text(x, hd.name, 56, 13, 10, hd.color);
      wrapText(x, d.text, 56, 30, 280, 11, '#fff');
    });
    ctx.globalAlpha = a; ctx.drawImage(c, 6, y - 2, 348, 54); ctx.globalAlpha = 1;
  },
};

// ---------- 新手教學：只有第 1 關 3 個短步驟（做完自動前進），其餘功能改成第一次用到時的小提示 ----------
const padT = i => { const p = CFG.TOWER_SPOTS[i]; return p && { x: p[0], y: p[1] - 10, r: 20, world: true }; };
const plotT = i => { const p = CFG.PLOTS[i]; return p && { x: p[0], y: p[1], r: 18, world: true }; };
const btnT = id => { const b = UI.buttons.find(b => b.id === id); return b && { x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2 + 4 }; };
const TUTORIAL = {
  1: [
    { text: '點發亮的石台，蓋弓箭塔', target: () => padT(0), done: () => G.towers.length > 0, freeze: true },
    { text: '點後方空地，蓋一座農田', target: () => plotT(0), done: () => G.buildings.some(b => b.type === 'farm'), freeze: true },
    { text: '點地圖空地，英雄會走過去', target: null, done: () => G.qol.heroMoved || G.phase !== 'day' },
  ],
};
const TUT_FREEZE_MAX = 10;   // 教學步驟最多暫停白天倒數 10 秒

// 情境小提示：每個只出現一次（存檔 tips），約 2.5 秒、不擋操作；一次只顯示一個，其他排隊
const TIPS = [
  { id: 'dusk',     text: '準備好就按「進入黃昏」', when: () => G.phase === 'day' && G.towers.length > 0 && G.time > 4 },
  { id: 'preview',  text: '點右上「敵情」看今晚敵人', when: () => G.phase === 'dusk' || (G.phase === 'day' && G.night >= 2) },
  { id: 'skill',    text: '技能鈕 → 點地圖施放技能', when: () => G.phase === 'night' && G.hero && G.hero.cd <= 0 && G.enemies.length > 0 },
  { id: 'upgrade',  text: '點已蓋的塔可以升級', when: () => G.phase === 'day' && G.night >= 2 && G.towers.some(t => t.lvl < 3) },
  { id: 'barracks', text: '新塔：兵營派士兵擋路', when: () => towerAllowed('barracks') && G.phase === 'day' },
  { id: 'mage',     text: '新塔：法師塔克制重甲盾兵', when: () => towerAllowed('mage') && G.phase === 'day' },
  { id: 'cannon',   text: '新塔：砲塔範圍爆炸傷害', when: () => towerAllowed('cannon') && G.phase === 'day' },
  { id: 'supply',   text: '馬車把糧運到前線補給站', when: () => !!G.post && !G.choosingSupply },
  { id: 'starving', text: '前線缺糧！塔會變慢', when: () => G.starving && G.phase === 'night' },
  { id: 'beacon',   text: '夜晚可點燃烽火加攻速', when: () => G.phase === 'night' && levelHas('beacon') && !!G.post && !G.beaconUsed },
  { id: 'branch',   text: 'Lv3 塔可以選擇分支', when: () => G.lv && G.lv.branches && G.towers.some(t => t.lvl >= 3 && !t.br) },
  { id: 'evolve',   text: '英雄 Lv10！點左下進化', when: () => G.hero && G.hero.evoReady && !G.hero.evo },
  { id: 'raider',   text: '掠奪者會搶補給線的糧', when: () => G.enemies.some(e => e.d.raider && !e.d.boss) },
  { id: 'camera',   text: '拖曳移動地圖・雙指／滾輪縮放', when: () => G.phase === 'day' && G.time > 6 && Cam.userAt < 0 },
];
const Tips = {
  update(dt) {
    if (!G.save) return;
    const seen = G.save.tips = G.save.tips || {};
    const c = G.tip;
    if (c) { c.t += dt; if (c.t >= c.life) G.tip = null; return; }
    if (G.tut || G.choosingSupply || G.dawnChoices || (typeof Boss !== 'undefined' && Boss.active)) return;
    for (const tp of TIPS) {
      if (seen[tp.id]) continue;
      let ok = false; try { ok = tp.when(); } catch (e) { ok = false; }
      if (ok) { seen[tp.id] = 1; writeSave(); G.tip = { id: tp.id, text: tp.text, t: 0, life: 2.5 }; (G.tipLog = G.tipLog || []).push(tp.id); return; }
    }
  },
  draw(ctx) {
    const c = G.tip; if (!c || G.screen !== 'play') return;
    const k = c.t / c.life; ctx.globalAlpha = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
    const cv = cachedPanel('tip|' + c.text, 224, 26, x => { panel(x, 2, 2, 220, 22, 'rgba(20,24,44,0.9)', '#ffd166'); text(x, '💡 ' + c.text, 112, 13, 10, '#fff', 'center'); });
    ctx.drawImage(cv, 68, CFG.MAP_TOP + 64, 224, 26);
    ctx.globalAlpha = 1;
  },
};
const Tutorial = {
  start(lv) { G.tut = TUTORIAL[lv] && !(G.save.tutorial || {})[lv] ? { lv, step: 0, t: 0, freezeT: 0 } : null; },
  cur() { return G.tut && TUTORIAL[G.tut.lv][G.tut.step]; },
  finish(how) { const t = G.tut; if (!t) return; (G.save.tutorial = G.save.tutorial || {})[t.lv] = how; writeSave(); G.tut = null; },
  update(dt) {
    const tt = G.tut; if (!tt) return;
    const s = this.cur(); if (!s) { this.finish('done'); return; }
    if (G.choosingSupply) return;
    tt.t += dt;
    if (s.freeze && G.phase === 'day' && tt.freezeT < TUT_FREEZE_MAX) { G.phaseT += dt; tt.freezeT += dt; }
    // 目標在畫面外（地圖變大、可捲動）：鏡頭自動移過去（玩家剛手動操作過就不搶）
    const tg = s.target && s.target();
    if (tg && tg.world && !G.menu && performance.now() - Cam.userAt > 2500) Cam.ensureVisible(tg.x, tg.y, 60);
    if (s.timer ? tt.t >= s.timer : s.done()) { tt.step++; tt.t = 0; if (tt.step >= TUTORIAL[tt.lv].length) this.finish('done'); }
  },
  draw(ctx) {
    const tt = G.tut; if (!tt || G.screen !== 'play' || G.choosingSupply || G.dawnChoices) return;
    const s = this.cur(); if (!s || (s.phase && G.phase !== s.phase)) return;
    let tg = s.target && s.target();
    if (tg && tg.world) { const [x, y] = Cam.w2s(tg.x, tg.y); tg = { x, y, r: tg.r * Cam.z }; }   // 世界座標 → 畫面座標
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    if (tg && !G.menu) {
      ctx.strokeStyle = `rgba(255,209,102,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r + 3 * pulse, 0, 7); ctx.stroke();
      const ay = tg.y - tg.r - 10 - 5 * pulse;
      ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#1a1c2c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tg.x, ay); ctx.lineTo(tg.x - 8, ay - 12); ctx.lineTo(tg.x + 8, ay - 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (G.menu) return;   // 選單開啟時只留提示圈，不擋住選單
    const top = !tg || tg.y > 330;
    const y = top ? CFG.MAP_TOP + 30 : CFG.MAP_BOTTOM - 100;
    const c = cachedPanel(`tut|${tt.lv}|${tt.step}`, 348, 32, x => {
      panel(x, 2, 2, 344, 28, 'rgba(20,24,44,0.94)', '#ffd166');
      text(x, `${tt.step + 1}/${TUTORIAL[tt.lv].length}`, 12, 16, 10, '#ffd166');
      text(x, s.text, 36, 16, 12, '#fff');
    });
    ctx.drawImage(c, 6, y - 2, 348, 32);
    btn(ctx, 288, y + 3, 58, 22, '跳過', () => this.finish('skipped'), { bg: '#5a3a5a', size: 10, id: 'tut_skip' });
  },
};

// ---------- 每局初始化／每幀 ----------
function qolNewRun() {
  G.qol = { heroMoved: false, skillUsed: false, saidStart: false, saidLow: false, saidBoss: false };
  G.dialog = null; G.dialogLog = []; G.notice = null; G.tip = null; G.tipLog = []; G.paused = false; G.dmgN = 0;
  Tutorial.start(G.levelId);
}
function qolUpdate(dt) {
  if (!G.qol) qolNewRun();
  const q = G.qol;
  Dialog.update(dt);
  if (G.notice) { G.notice.t += dt; if (G.notice.t > G.notice.life) G.notice = null; }
  Tutorial.update(dt);
  Tips.update(dt);
  if (!q.saidStart && !G.choosingSupply && G.time > 1.2) { q.saidStart = true; Dialog.say('start'); }
  if (!q.saidLow && G.castleHp > 0 && G.castleHp / G.castleMax <= 0.3) { q.saidLow = true; Dialog.say('lowHp'); vibe([120, 60, 120], true); }
  if (!q.saidBoss && G.boss && !(typeof Boss !== 'undefined' && Boss.active)) { q.saidBoss = true; Dialog.say('boss', 0.3); }
}
function drawNotice(ctx) {
  const n = G.notice; if (!n || G.screen !== 'play') return;
  const k = n.t / n.life; ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
  const c = cachedPanel('note|' + n.text, 184, 26, x => { panel(x, 2, 2, 180, 22, 'rgba(40,24,60,0.9)', '#c58cf2'); text(x, n.text, 92, 13, 10, '#fff', 'center'); });
  ctx.drawImage(c, 88, CFG.MAP_TOP + 90, 184, 26);
  ctx.globalAlpha = 1;
}

// ---------- 暫停／設定／圖鑑（覆蓋層） ----------
// 覆蓋層堆疊：暫停 → 設定 → 重置確認，關閉時一層層返回
function openOverlay(k) { UI.ovStack = UI.ovStack || []; if (UI.overlay) UI.ovStack.push(UI.overlay); UI.overlay = k; if (k === 'pause') G.paused = true; }
function closeOverlay() { UI.overlay = (UI.ovStack || []).pop() || null; if (!UI.overlay) G.paused = false; }
function clearOverlay() { UI.overlay = null; UI.ovStack = []; G.paused = false; }
function pauseGame() { if (G.screen === 'play' && !UI.overlay) openOverlay('pause'); }
function drawPauseButton(ctx) {
  const x = 32, y = CFG.MAP_TOP + 4;
  ctx.fillStyle = 'rgba(20,18,36,0.75)'; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, 24, 20, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(x + 8, y + 5, 3, 10); ctx.fillRect(x + 13, y + 5, 3, 10);
  UI.buttons.push({ x: x - 2, y: y - 2, w: 28, h: 24, onTap: pauseGame, id: 'pause' });
}
function renderOverlay(ctx) {
  UI.buttons = [];
  ctx.fillStyle = 'rgba(5,5,15,0.6)'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  if (UI.overlay === 'pause') renderPause(ctx);
  else if (UI.overlay === 'settings') renderSettings(ctx);
  else if (UI.overlay === 'reset') renderResetConfirm(ctx);
  else if (UI.overlay === 'bestiary') renderBestiary(ctx);
  else if (UI.overlay === 'outing') renderOuting(ctx);
  else if (UI.overlay === 'reveal') renderReveal(ctx);
  else if (UI.overlay === 'library') renderLibrary(ctx);
  else if (UI.overlay === 'viewer') renderViewer(ctx);
  if (UI.toastT && performance.now() < UI.toastT) text(ctx, UI.toastMsg, CFG.W / 2, 620, 11, '#ff9f9f', 'center');
}
function renderPause(ctx) {
  panel(ctx, 50, 150, 260, 330, 'rgba(26,28,44,0.97)', '#ffd166');
  text(ctx, '暫停', CFG.W / 2, 178, 22, '#ffd166', 'center');
  text(ctx, G.lv && G.levelId ? `第 ${G.levelId} 關・${G.lv.name}｜第 ${G.night}/${CFG.NIGHTS} 夜` : '', CFG.W / 2, 204, 10, '#aaa', 'center', false);
  btn(ctx, 80, 222, 200, 44, '▶ 繼續遊戲', clearOverlay, { bg: '#3b7d4f', size: 15, id: 'resume' });
  btn(ctx, 80, 274, 200, 36, '⚙ 設定', () => openOverlay('settings'), { bg: '#3b5dc9', id: 'pause_settings' });
  btn(ctx, 80, 316, 200, 36, '📖 敵人圖鑑', () => openOverlay('bestiary'), { bg: '#7b4fa0', id: 'pause_bestiary' });
  btn(ctx, 80, 368, 200, 36, '↻ 重新開始本關', () => { clearOverlay(); newRun(G.heroId, G.blessingId); }, { bg: '#b86f2c', id: 'restart' });
  btn(ctx, 80, 412, 200, 36, '◀ 放棄並返回地圖', () => { clearOverlay(); G.screen = G.levelId ? 'map' : 'select'; UI.lvSel = G.levelId || null; }, { bg: '#5a3a3a', id: 'quit' });
}
function renderSettings(ctx) {
  panel(ctx, 20, 96, 320, 452, 'rgba(26,28,44,0.97)', '#ffd166');
  text(ctx, '設定', CFG.W / 2, 122, 20, '#ffd166', 'center');
  btn(ctx, 300, 102, 32, 26, '×', closeOverlay, { bg: '#333c57', id: 'set_close', size: 14 });
  let y = 156;
  for (const [k, label] of [['music', '音樂音量'], ['sfx', '音效音量']]) {
    const v = setting(k);
    text(ctx, label, 36, y, 12, '#fff');
    text(ctx, `${Math.round(v * 100)}%`, 318, y, 11, '#ffd166', 'right');
    for (let i = 0; i < 10; i++) {
      const on = v >= (i + 1) / 10 - 1e-6, x = 36 + i * 28;
      ctx.fillStyle = on ? '#ffd166' : '#333c57'; ctx.fillRect(x, y + 12, 24, 14);
      UI.buttons.push({ x, y: y + 8, w: 28, h: 22, id: `set_${k}_${i + 1}`, onTap: () => setSetting(k, i === 0 && Math.abs(v - 0.1) < 1e-6 ? 0 : (i + 1) / 10) });   // 再點第一格＝靜音
    }
    y += 50;
  }
  const vibOk = Vibe.supported();
  for (const [k, label, sub] of [['shake', '畫面震動', '強力攻擊、首領、城堡受擊'], ['vibrate', '震動回饋', vibOk ? '支援的手機會輕微震動' : '此裝置／瀏覽器不支援'], ['dmgNum', '傷害數字', '顯示每次攻擊的傷害']]) {
    const on = !!setting(k);
    text(ctx, label, 36, y + 6, 12, '#fff');
    text(ctx, sub, 36, y + 22, 9, '#999', 'left', false, false);
    // 開關
    const x = 270;
    ctx.fillStyle = on ? '#3b7d4f' : '#444'; ctx.beginPath(); ctx.roundRect(x, y, 50, 24, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(on ? x + 38 : x + 12, y + 12, 9, 0, 7); ctx.fill();
    text(ctx, on ? '開' : '關', on ? x + 16 : x + 34, y + 12, 9, '#fff', 'center', true, false);
    UI.buttons.push({ x: x - 6, y: y - 4, w: 62, h: 32, id: `set_${k}`, onTap: () => { setSetting(k, !on); if (k === 'vibrate' && !on) vibe(40, true); } });
    y += 44;
  }
  btn(ctx, 36, y + 6, 288, 34, '重看新手教學與提示', () => { G.save.tutorial = {}; G.save.tips = {}; writeSave(); toastScreen('教學與小提示會重新出現'); }, { bg: '#3b5dc9', size: 12, id: 'set_tutorial' });
  btn(ctx, 36, y + 50, 288, 34, '⚠ 重置存檔', () => openOverlay('reset'), { bg: '#8a2030', size: 12, id: 'set_reset' });
  text(ctx, `存檔版本 v${SAVE_VERSION}${G.save.savedAt ? '｜上次儲存 ' + new Date(G.save.savedAt).toLocaleString('zh-TW', { hour12: false }) : ''}`, CFG.W / 2, y + 102, 8, '#777', 'center', false, false);
}
function renderResetConfirm(ctx) {
  panel(ctx, 40, 220, 280, 190, 'rgba(40,14,20,0.98)', '#ef7d57');
  text(ctx, '確定要重置存檔嗎？', CFG.W / 2, 252, 16, '#ff9f9f', 'center');
  wrapText(ctx, '所有關卡星數、遺物碎片、天賦、圖鑑與進化紀錄都會刪除，無法復原。（音量等設定會保留）', 58, 282, 246, 11, '#ddd');
  btn(ctx, 58, 350, 110, 40, '取消', closeOverlay, { bg: '#333c57', id: 'reset_cancel' });
  btn(ctx, 192, 350, 110, 40, '確定刪除', () => {
    resetSave(); clearOverlay(); G.screen = 'title'; UI.lvSel = null; toastScreen('存檔已重置');
  }, { bg: '#b13e53', id: 'reset_confirm' });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });   // 切到背景自動暫停
