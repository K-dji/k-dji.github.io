// ============================================================
// peace-strike-3d · 主流程（登录 → 创建角色 → 大厅 → 战斗 / 联机）
// ============================================================
import {
  MODES, MAPS, MAP_BY_ID, LEVELS, WEAPONS, DEFAULT_SETTINGS,
  UNLOCK_COST, CHAR_SKINS, SKIN_TONES, WEAPON_SKINS, MED_SKINS, DRINK_SKINS,
  THROWABLE_SKINS, THROWABLES, CRATE_POOL, PASS_XP_PER_LEVEL, PASS_REWARD, REWARDS,
} from './config.js';
import { Game } from './game.js';
import { AIManager } from './ai.js';
import { RoomClient, PresencePoll } from './net.js';
import { isTouch, TouchControls, suppressTouchFeedback } from './touch.js';

const $=id=>document.getElementById(id);
const show=id=>{ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); };
const modal=(id,on)=>$(id).classList.toggle('on',!!on);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// ---------- 全局状态 ----------
const state={
  token: localStorage.getItem('pe3d_token')||'',
  user: JSON.parse(localStorage.getItem('pe3d_user')||'null'),
  settings: {...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('pe3d_settings')||'{}')},
  prefs: JSON.parse(localStorage.getItem('pe3d_prefs')||'{}'),
  owned: [],                      // [{kind,id}]
  mode: 'level', mapIndex: 0,
  unlocked: 1, endlessBest: 0, totalKills: 0, xp: 0,
  game: null, ai: null, net: null, touch: null, presence: null, onlineList: [],
};
try{ const pr=JSON.parse(localStorage.getItem('pe3d_progress')||'{}');
  state.unlocked=pr.unlocked||1; state.endlessBest=pr.endlessBest||0; state.totalKills=pr.totalKills||0; state.xp=pr.xp||0; }catch(e){}

// 免费武器
function ownedWeapons(){
  const set=new Set(['m416','ump45','p1911']);
  for(const o of state.owned) if(o.kind==='weapon') set.add(o.id);
  return set;
}
function ownedIds(kind){
  const set=new Set();
  for(const o of state.owned) if(o.kind===kind) set.add(o.id);
  return set;
}
function passLevel(){ return Math.floor(state.xp/PASS_XP_PER_LEVEL)+1; }

// ---------- API（游客模式本地降级） ----------
async function api(path, body, method){
  if(state.guest){
    if(path==='/leaderboard') return {list:[]};
    if(path.startsWith('/store')) throw new Error('游客模式无法购买，注册账号即可保存进度');
    if(path==='/auth/me'||path==='/auth/login'||path==='/auth/register') throw new Error('游客模式');
    return {ok:true, coins:state.user?.coins??1200, user:state.user, owned:[], added:0};
  }
  const res=await fetch(API_BASE+'/api'+path,{
    method: method|| (body?'POST':'GET'),
    headers:{'Content-Type':'application/json', ...(state.token?{'Authorization':'Bearer '+state.token}:{})},
    body: body? JSON.stringify(body): undefined
  });
  const data=await res.json().catch(()=>({error:'网络错误'}));
  if(!res.ok) throw new Error(data.error||'请求失败');
  return data;
}
async function apiWithTimeout(path, ms=4000){
  return Promise.race([
    api(path),
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')), ms))
  ]);
}
async function savePrefs(){
  localStorage.setItem('pe3d_prefs', JSON.stringify(state.prefs));
  try{ await api('/prefs', state.prefs); }catch(e){}
}

// ============================================================
// 登录 / 注册
// ============================================================
function initAuth(){
  document.querySelectorAll('#auth-tabs .tab').forEach(tab=>{
    tab.onclick=()=>{
      document.querySelectorAll('#auth-tabs .tab').forEach(t=>t.classList.remove('on'));
      tab.classList.add('on');
      $('form-login').classList.toggle('on',tab.dataset.tab==='login');
      $('form-register').classList.toggle('on',tab.dataset.tab==='register');
    };
  });
  $('btn-guest').onclick=()=>{
    state.guest=true; sessionStorage.setItem('pe3d_guest','1');
    state.user={username:'游客'+Math.floor(1000+Math.random()*9000), skin:'default', coins:1200};
    state.prefs=JSON.parse(localStorage.getItem('pe3d_prefs')||'{}');
    enterLobby();
    if(!state.prefs.gender) openCreator(true);
  };
  $('btn-login').onclick=async()=>{
    try{
      const data=await api('/auth/login',{username:$('login-user').value.trim(),password:$('login-pass').value});
      afterLogin(data);
    }catch(e){ $('auth-msg').textContent=e.message; }
  };
  $('btn-register').onclick=async()=>{
    const u=$('reg-user').value.trim(), p=$('reg-pass').value, p2=$('reg-pass2').value, inv=$('reg-invite').value.trim();
    $('auth-msg2').textContent='';
    if(!/^[a-zA-Z0-9_]{3,16}$/.test(u)) return $('auth-msg2').textContent='账号需 3~16 位字母/数字/下划线';
    if(p.length<8) return $('auth-msg2').textContent='密码至少 8 位';
    if(p!==p2) return $('auth-msg2').textContent='两次密码不一致';
    if(!inv) return $('auth-msg2').textContent='注册必须输入邀请码';
    try{
      const data=await api('/auth/register',{username:u,password:p,inviteCode:inv});
      afterLogin(data, true);
    }catch(e){ $('auth-msg2').textContent=e.message; }
  };
}
async function afterLogin(data, isNew=false){
  state.token=data.token; state.user=data.user;
  localStorage.setItem('pe3d_token',data.token);
  localStorage.setItem('pe3d_user',JSON.stringify(data.user));
  try{
    const me=await api('/auth/me');
    state.user=me.user; state.owned=me.owned||[];
    if(me.progress){ Object.assign(state, {unlocked:me.progress.unlocked, endlessBest:me.progress.endlessBest, totalKills:me.progress.totalKills, xp:me.progress.xp||0}); }
    if(Object.keys(me.user.prefs||{}).length) state.prefs=me.user.prefs;
  }catch(e){}
  localStorage.setItem('pe3d_prefs', JSON.stringify(state.prefs));
  saveProgressLocal();
  enterLobby();
  // 新用户 / 未设置形象 → 角色创建
  if(isNew || !state.prefs.gender) openCreator(true);
}

// ============================================================
// 角色形象绘制（大厅展示 / 创建器预览共用）
// ============================================================
function drawChar(cv, prefs){
  const ctx=cv.getContext('2d'); const W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H);
  const tone=(SKIN_TONES[prefs.skinTone]||SKIN_TONES.yellow).color;
  const cs=CHAR_SKINS[prefs.charSkin||'classic']||CHAR_SKINS.classic;
  const body='#'+cs.body.toString(16).padStart(6,'0');
  const female=prefs.gender==='female';
  // 阴影
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(W/2,H-14,44,9,0,0,7); ctx.fill();
  // 腿
  ctx.fillStyle=body; ctx.fillRect(W/2-20,H-100,16,86); ctx.fillRect(W/2+4,H-100,16,86);
  ctx.fillStyle='#1a1f28'; ctx.fillRect(W/2-22,H-24,20,12); ctx.fillRect(W/2+2,H-24,20,12);
  // 躯干
  ctx.fillStyle=body; ctx.fillRect(W/2-26,H-170,52,74);
  ctx.fillStyle='rgba(0,0,0,.25)'; ctx.fillRect(W/2-26,H-170,52,10);
  // 手臂
  ctx.fillStyle=body; ctx.fillRect(W/2-38,H-166,12,60); ctx.fillRect(W/2+26,H-166,12,60);
  ctx.fillStyle=tone; ctx.fillRect(W/2-38,H-110,12,14); ctx.fillRect(W/2+26,H-110,12,14);
  // 手中武器（主武器皮肤色）
  const ws=WEAPON_SKINS[prefs.weaponSkins?.[prefs.loadout?.[0]||'m416']||'none']||WEAPON_SKINS.none;
  ctx.fillStyle='#'+ws.color.toString(16).padStart(6,'0');
  ctx.fillRect(W/2+16,H-128,52,12);
  if(ws.emissive){ ctx.fillStyle=THREEColor(ws.emissive); ctx.fillRect(W/2+40,H-126,22,3); }
  // 头
  ctx.fillStyle=tone; ctx.beginPath(); ctx.arc(W/2,H-192,24,0,7); ctx.fill();
  // 头发（性别差异）
  ctx.fillStyle= female? '#4a2f1e' : '#1c1c1c';
  ctx.beginPath(); ctx.arc(W/2,H-196,24,Math.PI,0); ctx.fill();
  if(female){ ctx.fillRect(W/2-24,H-200,8,52); ctx.fillRect(W/2+16,H-200,8,52); }
  else { ctx.fillRect(W/2-24,H-198,48,10); }
  // 眼睛
  ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(W/2-9,H-190,3,0,7); ctx.arc(W/2+9,H-190,3,0,7); ctx.fill();
  // 专属皮肤：金冠
  if(cs.hero){ ctx.fillStyle='#ffd34d'; ctx.beginPath();
    ctx.moveTo(W/2-22,H-216); ctx.lineTo(W/2-22,H-230); ctx.lineTo(W/2-12,H-222); ctx.lineTo(W/2,H-232);
    ctx.lineTo(W/2+12,H-222); ctx.lineTo(W/2+22,H-230); ctx.lineTo(W/2+22,H-216); ctx.closePath(); ctx.fill(); }
}
function THREEColor(c){ return '#'+c.toString(16).padStart(6,'0'); }

// ============================================================
// 角色创建 / 更换
// ============================================================
function openCreator(first=false){
  const p={...state.prefs};
  if(!p.gender) p.gender='male';
  if(!p.skinTone) p.skinTone='yellow';
  if(!p.charSkin) p.charSkin='classic';
  // 性别
  const gBtns=[...document.querySelectorAll('#cr-gender .seg')];
  const syncG=()=>gBtns.forEach(b=>b.classList.toggle('on',b.dataset.v===p.gender));
  gBtns.forEach(b=>b.onclick=()=>{ p.gender=b.dataset.v; syncG(); drawChar($('char-canvas'),p); });
  syncG();
  // 肤色
  const toneBox=$('cr-tone'); toneBox.innerHTML='';
  for(const [k,t] of Object.entries(SKIN_TONES)){
    const d=document.createElement('div'); d.className='tone-dot'+(k===p.skinTone?' on':'');
    d.style.background=t.color; d.title=t.name;
    d.onclick=()=>{ p.skinTone=k; [...toneBox.children].forEach(c=>c.classList.remove('on')); d.classList.add('on'); drawChar($('char-canvas'),p); };
    toneBox.appendChild(d);
  }
  // 角色皮肤（仅已拥有；hero 仅 kaobei）
  const isHero=state.user?.skin==='hero';
  const own=ownedIds('charSkin'); if(isHero) own.add('gold');
  own.add('classic');
  const grid=$('cr-charskins'); grid.innerHTML='';
  for(const [k,c] of Object.entries(CHAR_SKINS)){
    if(!own.has(k)) continue;
    const cell=document.createElement('div'); cell.className='skin-cell'+(k===p.charSkin?' on':'');
    cell.innerHTML=`${c.name}${c.hero?' ★':''}`;
    cell.onclick=()=>{ p.charSkin=k; [...grid.children].forEach(x=>x.classList.remove('on')); cell.classList.add('on'); drawChar($('char-canvas'),p); };
    grid.appendChild(cell);
  }
  drawChar($('char-canvas'),p);
  $('btn-creator-save').onclick=async()=>{
    state.prefs={...state.prefs, ...p};
    await savePrefs();
    modal('creator-modal',false);
    renderCharStage(); renderLobbyUser();
  };
  $('creator-modal').querySelector('h2').textContent= first? '创建你的角色':'更换形象';
  modal('creator-modal',true);
}

// ============================================================
// 大厅
// ============================================================
function enterLobby(){
  show('screen-lobby');
  document.body.classList.toggle('touch', isTouch());
  renderLobbyUser();
  renderCharStage();
  buildModeCards();
  renderMap();
  saveProgressLocal();
  connectPresence();
  $('btn-change-char').onclick=()=>openCreator(false);
  $('btn-fullscreen').onclick=goFullscreen;
  $('btn-pause-fs').onclick=goFullscreen;
}
function renderLobbyUser(){
  const hero=state.user?.skin==='hero';
  $('lobby-avatar').textContent=hero?'我':(state.user?.username?.[0]||'兵').toUpperCase();
  $('lobby-avatar').classList.toggle('hero',hero);
  const lv=passLevel();
  $('lobby-name').innerHTML=`${state.user?.username||'士兵'} <small>${hero?'★ 鎏金战神·我':'通行证 Lv.'+lv}</small>`;
  const into=state.xp%PASS_XP_PER_LEVEL;
  $('xp-bar').style.width=(into/PASS_XP_PER_LEVEL*100)+'%';
  $('xp-text').textContent=`${into}/${PASS_XP_PER_LEVEL}`;
  $('res-coins').textContent='◈ '+(state.user?.coins??0);
  $('res-kills').textContent=`击杀 ${state.totalKills}`;
  $('lobby-stats').innerHTML=`关卡进度 ${Math.min(state.unlocked,LEVELS.length)}/${LEVELS.length}<br>无尽最佳 第 ${state.endlessBest} 波<br>总击杀 ${state.totalKills}<br>通行证 Lv.${lv}`;
}
function renderCharStage(){
  $('char-label').textContent=`${(CHAR_SKINS[state.prefs.charSkin||'classic']||CHAR_SKINS.classic).name} · ${(SKIN_TONES[state.prefs.skinTone]||SKIN_TONES.yellow).name}肤色 · ${state.prefs.gender==='female'?'女性':'男性'}`;
  drawChar($('char-canvas'), state.prefs);
}
function goFullscreen(){
  const el=document.documentElement;
  if(!document.fullscreenElement){ el.requestFullscreen?.().catch(()=>{}); screen.orientation?.lock?.('landscape').catch(()=>{}); }
  else document.exitFullscreen?.();
}

function buildModeCards(){
  const col=$('lobby-mode-col'); col.innerHTML='';
  for(const m of Object.values(MODES)){
    const el=document.createElement('div');
    el.className='mode-card'+(m.id===state.mode?' on':'');
    el.innerHTML=`<h3>${m.name}</h3><p>${m.desc}</p>`;
    el.onclick=()=>{
      state.mode=m.id;
      document.querySelectorAll('.mode-card').forEach(c=>c.classList.remove('on'));
      el.classList.add('on');
      $('free-opts').style.display = m.id==='free'?'flex':'none';
    };
    col.appendChild(el);
  }
  const sel=$('opt-bots'); sel.innerHTML='';
  [4,6,8,10,12,16,20].forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
  sel.value='8';
}

function renderMap(){
  const m=MAPS[state.mapIndex];
  $('map-name').textContent=m.name;
  drawMapThumb(m);
}
function drawMapThumb(m){
  const cv=$('map-thumb'); cv.width=560; cv.height=220;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#'+m.sky.toString(16).padStart(6,'0'); ctx.fillRect(0,0,560,120);
  ctx.fillStyle='#'+m.ground.toString(16).padStart(6,'0'); ctx.fillRect(0,120,560,100);
  ctx.fillStyle='#'+m.wall.toString(16).padStart(6,'0');
  for(let i=0;i<m.buildings+4;i++){ ctx.fillRect(30+ i*47+Math.sin(i*3)*10, 70+(i%3)*14, 26+ (i%4)*8, 50); }
  ctx.fillStyle='#'+m.crate.toString(16).padStart(6,'0');
  for(let i=0;i<Math.min(m.crates,18);i++){ ctx.fillRect(20+i*31, 160+(i%2)*8, 12,12); }
  if(m.night){ ctx.fillStyle='rgba(4,10,26,0.45)'; ctx.fillRect(0,0,560,220); }
}
$('map-prev').onclick=()=>{ state.mapIndex=(state.mapIndex-1+MAPS.length)%MAPS.length; renderMap(); };
$('map-next').onclick=()=>{ state.mapIndex=(state.mapIndex+1)%MAPS.length; renderMap(); };

// ---------- 设置 ----------
function initSettings(){
  const s=state.settings;
  const bind=(id,out,key,fmt)=>{
    $(id).value=s[key]; $(out).textContent=fmt?fmt(s[key]):s[key];
    $(id).oninput=e=>{ s[key]=parseFloat(e.target.value); $(out).textContent=fmt?fmt(s[key]):s[key]; };
  };
  bind('set-sensx','out-sensx','sensX',v=>v.toFixed(1));
  bind('set-sensy','out-sensy','sensY',v=>v.toFixed(1));
  bind('set-sensads','out-sensads','sensAds',v=>v.toFixed(1));
  bind('set-fov','out-fov','fov',v=>v+'°');
  bind('set-vol','out-vol','volume',v=>Math.round(v*100)+'%');
  $('set-quality').value=s.quality;
  $('btn-set-done').onclick=()=>{
    s.quality=$('set-quality').value;
    localStorage.setItem('pe3d_settings',JSON.stringify(s));
    modal('settings-modal',false);
  };
}
function openSettings(){ initSettings(); modal('settings-modal',true); }
$('btn-settings').onclick=openSettings;
$('btn-pause-settings').onclick=openSettings;
$('btn-keymap').onclick=openKeymap;
$('btn-pause-keymap').onclick=openKeymap;
$('btn-logout').onclick=()=>{ localStorage.removeItem('pe3d_token'); state.token=''; location.reload(); };

// ---------- 键位布局编辑 ----------
function openKeymap(){
  modal('keymap-modal',true);
  if(!state.touch) state.touch=new TouchControls(()=>state.game,()=>state.settings);
  state.touch.openEditor($('km-stage'));
  $('km-stage').style.pointerEvents='auto';
}
$('btn-km-save').onclick=()=>{ state.touch?.closeEditor(true); modal('keymap-modal',false); };
$('btn-km-reset').onclick=()=>{ state.touch?.resetLayout(); state.touch.openEditor($('km-stage')); };

// ============================================================
// 商城 / 军需 / 仓库 / 通行证 / 排行榜
// ============================================================
let storeTab='charSkin';
const STORE_TABS=[
  ['charSkin','角色皮肤'],['weapon','武器解锁'],['weaponSkin','武器皮肤'],
  ['medSkin','药物皮肤'],['drinkSkin','饮料皮肤'],['throwableSkin','投掷物皮肤'],
];
function storeItems(){
  if(storeTab==='charSkin') return Object.entries(CHAR_SKINS).filter(([k,c])=>!c.hero).map(([k,c])=>({kind:'charSkin',id:k,name:c.name,price:c.price,sw:'#'+c.body.toString(16).padStart(6,'0')}));
  if(storeTab==='weapon') return Object.entries(UNLOCK_COST).filter(([k,c])=>c>0).map(([k,c])=>({kind:'weapon',id:k,name:WEAPONS[k].name,price:c,sub:WEAPONS[k].cls+' · '+WEAPONS[k].dmg+'伤害',sw:'#6a7484'}));
  if(storeTab==='weaponSkin') return Object.entries(WEAPON_SKINS).map(([k,c])=>({kind:'weaponSkin',id:k,name:c.name,price:c.price,sw:'#'+c.color.toString(16).padStart(6,'0')}));
  if(storeTab==='medSkin') return Object.entries(MED_SKINS).map(([k,c])=>({kind:'medSkin',id:k,name:c.name,price:c.price,sw:'#'+c.color.toString(16).padStart(6,'0')}));
  if(storeTab==='drinkSkin') return Object.entries(DRINK_SKINS).map(([k,c])=>({kind:'drinkSkin',id:k,name:c.name,price:c.price,sw:'#'+c.color.toString(16).padStart(6,'0')}));
  return Object.entries(THROWABLE_SKINS).map(([k,c])=>({kind:'throwableSkin',id:k,name:c.name,price:c.price,sw:'#'+c.frag.toString(16).padStart(6,'0')}));
}
function openStore(){
  renderStoreTabs(); renderStoreList();
  $('store-coins').textContent='◈ '+(state.user?.coins??0);
  modal('store-modal',true);
}
function renderStoreTabs(){
  const box=$('store-tabs'); box.innerHTML='';
  for(const [k,label] of STORE_TABS){
    const b=document.createElement('button'); b.className='btn ghost small seg'+(k===storeTab?' on':'');
    b.textContent=label; b.onclick=()=>{ storeTab=k; renderStoreTabs(); renderStoreList(); };
    box.appendChild(b);
  }
}
function renderStoreList(){
  const list=$('store-list'); list.innerHTML='';
  const isHero=state.user?.skin==='hero';
  for(const it of storeItems()){
    const owned= it.kind==='weapon'? ownedWeapons().has(it.id) : ownedIds(it.kind).has(it.id) || (it.id==='classic'||it.id==='none');
    const el=document.createElement('div'); el.className='store-item';
    el.innerHTML=`<div class="sw" style="background:${it.sw}"></div>
      <div class="nm">${it.name}${it.sub?'<small>'+it.sub+'</small>':''}</div>
      ${owned?'<span style="color:var(--ok)">已拥有</span>':`<span class="pr">◈ ${it.price}</span>`}`;
    if(!owned){
      const b=document.createElement('button'); b.className='btn small'; b.textContent='购 买';
      b.onclick=async()=>{
        try{
          const r=await api('/store/buy',{kind:it.kind,itemId:it.id,price:it.price});
          state.user.coins=r.coins; state.owned.push({kind:it.kind,id:it.id});
          b.textContent='✓ 已购'; b.disabled=true; renderStoreList();
          renderLobbyUser();
        }catch(e){ alert(e.message); }
      };
      el.appendChild(b);
    }
    list.appendChild(el);
  }
}
$('btn-store').onclick=openStore;

// 军需
$('btn-crate').onclick=()=>{ $('crate-result').textContent=''; modal('crate-modal',true); };
$('btn-crate-close').onclick=()=>modal('crate-modal',false);
$('btn-crate-open').onclick=async()=>{
  $('crate-result').textContent='开启中…';
  try{
    const r=await api('/store/crate',{});
    state.user.coins=r.coins;
    if(!state.owned.some(o=>o.kind===r.reward.kind&&o.id===r.reward.itemId)) state.owned.push(r.reward);
    const names={charSkin:'角色皮肤',weaponSkin:'武器皮肤',medSkin:'药物皮肤',drinkSkin:'饮料皮肤',throwableSkin:'投掷物皮肤'};
    const look={charSkin:CHAR_SKINS,weaponSkin:WEAPON_SKINS,medSkin:MED_SKINS,drinkSkin:DRINK_SKINS,throwableSkin:THROWABLE_SKINS}[r.reward.kind];
    $('crate-result').textContent=`🎉 获得 ${names[r.reward.kind]}「${look[r.reward.itemId].name}」`;
    renderLobbyUser();
  }catch(e){ $('crate-result').textContent=e.message; }
};

// 仓库
let whTab='loadout';
$('btn-warehouse').onclick=()=>{ renderWarehouse(); modal('warehouse-modal',true); };
function renderWarehouse(){
  document.querySelectorAll('#wh-tabs .seg').forEach(b=>b.classList.toggle('on',b.dataset.tab===whTab));
  document.querySelectorAll('.wh-pane').forEach(p=>p.style.display='none');
  $(whTab==='loadout'?'wh-loadout':whTab==='skin'?'wh-skin':'wh-char').style.display='block';
  const own=ownedWeapons();
  const fill=(sel, val)=>{
    sel.innerHTML='';
    for(const k of own){
      const o=document.createElement('option'); o.value=k; o.textContent=WEAPONS[k].name; sel.appendChild(o);
    }
    if(!own.has(val)) val=own.values().next().value;
    sel.value=val;
  };
  const lo=state.prefs.loadout||['m416','ump45','p1911'];
  fill($('lo-primary'), lo[0]); fill($('lo-secondary'), lo[1]); fill($('lo-pistol'), lo[2]||'p1911');
  // 皮肤选择
  const fillSkins=(sel, skinsKey, current)=>{
    sel.innerHTML='';
    const ownS=ownedIds(skinsKey); ownS.add(skinsKey==='weaponSkin'?'none':'classic');
    const table={weaponSkin:WEAPON_SKINS,medSkin:MED_SKINS,drinkSkin:DRINK_SKINS,throwableSkin:THROWABLE_SKINS}[skinsKey];
    for(const k of ownS){
      const o=document.createElement('option'); o.value=k; o.textContent=table[k]?.name||k; sel.appendChild(o);
    }
    sel.value=ownS.has(current)?current:ownS.values().next().value;
  };
  fillSkins($('sk-weapon'),'weaponSkin', state.prefs.weaponSkins?.[lo[0]]||'none');
  fillSkins($('sk-med'),'medSkin', state.prefs.medSkin||'classic');
  fillSkins($('sk-drink'),'drinkSkin', state.prefs.drinkSkin||'classic');
  fillSkins($('sk-throw'),'throwableSkin', state.prefs.throwableSkin||'classic');
  $('btn-wh-char-editor').onclick=()=>{ modal('warehouse-modal',false); openCreator(false); };
}
$('btn-wh-save').onclick=async()=>{
  state.prefs.loadout=[$('lo-primary').value,$('lo-secondary').value,$('lo-pistol').value];
  state.prefs.weaponSkins={...state.prefs.weaponSkins, [state.prefs.loadout[0]]:$('sk-weapon').value};
  state.prefs.medSkin=$('sk-med').value;
  state.prefs.drinkSkin=$('sk-drink').value;
  state.prefs.throwableSkin=$('sk-throw').value;
  await savePrefs();
  modal('warehouse-modal',false);
  renderCharStage();
};
document.querySelectorAll('#wh-tabs .seg').forEach(b=>b.onclick=()=>{ whTab=b.dataset.tab; renderWarehouse(); });

// 通行证
$('btn-pass').onclick=()=>{
  const lv=passLevel(), claimed=new Set(state.prefs.passClaimed||[]);
  $('pass-info').innerHTML=`当前等级 <b style="color:var(--gold2)">Lv.${lv}</b> · XP ${state.xp} · 每局战斗获得 XP（击杀×10 / 胜利+100）`;
  const list=$('pass-list'); list.innerHTML='';
  for(let i=1;i<=Math.max(10,lv+2);i++){
    const row=document.createElement('div'); row.className='pass-row';
    row.innerHTML=`<b style="color:var(--gold2);width:52px">Lv.${i}</b><span style="flex:1">奖励 ◈${PASS_REWARD}</span>`;
    if(i<=lv){
      if(claimed.has(i)){ row.insertAdjacentHTML('beforeend','<span style="color:var(--ok)">已领取</span>'); }
      else{
        const b=document.createElement('button'); b.className='btn ok small'; b.textContent='领 取';
        b.onclick=async()=>{
          claimed.add(i); state.prefs.passClaimed=[...claimed];
          state.user.coins=(state.user.coins??0)+PASS_REWARD;
          await savePrefs();
          try{ await api('/coins',{coins:PASS_REWARD,reason:'pass'}); }catch(e){}
          renderLobbyUser(); $('btn-pass').onclick();
        };
        row.appendChild(b);
      }
    } else row.insertAdjacentHTML('beforeend','<span style="color:var(--sub)">未达成</span>');
    list.appendChild(row);
  }
  modal('pass-modal',true);
};

// 排行榜
$('btn-rank').onclick=async()=>{
  const list=$('rank-list');
  list.innerHTML='<div style="color:var(--sub)">加载中…</div>';
  modal('rank-modal',true);
  try{
    const r=await api('/leaderboard');
    list.innerHTML='';
    if(!r.list?.length) list.innerHTML='<div style="color:var(--sub)">暂无数据，打一局上榜！</div>';
    r.list.forEach((row,i)=>{
      const el=document.createElement('div'); el.className='rank-row';
      el.innerHTML=`<span class="no">${i+1}</span><span class="who">${row.username}${row.skin==='hero'?' ★':''}</span>
        <span>击杀 ${row.K??row.k??0}</span><span style="color:var(--sub)">无尽 ${row.w??0} 波</span>`;
      list.appendChild(el);
    });
  }catch(e){ list.innerHTML='<div style="color:var(--sub)">无法获取（离线模式）</div>'; }
};
$('btn-rank-close').onclick=()=>modal('rank-modal',false);

// ============================================================
// 开战
// ============================================================
$('start-game').onclick=()=>{
  const freeOpts = state.mode==='free' ? {
    bots: parseInt($('opt-bots').value),
    strength: $('opt-str').value,
    sens: parseFloat($('opt-sens').value)
  } : null;
  if(freeOpts){ state.settings.sensX=freeOpts.sens; state.settings.sensY=freeOpts.sens; }
  if(isTouch()) goFullscreen();
  startGame({ mode: state.mode, mapId: MAPS[state.mapIndex].id,
    level: state.mode==='level'? state.unlocked : undefined, freeOpts });
};

function startGame(opts){
  show('screen-game');
  const canvas=$('game-canvas');
  state._lastOpts=opts;
  state.game=new Game(canvas,{
    ...opts,
    settings:state.settings,
    skin:state.user?.skin,
    prefs:state.prefs,
    aiEnabled: opts.mode!=='multi',
    timeLimit: opts.timeLimit||0,
    onPause:()=>modalPause(true),
    onTip:tip=>{ const t=$('hud-tip'); t.textContent=tip; t.classList.add('show');
      clearTimeout(state._tipT); state._tipT=setTimeout(()=>t.classList.remove('show'),2200); },
    onHud:handleHud,
    onOver:handleOver,
    net: state.net,
  });
  state.game.enabled=true;
  state.game.resize();
  if(!isTouch()) canvas.requestPointerLock?.();
  state.ai=new AIManager(state.game,()=>state.token);
  const g=state.game; g.loop=()=>{}; // 停用内建循环，改用下面带 AI 的循环
  let last=performance.now();
  const custom=()=>{
    if(!state.game||state.game._stopped) return;
    requestAnimationFrame(custom);
    const now=performance.now(), dt=Math.min((now-last)/1000,0.05); last=now;
    const gg=state.game;
    if(gg.enabled!==false){
      gg.updatePlayer(dt); gg.updateBots(dt); gg.updateEffects(dt);
      gg.updateProjectiles(dt); gg.updateZones(dt);
      state.ai?.update(dt);
      if(gg.respawnT>0){ gg.respawnT-=dt; if(gg.respawnT<=0){ gg.spawnPlayer(); gg.onTip?.('重新部署'); } }
      if(gg.timeLeft>0&&gg.state==='playing'){ gg.timeLeft-=dt; if(gg.timeLeft<=0){ gg.timeLeft=0; gg.endGame(true,{timeout:true}); } }
      state.net?.tickNet?.(dt,gg);
      gg.renderer.render(gg.scene,gg.camera);
    }
  };
  custom();
  state.touch=new TouchControls(()=>state.game,()=>state.settings);
  if(isTouch()) state.touch.build($('touch-ui'));
  addEventListener('resize',onResize);
}
function onResize(){ state.game?.resize(); }

function modalPause(on){ modal('pause-menu',on); if(state.game) state.game.enabled=!on;
  if(!on&&!isTouch()) $('game-canvas').requestPointerLock?.(); }
$('btn-resume').onclick=()=>modalPause(false);
$('btn-quit').onclick=()=>quitGame();
function quitGame(){
  state.game?._cleanupInput?.(); state.game?.dispose(); state.game=null;
  state.net?.leave(); state.net=null;
  removeEventListener('resize',onResize);
  document.exitPointerLock?.();
  enterLobby();
}
$('btn-back-lobby').onclick=()=>quitGame();
$('btn-again').onclick=()=>{ const o=state._lastOpts; quitGame(); startGame(o); };

// ---------- HUD ----------
function handleHud(u){
  const g=state.game; if(!g) return;
  if(u.dt!==undefined){
    $('bar-hp').style.transform=`scaleX(${g.hp/100})`;
    $('num-hp').textContent=Math.ceil(g.hp);
    $('bar-boost').style.transform=`scaleX(${g.boost/100})`;
    $('num-boost').textContent=Math.ceil(g.boost);
    const w=g.weapon;
    $('ammo-big').innerHTML=`${g.reloading>0?'--':g.ammo[g.wkey]} <small>/ ${g.reserve[w.ammo]}</small>`;
    $('weapon-name').textContent=w.name+(g.reloading>0?'（换弹中）':'');
    const slots=$('weapon-slots');
    if(slots.childElementCount!==g.slots.length){
      slots.innerHTML='';
      g.slots.forEach((k,i)=>{ const el=document.createElement('div'); el.className='wslot'; el.dataset.i=i;
        el.textContent=WEAPONS[k].name; el.onclick=()=>g.switchTo(i); slots.appendChild(el); });
    }
    [...slots.children].forEach((el,i)=>el.classList.toggle('on',i===g.slot));
    $('hud-timer').textContent = g.timeLeft>0? fmtTime(g.timeLeft): (g.mode==='endless'?`第 ${g.wave} 波`:'∞');
    const aliveBots=g.bots.filter(b=>b.hp>0).length;
    $('hud-alive').textContent = g.mode==='multi'? `存活 ${g.remotePlayers.size+1}` : `剩余敌人 ${aliveBots}`;
    $('crosshair').classList.toggle('ads',g.adsK>0.5);
    // 投掷物
    const t=g.throwable;
    $('th-name').textContent=THROWABLES[t.type].name;
    $('th-count').textContent='×'+t.counts[t.type];
  }
  if(u.event==='kill') addKillFeed(`你 ${u.head?'爆头击杀':'击杀了'} ${u.name}`);
  if(u.event==='death') addKillFeed('你被击倒了');
}
$('th-cycle').onclick=()=>state.game?.cycleThrowable();
$('th-throw').onclick=()=>state.game?.throwCurrent();
function addKillFeed(txt){
  const kf=$('kill-feed');
  const el=document.createElement('div'); el.className='kf'; el.textContent=txt;
  kf.prepend(el);
  setTimeout(()=>el.remove(),4000);
  while(kf.childElementCount>5) kf.lastChild.remove();
}
function fmtTime(s){ const m=Math.floor(s/60),ss=Math.floor(s%60); return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }

function handleOver(r){
  const g=state.game;
  $('over-title').textContent = r.win? (r.timeout?'时间到 · 任务完成':'WIN · 胜利') : '失败';
  $('over-title').style.color = r.win? 'var(--gold)':'var(--danger)';
  let extra='';
  if(g.mode==='level') extra=`第 ${r.level} 关 ${r.win?'通过':'未通过'}`;
  if(g.mode==='endless') extra=`坚持到第 ${r.wave} 波`;
  $('over-stats').innerHTML=`击杀 ${r.kills} · 阵亡 ${r.deaths}${extra?('<br>'+extra):''}`;
  // 金币 / XP 结算
  const coins=Math.min(500, r.kills*REWARDS.kill + (r.win?REWARDS.win:REWARDS.lose) + (r.wave||0)*REWARDS.wave);
  const xpGain=r.kills*10 + (r.win?100:20) + (r.wave||0)*10;
  $('over-coins').textContent=`获得 ◈${coins} · XP +${xpGain}`;
  $('over-screen').classList.add('on');
  document.exitPointerLock?.();
  if(g.mode==='level'&&r.win&&r.level>=state.unlocked&&r.level<LEVELS.length) state.unlocked=r.level+1;
  if(g.mode==='endless'&&r.wave>state.endlessBest) state.endlessBest=r.wave;
  state.totalKills+=r.kills;
  state.xp+=xpGain;
  state.user.coins=(state.user.coins??0)+coins;
  saveProgressLocal(); renderLobbyUser();
  api('/progress',{unlocked:state.unlocked,endlessBest:state.endlessBest,totalKills:state.totalKills,xpGain}).catch(()=>{});
  api('/coins',{coins,reason:'match'}).catch(()=>{});
}
function saveProgressLocal(){
  localStorage.setItem('pe3d_progress',JSON.stringify({unlocked:state.unlocked,endlessBest:state.endlessBest,totalKills:state.totalKills,xp:state.xp}));
}

// ============================================================
// 联机
// ============================================================
$('btn-multi').onclick=()=>{ modal('multi-modal',true); };
function connectPresence(){
  if(state.presence) state.presence.close();
  const ps=new PresencePoll({
    onPresence:list=>{
      state.onlineList=list||[];
      const el=$('online-list'); if(!el) return;
      el.innerHTML= state.onlineList.filter(p=>p.name!==state.user?.username).length? '' : '<div style="color:var(--sub)">暂无其他在线玩家</div>';
      for(const p of state.onlineList){
        if(p.name===state.user?.username) continue;
        const row=document.createElement('div'); row.className='ol';
        row.innerHTML=`<span>${p.name}${p.in_room?'（房间中）':''}</span>`;
        const b=document.createElement('button'); b.className='btn ghost small';
        b.textContent = state.net?.isHost ? '邀请进组' : '申请进组';
        b.onclick=()=>{
          if(state.net?.isHost){ state.presence.invite(p.name, state.net.code); b.textContent='已邀请'; b.disabled=true; }
          else { state.presence.requestJoin(p.name); b.textContent='已发送'; b.disabled=true; }
        };
        row.appendChild(b); el.appendChild(row);
      }
    },
    onInvite:m=>{
      $('invite-text').textContent=`玩家「${m.from}」邀请你加入房间（申请码 ${m.code}）`;
      modal('invite-modal',true);
      $('btn-invite-yes').onclick=()=>{ modal('invite-modal',false); openRoom(m.code); };
      $('btn-invite-no').onclick=()=>modal('invite-modal',false);
    },
    onFriendReq:m=>{
      if(!state.net?.isHost){
        $('invite-text').textContent=`玩家「${m.from}」想与你组队，但你还不是房主。可自行创建房间后邀请对方。`;
        $('btn-invite-yes').style.display='none';
        modal('invite-modal',true);
        $('btn-invite-no').onclick=()=>{ modal('invite-modal',false); $('btn-invite-yes').style.display=''; };
        return;
      }
      $('invite-text').textContent=`玩家「${m.from}」申请加入你的房间，是否同意？`;
      modal('invite-modal',true);
      $('btn-invite-yes').onclick=()=>{
        modal('invite-modal',false); $('btn-invite-yes').style.display='';
        state.presence.invite(m.from, state.net.code);   // 同意 → 发送正式邀请
      };
      $('btn-invite-no').onclick=()=>{ modal('invite-modal',false); $('btn-invite-yes').style.display=''; };
    },
  });
  state.presence=ps;
  ps.connect(state.user?.username||'士兵');
}

function openRoom(joinCode){
  modal('multi-modal',false);
  modal('room-modal',true);
  $('room-map').innerHTML=MAPS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
  const net=new RoomClient({
    name:state.user?.username||'士兵',
    skin:state.user?.skin,
    onClose:()=>{ if(state.net){ addKillFeed('与房间断开连接'); state.net=null; modal('room-modal',false); } },
  });
  state.net=net;
  wireRoomUI(net);
  if(joinCode){
    net.joinByCode(joinCode).catch(e=>{
      const map={badCode:'申请码不存在',full:'房间已满（10 人上限）',started:'战斗已开始，无法加入'};
      alert(map[e.message]||e.message);
      modal('room-modal',false); state.net=null;
    });
  } else {
    net.create(MAPS[state.mapIndex].id, parseInt($('room-time').value)).catch(e=>{
      alert('创建失败：'+e.message);
      modal('room-modal',false); state.net=null;
    });
  }
}
function wireRoomUI(net){
  net.onMsg=({type,...d})=>{
    if(type==='welcome'){
      $('room-head-title').textContent= net.isHost? '房主' : '成员';
      $('room-code').textContent=net.code||'------';
      state.presence?.setRoom(net.code);
      $('btn-start-room').style.display= net.isHost?'inline-flex':'none';
      $('host-opts').style.display= net.isHost?'flex':'none';
      if(!net.isHost){ $('room-time').disabled=true; $('room-map').disabled=true; }
      else { $('room-time').value=net.timeLimit; $('room-map').value=net.mapId; }
      renderRoom(net);
    }
    if(type==='pending'){
      $('room-players').innerHTML='<div class="room-slot"><span style="color:var(--gold2)">⏳ 已提交申请，等待房主同意…</span></div>';
    }
    if(type==='approved') addKillFeed('房主已同意你进组');
    if(type==='hostChange'){ $('room-head-title').textContent=net.isHost?'房主':'成员'; addKillFeed(`房主已移交（新房主：${d.host||'？'}）`); }
    if(type==='update') renderRoom(net);
    if(type==='settings'){ $('room-time').value=d.time; $('room-map').value=d.map; }
    if(type==='start'){
      modal('room-modal',false);
      startGame({mode:'multi', mapId:d.map, timeLimit:d.time, aiEnabled:false});
    }
    if(type==='kicked'){ alert(`房主已将你移出房间（${d.by}）`); modal('room-modal',false); state.net=null; }
    if(type==='denied'){ alert('房主拒绝了你的申请'); modal('room-modal',false); state.net=null; }
  };
  net.onGameData=(pid,msg)=>{
    const g=state.game; if(!g) return;
    if(msg.k==='st') g.updateRemote(pid,msg);
    if(msg.k==='hit'&&msg.target===net.myId) g.damagePlayer(msg.dmg);
  };
  $('btn-copy-code').onclick=()=>{ navigator.clipboard?.writeText(net.code||''); $('btn-copy-code').textContent='已复制'; };
  $('btn-ready-room').onclick=()=>{ net.toggleReady(); };
  $('btn-leave-room').onclick=()=>{ net.leave(); state.presence?.setRoom(null); state.net=null; modal('room-modal',false); };
  $('btn-start-room').onclick=()=>{
    const others=[...net.players.values()].filter(p=>p.pid!==net.myId);
    if(others.length && !others.every(p=>p.ready)){
      alert('还有队友未准备，全员准备后才能开始'); return;
    }
    net.hostStart();
  };
  $('room-time').onchange=()=>net.hostSetSettings($('room-map').value, parseInt($('room-time').value));
  $('room-map').onchange=()=>net.hostSetSettings($('room-map').value, parseInt($('room-time').value));
}
function renderRoom(net){
  const box=$('room-players'); box.innerHTML='';
  const ps=[...net.players.values()];
  $('room-count').textContent=`${ps.length}/10 人`;
  for(let i=0;i<Math.max(ps.length,2)&&i<10;i++){
    const p=ps[i];
    const el=document.createElement('div'); el.className='room-slot';
    if(p){
      const isMe=p.pid===net.myId, isHostP=p.pid===net.hostPid;
      el.innerHTML=`<span class="tag ${isMe?(net.isHost?'host':''):(isHostP?'host':'')}">${isMe?'我':(p.ready?'已准备':'未准备')}</span>
        <span style="${p.skin==='hero'?'color:var(--gold)':''}">${p.name}${isHostP&&!isMe?'（房主）':''}</span>`;
      if(net.isHost&&!isMe){
        const kick=document.createElement('button'); kick.className='btn danger small'; kick.textContent='移除';
        kick.style.marginLeft='auto';
        kick.onclick=()=>net.hostKick(p.pid);
        el.appendChild(kick);
      }
    } else {
      el.innerHTML=`<span style="color:var(--sub)">空位（可邀请 / 等待申请）</span>`;
    }
    box.appendChild(el);
  }
  const rq=$('room-requests'); rq.innerHTML='';
  if(net.requests?.length){
    for(const r of net.requests){
      const el=document.createElement('div'); el.className='req';
      el.innerHTML=`<span>玩家「${r.name}」申请进组</span>`;
      const yes=document.createElement('button'); yes.className='btn ok small'; yes.textContent='同意';
      yes.onclick=()=>net.hostResolve(r.rid,true);
      const no=document.createElement('button'); no.className='btn danger small'; no.textContent='不同意';
      no.onclick=()=>net.hostResolve(r.rid,false);
      el.append(yes,no); rq.appendChild(el);
    }
  } else rq.innerHTML='<div style="color:var(--sub);font-size:12px">暂无申请</div>';
}

// ============================================================
// 启动
// ============================================================
async function boot(){
  suppressTouchFeedback();
  initAuth();
  const fill=$('loading-fill');
  let p=0; const t=setInterval(()=>{ p=Math.min(96,p+Math.random()*18); fill.style.width=p+'%'; },120);
  // 游客模式恢复
  if(sessionStorage.getItem('pe3d_guest')==='1'){
    clearInterval(t); fill.style.width='100%';
    setTimeout(()=>{
      $('loading').classList.add('hide');
      state.guest=true;
      state.user={username:'游客'+Math.floor(1000+Math.random()*9000), skin:'default', coins:1200};
      state.prefs=JSON.parse(localStorage.getItem('pe3d_prefs')||'{}');
      enterLobby();
    },300);
    return;
  }
  try{
    if(state.token){
      const me=await apiWithTimeout('/auth/me', 4500);
      state.user=me.user; state.owned=me.owned||[];
      if(me.progress){ state.unlocked=me.progress.unlocked; state.endlessBest=me.progress.endlessBest; state.totalKills=me.progress.totalKills; state.xp=me.progress.xp||0; }
      if(Object.keys(me.user.prefs||{}).length) state.prefs=me.user.prefs;
    }
  }catch(e){ state.token=''; localStorage.removeItem('pe3d_token'); }
  clearInterval(t); fill.style.width='100%';
  setTimeout(()=>{
    $('loading').classList.add('hide');
    if(state.token&&state.user) enterLobby(); else show('screen-auth');
  },400);
  const v=$('promo-video');
  v?.play?.().catch(()=>{ document.addEventListener('click',()=>v.play?.().catch(()=>{}),{once:true}); });
}
boot();
window.__enterLobby=enterLobby;   // 调试钩子（不影响正常流程）
