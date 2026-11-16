// ============================================================
// peace-strike-3d · 配置数据层（武器 / 地图 / 模式 / 关卡）
// ============================================================

// ---------- 武器（12 把） ----------
// dmg 单发伤害; rpm 射速; mag 弹匣; reload 换弹秒; spread 腰射散布; adsSpread 开镜散布
export const WEAPONS = {
  m416:   { name:'M416',   cls:'步枪',   dmg:26, rpm:700, mag:30, reload:2.1, spread:0.018, adsSpread:0.005, range:130, zoom:1.6, auto:true,  ammo:'5.56', recoil:1.0 },
  akm:    { name:'AKM',    cls:'步枪',   dmg:34, rpm:600, mag:30, reload:2.4, spread:0.026, adsSpread:0.009, range:110, zoom:1.5, auto:true,  ammo:'7.62', recoil:1.5 },
  scarl:  { name:'SCAR-L', cls:'步枪',   dmg:28, rpm:640, mag:30, reload:2.2, spread:0.020, adsSpread:0.006, range:120, zoom:1.5, auto:true,  ammo:'5.56', recoil:1.1 },
  ump45:  { name:'UMP45',  cls:'冲锋枪', dmg:20, rpm:670, mag:25, reload:2.0, spread:0.022, adsSpread:0.008, range:70,  zoom:1.4, auto:true,  ammo:'.45',  recoil:0.8 },
  vector: { name:'Vector', cls:'冲锋枪', dmg:18, rpm:1100,mag:19, reload:2.0, spread:0.020, adsSpread:0.007, range:60,  zoom:1.4, auto:true,  ammo:'.45',  recoil:0.7 },
  m249:   { name:'M249',   cls:'轻机枪', dmg:30, rpm:800, mag:100,reload:5.2, spread:0.035, adsSpread:0.014, range:120, zoom:1.3, auto:true,  ammo:'5.56', recoil:1.6 },
  mini14: { name:'Mini14', cls:'连狙',   dmg:46, rpm:320, mag:20, reload:2.6, spread:0.014, adsSpread:0.003, range:220, zoom:3.0, auto:false, ammo:'5.56', recoil:1.2 },
  m24:    { name:'M24',    cls:'狙击枪', dmg:95, rpm:60,  mag:5,  reload:3.4, spread:0.012, adsSpread:0.001, range:300, zoom:4.5, auto:false, ammo:'7.62', recoil:2.5, bolt:true },
  awm:    { name:'AWM',    cls:'狙击枪', dmg:130,rpm:50,  mag:5,  reload:4.0, spread:0.012, adsSpread:0.0005,range:350, zoom:5.0, auto:false, ammo:'.300', recoil:3.0, bolt:true },
  s686:   { name:'S686',   cls:'霰弹枪', dmg:13, rpm:200, mag:2,  reload:2.8, spread:0.05,  adsSpread:0.035, range:25,  zoom:1.2, auto:false, ammo:'12号', recoil:2.0, pellets:9 },
  p1911:  { name:'P1911',  cls:'手枪',   dmg:24, rpm:420, mag:7,  reload:1.6, spread:0.025, adsSpread:0.010, range:45,  zoom:1.3, auto:false, ammo:'.45',  recoil:0.9 },
  vss:    { name:'VSS',    cls:'特种枪', dmg:34, rpm:700, mag:10, reload:2.3, spread:0.016, adsSpread:0.004, range:150, zoom:2.5, auto:true,  ammo:'9mm',  recoil:0.9 },
};

// ---------- 地图（12 张，程序化生成，seed 固定保证一致） ----------
export const MAPS = [
  { id:'training',  name:'训练基地',   sky:0x87b7e8, ground:0x5e7d4a, fog:0x9fc4e8, wall:0x8a8f96, crate:0xa8743a, size:160, buildings:10, crates:26, night:false },
  { id:'warehouse', name:'军事仓库',   sky:0x6f87a8, ground:0x565d63, fog:0x7c93ad, wall:0x6d7480, crate:0x8f6b34, size:140, buildings:14, crates:40, night:false },
  { id:'desert',    name:'沙漠小镇',   sky:0xf2cf8e, ground:0xd6b070, fog:0xecd19a, wall:0xc9a15e, crate:0x9c7038, size:180, buildings:16, crates:22, night:false },
  { id:'snowpost',  name:'雪山哨站',   sky:0xcfe4f5, ground:0xe8eef2, fog:0xdfeaf2, wall:0x9aa7b0, crate:0x7d5c33, size:160, buildings:12, crates:24, night:false },
  { id:'port',      name:'港口集装箱', sky:0x8fb6d8, ground:0x7d8890, fog:0x9dbdd6, wall:0x4f8fa8, crate:0xc9583a, size:150, buildings:0,  crates:56, night:false, containers:true },
  { id:'city',      name:'都市巷战',   sky:0x93a8b8, ground:0x606870, fog:0xa8b6c2, wall:0x8f949c, crate:0x9a5a30, size:190, buildings:22, crates:18, night:false },
  { id:'jungle',    name:'雨林遗迹',   sky:0x9fd6a8, ground:0x3f7a3a, fog:0xaeddb2, wall:0x7a6a50, crate:0x6d4f2c, size:170, buildings:9,  crates:20, night:false },
  { id:'factory',   name:'废弃工厂',   sky:0x8a8a90, ground:0x4a4a50, fog:0x8d8d94, wall:0x5a5e66, crate:0x8a6a2c, size:150, buildings:13, crates:34, night:false },
  { id:'canyon',    name:'峡谷要塞',   sky:0xe8a06a, ground:0xb56a3a, fog:0xdfa878, wall:0xa86238, crate:0x7c5428, size:170, buildings:11, crates:20, night:false },
  { id:'nightair',  name:'夜晚机场',   sky:0x0a1428, ground:0x2c3038, fog:0x101c30, wall:0x3a4048, crate:0x6d5228, size:200, buildings:12, crates:26, night:true },
  { id:'island',    name:'海岛渔村',   sky:0x7fc4ee, ground:0xd8c48e, fog:0xa8d8ec, wall:0xb8d8e0, crate:0x8a6a3a, size:160, buildings:14, crates:18, night:false },
  { id:'lava',      name:'熔岩矿场',   sky:0x3a1a14, ground:0x4a2820, fog:0x55241a, wall:0x5a3a30, crate:0x8a4a20, size:150, buildings:10, crates:30, night:true, lava:true },
];

// ---------- 关卡（关卡模式 10 关） ----------
export const LEVELS = [
  { lv:1,  map:'training',  bots:4,  strength:0.5 },
  { lv:2,  map:'training',  bots:6,  strength:0.6 },
  { lv:3,  map:'warehouse', bots:7,  strength:0.7 },
  { lv:4,  map:'desert',    bots:8,  strength:0.8 },
  { lv:5,  map:'snowpost',  bots:9,  strength:0.9 },
  { lv:6,  map:'port',      bots:10, strength:1.0 },
  { lv:7,  map:'city',      bots:11, strength:1.1 },
  { lv:8,  map:'factory',   bots:12, strength:1.2 },
  { lv:9,  map:'canyon',    bots:13, strength:1.35 },
  { lv:10, map:'nightair',  bots:15, strength:1.5 },
];

// ---------- 模式 ----------
export const MODES = {
  level:  { id:'level',  name:'关卡模式', desc:'10 个关卡逐步解锁，越打越强' },
  free:   { id:'free',   name:'自由模式', desc:'自定义敌人数量 / 强度 / 灵敏度' },
  endless:{ id:'endless',name:'无尽模式', desc:'一波接一波，看你能撑多久' },
  multi:  { id:'multi',  name:'多人联机', desc:'点对点开黑，房主建房拉人' },
};

// ---------- 默认设置 ----------
export const DEFAULT_SETTINGS = {
  sensX: 1.0, sensY: 1.0, sensAds: 0.8,   // 灵敏度
  fov: 75,
  quality: 'high',                         // low / mid / high
  volume: 0.8,
  layout: null,                            // 自定义键位（触屏）
};

// ---------- 预置账号（服务端 bootstrap 同步创建） ----------
export const PRESET_ACCOUNT = { username: 'kaobei', password: 'kaobei-games', skin: 'hero' };

// 注册限制方式：邀请码。可在 worker 部署后用 wrangler secret 修改，
// 默认邀请码（服务端 bootstrap 时写入 D1）：
export const DEFAULT_INVITE_CODES = ['PEACE2026', 'KB-INV-2026'];

export const MAP_BY_ID = Object.fromEntries(MAPS.map(m => [m.id, m]));

// ---------- 后端 API 基址 ----------
// 部署在 GitHub Pages（静态托管）时，自动改用 Cloudflare Pages 的后端；
// 部署在 Cloudflare Pages 时为同源（空字符串）。
export const API_BASE = location.hostname.includes('github.io')
  ? 'https://kaobei-games-3d.pages.dev'
  : '';

// ============================================================
// 商城 / 皮肤 / 解锁体系
// ============================================================

// 武器解锁价格（金币）。0 = 出厂自带
export const UNLOCK_COST = {
  m416:0, ump45:0, p1911:0,
  scarl:400, s686:500, vector:600, akm:700, mini14:800, vss:900,
  m249:1200, m24:1500, awm:2500,
};

// 角色皮肤（body 颜色，hero 仅 kaobei）
export const CHAR_SKINS = {
  classic:{ name:'经典特训', price:0,    body:0x3a4a66, hero:false },
  navy:   { name:'深海劲旅', price:800,  body:0x2b4a8a, hero:false },
  scarlet:{ name:'猩红突击', price:1200, body:0x8a2f2f, hero:false },
  snow:   { name:'雪地幽灵', price:1500, body:0xcfd8de, hero:false },
  neon:   { name:'霓虹猎手', price:2000, body:0x1fb8a8, hero:false },
  gold:   { name:'鎏金战神·我', price:0, body:0xffc84d, hero:true },
};

// 肤色（影响第一人称手臂 / 角色头像 / 角色模型）
export const SKIN_TONES = {
  fair:  { name:'白皙', color:'#f2cfae' },
  yellow:{ name:'自然', color:'#e0b088' },
  wheat: { name:'小麦', color:'#c98d5e' },
  bronze:{ name:'古铜', color:'#8d5a3b' },
};

// 武器皮肤（替换枪身颜色，emissive 自发光）
export const WEAPON_SKINS = {
  none:   { name:'默认涂装', price:0,    color:0x1e2228, emissive:0x000000 },
  carbon: { name:'碳纤维',   price:400,  color:0x2b2b30, emissive:0x000000 },
  camo:   { name:'丛林迷彩', price:500,  color:0x4a5d3a, emissive:0x000000 },
  gold:   { name:'鎏金龙纹', price:600,  color:0xc9a13b, emissive:0x523c00 },
  neon:   { name:'霓虹脉冲', price:800,  color:0x101820, emissive:0x1899cc },
  lava:   { name:'熔岩 core',price:1000, color:0x3a1408, emissive:0xa83214 },
};

// 药物皮肤（急救包外观）
export const MED_SKINS = {
  classic: { name:'经典急救包', price:0,   color:0xd94a3a },
  military:{ name:'军规绿包',   price:300, color:0x3f7a3f },
  gold:    { name:'黄金药箱',   price:500, color:0xd8a832 },
};

// 饮料皮肤（能量饮料外观）
export const DRINK_SKINS = {
  classic:{ name:'经典饮料', price:0,   color:0xff8c2a },
  cola:   { name:'快乐碳酸', price:200, color:0x7a3a1a },
  gold:   { name:'金色补剂', price:500, color:0xe8b83a },
};

// 投掷物皮肤（统一外观主题）
export const THROWABLE_SKINS = {
  classic:{ name:'标准军规', price:0,   frag:0x3a5a2f, smoke:0x6a6a6a, flash:0x9aa0a8, molotov:0xb85a1a },
  camo:   { name:'丛林迷彩', price:300, frag:0x4a5d2a, smoke:0x5a6a4a, flash:0x8a9a7a, molotov:0xa86a2a },
  neon:   { name:'霓虹风暴', price:600, frag:0x18c8e8, smoke:0x48c8d8, flash:0xd8f8ff, molotov:0x28e8b8 },
  gold:   { name:'鎏金荣耀', price:900, frag:0xd8a832, smoke:0xc8b878, flash:0xf8e8b8, molotov:0xe8982a },
};

// 投掷物
export const THROWABLES = {
  frag:    { name:'破片手雷', dmg:95,  radius:7,   fuse:2.6, count:2 },
  smoke:   { name:'烟雾弹',   radius:5,  dur:11, count:1 },
  flash:   { name:'闪光弹',   radius:14, dur:2.2, count:1 },
  molotov: { name:'燃烧瓶',   radius:3.5, dur:7, dps:14, count:1 },
};

// 军需补给箱（400 金币/抽）随机池
export const CRATE_POOL = [
  { kind:'weaponSkin', id:'carbon', w:20 },
  { kind:'weaponSkin', id:'camo',   w:18 },
  { kind:'weaponSkin', id:'gold',   w:8  },
  { kind:'weaponSkin', id:'neon',   w:5  },
  { kind:'weaponSkin', id:'lava',   w:3  },
  { kind:'charSkin',   id:'navy',   w:10 },
  { kind:'charSkin',   id:'scarlet',w:6  },
  { kind:'charSkin',   id:'snow',   w:4  },
  { kind:'charSkin',   id:'neon',   w:3  },
  { kind:'medSkin',    id:'military',w:10 },
  { kind:'medSkin',    id:'gold',   w:4  },
  { kind:'drinkSkin',  id:'cola',   w:10 },
  { kind:'drinkSkin',  id:'gold',   w:4  },
  { kind:'throwableSkin', id:'camo',w:10 },
  { kind:'throwableSkin', id:'neon',w:4  },
  { kind:'throwableSkin', id:'gold',w:3  },
];
export const CRATE_PRICE = 400;

// 通行证：每 300 XP 一级，每级可领 150 金币
export const PASS_XP_PER_LEVEL = 300;
export const PASS_REWARD = 150;

// 金币奖励
export const REWARDS = { kill:12, win:100, lose:25, wave:20 };

