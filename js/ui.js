'use strict';
// =============================================================
// 介面：HUD、底部操作列、建造選單、各畫面（英雄選擇／祝福卡／黎明事件／結算）與觸控輸入
// 採「即時模式」按鈕：每一幀繪製時登記點擊區域
// =============================================================
const UI = { buttons: [], selHero: 'erin', blessChoices: null, lvSel: null, modOn: false };

function btn(ctx, x, y, w, h, label, onTap, o = {}) {
  const r = 6;
  ctx.fillStyle = o.disabled ? 'rgba(60,60,70,0.85)' : (o.bg || '#3b5dc9');
  ctx.strokeStyle = o.border || '#1a1c2c'; ctx.lineWidth = o.lw || 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.stroke();
  if (label) text(ctx, label, x + w / 2, y + h / 2 + 1, o.size || 13, o.disabled ? '#999' : (o.color || '#fff'), 'center');
  if (onTap && !o.disabled) UI.buttons.push({ x, y, w, h, onTap, id: o.id });
}
function panel(ctx, x, y, w, h, bg = 'rgba(26,28,44,0.92)', border = '#ffd166') {
  ctx.fillStyle = bg; ctx.strokeStyle = border; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
}

// ---------- HUD ----------
// 上方資源列：內容（數字／文字）有變才重畫進快取畫布，平常每幀只 drawImage 一次（省下十幾次描邊文字）
const HudCache = { c: null, key: '', s: 0 };
function renderHUDTop(ctx) {
  const r = G.res, ph = hudPhaseText();
  const key = [Math.floor(r.wood), Math.floor(r.stone), Math.floor(r.food), G.post ? Math.floor(r.front) : '-', G.villagers.length, popCap(), G.starving, !!G.post, Math.ceil(G.castleHp), G.castleMax, ph, G.phase, Art.loaded].join('|');
  const S = (typeof view !== 'undefined' && view.s) || 2;
  if (!HudCache.c || HudCache.s !== S) { HudCache.c = document.createElement('canvas'); HudCache.c.width = Math.ceil(CFG.W * S); HudCache.c.height = Math.ceil(CFG.MAP_TOP * S); HudCache.s = S; HudCache.key = ''; }
  if (key !== HudCache.key) {
    HudCache.key = key;
    const x = HudCache.c.getContext('2d'); x.setTransform(S, 0, 0, S, 0, 0); x.clearRect(0, 0, CFG.W, CFG.MAP_TOP); x.imageSmoothingEnabled = false;
    drawHUDTop(x, ph);
  }
  ctx.drawImage(HudCache.c, 0, 0, CFG.W, CFG.MAP_TOP);
}
function hudPhaseText() {
  if (G.phase === 'day') return `第${G.night}天・白天 ${Math.ceil(G.phaseT)}s`;
  if (G.phase === 'dusk') return `第${G.night}天・黃昏 ${Math.ceil(G.phaseT)}s`;
  if (G.phase === 'night') return `第${G.night}/${CFG.NIGHTS}夜・敵人 ${G.enemies.length + G.spawnList.length}`;
  return `第${G.night}天・黎明`;
}
function drawHUDTop(ctx, ph) {
  ctx.fillStyle = 'rgba(20,18,36,0.92)'; ctx.fillRect(0, 0, CFG.W, CFG.MAP_TOP);
  const r = G.res;
  const items = [['icon_wood', Math.floor(r.wood), '#e8c48a'], ['icon_stone', Math.floor(r.stone), '#c2d3e0'],
                 ['icon_food', Math.floor(r.food), G.starving && !G.post ? '#ff6b6b' : '#ffd166'], ['icon_front', G.post ? Math.floor(r.front) : '—', G.starving ? '#ff6b6b' : G.post ? '#ffe9a8' : '#777'],
                 ['icon_pop', `${G.villagers.length}/${popCap()}`, '#fff']];
  const labels = ['木頭', '石頭', '後方糧', '前線糧', '人口'];
  items.forEach((it, i) => {
    const x = 6 + i * 71;
    drawSprite(ctx, it[0], x + 7, 18, 1.5, false, false, null, 14, 16);
    text(ctx, String(it[1]), x + 17, 9, 11, it[2]);
    text(ctx, labels[i], x + 17, 21, 8, '#9aa', 'left', false, false);
  });
  // 城堡血量
  drawSprite(ctx, 'icon_heart', 12, 38, 1.3);
  const ratio = G.castleHp / G.castleMax;
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(21, 29, 102, 8); ctx.fillStyle = '#5d275d'; ctx.fillRect(22, 30, 100, 6);
  ctx.fillStyle = ratio > 0.5 ? '#5fd16b' : ratio > 0.25 ? '#ffcd75' : '#ef7d57'; ctx.fillRect(22, 30, 100 * ratio, 6);
  text(ctx, `城堡 ${Math.ceil(G.castleHp)}/${G.castleMax}`, 128, 33, 9, '#fff');
  text(ctx, ph, CFG.W - 6, 33, 10, G.phase === 'night' ? '#9fb4ff' : G.phase === 'dusk' ? '#ffb070' : '#ffe9a8', 'right');
}
function renderHUD(ctx) {
  renderHUDTop(ctx);
  // 補給狀態
  if (G.starving && G.phase === 'night') text(ctx, `⚠ ${G.post ? '前線' : ''}缺糧！攻速 -30%、兵營停止補兵`, CFG.W / 2, CFG.MAP_TOP + 10, 10, '#ff6b6b', 'center');
  else if (G.phase === 'night' && G.foodUse) text(ctx, `${G.post ? '前線' : '塔'}耗糧 ${G.foodUse.toFixed(1)}/秒`, CFG.W - 6, CFG.MAP_TOP + 10, 9, '#ffe9a8', 'right');
  let y = CFG.MAP_TOP + 22;
  // 首領血條
  const b = G.boss;
  if (b && live(b)) {
    panel(ctx, 70, y - 8, 220, 22, 'rgba(40,6,12,0.85)', '#b13e53');
    text(ctx, '酋長 格魯姆', 76, y + 3, 10, '#ff8a8a');
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(140, y - 1, 144, 8); ctx.fillStyle = '#c0283a'; ctx.fillRect(141, y, 142 * clamp(b.hp / b.max, 0, 1), 6);
    for (const k of b.d.hornAt) { ctx.fillStyle = '#ffd166'; ctx.fillRect(141 + 142 * k, y - 2, 1, 10); }
    y += 24;
  }
  // 夜晚：下一波預告（波次開始前 12 秒）
  if (G.phase === 'night' && G.waveStarts) {
    const plan = nightPlan(), wi = G.waveStarts.findIndex(t => t > G.nightT);
    if (wi > 0 && G.waveStarts[wi] - G.nightT < 12) {
      panel(ctx, 40, y - 8, 280, 26, 'rgba(26,28,44,0.85)', '#9fb4ff');
      text(ctx, `第 ${wi + 1} 波 ${Math.ceil(G.waveStarts[wi] - G.nightT)}s`, 46, y + 5, 10, '#9fb4ff');
      drawGroups(ctx, plan[wi], 116, y + 5, 200);
    }
  }
  // 烽火剩餘
  if (G.beaconT > 0) text(ctx, `🔥 烽火 ${Math.ceil(G.beaconT)}s`, 62, CFG.MAP_TOP + 14, 10, '#ffb347');
}
// 敵人圖示 ×數量（單行）
function drawGroups(ctx, groups, x, y, maxW) {
  groups.forEach((g, gi) => {
    const [type, n] = g, d = CFG.ENEMIES[type]; if (!d) return;
    if (x > maxW + 60) return;
    drawSprite(ctx, d.sprite, x + 8, y + 8, 0.9, false, false, null, 18, 18);
    text(ctx, `×${n}`, x + 17, y + 2, 10, d.boss ? '#ff6b6b' : '#fff');
    if (G.paths && G.paths.length > 1 && !(d.raider || d.arsonist || d.sapper)) text(ctx, ((g[3] !== undefined && g[3] !== null ? g[3] : gi) % 2) ? '右路' : '左路', x + 17, y + 13, 7, '#9fb4ff', 'left', false, false);   // 雙路關卡：標出進攻路線
    x += 40;
  });
  return x;
}
// 傷害類型小徽章：物理／魔法／對空
function typeBadges(ctx, x, y, dmgType, air) {
  const items = [[dmgType === 'magic' ? '魔' : '物', dmgType === 'magic' ? '#7b4fa0' : '#b86f2c', dmgType === 'magic' ? '魔法傷害（剋重甲）' : '物理傷害'],
                 [air ? '空' : '地', air ? '#2f7fb8' : '#566c86', air ? '可對空' : '只打地面']];
  for (const [ch, bg, tip] of items) {
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x, y - 7, 14, 14, 3); ctx.fill();
    text(ctx, ch, x + 7, y, 9, '#fff', 'center', true, false);
    text(ctx, tip, x + 17, y, 8, '#ddd', 'left', false, false);
    ctx.font = `8px ${FONT}`; x += 22 + ctx.measureText(tip).width;
  }
  return x;
}

// ---------- 底部操作列 ----------
function renderBottom(ctx) {
  const y0 = CFG.MAP_BOTTOM;
  ctx.fillStyle = 'rgba(20,18,36,0.95)'; ctx.fillRect(0, y0, CFG.W, CFG.H - y0);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(0, y0, CFG.W, 1);
  // 速度
  btn(ctx, 6, y0 + 14, 40, 32, '', () => { const opts = DEBUG ? [1, 2, 4, 8] : [1, 2]; G.speed = opts[(opts.indexOf(G.speed) + 1) % opts.length]; if (G.speed <= 2) setSetting('speed', G.speed); }, { bg: G.speed > 1 ? '#b86f2c' : '#333c57', id: 'speed', border: G.speed > 1 ? '#ffd166' : '#1a1c2c' });
  text(ctx, G.speed > 1 ? '▶▶' : '▶', 26, y0 + 24, 9, '#fff', 'center', true, false);
  text(ctx, `${G.speed}x`, 26, y0 + 37, 12, G.speed > 1 ? '#fff2a8' : '#fff', 'center');
  // 英雄頭像
  const h = G.hero;
  ctx.fillStyle = '#262b44'; ctx.fillRect(52, y0 + 8, 98, 44);
  drawSprite(ctx, h.evo && Art.img[h.d.sprite + '_evo_front'] ? h.d.sprite + '_evo' : h.d.sprite, 68, y0 + 48, 1.9, false, false, 'idle', 40);
  text(ctx, `${h.d.name} Lv${h.lvl}${h.evo ? '★' : ''}`, 86, y0 + 18, 10, h.evo ? '#ffd166' : h.d.color);
  if (h.dead) text(ctx, `復活 ${Math.ceil(h.respawnT)}s`, 86, y0 + 34, 10, '#ff6b6b');
  else { hpBar(ctx, 116, y0 + 30, 56, h.hp / h.max, h.d.color); text(ctx, `${Math.ceil(h.hp)}/${h.max}`, 86, y0 + 42, 8, '#ccc', 'left', false); }
  // 經驗條
  const xn = heroXpNext(h);
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(86, y0 + 49, 62, 3); ctx.fillStyle = '#41a6f6'; ctx.fillRect(86, y0 + 49, 62 * (xn ? clamp(xn[0] / xn[1], 0, 1) : 1), 3);
  // 進化按鈕（Lv10）
  if (h.evoReady && !h.evo) {
    const pk = 0.6 + 0.4 * Math.sin(G.time * 6 + performance.now() / 300);
    btn(ctx, 54, y0 + 10, 94, 40, '', () => { if (!h.dead) CutIn.evolve(h, evolveHero); else toast('英雄復活中…'); }, { bg: `rgba(184,134,11,${0.75 + 0.2 * pk})`, border: '#fff2a8', id: 'evolve' });
    drawSprite(ctx, h.d.sprite, 70, y0 + 48, 1.9, false, false, 'idle', 34);
    text(ctx, '✦ 進化 ✦', 112, y0 + 24, 13, '#fffbe6', 'center');
    text(ctx, CFG.EVOLVE[h.id].title, 112, y0 + 40, 9, '#fff', 'center', false);
  }
  // 階段按鈕
  if (G.phase === 'day') btn(ctx, 156, y0 + 10, 118, 40, '進入黃昏 ▶', skipPhase, { bg: '#b86f2c', id: 'phase' });
  else if (G.phase === 'dusk') btn(ctx, 156, y0 + 10, 118, 40, '迎戰夜晚 ▶', skipPhase, { bg: '#5d275d', id: 'phase' });
  else if (G.phase === 'night' && !(levelHas('beacon') && G.post)) btn(ctx, 156, y0 + 10, 118, 40, '夜戰中…', null, { disabled: true });
  else if (G.phase === 'night') {
    // 烽火（每夜一次）
    const c = beaconCost();
    if (G.beaconT > 0) btn(ctx, 156, y0 + 10, 118, 40, `🔥 烽火 ${Math.ceil(G.beaconT)}s`, null, { disabled: true });
    else if (G.beaconUsed) btn(ctx, 156, y0 + 10, 118, 40, '烽火已使用', null, { disabled: true });
    else {
      btn(ctx, 156, y0 + 10, 118, 40, '', useBeacon, { bg: G.res.front >= c ? '#c4501c' : '#5a3a2a', id: 'beacon' });
      text(ctx, '🔥 點燃烽火', 215, y0 + 24, 12, '#fff', 'center');
      text(ctx, `塔攻速↑ ${CFG.BEACON.dur + (talent('d4') ? 5 : 0)}秒｜-${c} 前線糧`, 215, y0 + 40, 8, G.res.front >= c ? '#ffe9a8' : '#ff8080', 'center', false);
    }
  }
  else btn(ctx, 156, y0 + 10, 118, 40, '黎明', null, { disabled: true });
  // 技能鈕
  const cx = 316, cy = y0 + 30, rr = 26;
  const noSkill = G.mod === 'noHeroSkill';
  const ready = !h.dead && h.cd <= 0 && !noSkill;
  ctx.fillStyle = G.targeting ? '#ffd166' : ready ? '#7b4fa0' : '#333c57';
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill(); ctx.strokeStyle = '#1a1c2c'; ctx.lineWidth = 2; ctx.stroke();
  if (h.cd > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (h.cd / skillCd(h))); ctx.fill();
    text(ctx, `${Math.ceil(h.cd)}`, cx, cy + 9, 11, '#fff', 'center');
  }
  text(ctx, skillName(h), cx, cy - (h.cd > 0 ? 5 : 0), skillName(h).length > 3 ? 9 : 11, G.targeting ? '#1a1c2c' : '#fff', 'center', true, !G.targeting);
  UI.buttons.push({ x: cx - rr, y: cy - rr, w: rr * 2, h: rr * 2, id: 'skill', onTap: () => {
    if (noSkill) { toast('挑戰條件：英雄不能施放技能'); return; }
    if (h.dead) { toast('英雄復活中…'); return; }
    if (h.cd > 0) { toast('技能冷卻中'); return; }
    G.targeting = !G.targeting; G.menu = null;
  } });
  if (G.targeting) text(ctx, `點擊地圖施放「${skillName(h)}」`, CFG.W / 2, CFG.MAP_BOTTOM - 12, 12, '#ffd166', 'center');
  // 敵情按鈕（白天／黃昏）
  if (G.phase === 'day' || G.phase === 'dusk') btn(ctx, CFG.W - 58, CFG.MAP_TOP + 4, 54, 18, '敵情 ▾', () => { G.preview = G.preview && G.preview.t < 10 ? null : { t: 0 }; }, { bg: 'rgba(93,39,93,0.9)', size: 10, id: 'preview' });
}

// ---------- 建造選單 ----------
function openSpotMenu(i) { G.menu = { kind: 'spot', i, pick: null }; }
function openPlotMenu(i) { G.menu = { kind: 'plot', i }; }
// 射程圈（實線 = 目前；虛線 = 預覽）
function rangeCircle(ctx, x, y, r, preview, col = '255,255,255') {
  ctx.save();
  ctx.fillStyle = `rgba(${col},${preview ? 0.08 : 0.07})`; ctx.strokeStyle = `rgba(${col},${preview ? 0.85 : 0.55})`; ctx.lineWidth = preview ? 1.5 : 1.2;
  if (preview) ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function previewRange(type, lvl, x, y) {
  const d = CFG.TOWERS[type]; let r = d.range[lvl - 1];
  if (type === 'archer' && G.hero && G.hero.id === 'erin' && !G.hero.dead && Math.hypot(G.hero.x - x, G.hero.y - y) < 120) r *= 1.15;
  if (talent('d3')) r *= 1.08;
  return r;
}
function renderMenu(ctx) {
  const m = G.menu; if (!m) return;
  if (m.kind === 'branch') { renderBranch(ctx, m); return; }
  let cx, cy, opts = [], title = '', info = null, warn = null;
  if (m.kind === 'spot') {
    [cx, cy] = CFG.TOWER_SPOTS[m.i];
    const t = towerAt(m.i);
    if (!spotSupplied(cx, cy)) warn = '⚠ 在補給範圍外：夜晚缺糧（攻速 -30%）';
    if (!t) {
      title = m.pick ? '再點一次確定建造' : '建造防禦塔（點選預覽射程）';
      if (m.pick) {
        const d = CFG.TOWERS[m.pick];
        // 幽靈預覽：半透明塔 + 射程圈
        const r = m.pick === 'barracks' ? d.range[0] : previewRange(m.pick, 1, cx, cy);
        if (m.pick === 'barracks') { const p = nearestOnPaths(cx, cy); rangeCircle(ctx, p.x, p.y, r, true, '65,166,246'); }
        else rangeCircle(ctx, cx, cy - 10, r, true, m.pick === 'archer' ? '160,255,160' : '255,255,255');
        ctx.globalAlpha = 0.55; drawSprite(ctx, d.sprite, cx, cy + 8, 1.8, false, false, 1); ctx.globalAlpha = 1;
        info = { name: d.name, dmgType: d.dmgType, air: d.air, line: towerLine(m.pick, 1) };
      }
      for (const k of ['archer', 'barracks', 'mage', 'cannon'].filter(towerAllowed)) {
        const d = CFG.TOWERS[k], picked = m.pick === k;
        opts.push({ icon: d.sprite, label: picked ? '確定' : d.name, cost: towerCost(d.cost[0]), hl: picked,
          act: () => { if (m.pick !== k) { m.pick = k; return; } if (buildTower(m.i, k)) G.menu = null; } });
      }
    } else {
      title = `${towerName(t)} ${t.bdef ? '★' : 'Lv' + t.lvl}`;
      info = { name: towerName(t), dmgType: tStat(t, 'dmgType'), air: tStat(t, 'air'), line: towerLine(t.type, t.lvl, t), desc: t.bdef ? t.bdef.desc : null };
      // 範圍圈：目前（實線）＋ 升級後（虛線）
      if (t.type !== 'barracks') {
        rangeCircle(ctx, t.x, t.y - 10, towerRange(t), false, t.type === 'archer' ? '160,255,160' : '255,255,255');
        if (t.lvl < 3) rangeCircle(ctx, t.x, t.y - 10, towerRange(t) * t.def.range[t.lvl] / t.def.range[t.lvl - 1], true, '255,209,102');
        if (t.br === 'necro') rangeCircle(ctx, t.rally.x, t.rally.y, 8, false, '140,255,140');
      } else {
        rangeCircle(ctx, t.rally.x, t.rally.y, tStat(t, 'range'), false, '65,166,246');
        if (t.lvl < 3) rangeCircle(ctx, t.rally.x, t.rally.y, t.def.range[t.lvl], true, '255,209,102');
      }
      if (t.lvl < 3) opts.push({ icon: t.def.sprite, lvl: t.lvl + 1, label: `升級 Lv${t.lvl + 1}`, cost: towerCost(t.def.cost[t.lvl]), act: () => { if (upgradeTower(t)) G.menu = null; } });
      else if (!t.br && levelHas('branches')) opts.push({ icon: CFG.BRANCHES[t.def.branches[0]].sprite, label: '分支升級', cost: towerCost(CFG.BRANCH_COST), hl: true, act: () => { G.menu = { kind: 'branch', t, pick: null }; } });
      const refund = {}; for (const k in t.spent) refund[k] = Math.floor(t.spent[k] * CFG.SELL_REFUND);
      opts.push({ icon: null, label: '賣出', cost: refund, refund: true, act: () => { sellTower(t); G.menu = null; } });
    }
  } else if (m.kind === 'granary') {
    cx = CFG.GRANARY.x; cy = CFG.GRANARY.y;
    title = '糧倉被燒毀：無法交糧、車隊停運';
    opts.push({ icon: 'granary', label: '修復', cost: CFG.REPAIR_COST.granary, hl: true, act: () => { if (repairBuilding('granary')) G.menu = null; } });
  } else if (m.kind === 'post') {
    cx = G.post.x; cy = G.post.y;
    title = `${G.post.name}｜補給範圍 ${CFG.SUPPLY_RADIUS}`;
    rangeCircle(ctx, cx, cy, CFG.SUPPLY_RADIUS, false, '255,209,102');
    opts.push({ icon: 'depot', label: '遷移', cost: CFG.SUPPLY_MOVE_COST, act: () => { G.menu = null; G.supplyPick = G.post.id; G.choosingSupply = 'move'; } });
  } else {
    [cx, cy] = CFG.PLOTS[m.i];
    const b = buildingAt(m.i);
    if (!b) {
      title = '建造（白天）';
      for (const k of ['farm', 'lumber', 'quarry', 'house'].filter(buildingAllowed)) {
        const d = CFG.BUILDINGS[k];
        opts.push({ icon: d.sprite, label: d.name, cost: d.cost, act: () => { if (placeBuilding(m.i, k)) G.menu = null; } });
      }
    } else {
      title = b.burned ? `${b.def.name}被燒毀：停止生產` : `${b.def.name}｜${b.def.desc}${b.def.yield ? `｜工人 ${b.workers.length}/${CFG.WORKERS_PER_BUILDING}` : ''}`;
      if (b.burned) opts.push({ icon: b.def.sprite, label: '修復', cost: CFG.REPAIR_COST.building, hl: true, act: () => { if (repairBuilding(b)) G.menu = null; } });
      opts.push({ icon: null, label: '拆除', cost: {}, refund: true, act: () => { demolish(b); G.menu = null; } });
    }
  }
  // 選項排列：塔在上方路段→往下展開；後方地塊→往上展開
  const n = opts.length, ow = 66, oh = 58, gap = 4, extra = m.kind === 'spot' ? 42 : (info ? 30 : 0) + (warn ? 12 : 0);   // 塔選單固定高度：預覽前後按鈕不移動
  const totalW = Math.max(n * ow + (n - 1) * gap, m.kind === 'spot' ? 240 : 0);
  const px = clamp(cx - totalW / 2, 4, CFG.W - totalW - 4);
  let py;
  if (m.kind === 'plot' || m.kind === 'granary') py = cy - 26 - oh - 6;
  else if (m.kind === 'spot' || m.kind === 'post') {
    // 塔的選單停靠在地圖下緣（或上緣），不遮住射程圈
    const H = oh + 22 + extra;
    py = cy < (CFG.MAP_TOP + CFG.MAP_BOTTOM) / 2 + 40 ? CFG.MAP_BOTTOM - H - 2 : CFG.MAP_TOP + 46;
    ctx.strokeStyle = 'rgba(255,209,102,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(cx, cy + (py > cy ? 12 : -40)); ctx.lineTo(clamp(cx, px + 10, px + totalW - 10), py > cy ? py - 18 : py + H - 18); ctx.stroke(); ctx.setLineDash([]);
  }
  py = Math.max(CFG.MAP_TOP + 18, py);
  panel(ctx, px - 4, py - 18, totalW + 8, oh + 22 + extra);
  text(ctx, title, px + 2, py - 8, 10, '#ffd166');
  opts.forEach((o, i) => {
    const x = px + i * (ow + gap), y = py + 2;
    const ok = o.refund || canAfford(o.cost);
    ctx.fillStyle = o.hl ? '#5d4a1e' : ok ? '#333c57' : '#2a2a33'; ctx.fillRect(x, y, ow, oh - 4);
    ctx.strokeStyle = o.hl ? '#ffd166' : ok ? '#94b0c2' : '#555'; ctx.lineWidth = o.hl ? 2 : 1; ctx.strokeRect(x + 0.5, y + 0.5, ow - 1, oh - 5);
    if (o.icon) drawSprite(ctx, o.icon, x + 14, y + 40, 1.2, false, false, o.lvl || 1, 34, 26);
    text(ctx, o.label, x + (o.icon ? 42 : ow / 2), y + 14, 10, '#fff', 'center');
    const ct = Object.keys(o.cost).length ? (o.refund ? '+' : '') + costText(o.cost) : '';
    text(ctx, ct, x + (o.icon ? 42 : ow / 2), y + 32, 9, o.refund ? '#5fd16b' : ok ? '#ffe9a8' : '#ff6b6b', 'center');
    UI.buttons.push({ x, y, w: ow, h: oh - 4, onTap: o.act, id: `opt${i}` });
  });
  let iy = py + oh + 4;
  if (!info && m.kind === 'spot') { text(ctx, '點一下塔種：顯示射程預覽；再點一次：建造', px, iy + 6, 9, '#bbb', 'left', false); iy += 30; }
  if (info) {
    typeBadges(ctx, px, iy, info.dmgType, info.air);
    text(ctx, info.line, px, iy + 15, 9, '#e8e8f0', 'left', false);
    iy += 30;
  }
  if (warn) text(ctx, warn, px, iy - 2, 9, '#ff8080', 'left', false);
  // 選取標記
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 16, 10, 0, 0, 7); ctx.stroke();
}
// 塔數值一行文字
function towerLine(type, lvl, t) {
  const g = k => t ? tStat(t, k) : (Array.isArray(CFG.TOWERS[type][k]) ? CFG.TOWERS[type][k][lvl - 1] : CFG.TOWERS[type][k]);
  if (type === 'barracks') return `士兵 ${Math.round(g('soldierHp'))} 血｜${g('soldierDmg')} 傷害${t && t.bdef && t.bdef.soldierDR ? `｜減傷 ${t.bdef.soldierDR * 100}%` : ''}`;
  const r = t ? towerRange(t) : g('range');
  return `傷害 ${g('dmg')}｜每 ${g('rate')} 秒｜射程 ${Math.round(r)}${g('splash') ? `｜範圍 ${g('splash')}` : ''}`;
}
// 分支選擇（二選一，永久）
function renderBranch(ctx, m) {
  const t = m.t, [b1, b2] = t.def.branches, cost = towerCost(CFG.BRANCH_COST);
  ctx.fillStyle = 'rgba(8,6,20,0.72)'; ctx.fillRect(0, CFG.MAP_TOP, CFG.W, CFG.MAP_BOTTOM - CFG.MAP_TOP);
  // 預覽射程（地圖上）
  if (m.pick && t.type !== 'barracks') rangeCircle(ctx, t.x, t.y - 10, CFG.BRANCHES[m.pick].range * (talent('d3') ? 1.08 : 1), true, '255,209,102');
  panel(ctx, 10, 110, 340, 400, 'rgba(26,28,44,0.96)', '#ffd166');
  text(ctx, `${t.def.name}・分支升級`, CFG.W / 2, 132, 17, '#ffd166', 'center');
  text(ctx, '二選一，選定後無法更改', CFG.W / 2, 152, 10, '#ff9f9f', 'center', false);
  [b1, b2].forEach((id, i) => {
    const b = CFG.BRANCHES[id], x = 20 + i * 164, y = 166, w = 156, h = 270, sel = m.pick === id;
    panel(ctx, x, y, w, h, sel ? 'rgba(93,74,30,0.95)' : 'rgba(40,44,70,0.95)', sel ? '#ffd166' : '#566c86');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; Light.glow1(ctx, id === 'necro' || id === 'ranger' ? 'green' : id === 'arcane' ? 'purple' : id === 'tesla' ? 'cyan' : 'warm', x + w / 2, y + 70, 56, sel ? 0.5 : 0.25); ctx.restore(); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(x + w / 2, y + 120); ctx.scale(1.9, 1.9); drawSprite(ctx, b.sprite, 0, 0, 2, false, false, null, 52, 74); ctx.restore();
    text(ctx, b.name, x + w / 2, y + 136, 16, sel ? '#ffd166' : '#fff', 'center');
    typeBadges(ctx, x + 8, y + 158, b.dmgType, b.air);
    wrapText(ctx, b.desc, x + 8, y + 180, w - 16, 10, '#e8e8f0');
    const fake = Object.assign({}, t, { bdef: b, br: id, lvl: 4 });
    wrapText(ctx, towerLine(t.type, 4, fake), x + 8, y + 222, w - 16, 9, '#a7f070');
    UI.buttons.push({ x, y, w, h, id: `branch${i}`, onTap: () => { m.pick = id; } });
  });
  const ok = m.pick && canAfford(cost);
  btn(ctx, 30, 452, 180, 44, m.pick ? `確定：${CFG.BRANCHES[m.pick].name}` : '請先選一個分支', () => { if (branchTower(t, m.pick)) G.menu = null; }, { bg: '#b13e53', disabled: !ok, id: 'branchOk', size: 12 });
  text(ctx, costText(cost), 120, 503, 9, canAfford(cost) ? '#ffe9a8' : '#ff6b6b', 'center');
  btn(ctx, 220, 452, 110, 44, '取消', () => { G.menu = null; }, { bg: '#333c57', id: 'branchCancel' });
}

// ---------- 補給站選擇 ----------
function renderSupplyChoice(ctx) {
  const first = G.choosingSupply === true;
  ctx.fillStyle = 'rgba(8,6,20,0.45)'; ctx.fillRect(0, CFG.MAP_TOP, CFG.W, CFG.MAP_BOTTOM - CFG.MAP_TOP);
  // 塔位（是否在範圍內）
  const sel = CFG.SUPPLY_SPOTS.find(p => p.id === G.supplyPick);
  for (const [x, y] of CFG.TOWER_SPOTS) {
    const ok = Math.hypot(x - sel.x, y - sel.y) <= CFG.SUPPLY_RADIUS;
    ctx.fillStyle = ok ? '#5fd16b' : '#ff6b6b'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); ctx.strokeStyle = '#1a1028'; ctx.lineWidth = 1; ctx.stroke();
  }
  for (const p of CFG.SUPPLY_SPOTS) {
    const on = p.id === G.supplyPick;
    if (on) {
      rangeCircle(ctx, p.x, p.y, CFG.SUPPLY_RADIUS, false, '255,209,102');
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.beginPath(); p.road.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = on ? '#ffd166' : 'rgba(255,255,255,0.85)'; ctx.strokeStyle = '#1a1028'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, on ? 11 : 8, 0, 7); ctx.fill(); ctx.stroke();
    drawSprite(ctx, 'depot', p.x, p.y + 8, 1.4, false, false, null, 22, 26);
    text(ctx, p.name, clamp(p.x, 40, CFG.W - 40), p.y + 22, 10, on ? '#ffd166' : '#fff', 'center');
    UI.buttons.push({ x: p.x - 24, y: p.y - 26, w: 48, h: 56, id: `post_${p.id}`, onTap: () => { G.supplyPick = p.id; } });
  }
  // 說明面板
  const inf = postInfo(sel), risk = ['低', '中', '高'][sel.risk];
  panel(ctx, 8, 450, 344, 126, 'rgba(26,28,44,0.96)', '#ffd166');
  text(ctx, first ? '選擇補給站位置' : '遷移補給站', 18, 466, 14, '#ffd166');
  text(ctx, '點地圖上的旗幟切換', 342, 466, 9, '#aaa', 'right', false);
  text(ctx, sel.name, 18, 488, 13, '#fff');
  text(ctx, sel.desc, 18, 505, 9, '#ddd', 'left', false);
  text(ctx, `運送單程 ${inf.trip.toFixed(1)} 秒`, 18, 524, 10, '#ffe9a8');
  text(ctx, `覆蓋塔位 ${inf.cover}/${CFG.TOWER_SPOTS.length}`, 128, 524, 10, inf.cover === CFG.TOWER_SPOTS.length ? '#a7f070' : '#ffe9a8');
  text(ctx, `掠奪風險 ${risk}`, 250, 524, 10, sel.risk >= 2 ? '#ff6b6b' : sel.risk ? '#ffb070' : '#a7f070');
  const cost = first || G.supplyPick === G.post.id ? null : CFG.SUPPLY_MOVE_COST;
  btn(ctx, first ? 90 : 30, 536, 180, 34, cost ? `確定遷移（${costText(cost)}）` : '確定', confirmSupply, { bg: '#b13e53', id: 'supplyOk', disabled: cost && !canAfford(cost) });
  if (!first) btn(ctx, 220, 536, 110, 34, '取消', () => { G.choosingSupply = false; }, { bg: '#333c57', id: 'supplyCancel' });
}

// ---------- 今夜敵情 ----------
function renderPreview(ctx) {
  if (!G.preview || G.preview.t > 10 || G.phase === 'night' || G.phase === 'dawn' || G.choosingSupply || G.menu) return;
  const plan = nightPlan(), y0 = CFG.MAP_TOP + 26, h = 46 + plan.length * 26;
  panel(ctx, 8, y0, 344, h, 'rgba(26,28,44,0.93)', '#c58cf2');
  text(ctx, `今夜敵情・第 ${G.night} 夜`, 16, y0 + 13, 12, '#d3a8ff');
  btn(ctx, 322, y0 + 3, 24, 20, '×', () => { G.preview = null; }, { bg: '#333c57', id: 'previewClose', size: 12 });
  plan.forEach((w, i) => {
    const y = y0 + 32 + i * 26;
    text(ctx, `第${i + 1}波`, 16, y + 4, 10, '#fff');
    drawGroups(ctx, w, 56, y + 2, 260);
  });
  const has = k => plan.some(w => w.some(g => g[0] === k)), boss = has('boss');
  const side = [has('raider') && '掠奪者 → 補給線', has('arsonist') && '縱火狂 → 後方建築', has('sapper') && '地鼠 → 補給道路'].filter(Boolean).join('｜');
  text(ctx, `入口：${G.paths && G.paths.length > 1 ? '左右兩路' : '北方道路'}${side ? '｜' + side : ''}${boss ? '｜⚠ 首領' : ''}`, 16, y0 + h - 10, 9, boss ? '#ff8a8a' : '#ffe9a8', 'left', false);
}

// ---------- 天賦樹 ----------
function renderTalents(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, CFG.H); g.addColorStop(0, '#1b1f3a'); g.addColorStop(1, '#2a1838');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CFG.W, CFG.H);
  text(ctx, '天賦樹', CFG.W / 2, 34, 24, '#ffd166', 'center');
  text(ctx, `遺物碎片 ${G.save.shards}`, CFG.W / 2, 62, 13, '#c58cf2', 'center');
  text(ctx, '失敗或勝利都能獲得碎片，永久強化', CFG.W / 2, 80, 9, '#aaa', 'center', false);
  const cols = [62, 180, 298], colC = ['#a7f070', '#9fb4ff', '#ffb070'];
  CFG.TALENT_TREES.forEach((n, i) => text(ctx, n, cols[i], 104, 14, colC[i], 'center'));
  for (const n of CFG.TALENTS) {
    const col = cols[n.tree], row = CFG.TALENTS.filter(x => x.tree === n.tree).indexOf(n), y = 122 + row * 96;
    const own = talent(n.id), avail = !own && (!n.req || talent(n.req)), sel = UI.talentSel === n.id;
    if (row > 0) { ctx.strokeStyle = talent(CFG.TALENTS.filter(x => x.tree === n.tree)[row - 1].id) ? colC[n.tree] : '#444'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(col, y - 22); ctx.lineTo(col, y); ctx.stroke(); }
    panel(ctx, col - 50, y, 100, 74, own ? 'rgba(60,90,50,0.95)' : avail ? 'rgba(40,44,70,0.95)' : 'rgba(30,30,38,0.9)', sel ? '#ffd166' : own ? colC[n.tree] : avail ? '#566c86' : '#333');
    text(ctx, n.name, col, y + 16, 13, own ? colC[n.tree] : avail ? '#fff' : '#777', 'center');
    wrapText(ctx, n.desc, col - 44, y + 33, 88, 8, own ? '#e8f8e0' : avail ? '#ccc' : '#666');
    text(ctx, own ? '✔ 已解鎖' : `◆ ${n.cost}`, col, y + 64, 9, own ? '#a7f070' : G.save.shards >= n.cost && avail ? '#c58cf2' : '#777', 'center');
    UI.buttons.push({ x: col - 50, y, w: 100, h: 74, id: `talent_${n.id}`, onTap: () => { UI.talentSel = n.id; } });
  }
  const n = CFG.TALENTS.find(x => x.id === UI.talentSel);
  if (n) {
    const own = talent(n.id), can = !own && (!n.req || talent(n.req)) && G.save.shards >= n.cost;
    const why = own ? '已解鎖' : n.req && !talent(n.req) ? `需要先解鎖「${CFG.TALENTS.find(x => x.id === n.req).name}」` : G.save.shards < n.cost ? '碎片不足' : '';
    btn(ctx, 20, 512, 200, 40, own ? '已解鎖' : `解鎖「${n.name}」◆${n.cost}`, () => { if (unlockTalent(n.id)) sfx('upgrade'); }, { bg: '#7b4fa0', disabled: !can, id: 'talentBuy', size: 12 });
    if (why && !own) text(ctx, why, 120, 560, 9, '#ff9f9f', 'center', false);
  } else text(ctx, '點選一個天賦查看', 120, 532, 11, '#aaa', 'center', false);
  btn(ctx, 230, 512, 110, 40, '重置（退還）', () => { resetTalents(); sfx('sell'); }, { bg: '#333c57', id: 'talentReset', size: 11 });
  btn(ctx, 110, 578, 140, 40, '返回', () => { G.screen = UI.talentBack || 'select'; }, { bg: '#b13e53', id: 'back', size: 14 });
}

// ---------- 地圖點擊 ----------
function handleMapTap(x, y) {
  if (G.screen !== 'play' || G.phase === 'dawn') return;
  if (G.choosingSupply) return;
  if (y < CFG.MAP_TOP || y > CFG.MAP_BOTTOM) return;
  if (G.targeting) { CutIn.request(G.hero, () => castSkill(x, y)); G.targeting = false; return; }
  if (G.menu && G.menu.kind === 'branch') return;
  const hadMenu = !!G.menu; G.menu = null;
  const si = CFG.TOWER_SPOTS.findIndex(s => Math.abs(s[0] - x) < 18 && y > s[1] - 42 && y < s[1] + 14);
  if (si >= 0) { openSpotMenu(si); return; }
  const pi = CFG.PLOTS.findIndex(p => Math.abs(p[0] - x) < 16 && Math.abs(p[1] - y) < 16);
  if (pi >= 0) {
    if (!buildingAt(pi) && G.phase !== 'day') { toast('後方建築只能在白天建造'); return; }
    openPlotMenu(pi); return;
  }
  if (G.granaryBurned && Math.abs(CFG.GRANARY.x - x) < 20 && Math.abs(CFG.GRANARY.y - y) < 22) { G.menu = { kind: 'granary' }; return; }
  if (G.post && Math.abs(G.post.x - x) < 18 && y > G.post.y - 30 && y < G.post.y + 14) {
    if (G.phase === 'day') { G.menu = { kind: 'post' }; return; }
    toast('補給站只能在白天遷移');
  }
  if (hadMenu) return;
  if (G.qol) G.qol.heroMoved = true;
  moveHero(x, y);
}

// ---------- 畫面：標題 ----------
function screenBg(ctx, a = '#1b1f3a', b = '#3a2340') {
  const g = ctx.createLinearGradient(0, 0, 0, CFG.H); g.addColorStop(0, a); g.addColorStop(1, b);
  ctx.fillStyle = g; ctx.fillRect(0, 0, CFG.W, CFG.H);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect((i * 97) % 360, (i * 53) % 140, 2, 2); }
}
function renderTitle(ctx) {
  screenBg(ctx);
  ['lena', 'erin', 'vera'].forEach((id, i) => {
    const alt = G.save.evolved && G.save.evolved[id] && Art.resolve(id + '_evo_portrait');
    ctx.globalAlpha = i === 1 ? 1 : 0.8; drawPortrait(ctx, id, CFG.HEROES[id], [16, 118, 238][i], i === 1 ? 168 : 190, i === 1 ? 124 : 106, i === 1 ? 170 : 140, alt); ctx.globalAlpha = 1;
  });
  text(ctx, '糧線守衛', CFG.W / 2, 70, 38, '#ffd166', 'center');
  text(ctx, '放逐騎士的黎明', CFG.W / 2, 110, 16, '#e8c48a', 'center');
  text(ctx, '第一章・邊境森林', CFG.W / 2, 136, 11, '#c58cf2', 'center');
  const st = totalStars();
  text(ctx, `★ ${st}/30　遺物碎片 ${G.save.shards}`, CFG.W / 2, 368, 12, '#ffd166', 'center');
  const cont = continueLevel();
  if (cont) {
    btn(ctx, 80, 386, 200, 56, '', () => { G.screen = 'map'; UI.lvSel = cont; UI.modOn = false; }, { bg: '#b13e53', id: 'title_continue' });
    text(ctx, '繼續冒險', CFG.W / 2, 404, 19, '#fff', 'center');
    text(ctx, `第 ${cont} 關・${LEVELS[cont - 1].name}`, CFG.W / 2, 428, 10, '#ffe9a8', 'center', false);
  } else btn(ctx, 80, 386, 200, 56, '開始遊戲', () => { G.screen = 'map'; UI.lvSel = null; }, { bg: '#b13e53', size: 20, id: 'title_start' });
  btn(ctx, 80, 452, 96, 38, '天賦樹', () => { G.screen = 'talents'; UI.talentBack = 'title'; UI.talentSel = null; }, { bg: '#7b4fa0', size: 14, id: 'title_talents' });
  btn(ctx, 184, 452, 96, 38, '📚 圖書館', () => { UI.libTab = 'art'; openOverlay('library'); }, { bg: '#5d275d', size: 14, id: 'title_library' });
  btn(ctx, 80, 498, 200, 32, '⚙ 設定', () => openOverlay('settings'), { bg: '#333c57', size: 12, id: 'title_settings' });
  if (UI.toastT && performance.now() < UI.toastT) text(ctx, UI.toastMsg, CFG.W / 2, 610, 12, '#ffd166', 'center');
  text(ctx, '白天建設 → 黃昏佈防 → 夜晚死守', CFG.W / 2, 560, 11, '#aaa', 'center', false);
  text(ctx, '守住糧線，撐過每一夜！', CFG.W / 2, 578, 11, '#aaa', 'center', false);
  if (!LS.persistent) text(ctx, '⚠ 瀏覽器封鎖了儲存空間：進度只保留到關閉頁面', CFG.W / 2, 596, 9, '#ff9e7a', 'center', false);
}

// ---------- 畫面：關卡地圖 ----------
// 10 個關卡節點沿蜿蜒小路排列（由下往上）；需要前一關通關才開放
const MAP_NODES = [[80, 560], [180, 540], [280, 505], [250, 440], [140, 425], [70, 360], [150, 300], [260, 275], [290, 200], [180, 140]];
function renderLevelMap(ctx) {
  screenBg(ctx, '#20301e', '#2b2418');
  // 地形：草地、樹叢、河流（裝飾）
  ctx.fillStyle = 'rgba(70,110,50,0.35)'; for (let i = 0; i < 26; i++) { const x = (i * 131) % 360, y = 120 + (i * 77) % 500; ctx.beginPath(); ctx.arc(x, y, 14 + (i % 4) * 5, 0, 7); ctx.fill(); }
  ctx.strokeStyle = 'rgba(80,140,200,0.45)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-5, 250); ctx.bezierCurveTo(120, 220, 200, 270, 365, 235); ctx.stroke();
  ctx.fillStyle = 'rgba(30,24,20,0.85)'; ctx.fillRect(0, 0, CFG.W, 84);
  text(ctx, '第一章・邊境森林', CFG.W / 2, 28, 20, '#ffd166', 'center');
  text(ctx, `★ ${totalStars()}/30　遺物碎片 ${G.save.shards}`, CFG.W / 2, 56, 12, '#c58cf2', 'center');
  btn(ctx, 6, 8, 56, 26, '◀ 標題', () => { G.screen = 'title'; }, { bg: '#333c57', size: 10, id: 'map_back' });
  btn(ctx, 6, 50, 56, 26, '天賦', () => { G.screen = 'talents'; UI.talentBack = 'map'; UI.talentSel = null; }, { bg: '#7b4fa0', size: 11, id: 'map_talents' });
  btn(ctx, CFG.W - 62, 50, 56, 26, '圖鑑', () => openOverlay('bestiary'), { bg: '#5d275d', size: 11, id: 'map_bestiary' });
  btn(ctx, CFG.W - 92, 8, 52, 26, '⚙ 設定', () => openOverlay('settings'), { bg: '#333c57', size: 10, id: 'map_settings' });
  // 小路
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, c] of [[12, 'rgba(60,40,20,0.8)'], [8, '#c8a466']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); MAP_NODES.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(80,50,20,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); MAP_NODES.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
  // 城堡（起點）
  drawSprite(ctx, 'castle', 40, 625, 1.1);
  LEVELS.forEach((lv, i) => {
    const [x, y] = MAP_NODES[i], open = levelUnlocked(lv.id), rec = levelRec(lv.id), stars = rec ? rec.stars || 0 : 0, sel = UI.lvSel === lv.id;
    const boss = !!lv.boss, r = boss ? 20 : 15;
    const next = open && !stars;
    if (next) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; Light.glow1(ctx, 'warm', x, y, 34, 0.35 + 0.2 * Math.sin(performance.now() / 300)); ctx.restore(); ctx.globalAlpha = 1; }
    ctx.fillStyle = !open ? '#3a3a44' : boss ? '#8a2030' : stars ? '#3b6d3a' : '#b86f2c';
    ctx.strokeStyle = sel ? '#fff' : open ? '#ffd166' : '#666'; ctx.lineWidth = sel ? 3 : 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    if (boss && open) drawSprite(ctx, 'boss', x, y + 14, 0.9, false, false, null, 30, 30);
    else text(ctx, open ? String(lv.id) : '🔒', x, y + 1, open ? 14 : 11, '#fff', 'center');
    for (let k = 0; k < 3; k++) text(ctx, '★', x - 12 + k * 12, y + r + 8, 10, k < stars ? '#ffd166' : 'rgba(0,0,0,0.5)', 'center', true, false);
    if (rec && rec.mods && lv.mod && rec.mods[lv.mod]) text(ctx, '◆', x + r, y - r + 2, 9, '#c58cf2', 'center');
    UI.buttons.push({ x: x - 24, y: y - 24, w: 48, h: 48, id: `lv_${lv.id}`, onTap: () => { if (!open) { toastScreen('需要先通關第 ' + (lv.id - 1) + ' 關'); return; } UI.lvSel = lv.id; UI.modOn = false; } });
  });
  if (UI.toastT && performance.now() < UI.toastT) text(ctx, UI.toastMsg, CFG.W / 2, 100, 12, '#ff9f9f', 'center');
  if (UI.lvSel) renderLevelCard(ctx, LEVELS[UI.lvSel - 1]);
}
function toastScreen(m) { UI.toastMsg = m; UI.toastT = performance.now() + 1600; }
function renderLevelCard(ctx, lv) {
  const rec = levelRec(lv.id), y = 360;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  UI.buttons.push({ x: 0, y: 0, w: CFG.W, h: CFG.H, id: 'card_bg', onTap: () => { UI.lvSel = null; } });
  panel(ctx, 12, y - 150, 336, 412, 'rgba(26,28,44,0.97)', lv.boss ? '#ff6b6b' : '#ffd166');
  UI.buttons.push({ x: 12, y: y - 150, w: 336, h: 412, id: 'card', onTap: () => {} });
  text(ctx, `第 ${lv.id} 關`, 26, y - 130, 11, '#aaa');
  text(ctx, lv.name, 26, y - 108, 20, lv.boss ? '#ff8a8a' : '#ffd166');
  const dc = { 易: '#a7f070', 中: '#ffcd75', 難: '#ff6b6b' }[lv.diff];
  text(ctx, `難度 ${lv.diff}`, 334, y - 128, 11, dc, 'right'); text(ctx, `${lv.nights} 夜`, 334, y - 110, 11, '#9fb4ff', 'right');
  wrapText(ctx, lv.intro, 26, y - 84, 308, 10, '#e8e8f0');
  // 敵人種類
  const types = [...new Set(lv.waves.flat(2).map(g => g[0]))];
  text(ctx, '敵軍', 26, y - 18, 10, '#ffb070');
  types.forEach((t, i) => { drawSprite(ctx, CFG.ENEMIES[t].sprite, 70 + i * 30, y - 8, 0.9, false, false, null, 22, 22); });
  text(ctx, '可用', 26, y + 16, 10, '#a7f070');
  lv.towers.forEach((t, i) => { drawSprite(ctx, CFG.TOWERS[t].sprite, 70 + i * 30, y + 28, 0.9, false, false, 1, 22, 26); });
  if (lv.supply) text(ctx, '補給線', 70 + lv.towers.length * 30 + 4, y + 16, 9, '#ffe9a8', 'left', false);
  // 最佳成績
  const best = rec && rec.stars ? `最佳 ${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}　通關 ${rec.wins || 0} 次` : rec && rec.tries ? `尚未通關（最多撐過 ${rec.bestNights || 0} 夜）` : '尚未挑戰';
  text(ctx, best, 26, y + 50, 11, rec && rec.stars ? '#ffd166' : '#bbb');
  // 挑戰條件
  if (lv.mod) {
    const m = LEVEL_MODS[lv.mod], done = rec && rec.mods && rec.mods[lv.mod];
    const on = UI.modOn;
    ctx.fillStyle = on ? 'rgba(123,79,160,0.6)' : 'rgba(40,44,70,0.9)'; ctx.strokeStyle = on ? '#c58cf2' : '#566c86'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(26, y + 64, 308, 46, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? '#c58cf2' : '#333'; ctx.fillRect(36, y + 78, 18, 18); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(36.5, y + 78.5, 17, 17);
    if (on) text(ctx, '✔', 45, y + 88, 13, '#fff', 'center');
    text(ctx, `挑戰：${m.name}`, 62, y + 80, 12, on ? '#fff' : '#ddd');
    text(ctx, done ? '已完成 ◆' : `通關額外 ◆${m.shards} 碎片（首次）`, 62, y + 98, 9, done ? '#a7f070' : '#c58cf2', 'left', false);
    UI.buttons.push({ x: 26, y: y + 64, w: 308, h: 46, id: 'mod_toggle', onTap: () => { UI.modOn = !UI.modOn; } });
  }
  btn(ctx, 26, y + 196, 120, 46, '關閉', () => { UI.lvSel = null; }, { bg: '#333c57', size: 14, id: 'card_close' });
  btn(ctx, 156, y + 196, 178, 46, '選擇英雄 ▶', () => { G.levelId = lv.id; G.mod = UI.modOn && lv.mod ? lv.mod : null; G.screen = 'select'; }, { bg: '#b13e53', size: 16, id: 'card_go' });
  text(ctx, lv.tips[0], CFG.W / 2, y + 128, 10, '#ffe9a8', 'center', false);
  if (lv.tips[1]) text(ctx, lv.tips[1], CFG.W / 2, y + 146, 10, '#ffe9a8', 'center', false);
  if (lv.tips[2]) text(ctx, lv.tips[2], CFG.W / 2, y + 164, 10, '#ffe9a8', 'center', false);
}

// ---------- 畫面：英雄選擇 ----------
function renderSelect(ctx) {
  screenBg(ctx);
  const lv = G.levelId === 0 ? LEGACY_LEVEL : LEVELS[(G.levelId || 1) - 1];
  text(ctx, `第 ${lv.id} 關・${lv.name}`, CFG.W / 2, 40, 22, lv.boss ? '#ff8a8a' : '#ffd166', 'center');
  text(ctx, `${lv.nights} 夜・難度 ${lv.diff}${G.mod ? `・挑戰：${LEVEL_MODS[G.mod].name}` : ''}`, CFG.W / 2, 68, 11, G.mod ? '#c58cf2' : '#e8c48a', 'center');
  const s = G.save;
  text(ctx, `遺物碎片 ${s.shards}　挑戰次數 ${s.attempts}`, CFG.W / 2, 96, 10, '#c58cf2', 'center');
  text(ctx, '選擇出戰英雄', CFG.W / 2, 122, 14, '#fff', 'center');
  s.altArt = s.altArt || {};
  ['erin', 'lena', 'vera'].forEach((id, i) => {
    const d = CFG.HEROES[id], y = 136 + i * 128, sel = UI.selHero === id;
    const evoOk = !!(s.evolved && s.evolved[id]), alt = evoOk && s.altArt[id] && !!Art.resolve(id + '_evo_portrait');
    panel(ctx, 14, y, 332, 118, sel ? 'rgba(59,93,201,0.55)' : 'rgba(26,28,44,0.85)', sel ? '#ffd166' : '#566c86');
    UI.buttons.push({ x: 14, y, w: 332, h: 118, id: `hero_${id}`, onTap: () => { UI.selHero = id; } });
    drawPortrait(ctx, id, d, 20, y + 6, 84, 106, alt);
    if (evoOk) {   // 曾經進化過：卡片上的小切換鈕（一般 ⇄ 進化插畫），存檔記住
      btn(ctx, 22, y + 90, 40, 18, alt ? '✦進化' : '一般', () => { s.altArt[id] = !s.altArt[id]; writeSave(); }, { bg: alt ? '#b8860b' : 'rgba(30,30,50,0.85)', border: '#ffd166', lw: 1, size: 8, id: `alt_${id}` });
    }
    text(ctx, `${d.name}｜${alt ? CFG.EVOLVE[id].title : d.title}`, 108, y + 18, 15, alt ? '#ffd166' : d.color);
    text(ctx, d.role, 108, y + 38, 10, '#ddd', 'left', false);
    text(ctx, `技能【${d.skill.name}】`, 108, y + 58, 11, '#ffd166');
    wrapText(ctx, d.skill.desc, 108, y + 74, 228, 10, '#ccc');
    text(ctx, `被動：${d.passive}`, 108, y + 102, 10, '#a7f070', 'left', false);
  });
  btn(ctx, 14, 532, 96, 44, '◀ 地圖', () => { G.screen = 'map'; }, { bg: '#333c57', size: 14, id: 'sel_back' });
  btn(ctx, 122, 532, 132, 44, '出征！', () => {
    if (G.save.lastResult === 'lose') { UI.blessChoices = pickN(CFG.BLESSINGS.filter(b => lv.supply || !b.supply), 3); G.screen = 'blessing'; }
    else newRun(UI.selHero, null);
  }, { bg: '#b13e53', size: 18, id: 'start' });
  btn(ctx, 264, 532, 82, 44, '天賦樹', () => { G.screen = 'talents'; UI.talentBack = 'select'; UI.talentSel = null; }, { bg: '#7b4fa0', size: 13, id: 'talents' });
  if (CFG.TALENTS.some(n => !talent(n.id) && (!n.req || talent(n.req)) && s.shards >= n.cost)) { ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(340, 536, 5, 0, 7); ctx.fill(); }
  text(ctx, lv.tips[0], CFG.W / 2, 596, 10, '#aaa', 'center', false);
  text(ctx, '點地圖移動英雄｜點石台蓋塔｜點後方空地建造', CFG.W / 2, 614, 10, '#aaa', 'center', false);
}
// 英雄選擇用立繪（有正式立繪時裁成卡片大小；否則畫放大的暫代點陣圖）；alt = 進化插畫（含背景）
function drawPortrait(ctx, id, d, x, y, w, h, alt) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y, w, h);
  const pk = (alt && Art.resolve(id + '_evo_portrait')) || Art.resolve(id + '_portrait');
  if (pk) {
    const im = Art.img[pk], m = Art.meta[pk];
    const s = Math.max(w / m.w, h / m.h), sw = w / s, sh = h / s;   // cover：置中裁切
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, (m.w - sw) / 2, 0, sw, sh, x, y, w, h);
  } else {
    ctx.imageSmoothingEnabled = false;
    drawSprite(ctx, d.sprite, x + w / 2, y + h - 6, 4.4, false, false, 'idle', h - 10);
  }
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
  ctx.strokeStyle = alt ? '#ffd166' : d.color; ctx.lineWidth = alt ? 2 : 1.5; ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.stroke();
}
function wrapText(ctx, s, x, y, maxW, size, color) {
  ctx.font = `${size}px ${FONT}`; let line = '', yy = y;
  for (const ch of s) { if (ctx.measureText(line + ch).width > maxW) { text(ctx, line, x, yy, size, color, 'left', false, false); line = ch; yy += size + 3; } else line += ch; }
  if (line) text(ctx, line, x, yy, size, color, 'left', false, false);
}
function pickN(arr, n) { const p = arr.slice(), out = []; while (out.length < n && p.length) out.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]); return out; }

// ---------- 畫面：祝福卡 ----------
function renderBlessing(ctx) {
  ctx.fillStyle = '#1b1f3a'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  text(ctx, '重新挑戰', CFG.W / 2, 50, 24, '#ffd166', 'center');
  text(ctx, '從 3 張祝福卡中選擇 1 張', CFG.W / 2, 82, 13, '#fff', 'center');
  text(ctx, `遺物碎片：${G.save.shards}（已永久累積）`, CFG.W / 2, 104, 11, '#c58cf2', 'center');
  if (G.save.lossStreak >= CFG.PITY_STREAK) text(ctx, `連敗保底：開局額外 +${CFG.PITY_BONUS.wood} 木、+${CFG.PITY_BONUS.stone} 石`, CFG.W / 2, 124, 11, '#a7f070', 'center');
  UI.blessChoices.forEach((b, i) => {
    const y = 146 + i * 130;
    panel(ctx, 30, y, 300, 116, 'rgba(93,39,93,0.8)', '#c58cf2');
    text(ctx, '✦ 祝福卡 ✦', CFG.W / 2, y + 22, 11, '#c58cf2', 'center');
    text(ctx, b.name, CFG.W / 2, y + 52, 20, '#ffd166', 'center');
    text(ctx, b.desc, CFG.W / 2, y + 84, 14, '#fff', 'center');
    UI.buttons.push({ x: 30, y, w: 300, h: 116, id: `bless${i}`, onTap: () => newRun(UI.selHero, b.id) });
  });
  btn(ctx, 110, 556, 140, 36, '返回', () => { G.screen = 'select'; }, { bg: '#333c57', id: 'back' });
  if (G.levelId) text(ctx, `第 ${G.levelId} 關・${LEVELS[G.levelId - 1].name}`, CFG.W / 2, 610, 11, '#aaa', 'center', false);
}

// ---------- 黎明事件 ----------
function renderDawn(ctx) {
  ctx.fillStyle = 'rgba(10,10,30,0.55)'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  panel(ctx, 20, 150, 320, 300, 'rgba(40,28,48,0.95)', '#ffb070');
  text(ctx, `第 ${G.night} 夜守住了！`, CFG.W / 2, 178, 18, '#ffd166', 'center');
  text(ctx, '黎明降臨，選擇一個事件', CFG.W / 2, 204, 12, '#fff', 'center');
  G.dawnChoices.forEach((ev, i) => {
    const y = 222 + i * 108, ok = !ev.cost || canAfford(ev.cost);
    panel(ctx, 36, y, 288, 96, ok ? 'rgba(184,111,44,0.35)' : 'rgba(60,60,70,0.6)', ok ? '#ffcd75' : '#666');
    text(ctx, ev.name, CFG.W / 2, y + 22, 17, ok ? '#ffd166' : '#999', 'center');
    text(ctx, `＋ ${ev.pro}`, CFG.W / 2, y + 50, 12, ok ? '#a7f070' : '#888', 'center');
    text(ctx, `－ ${ev.con}`, CFG.W / 2, y + 72, 11, ok ? '#ff9f9f' : '#888', 'center');
    if (!ok) text(ctx, '資源不足', 316, y + 12, 9, '#ff6b6b', 'right', false);
    UI.buttons.push({ x: 36, y, w: 288, h: 96, id: `dawn${i}`, onTap: () => chooseDawn(i) });
  });
}

// ---------- 結算 ----------
function renderEnd(ctx) {
  const e = G.end;
  ctx.fillStyle = 'rgba(10,10,30,0.7)'; ctx.fillRect(0, 0, CFG.W, CFG.H);
  panel(ctx, 24, 130, 312, 360, 'rgba(26,28,44,0.96)', e.win ? '#ffd166' : '#b13e53');
  text(ctx, e.win ? '勝利！領地守住了' : '城堡淪陷…', CFG.W / 2, 168, 22, e.win ? '#ffd166' : '#ff6b6b', 'center');
  if (e.win) {
    for (let i = 0; i < 3; i++) text(ctx, '★', CFG.W / 2 - 50 + i * 50, 218, 40, i < e.stars ? '#ffd166' : '#444', 'center');
    text(ctx, `城堡剩餘 ${G.castleHp}/${G.castleMax}`, CFG.W / 2, 256, 12, '#fff', 'center');
    text(ctx, `獲得遺物碎片 +${e.shards + (e.bonus || 0)}${e.modBonus ? `（含挑戰 ◆${e.modBonus}）` : ''}（共 ${G.save.shards}）`, CFG.W / 2, 274, 12, '#c58cf2', 'center');
  } else {
    text(ctx, `撐過 ${e.nights} 夜`, CFG.W / 2, 214, 16, '#fff', 'center');
    text(ctx, `獲得遺物碎片 +${e.shards}（共 ${G.save.shards}）`, CFG.W / 2, 244, 13, '#c58cf2', 'center');
  }
  text(ctx, `擊殺 ${G.stats.kills}　漏怪 ${G.stats.leaked}　被劫糧食 ${G.stats.stolen}`, CFG.W / 2, 290, 11, '#ccc', 'center');
  text(ctx, `英雄 ${G.hero.d.name} Lv${G.hero.lvl}${G.hero.evo ? `（${CFG.EVOLVE[G.hero.id].title}）` : ''}`, CFG.W / 2, 312, 11, G.hero.d.color, 'center');
  if (!e.win) { text(ctx, '失敗不白費：下次開局可從 3 張祝福卡選 1 張', CFG.W / 2, 344, 10, '#a7f070', 'center'); text(ctx, '碎片可在「天賦樹」永久強化', CFG.W / 2, 360, 10, '#c58cf2', 'center'); }
  else if (e.firstClear && e.level < LEVELS.length) text(ctx, `解鎖第 ${e.level + 1} 關「${LEVELS[e.level].name}」！`, CFG.W / 2, 350, 12, '#a7f070', 'center');
  else if (e.firstClear) text(ctx, '第一章完成！', CFG.W / 2, 350, 14, '#ffd166', 'center');
  const hasNext = e.win && e.level < LEVELS.length;
  btn(ctx, 36, 380, 136, 44, e.win ? '再玩一次' : '再次挑戰', () => { G.screen = 'select'; }, { bg: '#333c57', size: 14, id: 'again' });
  if (hasNext) btn(ctx, 188, 380, 136, 44, '下一關 ▶', () => { G.screen = 'map'; UI.lvSel = e.level + 1; UI.modOn = false; }, { bg: '#b13e53', size: 15, id: 'next' });
  else btn(ctx, 188, 380, 136, 44, '關卡地圖', () => { G.screen = 'map'; UI.lvSel = null; }, { bg: '#b13e53', size: 15, id: 'tomap' });
  btn(ctx, 110, 436, 140, 34, '關卡地圖', () => { G.screen = 'map'; UI.lvSel = null; }, { bg: '#566c86', size: 12, id: 'tomap2' });
}

// ---------- 主繪製 ----------
function renderAll(ctx) {
  // 技能演出且遊戲暫停（CUTIN_SLOW = 0）時：世界畫面拍一張快照重複使用，省下整個場景的繪製
  const frozen = CutIn.active && !CFG.CUTIN_SLOW && G.screen === 'play';
  if (frozen && CutIn.snap) { UI.buttons = []; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(CutIn.snap, 0, 0); ctx.restore(); }
  else { renderScreens(ctx); if (frozen) CutIn.takeSnap(ctx.canvas); }
  if (G.screen === 'play') { Boss.draw(ctx); CutIn.draw(ctx); }
  if (UI.overlay) renderOverlay(ctx);
  Music.drawButton(ctx);   // 靜音按鈕永遠在最上層
}
function renderScreens(ctx) {
  UI.buttons = [];
  ctx.imageSmoothingEnabled = false;
  if (G.screen === 'title') { renderTitle(ctx); return; }
  if (G.screen === 'map') { renderLevelMap(ctx); return; }
  if (G.screen === 'select') { renderSelect(ctx); return; }
  if (G.screen === 'blessing') { renderBlessing(ctx); return; }
  if (G.screen === 'talents') { renderTalents(ctx); return; }
  renderWorld(ctx);
  // 橫幅：畫在選單／面板之下（不擋住操作），首領登場演出時不顯示
  if (!Boss.active) for (const f of G.fx) if (f.kind === 'banner') {
    const k = f.t / f.life, a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(10,10,30,0.7)'; ctx.fillRect(0, 230, CFG.W, 64);
    text(ctx, f.text, CFG.W / 2, 252, 22, '#ffd166', 'center'); if (f.sub) text(ctx, f.sub, CFG.W / 2, 278, 11, '#fff', 'center');
    ctx.globalAlpha = 1;
  }
  renderMenu(ctx);
  renderHUD(ctx);
  renderBottom(ctx);
  if (G.screen === 'play') { renderPreview(ctx); Dialog.draw(ctx); drawNotice(ctx); Tips.draw(ctx); Tutorial.draw(ctx); drawPauseButton(ctx); }
  if (G.screen === 'play' && G.choosingSupply) { UI.buttons = UI.buttons.filter(b => b.id === 'speed' || b.id === 'pause'); renderSupplyChoice(ctx); }
  if (G.screen === 'play' && G.phase === 'dawn' && G.dawnChoices) renderDawn(ctx);
  if (G.screen === 'end') {
    UI.buttons = []; renderEnd(ctx);
    if (G.outing && G.outing.all) { panel(ctx, 24, 498, 312, 52, 'rgba(26,24,40,0.94)', CFG.HEROES[G.outing.hero].color); text(ctx, `${CFG.HEROES[G.outing.hero].name}的日常已全部收集！`, CFG.W / 2, 514, 12, '#ffd166', 'center'); text(ctx, `「${OUTING_DONE[G.outing.hero]}」`, CFG.W / 2, 534, 10, '#ddd', 'center', false); }
    outingCheck();
  }
}

function handleTap(x, y) {
  const muteBtn = (x > 300 && y < 70 && G.screen !== 'play') || (x < 34 && y > 40 && y < 70);
  if (UI.overlay) {   // 暫停／設定／圖鑑：只處理覆蓋層上的按鈕
    for (let i = UI.buttons.length - 1; i >= 0; i--) { const b = UI.buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { sfx('click'); b.onTap(); return; } }
    return;
  }
  if (CutIn.active) { if (!muteBtn) { CutIn.skip(); return; } }   // 演出中點擊＝略過（靜音鈕除外）
  if (Boss.active) { if (!muteBtn) { Boss.skip(); return; } }
  for (let i = UI.buttons.length - 1; i >= 0; i--) {
    const b = UI.buttons[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { sfx('click'); b.onTap(); return; }
  }
  if (G.screen === 'play') handleMapTap(x, y);
}
