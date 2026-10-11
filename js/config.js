'use strict';
// =============================================================
// 糧線守衛 試玩版 — 遊戲數值與資料（所有可調參數集中在這裡）
// =============================================================
// 存檔儲存：優先用 localStorage；被瀏覽器封鎖時（嵌入 iframe 的第三方儲存、隱私模式、沙盒 iframe）
// 改用記憶體（本次遊玩有效、關掉就消失），遊戲不會因為讀寫存檔而出錯。LS.persistent = 是否真的能保存。
const LS = (() => {
  try {
    const s = window.localStorage, k = '__lxsw_probe';
    s.setItem(k, '1'); s.removeItem(k);
    return { persistent: true, getItem: k => window.localStorage.getItem(k), setItem: (k, v) => window.localStorage.setItem(k, v), removeItem: k => window.localStorage.removeItem(k) };
  } catch (e) {
    const mem = {};
    return { persistent: false, getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  }
})();
const FONT = '"Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei",sans-serif';

const CFG = {
  W: 360, H: 640, MAP_TOP: 40, MAP_BOTTOM: 580,
  // 選用整張地圖背景（以 360×640 比例拉滿整個畫布；建議 720×1280，參考 tools/layout_guide.png）
  // null = 使用程序產生的地面與樹木。每關的背景圖由 tools/make_map_bg.py 產生（assets/maps/level_XX.jpg）
  MAP_BG: 'assets/maps/level_01.jpg',   // 每關換成 LEVELS[i].map   // 由 tools/make_map_bg.py 依本設定合成；null = 程序產生背景
  // 使用 MAP_BG 時，是否再依設定畫出敵人道路／補給道路與塔位底座（false = 完全以背景圖為準，空塔位只留小光點）
  MAP_BG_OVERLAY: false,
  // 背景音樂音量（0–1）、短曲音量、交叉淡化秒數
  MUSIC_VOLUME: 0.55, STING_VOLUME: 0.6, MUSIC_FADE: 1.5,
  // 技能演出（全身立繪 cut-in）開關、演出期間的遊戲時間倍率（0 = 暫停，背景用快照；例如 0.2 = 慢動作）
  SKILL_CUTIN: true, CUTIN_SLOW: 0,
  // 音效音量（0–1，與音樂分開）、同時最多幾個音效聲部
  SFX_VOLUME: 0.7, SFX_MAX_VOICES: 10,
  // 首領登場演出開關（演出期間遊戲暫停，點擊可略過）
  BOSS_INTRO: true,
  DAY_TIME: 60, DUSK_TIME: 20, NIGHTS: 3, CASTLE_HP: 20,
  START: { wood: 170, stone: 70, food: 20, front: 30 },
  FRONT_CAP: 80,
  BASE_POP: 4, HOUSE_POP: 3, WORKERS_PER_BUILDING: 2, VILLAGER_SPEED: 45,
  STARVE_RATE_MULT: 0.7,           // 前線斷糧：攻速 -30%
  HERO_RESPAWN: 10,

  // 敵人行進路線（上方森林 → 城堡）
  PATH: [[180, 40], [180, 90], [60, 90], [60, 190], [290, 190], [290, 290], [110, 290], [110, 370], [180, 370], [180, 412]],
  CASTLE: { x: 180, y: 432 },
  GRANARY: { x: 318, y: 556 },
  DEPOT: { x: 342, y: 236 },
  // 補給道路：糧倉 → 前線補給站
  ROAD: [[334, 548], [342, 548], [342, 240]],
  RAIDER_SPAWN: { x: -14, y: 448 },
  // 補給站候選位置（開局選一個；白天可花資源遷移）。road = 糧倉→補給站的道路；risk = 每晚額外掠奪者數量（第 1 夜減 1）
  // 防禦塔只有在補給站 SUPPLY_RADIUS 範圍內才領得到前線糧；範圍外的塔夜晚一律算缺糧
  SUPPLY_RADIUS: 235, SUPPLY_MOVE_COST: { wood: 40 },
  SUPPLY_SPOTS: [
    { id: 'rear',  name: '城後糧站', x: 316, y: 444, road: [[334, 548], [342, 548], [342, 444], [322, 444]], risk: 0,
      desc: '離糧倉近、運送快，但只能補給後半段的塔' },
    { id: 'east',  name: '東崖補給站', x: 342, y: 236, road: [[334, 548], [342, 548], [342, 240]], risk: 1,
      desc: '均衡：覆蓋中段與右側，左側塔位補不到' },
    { id: 'front', name: '前線中樞', x: 196, y: 226, road: [[334, 548], [342, 548], [342, 226], [204, 226]], risk: 2,
      desc: '覆蓋全部塔位，但路途遙遠、掠奪者更多' },
  ],
  // 烽火：每夜一次，所有塔攻速提升，消耗大量前線糧
  BEACON: { cost: 30, dur: 10, rate: 1.6 },
  // 魔法傷害對重甲的倍率；盾兵正面物理減傷
  MAGIC_VS_HEAVY: 1.5,

  TOWER_SPOTS: [[120, 62], [240, 66], [110, 146], [180, 146], [245, 146], [150, 246], [230, 246], [60, 252],
                [170, 336], [245, 336], [60, 348], [250, 404]],
  PLOTS: [[30, 486], [80, 486], [130, 486], [230, 486], [280, 486],
          [30, 548], [80, 548], [130, 548], [180, 548], [230, 548], [272, 548]],

  WAGON: { cap: 20, speed: 38, minLoad: 4 },

  BUILDINGS: {
    farm:   { name: '農田',   cost: { wood: 30 }, yield: { food: 5 },  workTime: 4, drop: 'granary', sprite: 'farm',   desc: '糧食 → 糧倉' },
    lumber: { name: '伐木場', cost: { wood: 20 }, yield: { wood: 10 }, workTime: 4, drop: 'castle',  sprite: 'lumber', desc: '產出木頭' },
    quarry: { name: '採石場', cost: { wood: 40 }, yield: { stone: 7 }, workTime: 5, drop: 'castle',  sprite: 'quarry', desc: '產出石頭' },
    house:  { name: '房屋',   cost: { wood: 40 }, pop: 3, sprite: 'house', desc: '人口上限 +3' },
  },

  // 防禦塔：陣列索引 = 等級-1
  TOWERS: {
    archer:   { name: '弓箭塔', sprite: 'archer', air: true, dmgType: 'phys',
                cost: [{ wood: 60 }, { wood: 60, stone: 20 }, { wood: 90, stone: 40 }],
                range: [88, 98, 110], dmg: [7, 11, 16], rate: [0.7, 0.62, 0.55], food: 0.08, desc: '攻速快，可對空', branches: ['ranger', 'musket'] },
    barracks: { name: '兵營', sprite: 'barracks',
                cost: [{ wood: 70, stone: 20 }, { wood: 60, stone: 30 }, { wood: 90, stone: 50 }],
                dmgType: 'phys', air: false, range: [70, 75, 80], soldierHp: [55, 80, 115], soldierDmg: [4, 6, 9], respawn: 9, food: 0.12, desc: '3 名士兵擋路',
                branches: ['templar', 'berserker'] },
    mage:     { name: '法師塔', sprite: 'mage', air: false, dmgType: 'magic',
                cost: [{ wood: 60, stone: 40 }, { wood: 60, stone: 50 }, { wood: 90, stone: 70 }],
                range: [78, 84, 92], dmg: [18, 28, 42], rate: [1.4, 1.3, 1.2], food: 0.1, desc: '魔法傷害，剋重甲', branches: ['arcane', 'necro'] },
    cannon:   { name: '砲塔', sprite: 'cannon', air: false, dmgType: 'phys', splash: 30,
                cost: [{ wood: 80, stone: 50 }, { wood: 70, stone: 60 }, { wood: 100, stone: 80 }],
                range: [82, 88, 95], dmg: [16, 26, 38], rate: [2.3, 2.1, 1.9], food: 0.1, desc: '範圍傷害', branches: ['catapult', 'tesla'] },
  },
  // 第 3 級 → 第 4 級：二選一的分支（永久）。數值為單一值（不再分等級）
  BRANCH_COST: { wood: 140, stone: 100 },
  BRANCHES: {
    ranger:    { base: 'archer', name: '遊俠塔', sprite: 'tower_ranger', dmgType: 'phys', air: true, range: 118, dmg: 15, rate: 0.5, food: 0.16,
                 poison: { dps: 8, t: 3 }, desc: '毒箭：命中後 3 秒持續毒傷（無視護甲）' },
    musket:    { base: 'archer', name: '火槍塔', sprite: 'tower_musket', dmgType: 'phys', air: true, range: 150, dmg: 62, rate: 1.6, food: 0.16,
                 desc: '超遠射程、單發高傷害' },
    templar:   { base: 'barracks', name: '聖殿騎士營', sprite: 'tower_templar', dmgType: 'phys', air: false, range: 82, soldierHp: 210, soldierDmg: 9, soldierRate: 0.9,
                 soldierDR: 0.35, respawn: 8, food: 0.2, desc: '重裝騎士：高血量、受傷 -35%' },
    berserker: { base: 'barracks', name: '野蠻人營', sprite: 'tower_berserker', dmgType: 'phys', air: false, range: 82, soldierHp: 125, soldierDmg: 21, soldierRate: 0.6,
                 respawn: 7, food: 0.2, desc: '狂戰士：攻擊高、出手快' },
    arcane:    { base: 'mage', name: '奧術塔', sprite: 'tower_arcane', dmgType: 'magic', air: false, range: 100, dmg: 58, rate: 1.1, food: 0.18,
                 instakill: 0.1, desc: '10% 機率直接秒殺（首領除外）' },
    necro:     { base: 'mage', name: '死靈塔', sprite: 'tower_necro', dmgType: 'magic', air: false, range: 94, dmg: 40, rate: 1.2, food: 0.18,
                 skeletons: { max: 3, every: 6, hp: 70, dmg: 6 }, desc: '召喚骷髏兵擋路（最多 3 名）' },
    catapult:  { base: 'cannon', name: '投石車', sprite: 'tower_catapult', dmgType: 'phys', air: false, range: 125, dmg: 72, rate: 3.2, splash: 52, food: 0.18,
                 desc: '超大範圍重擊，攻速慢' },
    tesla:     { base: 'cannon', name: '特斯拉塔', sprite: 'tower_tesla', dmgType: 'magic', air: false, range: 90, dmg: 30, rate: 1.25, chain: 4, food: 0.18,
                 desc: '連鎖閃電：最多跳 4 個目標' },
  },
  SELL_REFUND: 0.6,

  HEROES: {
    erin: { name: '艾琳', title: '精靈遊俠', sprite: 'erin', color: '#5fd16b',
            hp: 140, dmg: 9, rate: 0.6, range: 96, speed: 78, maxBlock: 1, dmgType: 'phys', proj: 'arrow',
            role: '遠程｜高速｜射程長',
            skill: { name: '箭雨', cd: 18, desc: '指定範圍連續射擊 3 秒（可打飛行）' },
            passive: '附近弓箭塔射程 +15%' },
    lena: { name: '蕾娜', title: '聖騎士', sprite: 'lena', color: '#ffd166',
            hp: 300, dmg: 19, rate: 0.9, range: 26, speed: 60, maxBlock: 3, dmgType: 'phys', melee: true,
            dr: 0.2, chargeDmg: 45, chargeHeal: 0.15, regen: 0.015, aura: 0.25, auraR: 150,   // 強化：受傷 -20%、衝鋒 45 傷害並回 15% 血；v9：攻擊 15→19、可擋 3 人、戰鬥中每秒回 1.5%、附近塔傷害 +25%（範圍 150）
            role: '近戰坦克｜可擋 2 名敵人',
            skill: { name: '聖盾衝鋒', cd: 16, desc: '衝向目標擊退敵人並回復 15% 血量，自身與附近士兵無敵 3 秒' },
            passive: '受到傷害 -20%｜附近的塔傷害 +25%｜士兵血量 +20%' },
    vera: { name: '薇拉', title: '元素法師', sprite: 'vera', color: '#8fa8ff',
            hp: 105, dmg: 15, rate: 1.0, range: 86, speed: 64, maxBlock: 1, dmgType: 'magic', proj: 'bolt',
            role: '範圍爆發｜血量低、傷害高',
            skill: { name: '隕石術', cd: 20, desc: '大範圍傷害並留下燃燒地面' },
            passive: '法師塔攻擊有機率連鎖第二目標' },
  },

  // 英雄經驗：各等級所需累積經驗（索引 = 等級-1）；擊殺給 ENEMIES.xp，附近敵人死亡給 1，天亮給 DAWN_XP×夜數
  HERO_XP: [0, 12, 28, 48, 72, 100, 132, 168, 208, 252], HERO_XP_NEAR: 90, DAWN_XP: 10,
  // Lv10 進化：數值與技能升級（hook：放上 assets/{id}_evo_{影格}.png 並加進 art_manifest 即自動改用進化圖）
  EVOLVE: {
    erin: { title: '月光遊俠', skill: '月光箭雨', desc: '範圍更大、箭矢貫穿護甲', hp: 1.4, dmg: 1.35 },
    lena: { title: '聖光騎士', skill: '聖光衝鋒', desc: '無敵更久，衝鋒後治療自身與士兵', hp: 1.4, dmg: 1.35 },
    vera: { title: '烈焰賢者', skill: '烈焰風暴', desc: '一次落下 3 顆隕石', hp: 1.4, dmg: 1.35 },
  },

  ENEMIES: {
    // armor = 物理減傷；frontArmor = 只有正面受到的物理傷害減免；heavy = 重甲（魔法傷害 ×MAGIC_VS_HEAVY）；xp = 英雄擊殺經驗
    goblin: { name: '哥布林步兵', sprite: 'goblin', hp: 40,  speed: 26, armor: 0,   dmg: 4, atkRate: 1.0, castleDmg: 1, xp: 3, sfx: 'die_goblin', bounty: { wood: 3 } },
    wolf:   { name: '狼騎兵',     sprite: 'wolf',   hp: 38,  speed: 56, armor: 0,   dmg: 5, atkRate: 0.9, castleDmg: 1, xp: 3, sfx: 'die_wolf', bounty: { wood: 4 } },
    shield: { name: '哥布林盾兵', sprite: 'shield', hp: 105, speed: 20, armor: 0, frontArmor: 0.5, heavy: true, dmg: 6, atkRate: 1.2, castleDmg: 2, xp: 5, sfx: 'die_goblin', bounty: { wood: 5, stone: 3 } },
    bat:    { name: '蝙蝠',       sprite: 'bat',    hp: 26,  speed: 42, armor: 0, flying: true, castleDmg: 1, xp: 3, sfx: 'die_bat', bounty: { wood: 3 } },
    raider: { name: '掠奪者',     sprite: 'raider', hp: 60,  speed: 40, armor: 0,   dmg: 5, atkRate: 1.0, castleDmg: 0, raider: true, xp: 4, sfx: 'die_goblin', bounty: { wood: 6 } },
    // 首領：每損失 25% 血量吹號，召喚掠奪者攻擊補給線
    arsonist: { name: '縱火狂',   sprite: 'arsonist', hp: 55, speed: 36, armor: 0, dmg: 4, atkRate: 1.0, castleDmg: 0, arsonist: true, xp: 4, sfx: 'die_goblin', bounty: { wood: 6 } },
    sapper: { name: '地鼠工兵',   sprite: 'sapper', hp: 80,  speed: 28, armor: 0.1, dmg: 4, atkRate: 1.0, castleDmg: 0, sapper: true, xp: 5, sfx: 'die_goblin', bounty: { stone: 6 } },
    boss:   { name: '酋長格魯姆', sprite: 'boss', hp: 1500, speed: 10, armor: 0.2, heavy: true, dmg: 28, atkRate: 1.5, castleDmg: 10, boss: true, xp: 30, sfx: 'boss_roar',
              hornAt: [0.75, 0.5, 0.25], hornRaiders: 3, bounty: { wood: 80, stone: 60 }, shards: 2 },
  },

  // 每夜的波次：[敵人種類, 數量, 出怪間隔秒]
  NIGHT_WAVES: [
    [ [['goblin', 6, 1.2]],
      [['goblin', 5, 1.0], ['wolf', 3, 0.8]],
      [['goblin', 7, 0.9], ['wolf', 4, 0.7]] ],
    [ [['goblin', 7, 1.0], ['shield', 3, 1.6]],
      [['wolf', 6, 0.7], ['raider', 2, 2.0]],
      [['shield', 5, 1.4], ['goblin', 8, 0.8], ['raider', 1, 1]] ],
    [ [['bat', 6, 0.9], ['goblin', 8, 0.8]],
      [['shield', 5, 1.3], ['wolf', 6, 0.7], ['raider', 2, 1.5]],
      [['bat', 8, 0.8], ['shield', 6, 1.2], ['goblin', 10, 0.7], ['raider', 2, 1.5], ['boss', 1, 0]] ],   // boss：在該波其他敵人出完後登場
  ],
  WAVE_GAP: 22,
  NIGHT_HP_SCALE: [1, 1.25, 1.5],

  // Roguelike：失敗後重新挑戰時，3 選 1 的祝福卡
  // 縱火狂點火時間、地鼠挖路時間、村民修路時間（秒）；被燒建築／糧倉的修復費用
  ARSON_TIME: 2.5, SAPPER_DIG: 4, ROAD_REPAIR: 6, REPAIR_COST: { building: { wood: 30 }, granary: { wood: 45 } },
  BLESSINGS: [
    { id: 'archerRate', name: '鷹眼祝福', desc: '弓箭塔攻速 +20%', apply: g => { g.mods.archerRate *= 1.2; } },
    { id: 'wood',       name: '森林饋贈', desc: '初始木頭 +50',     apply: g => { g.res.wood += 50; } },
    { id: 'castle',     name: '堅城祝福', desc: '城堡血量 +20%',   apply: g => { g.mods.castleHpMult *= 1.2; } },
    { id: 'stone',      name: '山岳饋贈', desc: '初始石頭 +40',     apply: g => { g.res.stone += 40; } },
    { id: 'wagon', supply: true, name: '疾風車輪', desc: '補給車隊速度 +30%', apply: g => { g.mods.wagonSpeed *= 1.3; } },
    { id: 'hero',       name: '英雄之心', desc: '英雄傷害 +25%',   apply: g => { g.mods.heroDmg *= 1.25; } },
    { id: 'soldier',    name: '鋼鐵軍紀', desc: '士兵血量 +30%',   apply: g => { g.mods.soldierHp *= 1.3; } },
    { id: 'front', supply: true, name: '前線糧倉', desc: '前線初始糧食 +40', apply: g => { g.res.front += 40; } },
  ],

  // 黎明事件：每天天亮 2 選 1，每個選項都有代價（cost = 需要支付的資源；不夠時不能選）
  EVENTS: [
    { id: 'merchant', name: '流浪商人', pro: '遺物碎片 +2（永久）', con: '石頭 -40', cost: { stone: 40 },
      apply: g => { pay({ stone: 40 }); g.save.shards += 2; writeSave(); } },
    { id: 'merc', supply: true, name: '傭兵投靠', pro: '英雄與士兵傷害 +25%', con: '之後每夜開始時 -12 前線糧',
      apply: g => { g.mods.heroDmg *= 1.25; g.mods.soldierDmg *= 1.25; g.upkeep.front += 12; } },
    { id: 'harvest',  name: '豐收祭典', pro: '後方糧倉 +60 糧', con: '村民慶祝：今天白天縮短 20 秒',
      apply: g => { g.res.food += 60; g.dayCut = 20; } },
    { id: 'mason',    name: '石匠工會', pro: '石頭 +70', con: '木頭 -40', cost: { wood: 40 },
      apply: g => { pay({ wood: 40 }); g.res.stone += 70; } },
    { id: 'repair',   name: '城牆修繕', pro: '城堡回復 6 點血量', con: '木頭 -50、石頭 -20', cost: { wood: 50, stone: 20 },
      apply: g => { pay({ wood: 50, stone: 20 }); g.castleHp = Math.min(g.castleMax, g.castleHp + 6); } },
    { id: 'curse',    name: '詛咒寶物', pro: '木頭 +100、石頭 +50', con: '城堡 -3 血',
      apply: g => { g.castleHp = Math.max(1, g.castleHp - 3); g.res.wood += 100; g.res.stone += 50; } },
    { id: 'stable', supply: true, name: '馬廄改良', pro: '車隊載量 +10、速度 +20%', con: '後方糧 -20', cost: { food: 20 },
      apply: g => { pay({ food: 20 }); g.mods.wagonCap += 10; g.mods.wagonSpeed *= 1.2; } },
    { id: 'settlers', name: '新移民',   pro: '立刻加入 3 名村民', con: '之後每夜開始時糧倉 -10 糧',
      apply: g => { g.bonusPop += 3; for (let i = 0; i < 3; i++) spawnVillager(); g.upkeep.food += 10; } },
    { id: 'smith',    name: '鐵匠鋪',   pro: '所有塔傷害 +12%（本關）', con: '木頭 -60', cost: { wood: 60 },
      apply: g => { pay({ wood: 60 }); g.mods.towerDmg *= 1.12; } },
  ],

  // 天賦樹：花遺物碎片永久解鎖（存在 localStorage）。req = 前置節點
  TALENTS: [
    { id: 'e1', tree: 0, name: '開墾', cost: 1, desc: '開局木頭 +40' },
    { id: 'e2', tree: 0, name: '豐饒', cost: 2, req: 'e1', desc: '農田產量 +25%' },
    { id: 'e3', tree: 0, name: '快馬', cost: 3, req: 'e2', desc: '補給車隊速度 +20%' },
    { id: 'e4', tree: 0, name: '商路', cost: 4, req: 'e3', desc: '每天天亮 +30 木、+20 石' },
    { id: 'd1', tree: 1, name: '石匠', cost: 1, desc: '防禦塔建造／升級費用 -10%' },
    { id: 'd2', tree: 1, name: '堅壁', cost: 2, req: 'd1', desc: '城堡血量 +5' },
    { id: 'd3', tree: 1, name: '鷹眼', cost: 3, req: 'd2', desc: '所有塔射程 +8%' },
    { id: 'd4', tree: 1, name: '狼煙', cost: 4, req: 'd3', desc: '烽火持續 +5 秒、花費 -10' },
    { id: 'h1', tree: 2, name: '鍛鍊', cost: 1, desc: '英雄血量 +15%' },
    { id: 'h2', tree: 2, name: '傳承', cost: 2, req: 'h1', desc: '英雄以 Lv3 出戰' },
    { id: 'h3', tree: 2, name: '專注', cost: 3, req: 'h2', desc: '技能冷卻 -20%' },
    { id: 'h4', tree: 2, name: '天命', cost: 4, req: 'h3', desc: '英雄獲得經驗 +30%' },
  ],
  TALENT_TREES: ['經濟', '防禦', '英雄'],
  WIN_SHARDS: 3,   // 勝利獲得碎片 = WIN_SHARDS + 星數

  PITY_STREAK: 2, PITY_BONUS: { wood: 30, stone: 20 },
};
