'use strict';
// =============================================================
// 像素素材
// -------------------------------------------------------------
// 1) 暫代圖：ART（字串點陣圖）→ Sprites.img[key]，程式產生，永遠可用。
// 2) 正式美術：js/art_manifest.js 的 ART_MANIFEST 列出 assets/*.png（由 tools/extract_art.py 產生）。
//    SPRITE_OVERRIDES 把「遊戲素材 key」對應到正式圖：
//      - 字串：單張圖
//      - 物件：多個變體（英雄動作 idle/walk/attack/skill、防禦塔等級 1/2/3）
//    正式圖還沒載入或載入失敗時，自動退回暫代圖。
//    PNG 存的是「邏輯尺寸 × 2」，畫的時候乘上 ART_DRAW_SCALE（0.5），錨點 ax/ay 為腳底。
// =============================================================
const ART_DRAW_SCALE = 0.5;
const SPRITE_OVERRIDES = {
  erin: { idle: 'erin_front', front: 'erin_front', side: 'erin_side', back: 'erin_back', walk1: 'erin_walk1', walk2: 'erin_walk2', atk1: 'erin_atk1', atk2: 'erin_atk2', sk1: 'erin_sk1', sk2: 'erin_sk2', wf1: 'erin_wf1', wf2: 'erin_wf2', wf3: 'erin_wf3', wf4: 'erin_wf4', wb1: 'erin_wb1', wb2: 'erin_wb2', wb3: 'erin_wb3', wb4: 'erin_wb4', ws1: 'erin_ws1', ws2: 'erin_ws2', ws3: 'erin_ws3' },
  lena: { idle: 'lena_front', front: 'lena_front', side: 'lena_side', back: 'lena_back', walk1: 'lena_walk1', walk2: 'lena_walk2', atk1: 'lena_atk1', atk2: 'lena_atk2', sk1: 'lena_sk1', sk2: 'lena_sk2', wf1: 'lena_wf1', wf2: 'lena_wf2', wf3: 'lena_wf3', wf4: 'lena_wf4', wb1: 'lena_wb1', wb2: 'lena_wb2', wb3: 'lena_wb3', wb4: 'lena_wb4', ws1: 'lena_ws1', ws2: 'lena_ws2', ws3: 'lena_ws3' },
  vera: { idle: 'vera_front', front: 'vera_front', side: 'vera_side', back: 'vera_back', walk1: 'vera_walk1', walk2: 'vera_walk2', atk1: 'vera_atk1', atk2: 'vera_atk2', sk1: 'vera_sk1', sk2: 'vera_sk2', wf1: 'vera_wf1', wf2: 'vera_wf2', wf3: 'vera_wf3', wf4: 'vera_wf4', wb1: 'vera_wb1', wb2: 'vera_wb2', wb3: 'vera_wb3', wb4: 'vera_wb4', ws1: 'vera_ws1', ws2: 'vera_ws2', ws3: 'vera_ws3', ws4: 'vera_ws4' },
  goblin: 'goblin', wolf: 'wolf', shield: 'shield', bat: 'bat', raider: 'raider',
  archer: { 1: 'archer_1', 2: 'archer_2', 3: 'archer_3' },
  barracks: { 1: 'barracks_1', 2: 'barracks_2', 3: 'barracks_3' },
  mage: { 1: 'mage_1', 2: 'mage_2', 3: 'mage_3' },
  cannon: { 1: 'cannon_1', 2: 'cannon_2', 3: 'cannon_3' },
  erin_portrait: 'erin_portrait', lena_portrait: 'lena_portrait', vera_portrait: 'vera_portrait',
  erin_evo_portrait: 'erin_evo_portrait', lena_evo_portrait: 'lena_evo_portrait', vera_evo_portrait: 'vera_evo_portrait',   // 進化插畫裁切（含背景）
  arsonist: 'arsonist', sapper: 'sapper',
  castle: 'castle', farm: 'farm', lumber: 'lumber', quarry: 'quarry', house: 'house', granary: 'granary', depot: 'depot',
  wagon: 'wagon',   // 正式圖馬頭朝左
  villager: { idle: 'villager_farmer', farm: 'villager_farmer', lumber: 'villager_lumber', quarry: 'villager_mason', carry: 'villager_carrier' },
  soldier: { idle: 'soldier_idle', attack: 'soldier_attack', knight: 'soldier_knight' },
  tree: { pine: 'deco_pine', oak: 'deco_oak', bush: 'deco_bush', rock: 'deco_rock' },
  pad: 'pad',
  icon_wood: 'icon_wood', icon_stone: 'icon_stone', icon_food: 'icon_food', icon_front: 'icon_front', icon_pop: 'icon_pop',
  boss: 'boss',
  // 分支防禦塔（第 4 級，tools/extract_branches.py 從防禦塔圖第 5、6 欄裁出）
  tower_ranger: 'tower_ranger', tower_musket: 'tower_musket', tower_templar: 'tower_templar', tower_berserker: 'tower_berserker',
  tower_arcane: 'tower_arcane', tower_necro: 'tower_necro', tower_catapult: 'tower_catapult', tower_tesla: 'tower_tesla',
  // 尚無正式圖（使用暫代圖）：icon_heart（城堡血量圖示）、skeleton（死靈塔骷髏兵）
};
// 進化英雄素材：assets/{id}_evo_{front,side,back}（站姿，tools/extract_evo.py）＋ {wf1-4,wb1-4,ws1-4,walk1,walk2,atk1,atk2,sk1,sk2}（動作影格，tools/extract_evo_frames.py）
// 特效 {id}_evo_fx_{影格}。缺的影格在 art_manifest 裡就沒有 → 走路循環自動略過（例：蕾娜側面只有 3 格）
const EVO_FRAMES = ['front', 'side', 'back', 'walk1', 'walk2', 'atk1', 'atk2', 'sk1', 'sk2', 'wf1', 'wf2', 'wf3', 'wf4', 'wb1', 'wb2', 'wb3', 'wb4', 'ws1', 'ws2', 'ws3', 'ws4'];
for (const id of ['erin', 'lena', 'vera']) {
  const o = { idle: `${id}_evo_front` }; for (const f of EVO_FRAMES) o[f] = `${id}_evo_${f}`;
  SPRITE_OVERRIDES[id + '_evo'] = o;
}

// 正式美術載入器
const Art = {
  img: {}, white: {}, meta: {}, loaded: 0, failed: [], total: 0, onReady: null,
  done() { if (this.loaded + this.failed.length === this.total && this.onReady) this.onReady(); },
  init() {
    if (typeof ART_MANIFEST === 'undefined') return;
    for (const k in ART_MANIFEST) {
      const m = ART_MANIFEST[k], im = new Image();
      this.total++;
      im.onload = () => {
        this.img[k] = im; this.meta[k] = m; this.loaded++;
        if (!k.endsWith('_portrait')) this.white[k] = Sprites.makeWhite(im);
        this.done();
      };
      im.onerror = () => { this.failed.push(m.src); this.done(); };
      im.src = m.src;
    }
  },
  // 依遊戲 key + 變體找到已載入的正式圖 key
  resolve(key, variant) {
    const o = SPRITE_OVERRIDES[key];
    if (!o) return null;
    const k = typeof o === 'string' ? o : (o[variant] || o.idle || o[1]);
    return this.img[k] ? k : null;
  },
};

const PAL = {
  k: '#1a1c2c', w: '#f4f4f4', s: '#f2c9a0', p: '#fff0e6', g: '#38b764', G: '#257179', l: '#a7f070',
  y: '#ffcd75', o: '#ef7d57', r: '#b13e53', R: '#5d275d', b: '#41a6f6', B: '#3b5dc9', c: '#73eff7',
  n: '#8b5a2b', N: '#5a3a1e', e: '#94b0c2', E: '#566c86', m: '#333c57', u: '#7b4fa0', U: '#c58cf2',
  f: '#ffd84a', F: '#ff7a00', W: '#e8c48a',
};

const ART = {
  goblin: [
    '................', '................', '..k..........k..', '..kgk.kkkk.kgk..', '...kggggggggk...', '....kgyggygk....',
    '....kggggggk....', '....kgkkkkgk....', '.....kggggk.....', '....knnnnnnk.e..', '...kgnnnnnngke..', '...kgnnNNnngk...',
    '.....nnnnnn.....', '.....kn..nk.....', '.....kN..Nk.....', '....kkk..kkk....'],
  wolf: [
    '................', '......k..k......', '.....kgkkgk.....', '.....kgyygk.....', '......kggk......', '.....knnnnk.....',
    '..k.kmEEEEmk....', '.kEkEEEEEEEEk...', 'kEwEEEEEEEEEEk..', 'kEEEEEEEEEEEEEk.', '.kkEEEEEEEEEEk.k', '...kEEkkkkEEk.kE',
    '...kEk....kEk...', '...kEk....kEk...', '..kkk....kkk....', '................'],
  shield: [
    '................', '.....kkkkkk.....', '....kEeeeeEk....', '..k.kEEEEEEk.k..', '..kgkggggggkgk..', '....kgyggygk....',
    '....kggggggk....', '...kkkgkkgk.....', '..keeekgggk.....', '.keEEEeknnnnk...', '.keEyEeknnnnk...', '.keEEEeknnnnk...',
    '.keEEEekNnnk....', '..keeek.kn.nk...', '...kkk..kN.Nk...', '.........kk.kk..'],
  bat: [
    '................', '................', '................', '................', 'k.....k..k.....k', 'kk....kkkk....kk',
    'kuk..kuuuuk..kuk', 'kuuk.kruurk.kuuk', 'kuuukuuuuuukuuuk', 'kuuuuuuuuuuuuuuk', '.kuuuukuukuuuuk.', '..kuuk.kk.kuuk..',
    '...kk......kk...', '................', '................', '................'],
  raider: [
    '................', '.....kkkkkk.....', '....kRRRRRRk....', '...kRRggggRRk...', '...kRgrggrgRk...', '....kggggggk....',
    '.....kkkkkk.....', '....krrrrrrk.nn.', '...kgrNNNNrgknnn', '...kgNNNNNNgknnn', '.....NNNNNN..nn.', '.....kNNNNk.....',
    '.....kN..Nk.....', '.....kN..Nk.....', '....kkk..kkk....', '................'],
  soldier: [
    '...........e....', '.....kkkk..e....', '....keeeek.e....', '....kesske.e....', '....kssssk.e....', '.....kkkk..e....',
    '....kBBBBk.s....', '...ksBwwBsks....', '...ksBwwBk.n....', '....kBBBBk.n....', '....kEEEEk.n....', '....kE..Ek......',
    '....kE..Ek......', '...kkk..kkk.....', '................', '................'],
  villager: [
    '................', '................', '.....kkkkk......', '....kyyyyyk.....', '...kyyyyyyyk....', '.....kssssk.....',
    '.....kskskk.....', '.....kssssk.....', '......kkkk......', '.....knnnnk.....', '....ksnnnnsk....', '.....knnnnk.....',
    '.....kN..Nk.....', '.....kN..Nk.....', '....kkk..kkk....', '................'],
  erin: [
    '................', '......kkkk......', '.....kyyyyk.....', '....kyppppyk..n.', '....kypkpkyk..nk', '...kyypppyyk..n.',
    '...ky.kppk.yk.n.', '..kG.kgggpk.knnn', '..kGkpppppppk.n.', '..kGkkgggggk..n.', '..kG.kppppk...n.', '...k.kgllgk.....',
    '.....kpppk......', '.....kp.pk......', '.....kp.pk......', '....kgp.pgk.....'],
  lena: [
    '................', '......kkkk......', '.....kyyyyk.....', '....kysssyyk....', '....kyskskyk....', '...kyysssyyk.e..',
    '..kee.kssk.eke..', '.keEeksssssseke.', '.kEyEkeesseekw..', '.keEek.ssss.kw..', '..kek.kwwwwk....', '.....kwwwwk.....',
    '.....keEEek.....', '.....ks..sk.....', '.....ke..ek.....', '....kkk..kkk....'],
  vera: [
    '......kkk.......', '.....kuuuk....c.', '....kuuuuuk..kck', '..kkuuuuuuukk.n.', '....kUUUUUk...n.', '....kUskskU...n.',
    '...kBUssssUBk.n.', '..kBBkbssbkBBkn.', '..kBksbbbbsskBn.', '..kB.kssssk.Bkn.', '..kB.kbbbbk.Bkn.', '..kBBkssssk.BBn.',
    '.....kssssk...n.', '.....ks..sk.....', '.....ks..sk.....', '....kkk..kkk....'],
  farm: [
    '................', '.kkkkkkkkkkkkkk.', '.kNnNnNnNnNnNnk.', '.kylylylylylylk.', '.kgygygygygygyk.', '.kNnNnNnNnNnNnk.',
    '.kylylylylylylk.', '.kgygygygygygyk.', '.kNnNnNnNnNnNnk.', '.kylylylylylylk.', '.kgygygygygygyk.', '.kNnNnNnNnNnNnk.',
    '.kkkkkkkkkkkkkk.', '..n..........n..', '................', '................'],
  lumber: [
    '................', '......kk........', '.....kGGk.......', '....kGgGGk......', '...kGgggGGk.....', '..kGggggggGk....',
    '...kkGGGGkk.....', '.....knNk.......', '.....knNk..e....', '..kkkkkkkkeEk...', '.knnyknnykNk....', '.kNnnkNnnkNk....',
    '.knnyknnyknnyk..', '.kNnnkNnnkNnnk..', '..kkkkkkkkkkk...', '................'],
  quarry: [
    '................', '................', '......kkkk......', '....kkeeeEkk....', '...keeeeeeEEk...', '..keewweeeeEEk..',
    '..keeeeeeEEEEk..', '.kEeeeeEEEEmmEk.', '.kEEeeEEmmmmEEk.', '.kEEEEEEEEEEEEk.', '..kkkkkkkkkkkk..', '.....kee...ke...',
    '....keEEk.keEk..', '....kkkkk.kkkk..', '................', '................'],
  house: [
    '................', '.......kk.......', '......krrk......', '.....krrrrk.....', '....krrrrrrk....', '...krrRrrRrrk...',
    '..krrrrrrrrrrk..', '.kkkkkkkkkkkkkk.', '..kWWWWWWWWWWk..', '..kWWkkWWWWWWk..', '..kWkfkWWkkkWk..', '..kWkkkWWknkWk..',
    '..kWWWWWWknkWk..', '..kWWWWWWknkWk..', '..kkkkkkkkkkkk..', '................'],
  granary: [
    '................', '......kkkk......', '....kkrrrrkk....', '...krrrrrrrrk...', '..krrrRRRRrrrk..', '.krrrRkkkkRrrrk.',
    '.kkkkkkkkkkkkkk.', '.kWWWWWWWWWWWWk.', '.kWnnnnnnnnnnWk.', '.kWnkkkkkkkknWk.', '.kWnkyyknyyknWk.', '.kWnkyyknyyknWk.',
    '.kWnkkkkkkkknWk.', '.kWnnnnnnnnnnWk.', '.kkkkkkkkkkkkkk.', '................'],
  depot: [
    '...k............', '...krr..........', '...krrr.........', '...k............', '...k..kk........', '...k.kWWk.......',
    '...kkWWWWk......', '...kWWnWWWk.....', '..kWWnnnWWWk....', '.kWWnnNnnWWWk...', 'kWWWnNNNnWWWWk..', 'kkkkkkkkkkkkkkk.',
    '..kyyk.kyyk.....', '.kyyyykyyyyk....', '.kkkkkkkkkkk....', '................'],
  wagon: [
    '................', '....kkkkkk......', '...kyyyyyyk.....', '..kyyyyyyyyk....', '.kkkkkkkkkkkk.k.', '.knnnnnnnnnnkkn.',
    '.kNnnnnnnnnNk.n.', '.kkkkkkkkkkkk.n.', '..kmk....kmk....', '.kmEmk..kmEmk...', '..kmk....kmk....', '................'],
  archer: [
    '................', '.......kk.......', '......kggk......', '.....kgggGk.....', '....kgggggGk....', '...kgggggggGk...',
    '..kkkkkkkkkkkk..', '...knnnnnnnnk...', '...knkkkkkknk...', '...knkfffFknk...', '...knkkkkkknk...', '...kNnnnnnnNk...',
    '...knNnnnnNnk...', '...knnNnnNnnk...', '...knnnNNnnnk...', '...knnNnnNnnk...', '...knNnnnnNnk...', '..kNnnnnnnnnNk..',
    '..kkkkkkkkkkkk..', '................'],
  mage: [
    '.......cc.......', '......kcck......', '.......kk.......', '......kuuk......', '.....kuUuuk.....', '....kuuUuuuk....',
    '...kuuuUuuuuk...', '..kkkkkkkkkkkk..', '...keeeeeeeek...', '...keekcckeek...', '...keekcckeek...', '...keeekkeeek...',
    '...kEeeeeeeEk...', '...keEeeeeEek...', '...keeEeeEeek...', '...keeeEEeeek...', '...kEeeeeeeEk...', '..kEEEEEEEEEEk..',
    '..kkkkkkkkkkkk..', '................'],
  cannon: [
    '................', '................', '................', '................', '........kkkk....', '.......kmmmmk...',
    '......kmmmmmmk..', '.....kmmmkkmk...', '..k.kkkmmkk.k...', '..kekekekekek...', '..keeeeeeeeek...', '..kEeeeeeeeEk...',
    '..keEeeeeeEek...', '..keeeeeeeeek...', '..kEeeeeeeeEk...', '..keeEeeeEeek...', '..keeeeeeeeek...', '.kEEEEEEEEEEEk..',
    '.kkkkkkkkkkkkk..', '................'],
  barracks: [
    '..........k.....', '..........kBBB..', '..........kBB...', '..........k.....', '......kkkkkk....', '.....kBBBBBBk...',
    '....kBBBBBBBBk..', '...kBBBBBBBBBBk.', '..kkkkkkkkkkkkkk', '...knnnnnnnnnnk.', '...knNnnnnnnNnk.', '...knnkkkkkknnk.',
    '...knnkNNNNknnk.', '...knnkNNNNknnk.', '...kNnkNNNNknNk.', '...knnkNNNNknnk.', '...knnkNNNNknnk.', '..kNNNNNNNNNNNNk',
    '..kkkkkkkkkkkkkk', '................'],
  castle: [
    '........................', '..k.k.k..........k.k.k..', '..kekek...kBk....kekek..', '..keeek...kBBk...keeek..',
    '..kEeek...k......kEeek..', '..keeek.k.k.k.k..keeek..', '..keeekkekekekek.keeek..', '..kEeekeeeeeeeeekkEeek..',
    '..keeekeEeeeeeEeekeeek..', '..keeekeeekkkeeeekeeek..', '..kEeekeeekfkeeeekEeek..', '..keeekeeekkkeeeekeeek..',
    '..keeekeEeeeeeEeekeeek..', '..kEeekeeeeeeeeeekEeek..', '..keeekeeekkkkeeekeeek..', '..keeekeekNNNNkeekeeek..',
    '..kEeekeekNNNNkeekEeek..', '..keeekeekNNNNkeekeeek..', '..keeekeekNNNNkeekeeek..', '.kEEEEEEEEEEEEEEEEEEEEk.',
    '.kkkkkkkkkkkkkkkkkkkkkk.', '........................'],
  tree: [
    '.....kk.....', '....kgGk....', '...kggGGk...', '..kgggggGk..', '...kggGGk...', '..kgggggGk..', '.kgggggggGk.',
    '..kggggGGk..', '.kgggggggGk.', 'kgggggggggGk', '.kkkkkkkkkk.', '.....nn.....', '.....nN.....', '....kkkk....'],
  icon_wood:  ['........', '.kkkkkk.', 'knynnynk', 'kNnnNnnk', 'knynnynk', 'kNnnNnnk', '.kkkkkk.', '........'],
  icon_stone: ['........', '..kkkk..', '.keewek.', 'keeeeEEk', 'kEeeEEEk', 'kEEEEEmk', '.kkkkkk.', '........'],
  icon_food:  ['...kk...', '..kyyk..', '.kyfyyk.', '.kyyfyk.', '.kyfyyk.', '..kyyk..', '...nn...', '...n....'],
  icon_front: ['.kkkkk..', 'kyyyyyk.', 'kkkkkkkk', 'knnnnnnk', 'kNnnnnNk', 'kkkkkkkk', '.km..km.', '........'],
  icon_pop:   ['...kk...', '..kssk..', '..kssk..', '...kk...', '.knnnnk.', 'ksnnnnsk', '..kNNk..', '..k..k..'],
  skeleton: [
    '................', '.....kkkk.......', '....kwwwwk......', '....kwkwkw......', '....kwwwwk......', '.....kwkk....e..',
    '...kk.ww.kk..e..', '..kw.kwwk.wk.e..', '..k.kwkwwk.kke..', '....kwwwwk..k...', '.....kwwk.......', '....kw..wk......',
    '....kw..wk......', '...kw....wk.....', '...kk....kk.....', '................'],
  icon_heart: ['........', '.kk.kk..', 'krrkrrk.', 'krrrrrrk', 'krrrrrrk', '.krrrrk.', '..krrk..', '...kk...'],
};

const Sprites = {
  img: {}, white: {},
  fromArt(rows) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    rows.forEach((row, j) => {
      for (let i = 0; i < w; i++) {
        const ch = row[i] || '.';
        if (ch !== '.' && PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, j, 1, 1); }
      }
    });
    return c;
  },
  makeWhite(src) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    return c;
  },
  init() {
    for (const k in ART) { this.img[k] = this.fromArt(ART[k]); this.white[k] = this.makeWhite(this.img[k]); }
    Art.init();
  },
};

// 以「腳底」為錨點畫素材。有正式圖時用正式圖（忽略 scale，用美術原尺寸；fitH 可限制最大高度），否則用暫代圖。
function drawSprite(ctx, key, x, y, scale = 1, flip = false, white = false, variant = null, fitH = 0, fitW = 0) {
  const ak = Art.resolve(key, variant);
  if (ak) {
    const m = Art.meta[ak];
    let s = ART_DRAW_SCALE;
    if (fitH && m.h * s > fitH) s = fitH / m.h;
    if (fitW && m.w * s > fitW) s = fitW / m.w;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(Art.img[ak], -m.ax * s, -m.ay * s, m.w * s, m.h * s);
    if (white && Art.white[ak]) { ctx.globalAlpha = 0.55; ctx.drawImage(Art.white[ak], -m.ax * s, -m.ay * s, m.w * s, m.h * s); }   // 受擊閃白（半透明）
    ctx.restore();
    return;
  }
  const im = (white ? Sprites.white : Sprites.img)[key];
  if (!im) return;
  const w = im.width * scale, h = im.height * scale;
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, Math.round(y - h), w, h); ctx.restore();
  } else ctx.drawImage(im, Math.round(x - w / 2), Math.round(y - h), w, h);
}
// 該素材實際畫出來的高度（用來擺血條）
function spriteHeight(key, scale = 1, variant = null) {
  const ak = Art.resolve(key, variant);
  if (ak) return Art.meta[ak].h * ART_DRAW_SCALE;
  const im = Sprites.img[key]; return im ? im.height * scale : 16;
}
