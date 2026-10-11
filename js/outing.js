'use strict';
// =============================================================
// v9：英雄日常（通關第 4 關起，勝利後選擇出遊地點 → 解鎖日常插畫）與圖書館（立繪／敵人）
// =============================================================
const DAILY_SCENES = [['01_onsen', '溫泉', '♨'], ['02_cafe', '咖啡廳', '☕'], ['03_animals', '小動物們', '🐾'], ['04_market', '市集', '🛍'], ['05_reading', '看書', '📖'],
                      ['06_nap', '午睡', '💤'], ['07_beach', '海邊', '🌊'], ['08_cooking', '下廚', '🍳'], ['09_festival', '祭典煙火', '🎆'], ['10_rain', '雨天', '☔']];
const DAILY_IDS = DAILY_SCENES.map(s => s[0]);
const OUTING_FROM_LEVEL = 4;
// 各英雄對每個地點的一句話（個性：艾琳＝溫柔愛自然、會跟植物說話；蕾娜＝認真遲鈍正義感、以聖光之名、愛吃肉、怕打雷；薇拉＝傲嬌天才、甜食控）
const DAILY_LINES = {
  erin: {
    '01_onsen': '森林深處的溫泉……聽說連樹精都會去泡呢。', '02_cafe': '那家店門口的香草長得好漂亮，我想去打聲招呼。',
    '03_animals': '小鹿和松鼠說好要等我，我們一起去吧？', '04_market': '市集上有好多遠方的種子……好想帶幾顆回家。',
    '05_reading': '在大樹下看植物圖鑑，樹葉會幫我翻頁喔。', '06_nap': '草地今天特別柔軟，花兒們說可以借我睡一下。',
    '07_beach': '海風會和森林的風一樣溫柔嗎？我想去看看。', '08_cooking': '用今天摘的野莓做點心吧，一定很好吃。',
    '09_festival': '祭典的燈火……像螢火蟲一樣閃閃發亮呢。', '10_rain': '下雨了，植物們都好開心，我也想去淋一點點。' },
  lena: {
    '01_onsen': '以聖光之名！泡完溫泉，鎧甲和身體都要閃閃發亮！', '02_cafe': '咖啡廳……有賣烤肉嗎？沒有的話，我只喝牛奶也行。',
    '03_animals': '守護弱小是騎士的使命！小動物們也不例外！', '04_market': '為了正義，我必須親自檢查市集每一串烤肉！',
    '05_reading': '讀騎士傳記是修行的一環……咦，這本是戀愛小說？', '06_nap': '這、這不是偷懶，是戰略性恢復！',
    '07_beach': '在沙灘揮劍一千次！……什麼？大家是來玩水的？', '08_cooking': '以聖光之名，烤一整隻全雞！火候交給我！',
    '09_festival': '煙火的聲音……不是打雷吧？是的話請抓住我的手！', '10_rain': '只是下雨而已……只要不打雷……絕對不要打雷……' },
  vera: {
    '01_onsen': '哼，溫泉對魔力恢復有效，我才不是想放鬆呢。', '02_cafe': '季節限定聖代……只是學術研究，懂嗎？',
    '03_animals': '我才沒有很喜歡小動物，是牠們自己黏過來的！', '04_market': '市集有稀有魔導書……還有馬卡龍，順便而已啦。',
    '05_reading': '安靜的書房最適合天才了……要陪我也行。', '06_nap': '熬夜研究三天，稍微閉個眼……才不是睡著了！',
    '07_beach': '海邊？哼，泳裝是你想看吧！……好啦，就去一下。', '08_cooking': '做甜點就是精準的鍊金術，看好了，天才的手藝！',
    '09_festival': '煙火配色還差得遠……不過跟你一起看還不錯。', '10_rain': '下雨天正好在屋裡研究……傘借你一半，別誤會喔。' },
};
const OUTING_ASK = { erin: '今天辛苦了～', lena: '任務完成！以聖光之名，該休息了！', vera: '哼，贏是理所當然的。' };
const OUTING_DONE = { erin: '大家的回憶，我都好好收藏著喔。', lena: '所有地方都巡邏完畢！……下次再一起去吧！', vera: '全部都去過了？哼……也、也不是不能再去一次。' };

// ---------- 圖片快取（延遲載入） ----------
const DImg = {
  c: {},
  get(src) { let im = this.c[src]; if (!im) { im = new Image(); im.onload = () => { im._ok = true; }; im.onerror = () => { im._bad = true; }; im.src = src; this.c[src] = im; } return im; },
  ok(src) { const im = this.get(src); return im._ok ? im : null; },
};
const dailySrc = (h, id, thumb) => `assets/daily/${h}_${id}${thumb ? '_t' : ''}.webp`;
function dailyUnlocked(h, id) { return !!(G.save.daily && G.save.daily[h] && G.save.daily[h][id]); }
function dailyLocked(h) { return DAILY_IDS.filter(id => !dailyUnlocked(h, id)); }
function unlockDaily(h, id) { const d = G.save.daily = G.save.daily || {}; (d[h] = d[h] || {})[id] = true; writeSave(); }
function sceneLabel(id) { const s = DAILY_SCENES.find(s => s[0] === id); return s ? s[1] : id; }

// 勝利時呼叫：決定這次的出遊選項（從還沒解鎖的地點隨機最多 3 個）
function prepareOuting(win) {
  G.outing = null;
  if (!win || !(G.levelId >= OUTING_FROM_LEVEL) || !G.heroId) return null;
  const locked = dailyLocked(G.heroId);
  G.outing = locked.length ? { hero: G.heroId, opts: pickN(locked, Math.min(3, locked.length)), shown: false, t0: performance.now() }
                           : { hero: G.heroId, all: true, shown: true, t0: performance.now() };
  for (const id of DAILY_IDS) if (G.outing.opts && G.outing.opts.includes(id)) DImg.get(dailySrc(G.heroId, id));   // 先載入大圖
  return G.outing;
}
// 結算畫面：1 秒後自動跳出出遊選單
function outingCheck() {
  const o = G.outing;
  if (G.screen !== 'end' || !o || o.shown || UI.overlay) return;
  if (performance.now() - o.t0 > (CFG.OUTING_DELAY ?? 1000)) { o.shown = true; openOverlay('outing'); }
}
function renderOuting(ctx) {
  const o = G.outing; if (!o) { closeOverlay(); return; }
  const hd = CFG.HEROES[o.hero];
  panel(ctx, 14, 92, 332, 470, 'rgba(26,24,40,0.97)', hd.color);
  drawPortrait(ctx, o.hero, hd, 26, 104, 72, 76, !!(G.save.evolved[o.hero] && Art.resolve(o.hero + '_evo_portrait')));
  text(ctx, hd.name, 108, 116, 12, hd.color);
  wrapText(ctx, OUTING_ASK[o.hero], 108, 136, 226, 11, '#ddd');
  text(ctx, '接下來想去哪裡玩？', 108, 166, 16, '#ffd166');
  o.opts.forEach((id, i) => {
    const y = 196 + i * 104, sc = DAILY_SCENES.find(s => s[0] === id);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.strokeStyle = '#6a5a8a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(26, y, 308, 94, 8); ctx.fill(); ctx.stroke();
    text(ctx, sc[2], 52, y + 30, 26, '#fff', 'center', false, false);
    text(ctx, sc[1], 80, y + 26, 16, '#fff2a8');
    wrapText(ctx, `「${DAILY_LINES[o.hero][id]}」`, 40, y + 56, 284, 11, '#ddd');
    UI.buttons.push({ x: 26, y, w: 308, h: 94, id: 'outing_' + i, onTap: () => pickOuting(i) });
  });
  btn(ctx, 120, 516, 120, 32, '下次再說', () => { G.outing = null; closeOverlay(); }, { bg: '#333c57', size: 11, id: 'outing_skip' });
}
function pickOuting(i) {
  const o = G.outing; if (!o || !o.opts[i]) return false;
  const id = o.opts[i]; unlockDaily(o.hero, id);
  G.reveal = { hero: o.hero, id, t0: performance.now() }; G.outing = null;
  UI.overlay = 'reveal'; sfx('evolve'); vibe([30, 40, 60], true);
  return true;
}
function renderReveal(ctx) {
  const r = G.reveal; if (!r) { closeOverlay(); return; }
  const k = Math.min(1, (performance.now() - r.t0) / 700), e = 1 - Math.pow(1 - k, 3);
  ctx.fillStyle = '#05050c'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  // 光芒
  ctx.save(); ctx.globalAlpha = 0.35 * (1 - k * 0.5); ctx.translate(CFG.W / 2, 300); ctx.rotate(performance.now() / 3000);
  ctx.fillStyle = '#ffd166'; for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -260); ctx.lineTo(14, -260); ctx.fill(); }
  ctx.restore();
  const im = DImg.ok(dailySrc(r.hero, r.id)) || DImg.ok(dailySrc(r.hero, r.id, true));
  const w = 344 * (0.85 + 0.15 * e), h = w * 9 / 16, x = (CFG.W - w) / 2, y = 300 - h / 2;
  ctx.globalAlpha = e;
  ctx.fillStyle = '#ffd166'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  if (im) { ctx.imageSmoothingEnabled = true; ctx.drawImage(im, x, y, w, h); ctx.imageSmoothingEnabled = false; } else { ctx.fillStyle = '#222'; ctx.fillRect(x, y, w, h); }
  const hd = CFG.HEROES[r.hero];
  text(ctx, '✦ 新的回憶 ✦', CFG.W / 2, y - 40, 18, '#ffd166', 'center');
  text(ctx, `${hd.name}・${sceneLabel(r.id)}`, CFG.W / 2, y + h + 28, 16, hd.color, 'center');
  wrapText(ctx, `「${DAILY_LINES[r.hero][r.id]}」`, 30, y + h + 56, 300, 11, '#eee');
  text(ctx, `日常收集 ${DAILY_IDS.filter(id => dailyUnlocked(r.hero, id)).length}/10　（圖書館可再次觀看）`, CFG.W / 2, y + h + 104, 10, '#aaa', 'center', false);
  ctx.globalAlpha = k >= 1 ? 0.6 + 0.4 * Math.sin(performance.now() / 300) : 0;
  text(ctx, '點擊畫面關閉', CFG.W / 2, 600, 11, '#fff', 'center');
  ctx.globalAlpha = 1;
  UI.buttons.push({ x: 0, y: 0, w: CFG.W, h: CFG.H, id: 'reveal_close', onTap: () => { if (performance.now() - r.t0 < 350) return; G.reveal = null; closeOverlay(); } });
}

// ---------- 圖書館 ----------
// 每位英雄 12 格：基本立繪、進化插畫（曾進化後解鎖）、10 張日常
function libItems(h) {
  const hd = CFG.HEROES[h];
  return [{ key: 'base', label: '立繪', open: true, full: `assets/${h}_illust.jpg`, thumb: `assets/daily/${h}_base_t.webp`, hint: '' },
          { key: 'evo', label: CFG.EVOLVE[h].title, open: !!G.save.evolved[h], full: `assets/${h}_evo_panel.jpg`, thumb: `assets/daily/${h}_evo_t.webp`, hint: '英雄進化後解鎖' },
          ...DAILY_SCENES.map(([id, label]) => ({ key: id, label, open: dailyUnlocked(h, id), full: dailySrc(h, id), thumb: dailySrc(h, id, true), hint: `通關第${OUTING_FROM_LEVEL}關後解鎖`, line: DAILY_LINES[h][id] }))]
    .map(it => Object.assign(it, { hero: h, name: hd.name }));
}
function renderLibrary(ctx) {
  UI.libTab = UI.libTab || 'art'; UI.libHero = UI.libHero || 'erin';
  panel(ctx, 6, 44, 348, 560, 'rgba(22,22,38,0.97)', '#ffd166');
  text(ctx, '圖書館', 22, 64, 18, '#ffd166');
  btn(ctx, 312, 50, 34, 26, '×', closeOverlay, { bg: '#333c57', id: 'lib_close', size: 14 });
  btn(ctx, 110, 50, 80, 26, '立繪', () => { UI.libTab = 'art'; }, { bg: UI.libTab === 'art' ? '#b86f2c' : '#333c57', size: 12, id: 'lib_tab_art' });
  btn(ctx, 196, 50, 80, 26, '敵人', () => { UI.libTab = 'enemy'; }, { bg: UI.libTab === 'enemy' ? '#b86f2c' : '#333c57', size: 12, id: 'lib_tab_enemy' });
  if (UI.libTab === 'enemy') { renderBestiary(ctx, true); return; }
  ['erin', 'lena', 'vera'].forEach((h, i) => {
    const hd = CFG.HEROES[h], n = libItems(h).filter(it => it.open).length;
    btn(ctx, 16 + i * 112, 86, 104, 28, `${hd.name} ${n}/12`, () => { UI.libHero = h; }, { bg: UI.libHero === h ? hd.color : '#333c57', color: UI.libHero === h ? '#1a1c2c' : '#fff', size: 11, id: 'lib_hero_' + h });
  });
  const items = libItems(UI.libHero);
  const total = ['erin', 'lena', 'vera'].reduce((a, h) => a + libItems(h).filter(it => it.open).length, 0);
  text(ctx, `全部收集 ${total}/36`, CFG.W / 2, 124, 9, '#aaa', 'center', false, false);
  items.forEach((it, i) => {
    const x = 16 + (i % 3) * 110, y = 134 + Math.floor(i / 3) * 114, w = 104, h = 59;
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x - 2, y - 2, w + 4, 106);
    const im = DImg.ok(it.thumb);
    if (im) { ctx.imageSmoothingEnabled = true; ctx.drawImage(im, x, y, w, h); ctx.imageSmoothingEnabled = false; }
    if (!it.open) {   // 未解鎖：暗色剪影
      ctx.fillStyle = 'rgba(8,8,18,0.86)'; ctx.fillRect(x, y, w, h);
      text(ctx, '？？？', x + w / 2, y + h / 2, 14, '#777', 'center');
    }
    ctx.strokeStyle = it.open ? '#ffd166' : '#444'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    text(ctx, it.open ? it.label : '？？？', x + w / 2, y + h + 12, 10, it.open ? '#fff' : '#777', 'center', false, false);
    if (!it.open) wrapText(ctx, it.hint, x + 2, y + h + 28, w - 4, 8, '#888');
    UI.buttons.push({ x, y, w, h: 100, id: `lib_item_${i}`, onTap: () => { if (!it.open) { toastScreen(it.hint); return; } Viewer.open(UI.libHero, it.key); } });
  });
}
// ---------- 全螢幕檢視（左右箭頭或滑動切換） ----------
const Viewer = {
  open(h, key) { const list = libItems(h).filter(it => it.open); const i = list.findIndex(it => it.key === key); if (i < 0) return false; UI.viewer = { hero: h, i: i }; openOverlay('viewer'); return true; },
  list() { return UI.viewer ? libItems(UI.viewer.hero).filter(it => it.open) : []; },
  step(d) { const L = this.list(); if (!L.length) return; UI.viewer.i = (UI.viewer.i + d + L.length) % L.length; UI.viewer.t0 = performance.now(); },
  cur() { const L = this.list(); return L[UI.viewer.i]; },
};
function renderViewer(ctx) {
  const L = Viewer.list(); if (!L.length) { closeOverlay(); return; }
  const it = Viewer.cur();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  const im = DImg.ok(it.full) || DImg.ok(it.thumb);
  if (im) {
    const s = Math.min(CFG.W / im.naturalWidth, 520 / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.imageSmoothingEnabled = true; ctx.drawImage(im, (CFG.W - w) / 2, 50 + (520 - h) / 2, w, h); ctx.imageSmoothingEnabled = false;
  } else text(ctx, '載入中…', CFG.W / 2, 300, 12, '#888', 'center');
  // 預先載入前後兩張
  for (const d of [-1, 1]) DImg.get(L[(UI.viewer.i + d + L.length) % L.length].full);
  text(ctx, `${it.name}・${it.label}`, 16, 24, 14, CFG.HEROES[it.hero].color);
  text(ctx, `${UI.viewer.i + 1}/${L.length}`, CFG.W / 2, 24, 11, '#ccc', 'center');
  if (it.line) wrapText(ctx, `「${it.line}」`, 20, 584, 320, 11, '#ddd');
  btn(ctx, 280, 8, 40, 30, '×', closeOverlay, { bg: '#333c57', id: 'viewer_close', size: 15 });   // 右上角留給靜音鈕
  if (L.length > 1) {
    btn(ctx, 4, 290, 34, 60, '◀', () => Viewer.step(-1), { bg: 'rgba(40,40,60,0.7)', id: 'viewer_prev', size: 16 });
    btn(ctx, 322, 290, 34, 60, '▶', () => Viewer.step(1), { bg: 'rgba(40,40,60,0.7)', id: 'viewer_next', size: 16 });
  }
  text(ctx, '← 滑動切換 →', CFG.W / 2, 624, 9, '#666', 'center', false, false);
}
