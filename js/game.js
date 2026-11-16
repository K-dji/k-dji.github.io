// ============================================================
// peace-strike-3d · 游戏核心引擎（Three.js 第一人称射击）
// ============================================================
import * as THREE from '../vendor/three.module.min.js';
import { WEAPONS, MAP_BY_ID, LEVELS, THROWABLES, WEAPON_SKINS, MED_SKINS, DRINK_SKINS, THROWABLE_SKINS, SKIN_TONES, MELEE, MELEE_SKINS } from './config.js';

const V3 = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
function mulberry32(seed){let t=seed>>>0;return()=>{t+=0x6D2B79F5;let r=Math.imul(t^t>>>15,1|t);r^=r+Math.imul(r^r>>>7,61|r);return((r^r>>>14)>>>0)/4294967296;};}

// 简易合成音效（无需音频资源）
class SFX {
  constructor(){ this.ctx=null; this.vol=0.8; }
  ensure(){ if(!this.ctx){ try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return this.ctx; }
  shot(kind='ar'){
    const c=this.ensure(); if(!c) return;
    const t=c.currentTime, dur = kind==='sniper'?0.35: kind==='shotgun'?0.3: 0.14;
    const buf=c.createBuffer(1, c.sampleRate*dur, c.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++){ const p=i/d.length; d[i]=(Math.random()*2-1)*Math.pow(1-p,2.2); }
    const src=c.createBufferSource(); src.buffer=buf;
    const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value= kind==='sniper'?900:1800;
    const g=c.createGain(); g.gain.value=this.vol*(kind==='pistol'?0.5:0.8);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  }
  beep(freq=880,dur=0.08,vol=0.3){
    const c=this.ensure(); if(!c) return;
    const o=c.createOscillator(), g=c.createGain();
    o.frequency.value=freq; o.type='square'; g.gain.value=this.vol*vol;
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+dur);
  }
}

// 人形角色模型（cryzen-io 风格：圆润低多边形小人）
// 敌人 / 远程玩家共用；hero=true 时为鎏金战神皮
export function createHumanoid(color, hero=false){
  const g=new THREE.Group();
  const mat=new THREE.MeshLambertMaterial({color, emissive:hero?0x553300:0x000000});
  const dark=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(0.55)});
  const skin=new THREE.MeshLambertMaterial({color:hero?0xffd98a:0xe6b98f});
  const gunMat=new THREE.MeshLambertMaterial({color:0x23262c});

  // 躯干：胶囊（圆柱+半球），微前倾
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.30,0.52,4,10), mat);
  body.position.y=1.08; body.rotation.x=0.08;
  // 盆骨
  const hip=new THREE.Mesh(new THREE.SphereGeometry(0.28,10,8), dark);
  hip.position.y=0.74; hip.scale.y=0.7;
  // 头：球形肤色 + 同色头盔罩
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.245,14,12), skin);
  head.position.y=1.77;
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(0.265,14,12,0,Math.PI*2,0,Math.PI*0.58), dark);
  helmet.position.y=1.775;
  // 双臂：前伸持枪（capsule，指向正前）
  const armGeo=new THREE.CapsuleGeometry(0.085,0.42,4,8);
  const armL=new THREE.Mesh(armGeo, mat);
  armL.position.set(-0.24,1.28,-0.22); armL.rotation.x=Math.PI/2-0.35; armL.rotation.z=0.25;
  const armR=new THREE.Mesh(armGeo, mat);
  armR.position.set(0.26,1.26,-0.20); armR.rotation.x=Math.PI/2-0.15; armR.rotation.z=-0.12;
  // 双腿：capsule
  const legGeo=new THREE.CapsuleGeometry(0.105,0.5,4,8);
  const legL=new THREE.Mesh(legGeo, dark); legL.position.set(-0.14,0.36,0);
  const legR=new THREE.Mesh(legGeo, dark); legR.position.set(0.14,0.36,0);
  // 鞋
  const shoeGeo=new THREE.BoxGeometry(0.16,0.09,0.28);
  const shoeL=new THREE.Mesh(shoeGeo, gunMat); shoeL.position.set(-0.14,0.06,-0.04);
  const shoeR=new THREE.Mesh(shoeGeo, gunMat); shoeR.position.set(0.14,0.06,-0.04);
  // 枪：双手前方
  const gun=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.12,0.62), gunMat);
  gun.position.set(0.10,1.30,-0.52);
  const barrel=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.26), gunMat);
  barrel.position.set(0.10,1.32,-0.86);
  g.add(body,hip,head,helmet,armL,armR,legL,legR,shoeL,shoeR,gun,barrel);
  if(hero){
    // 专属皮肤：金冠
    const crown=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.20,0.10,8),
      new THREE.MeshLambertMaterial({color:0xffd34d, emissive:0x8a6300}));
    crown.position.y=2.02; g.add(crown);
  }
  // 命中判定体（胸腔 + 头）——不渲染但可被射线命中
  const hitBody=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.85,0.4),
    new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false, colorWrite:false}));
  hitBody.position.y=1.1; g.add(hitBody);
  body.userData={part:'body'}; head.userData={part:'head'};
  g.userData.hitMeshes=[hitBody, head];
  return g;
}

export class Game {
  constructor(canvas, opts){
    // opts: {mode, mapId, settings, level?, freeOpts?, onHud, onOver, onTip, net?, skin}
    this.opts=opts;
    this.mode=opts.mode; this.mapId=opts.mapId||'training';
    this.settings=opts.settings||{};
    this.sfx=new SFX(); this.sfx.vol=this.settings.volume??0.8;
    this.onHud=opts.onHud||(()=>{}); this.onOver=opts.onOver||(()=>{}); this.onTip=opts.onTip||(()=>{});

    this.renderer=new THREE.WebGLRenderer({canvas, antialias:opts.settings.quality!=='low', powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, opts.settings.quality==='high'?2:1.4));
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(opts.settings.fov??75, innerWidth/innerHeight, 0.1, 600);
    this.clock=new THREE.Clock();
    this.raycaster=new THREE.Raycaster();

    this.input={fwd:0,right:0,look:{dx:0,dy:0},fire:false,ads:false,jump:false,
      crouchHeld:false,proneHeld:false,reloadHeld:false,healHeld:false,drinkHeld:false,switchSlot:null};
    this.keys={};
    this.enabled=true;
    this.stance='stand'; this.eyeY=1.6; this.crouch=0;
    this.pos=V3(0,0,0); this.vel=V3(); this.yaw=0; this.pitch=0;
    this.peakY=0;            // 空中最高点（用于坠落伤害）
    this.decals=[];          // 弹孔贴花
    this.hp=100; this.boost=0; this.alive=true; this.respawnT=0;
    this.medkits=3; this.drinks=4;
    this.useAction=null; this.useT=0;
    this.kills=0; this.deaths=0;

    // 武器：配装槽位（从仓库选择；未配置用默认）
    const lo=opts.prefs?.loadout;
    this.slots=((Array.isArray(lo)&&lo.length>=2)? lo.slice(0,3) : ['m416','ump45','p1911']).concat(['pan']);
    this.slot=0;
    this.prefs=opts.prefs||{};
    this.gender=this.prefs.gender||'male';
    this.throwable={type:'frag', counts:{frag:THROWABLES.frag.count, smoke:THROWABLES.smoke.count,
      flash:THROWABLES.flash.count, molotov:THROWABLES.molotov.count}};
    this.projectiles=[]; this.fires=[]; this.smokes=[]; this.blindT=0;
    this.swingT=0;
    this.cheats=opts.cheats||{};   // 管理员/被授权玩家的作弊配置
    this.ammo={}; // {wkey: mag 内}
    this.reserve={'5.56':210,'7.62':150,'.45':90,'12号':24,'.300':18,'9mm':80};
    for(const k of this.slots) if(WEAPONS[k]) this.ammo[k]=WEAPONS[k].mag;
    this.fireCd=0; this.reloading=0; this.recoil=0; this.adsK=0; this.boltCd=0;

    this.bots=[]; this.bullets=[]; this.effects=[];
    this.colliders=[]; this.shootables=[];
    this.remotePlayers=new Map(); // net 用
    this.timeLeft=opts.timeLimit||0;
    this.wave=0; this.state='playing';
    this.aiEnabled=opts.aiEnabled!==false && this.mode!=='multi';
    this._raf=0; this._lastNetSend=0;

    this.buildMap();
    this.bindInput(canvas);
    this.spawnPlayer();
    this.spawnByMode();
    this.loop();
  }

  // ---------------- 地图生成 ----------------
  buildMap(){
    const m=MAP_BY_ID[this.mapId]||MAP_BY_ID.training;
    const rng=mulberry32(m.id.split('').reduce((a,c)=>a+c.charCodeAt(0),7));
    this.scene.background=new THREE.Color(m.sky);
    this.scene.fog=new THREE.Fog(m.fog, m.size*0.55, m.size*2.1);
    const S=m.size, half=S/2;
    // 地面
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(S*2,S*2),
      new THREE.MeshLambertMaterial({color:m.ground}));
    ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; this.scene.add(ground);
    ground.userData.solid=true; this.shootables.push(ground);   // 地面可被击中（产生弹孔）
    // 灯光
    if(m.night){
      this.scene.add(new THREE.AmbientLight(0x334466,0.7));
      const moon=new THREE.DirectionalLight(0x8899cc,0.5); moon.position.set(40,80,20); this.scene.add(moon);
    } else {
      this.scene.add(new THREE.AmbientLight(0xbfd4ee,0.85));
      const sun=new THREE.DirectionalLight(0xfff1d0,1.1); sun.position.set(50,90,30); this.scene.add(sun);
    }
    if(m.lava){ const l=new THREE.PointLight(0xff5a22,1.6,90); l.position.set(0,6,0); this.scene.add(l); }
    // 边界墙
    const addBox=(x,y,z,w,h,d,color,solid=true,shoot=true)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshLambertMaterial({color}));
      mesh.position.set(x,y,z); this.scene.add(mesh);
      if(solid) this.colliders.push({min:V3(x-w/2,y-h/2,z-d/2),max:V3(x+w/2,y+h/2,z+d/2)});
      if(shoot){ mesh.userData.solid=true; this.shootables.push(mesh); }
      return mesh;
    };
    addBox(0,2,-half,S,4,1,m.wall); addBox(0,2,half,S,4,1,m.wall);
    addBox(-half,2,0,1,4,S,m.wall); addBox(half,2,0,1,4,S,m.wall);
    // 建筑物（含门洞：两段墙+楼板）
    const nB = m.buildings;
    for(let i=0;i<nB;i++){
      const x=rand2(rng,-half*0.72,half*0.72), z=rand2(rng,-half*0.72,half*0.72);
      const w=rand2(rng,8,16), d=rand2(rng,8,14), h=rand2(rng,3.5,7);
      const c=new THREE.Color(m.wall).offsetHSL(0,0,rand2(rng,-0.08,0.08));
      addBox(x,h/2,z-d/2,w,h,0.6,c); addBox(x,h/2,z+d/2,w,h,0.6,c);
      addBox(x-w/2,h/2,z,0.6,h,d,c);
      const gap=rand2(rng,-w*0.3,w*0.3);
      const seg=(w/2-Math.abs(gap)-1)/1;
      addBox(x+gap-((w/2-Math.abs(gap))/2+1)- (gap<0?0:0),h/2,z, Math.max(0.6, (w/2-Math.abs(gap))/2-0),h,0.6,c);
      if(h>4.5) addBox(x,h+0.2,z, w+1,0.5,d+1, c.clone().offsetHSL(0,0,-0.06));
    }
    // 集装箱 / 板条箱
    const nC = m.containers? m.crates : m.crates;
    for(let i=0;i<nC;i++){
      const x=rand2(rng,-half*0.8,half*0.8), z=rand2(rng,-half*0.8,half*0.8);
      const big=m.containers && rng()>0.5;
      const w=big?6:1.6, h=big?2.6:1.6, d=big?2.6:1.6;
      const c=new THREE.Color(m.crate).offsetHSL(rand2(rng,-0.06,0.06),0,rand2(rng,-0.05,0.05));
      const y=h/2+(big&&rng()>0.6? h:0);
      addBox(x,y,z,w,h,d,c);
    }
    // 岩石点缀
    for(let i=0;i<14;i++){
      const x=rand2(rng,-half*0.9,half*0.9), z=rand2(rng,-half*0.9,half*0.9);
      const r=rand2(rng,0.8,2.2);
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(r),new THREE.MeshLambertMaterial({color:0x777268}));
      rock.position.set(x,r*0.4,z); rock.rotation.set(rng()*3,rng()*3,rng()*3);
      this.scene.add(rock);
    }
    this.mapBounds=half-1.2;
  }

  // ---------------- 输入 ----------------
  bindInput(canvas){
    const onKeyDown=e=>{
      if(!this.enabled) return;
      this.keys[e.code]=true;
      if(e.code==='Digit1')this.input.switchSlot=0;
      if(e.code==='Digit2')this.input.switchSlot=1;
      if(e.code==='Digit3')this.input.switchSlot=2;
      if(e.code==='Digit4')this.input.switchSlot=3;
      if(e.code==='KeyR')this.input.reloadHeld=true;
      if(e.code==='KeyG')this.cycleThrowable();
      if(e.code==='KeyF')this.throwCurrent();
      if(e.code==='KeyH')this.input.healHeld=true;
      if(e.code==='KeyN')this.input.drinkHeld=true;
      if(e.code==='KeyC')this.input.crouchHeld=true;
      if(e.code==='KeyZ')this.input.proneHeld=true;
      if(e.code==='Space'){this.input.jump=true;e.preventDefault();}
      if(e.code==='Escape')this.opts.onPause?.();
      if(e.code==='Tab')e.preventDefault();
    };
    const onKeyUp=e=>{ this.keys[e.code]=false; };
    const onMouseMove=e=>{
      if(document.pointerLockElement===canvas && this.enabled){
        this.input.look.dx+=e.movementX; this.input.look.dy+=e.movementY;
      }
    };
    const onMouseDown=e=>{
      if(!this.enabled) return;
      if(document.pointerLockElement!==canvas){ canvas.requestPointerLock?.(); return; }
      if(e.button===0)this.input.fire=true;
      if(e.button===2)this.input.ads=true;
    };
    const onMouseUp=e=>{ if(e.button===0)this.input.fire=false; if(e.button===2)this.input.ads=false; };
    const ctx=e=>e.preventDefault();
    addEventListener('keydown',onKeyDown); addEventListener('keyup',onKeyUp);
    addEventListener('mousemove',onMouseMove);
    canvas.addEventListener('mousedown',onMouseDown); addEventListener('mouseup',onMouseUp);
    canvas.addEventListener('contextmenu',ctx);
    this._cleanupInput=()=>{ removeEventListener('keydown',onKeyDown); removeEventListener('keyup',onKeyUp);
      removeEventListener('mousemove',onMouseMove); removeEventListener('mouseup',onMouseUp); };
  }

  // ---------------- 玩家 ----------------
  get maxHp(){ const m=Number(this.cheats&&this.cheats.maxHp); return m>0? m : 100; }
  spawnPlayer(){
    this.pos.set(rand(-8,8),0,rand(-8,8));
    this.pos.y=0; this.vel.y=0; this.vel.x=0; this.vel.z=0; this.peakY=0;
    this.hp=this.maxHp; this.boost=0; this.alive=true; this.stance='stand';
    this.buildViewModel();
  }
  buildViewModel(){
    if(this.viewmodel) this.camera.remove(this.viewmodel);
    const hero=this.opts.skin==='hero';
    const tone=(SKIN_TONES[this.prefs.skinTone]||SKIN_TONES.yellow).color;
    const skinColor=new THREE.Color(tone);
    const vm=new THREE.Group();
    const armW=this.gender==='female'?0.07:0.09;
    const armMat=new THREE.MeshLambertMaterial({color:skinColor, emissive:hero?0x664400:0x000000});
    const arm1=new THREE.Mesh(new THREE.BoxGeometry(armW,armW,0.5),armMat); arm1.position.set(-0.22,-0.18,-0.45);
    const arm2=arm1.clone(); arm2.position.set(0.24,-0.2,-0.35);
    vm.add(arm1,arm2);
    if(this.isMelee){
      // 平底锅（皮肤色，默认黑色）
      const s=MELEE_SKINS[this.prefs.panSkin||'none']||MELEE_SKINS.none;
      const mat=new THREE.MeshLambertMaterial({color:s.color, emissive:s.emissive||0x000000});
      const panG=new THREE.Group();
      const pan=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.19,0.035,16),mat); pan.position.z=-0.62;
      const rim=new THREE.Mesh(new THREE.TorusGeometry(0.18,0.02,6,16),mat); rim.position.set(0,0.01,-0.62); rim.rotation.x=Math.PI/2;
      const handle=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.3),mat); handle.position.z=-0.4;
      panG.add(pan,rim,handle);
      panG.position.set(0.12,-0.16,0);
      vm.add(panG);
      this.panGroup=panG; this.muzzleFlash=null;
    } else {
      const ws=WEAPON_SKINS[this.prefs.weaponSkins?.[this.wkey]||'none']||WEAPON_SKINS.none;
      const gunMat=new THREE.MeshLambertMaterial({color:ws.color, emissive:ws.emissive});
      const gun=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.13,0.85),gunMat); gun.position.set(0.12,-0.14,-0.7);
      const barrel=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.045,0.3),gunMat); barrel.position.set(0.12,-0.12,-1.1);
      this.muzzleFlash=new THREE.Mesh(new THREE.SphereGeometry(0.09,6,6),
        new THREE.MeshBasicMaterial({color:0xffd97a,transparent:true,opacity:0}));
      this.muzzleFlash.position.set(0.12,-0.12,-1.3);
      vm.add(gun,barrel,this.muzzleFlash);
    }
    vm.position.set(0,0,0);
    this.viewmodel=vm; this.camera.add(vm);
    if(!this.scene.children.includes(this.camera)) this.scene.add(this.camera);
  }
  // 使用道具时的外观（药物/饮料皮肤）
  showUseItem(kind){
    this.removeUseItem();
    const skins=kind==='heal'?MED_SKINS:DRINK_SKINS;
    const s=skins[this.prefs[kind==='heal'?'medSkin':'drinkSkin']||'classic']||skins.classic;
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.14,0.1),
      new THREE.MeshLambertMaterial({color:s.color, emissive:new THREE.Color(s.color).multiplyScalar(0.15)}));
    m.position.set(0.16,-0.26,-0.55); m.rotation.z=0.3;
    this.camera.add(m); this.useItemMesh=m;
  }
  removeUseItem(){ if(this.useItemMesh){ this.camera.remove(this.useItemMesh); this.useItemMesh=null; } }

  // ---------------- 投掷物 ----------------
  cycleThrowable(){
    const order=['frag','smoke','flash','molotov'];
    let idx=order.indexOf(this.throwable.type);
    for(let i=1;i<=4;i++){
      const t=order[(idx+i)%4];
      if(this.throwable.counts[t]>0){ this.throwable.type=t; this.onTip(`切换 ${THROWABLES[t].name}（剩余${this.throwable.counts[t]}）`); return; }
    }
    this.onTip('投掷物已用完');
  }
  throwCurrent(){
    const t=this.throwable.type;
    if(this.throwable.counts[t]<=0){ this.onTip('投掷物已用完'); return; }
    this.throwable.counts[t]--;
    const cfg=THROWABLES[t];
    const skin=THROWABLE_SKINS[this.prefs.throwableSkin||'classic']||THROWABLE_SKINS.classic;
    const color=t==='frag'?skin.frag: t==='smoke'?skin.smoke: t==='flash'?skin.flash: skin.molotov;
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,8),
      new THREE.MeshLambertMaterial({color, emissive:new THREE.Color(color).multiplyScalar(0.2)}));
    mesh.position.copy(this.camera.getWorldPosition(V3()));
    this.scene.add(mesh);
    this.projectiles.push({type:t, mesh,
      vel:new THREE.Vector3(0,0.38,-1).normalize().multiplyScalar(15).applyEuler(this.camera.rotation),
      fuse:(t==='frag'||t==='flash')?cfg.fuse:99, born:performance.now()});
    this.sfx.beep(300,0.06,0.2);
    this.onHud({event:'throw'});
  }
  updateProjectiles(dt){
    for(let i=this.projectiles.length-1;i>=0;i--){
      const p=this.projectiles[i];
      p.vel.y-=16*dt;
      p.mesh.position.addScaledVector(p.vel,dt);
      if(p.mesh.position.y<0.16){
        p.mesh.position.y=0.16;
        if(p.type==='molotov'||p.type==='smoke'){ this.explodeProjectile(p); this.scene.remove(p.mesh); this.projectiles.splice(i,1); continue; }
        p.vel.y=Math.abs(p.vel.y)*0.4; p.vel.x*=0.65; p.vel.z*=0.65;
      }
      p.fuse-=dt;
      if(p.fuse<=0){ this.explodeProjectile(p); this.scene.remove(p.mesh); this.projectiles.splice(i,1); }
    }
  }
  explodeProjectile(p){
    const cfg=THROWABLES[p.type], pos=p.mesh.position;
    if(p.type==='frag'){
      this.addSpark(pos.clone().setY(0.5), 0xffb050);
      for(let k=0;k<16;k++) this.addSpark(pos.clone().setY(0.5).add(V3(rand(-1,1),rand(0,1.5),rand(-1,1))), 0xff7030);
      this.sfx.shot('sniper');
      const R=cfg.radius;
      for(const b of this.bots){
        if(b.hp<=0) continue;
        const d=b.mesh.position.distanceTo(pos);
        if(d<R) this.hitBot(b, cfg.dmg*(1-d/R/1.4), false);
      }
      const pd=this.pos.distanceTo(pos);
      if(pd<R*1.2) this.damagePlayer(cfg.dmg*0.5*(1-pd/(R*1.4)));
      this.opts.onShake?.();
    } else if(p.type==='smoke'){
      const g=new THREE.Group();
      for(let k=0;k<8;k++){
        const s=new THREE.Mesh(new THREE.SphereGeometry(rand(1.2,2.2),7,7),
          new THREE.MeshLambertMaterial({color:0x9aa2ab, transparent:true, opacity:0.78}));
        s.position.copy(pos).add(V3(rand(-1.6,1.6), rand(0.5,2.4), rand(-1.6,1.6)));
        g.add(s);
      }
      this.scene.add(g);
      this.smokes.push({group:g, center:pos.clone(), r:cfg.radius, until:performance.now()+cfg.dur*1000});
    } else if(p.type==='flash'){
      this.sfx.beep(1500,0.25,0.5);
      const d=this.pos.distanceTo(pos);
      const to=new THREE.Vector3().subVectors(pos, this.camera.getWorldPosition(V3())).normalize();
      const facing=to.dot(new THREE.Vector3(0,0,-1).applyEuler(this.camera.rotation));
      if(d<cfg.radius && facing>-0.2) this.blindT=Math.max(this.blindT, cfg.dur*(1-d/cfg.radius*0.4));
      for(const b of this.bots) if(b.hp>0&&b.mesh.position.distanceTo(pos)<cfg.radius) b.blindUntil=performance.now()+cfg.dur*1000;
      this.addSpark(pos.clone().setY(1), 0xffffff);
    } else if(p.type==='molotov'){
      const g=new THREE.Group();
      for(let k=0;k<9;k++){
        const s=new THREE.Mesh(new THREE.SphereGeometry(rand(0.35,0.7),6,6),
          new THREE.MeshBasicMaterial({color:0xff7a22, transparent:true, opacity:0.85}));
        s.position.copy(pos).add(V3(rand(-cfg.radius*0.7,cfg.radius*0.7), rand(0.1,0.8), rand(-cfg.radius*0.7,cfg.radius*0.7)));
        g.add(s);
      }
      this.scene.add(g);
      this.fires.push({group:g, center:pos.clone(), r:cfg.radius, dps:cfg.dps, until:performance.now()+cfg.dur*1000});
      this.sfx.shot('shotgun');
    }
  }
  smokeBlocks(a,b){
    for(const s of this.smokes){
      if(performance.now()>s.until) continue;
      const ab=new THREE.Vector3().subVectors(b,a), ac=new THREE.Vector3().subVectors(s.center,a);
      const len=ab.length(); if(len<0.01) continue;
      const t=clamp(ac.dot(ab)/len**2,0,1);
      const d=new THREE.Vector3().copy(a).addScaledVector(ab,t).distanceTo(s.center);
      if(d<s.r*0.8) return true;
    }
    return false;
  }
  updateZones(dt){
    const now=performance.now();
    for(let i=this.smokes.length-1;i>=0;i--){
      if(now>this.smokes[i].until){ this.scene.remove(this.smokes[i].group); this.smokes.splice(i,1); }
    }
    for(let i=this.fires.length-1;i>=0;i--){
      const f=this.fires[i];
      if(now>f.until){ this.scene.remove(f.group); this.fires.splice(i,1); continue; }
      for(const s of f.group.children) s.material.opacity=0.6+Math.random()*0.3;
      for(const b of this.bots){
        if(b.hp>0 && b.mesh.position.distanceTo(f.center)<f.r) this.hitBot(b, f.dps*dt, false);
      }
      if(this.alive && this.pos.distanceTo(f.center)<f.r) this.damagePlayer(f.dps*dt);
    }
    // 闪光白屏
    const fl=document.getElementById('flash-overlay');
    if(fl){ fl.style.opacity=Math.min(1,this.blindT/0.8); }
    this.blindT=Math.max(0,this.blindT-dt);
  }
  get wkey(){ return this.slots[this.slot]; }
  get weapon(){ return WEAPONS[this.wkey] || MELEE; }
  get isMelee(){ return this.wkey==='pan'; }

  damagePlayer(dmg, fromDir){
    if(!this.alive) return;
    if(this.cheats&&this.cheats.god) return;   // 无敌
    this.hp=Math.min(this.hp, this.maxHp)-dmg;
    if(this.hp<=0){
      this.hp=0; this.alive=false; this.deaths++;
      this.respawnT = this.mode==='free'||this.mode==='multi' ? 3 : -1;
      this.onHud({event:'death'});
      if(this.mode==='level'||this.mode==='endless') this.endGame(false);
    }
    this.onHud({event:'hurt'});
  }

  shoot(){
    const w=this.weapon;
    if(this.reloading>0||this.fireCd>0||this.boltCd>0) return;
    if(this.isMelee){ this.meleeAttack(); return; }
    if(this.cheats&&this.cheats.aimbot) this.aimbotAim();          // 自瞄吸附
    if(!(this.cheats&&this.cheats.infAmmo) && this.ammo[this.wkey]<=0){ this.sfx.beep(220,0.06,0.2); this.startReload(); return; }
    if(!(this.cheats&&this.cheats.infAmmo)) this.ammo[this.wkey]--;
    this.fireCd=60/w.rpm;
    if(w.bolt) this.boltCd=1.1;
    this.sfx.shot(w.cls==='狙击枪'?'sniper':w.cls==='霰弹枪'?'shotgun':w.cls==='手枪'?'pistol':'ar');
    if(!(this.cheats&&this.cheats.noRecoil)) this.recoil=Math.min(this.recoil+0.028*w.recoil,0.14);
    this.muzzleFlash.material.opacity=1;
    const pellets=w.pellets||1;
    const moving=Math.hypot(this.vel.x,this.vel.z)>1.2;
    const baseSpread=(this.adsK>0.5? w.adsSpread : w.spread)*(moving?1.7:1)*(this.stance==='prone'?0.6:1)*(this.cheats&&this.cheats.noRecoil?0.15:1);
    for(let p=0;p<pellets;p++){
      const dir=new THREE.Vector3(0,0,-1).applyEuler(this.camera.rotation);
      dir.x+= (Math.random()-0.5)*baseSpread*2; dir.y+=(Math.random()-0.5)*baseSpread*2; dir.normalize();
      this.castBullet(dir, w);
    }
    this.onHud({event:'shot'});
    this.opts.onShoot?.();
  }
  // 自瞄：转向最近可视敌人头部
  aimbotAim(){
    let best=null, bd=1e9;
    const eye=this.camera.getWorldPosition(V3());
    for(const b of this.bots){
      if(b.hp<=0) continue;
      const d=b.mesh.position.distanceTo(this.pos);
      if(d<90&&d<bd){ best=b; bd=d; }
    }
    if(!best) return;
    const head=best.mesh.position.clone(); head.y=1.72;
    const v=head.sub(eye);
    const horiz=Math.sqrt(v.x*v.x+v.z*v.z);
    if(horiz<0.01) return;
    this.pitch=clamp(Math.atan2(v.y,horiz),-1.45,1.45);
    this.yaw=Math.atan2(-v.x,-v.z);
  }
  castBullet(dir,w){
    const origin=this.camera.getWorldPosition(V3());
    this.raycaster.set(origin,dir); this.raycaster.far=w.range*1.6;
    const targets=[...this.shootables];
    for(const b of this.bots) if(b.hp>0) targets.push(...b.mesh.userData.hitMeshes);
    for(const [,rp] of this.remotePlayers) if(rp.mesh) targets.push(...rp.mesh.userData.hitMeshes);
    const hits=this.raycaster.intersectObjects(targets,false);
    // 弹道
    const end=hits[0]? hits[0].point.clone() : origin.clone().add(dir.multiplyScalar(w.range));
    this.addTracer(origin.clone().add(dir.clone().multiplyScalar(1.2)), end);
    // 弹着点：火花 + 弹孔贴花（障碍物/地面留痕）
    if(!hits[0]) return;
    const hit=hits[0];
    const ud=hit.object.userData;
    if(ud.bot){ // 命中 AI 敌人
      const isHead=ud.part==='head';
      let dmg=w.dmg*(isHead?2.3:1);
      if(hit.distance>w.range) dmg*=0.55; else if(hit.distance>w.range*0.6) dmg*=0.8;
      this.hitBot(ud.bot,dmg,isHead);
    } else if(ud.remote){ // 命中远程玩家（联机：射手权威）
      this.opts.net?.sendHit(ud.remote.id, w.dmg*(ud.part==='head'?2.3:1));
      this.showHitMarker(false);
    } else {
      // 打在障碍物/地面上：留弹孔
      const normal=hit.face? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : V3(0,1,0);
      this.addDecal(hit.point, normal);
      this.addSpark(hit.point);
    }
  }
  // 弹孔贴花（最多保留 50 个，10 秒后淡出）
  addDecal(point, normal){
    const size=0.07+Math.random()*0.07;
    const d=new THREE.Mesh(new THREE.CircleGeometry(size,8),
      new THREE.MeshBasicMaterial({color:0x181818, transparent:true, opacity:0.9, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2}));
    d.position.copy(point).addScaledVector(normal, 0.02);
    d.lookAt(point.clone().add(normal));
    this.scene.add(d);
    this.decals.push({obj:d, born:performance.now()});
    if(this.decals.length>50){
      const old=this.decals.shift();
      this.scene.remove(old.obj); old.obj.geometry.dispose(); old.obj.material.dispose();
    }
  }
  hitBot(bot,dmg,isHead,silent){
    if(bot.hp<=0) return;
    bot.hp-=dmg;
    if(!silent){ this.showHitMarker(isHead);
      this.addSpark(bot.mesh.position.clone().setY(isHead?1.78:1.05), 0xc23a3a); }
    if(bot.hp<=0){
      bot.hp=0; this.kills++;
      bot.mesh.rotation.z=Math.PI/2; bot.mesh.position.y=0.3;
      this.onHud({event:'kill', name:bot.name||'AI士兵', head:isHead});
      if(!silent) this.sfx.beep(1200,0.12,0.35);
      this.checkWaveClear();
    }
  }
  showHitMarker(head){
    const el=document.getElementById('hit-marker');
    if(el){ el.style.opacity=1; el.style.background=head?'#ff9a5a':'#ffdf9a';
      clearTimeout(this._hmT); this._hmT=setTimeout(()=>el.style.opacity=0,120); }
  }
  // 平底锅近战挥击（扇形判定，可击中 AI 敌人 / 联机玩家）
  meleeAttack(){
    this.fireCd=MELEE.cd;
    this.swingT=0.3;                       // 挥击动画
    this.sfx.beep(180,0.05,0.2);
    const dir=new THREE.Vector3(0,0,-1).applyEuler(this.camera.rotation);
    const fwd=new THREE.Vector3(dir.x,0,dir.z).normalize();
    let hitAny=false;
    for(const b of this.bots){
      if(b.hp<=0) continue;
      const to=b.mesh.position.clone().sub(this.pos); to.y=0;
      const d=to.length();
      if(d<MELEE.range && to.normalize().dot(fwd)>0.35){
        this.hitBot(b, MELEE.dmg*(0.85+Math.random()*0.3), false);
        this.addSpark(b.mesh.position.clone().setY(1.1), 0xcccccc);
        hitAny=true;
      }
    }
    for(const [,rp] of this.remotePlayers){ // 联机：近战命中（射手权威）
      if(!rp.mesh) continue;
      const to=rp.mesh.position.clone().sub(this.pos); to.y=0;
      const d=to.length();
      if(d<MELEE.range && to.normalize().dot(fwd)>0.35){
        this.opts.net?.sendHit(rp.id, MELEE.dmg);
        this.showHitMarker(false); hitAny=true;
      }
    }
    this.sfx.beep(hitAny?820:150, hitAny?0.12:0.06, hitAny?0.4:0.15);
  }

  startReload(){
    const w=this.weapon;
    if(this.reloading>0||this.ammo[this.wkey]>=w.mag||this.reserve[w.ammo]<=0) return;
    this.reloading=w.reload; this.sfx.beep(520,0.1,0.25);
    this.onTip(`换弹中… ${w.name}`);
  }
  finishReload(){
    const w=this.weapon;
    const need=w.mag-this.ammo[this.wkey];
    const take=Math.min(need,this.reserve[w.ammo]);
    this.ammo[this.wkey]+=take; this.reserve[w.ammo]-=take;
  }
  switchTo(i){
    if(i===this.slot||i<0||i>=this.slots.length) return;
    this.slot=i; this.reloading=0; this.adsK=0; this.recoil=0;
    this.buildViewModel(); this.sfx.beep(700,0.05,0.2);
    this.onTip(`切换 ${this.weapon.name}`);
  }

  // ---------------- 特效 ----------------
  addTracer(a,b,color=0xffe6a0){
    const geo=new THREE.BufferGeometry().setFromPoints([a,b]);
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:0.85}));
    this.scene.add(line);
    this.effects.push({obj:line,life:0.06,t:0});
  }
  addSpark(p,color=0xffd27a){
    for(let i=0;i<5;i++){
      const s=new THREE.Mesh(new THREE.SphereGeometry(0.03,4,4),
        new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9}));
      s.position.copy(p);
      this.scene.add(s);
      this.effects.push({obj:s,life:0.25,t:0,vel:V3(rand(-2,2),rand(1,3),rand(-2,2))});
    }
  }
  updateEffects(dt){
    for(let i=this.effects.length-1;i>=0;i--){
      const e=this.effects[i]; e.t+=dt;
      if(e.vel){ e.obj.position.addScaledVector(e.vel,dt); e.vel.y-=8*dt; }
      e.obj.material.opacity=Math.max(0,0.9*(1-e.t/e.life));
      if(e.t>=e.life){ this.scene.remove(e.obj); this.effects.splice(i,1); }
    }
    if(this.muzzleFlash) this.muzzleFlash.material.opacity=Math.max(0,this.muzzleFlash.material.opacity-dt*12);
    // 平底锅挥击动画
    if(this.swingT>0){
      this.swingT=Math.max(0,this.swingT-dt);
      const p=1-this.swingT/0.3;
      if(this.panGroup){
        this.panGroup.rotation.x=-Math.sin(Math.min(p,1)*Math.PI)*1.35;
        this.panGroup.position.z=-0.25*Math.sin(Math.min(p,1)*Math.PI);
      }
    } else if(this.panGroup){
      this.panGroup.rotation.x*=0.7; this.panGroup.position.z*=0.7;
    }
    // 弹孔：10 秒后开始淡出
    const now=performance.now();
    for(let i=this.decals.length-1;i>=0;i--){
      const d=this.decals[i]; const age=(now-d.born)/1000;
      if(age>10){
        d.obj.material.opacity=Math.max(0, d.obj.material.opacity-dt*0.6);
        if(d.obj.material.opacity<=0.01){
          this.scene.remove(d.obj); d.obj.geometry.dispose(); d.obj.material.dispose();
          this.decals.splice(i,1);
        }
      }
    }
  }

  // ---------------- 敌人 ----------------
  spawnBot(x,z,strength,idx){
    const mesh=createHumanoid(this.opts.skin==='hero'?0x8a3a3a:0x9a4a3a,false);
    mesh.position.set(x,0,z); this.scene.add(mesh);
    const head=mesh.userData.hitMeshes[1], body=mesh.userData.hitMeshes[0];
    const bot={ id:'b'+Date.now().toString(36)+idx, name:'AI士兵-'+(idx+1),
      mesh, head, body, hp:100*Math.min(strength,1.6), maxHp:100*Math.min(strength,1.6),
      strength, yaw:0, state:'patrol', wp:V3(x,0,z), shootCd:rand(0.5,2), burst:0,
      cmd:{move:[0,0],shoot:false,until:0}, losCache:0, los:false };
    // 透视标记（作弊：头顶红色标记，默认隐藏）
    const esp=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,8),
      new THREE.MeshBasicMaterial({color:0xff2020, transparent:true, opacity:0.85, depthTest:false}));
    esp.position.y=2.25; esp.visible=false; mesh.add(esp);
    bot.esp=esp;
    body.userData.bot=bot; head.userData.bot=bot;
    this.bots.push(bot);
    return bot;
  }
  spawnByMode(){
    const o=this.opts;
    if(this.mode==='level'){
      const lv=LEVELS[clamp((o.level||1)-1,0,LEVELS.length-1)];
      this.mapId=lv.map; this.timeLeft=0;
      for(let i=0;i<lv.bots;i++) this.spawnBot(rand(-this.mapBounds*0.7,this.mapBounds*0.7),rand(-this.mapBounds*0.7,this.mapBounds*0.7),lv.strength,i);
      this.onTip(`第 ${lv.lv} 关：消灭全部 ${lv.bots} 名敌军`);
    } else if(this.mode==='free'){
      const n=clamp(o.freeOpts?.bots??8,1,24), s=parseFloat(o.freeOpts?.strength??0.8);
      this.timeLeft=0;
      for(let i=0;i<n;i++) this.spawnBot(rand(-this.mapBounds*0.7,this.mapBounds*0.7),rand(-this.mapBounds*0.7,this.mapBounds*0.7),s,i);
    } else if(this.mode==='endless'){
      this.wave=0; this.timeLeft=0; this.nextWave();
    }
  }
  nextWave(){
    this.wave++;
    const n=Math.min(3+this.wave,14), s=0.6+this.wave*0.12;
    for(let i=0;i<n;i++) this.spawnBot(rand(-this.mapBounds*0.7,this.mapBounds*0.7),rand(-this.mapBounds*0.7,this.mapBounds*0.7),s,i);
    this.hp=Math.min(this.maxHp,this.hp+30); this.medkits=Math.min(3,this.medkits+1); this.drinks=Math.min(4,this.drinks+1);
    this.onTip(`第 ${this.wave} 波来袭！（共 ${n} 名）`);
    this.sfx.beep(980,0.2,0.4);
  }
  checkWaveClear(){
    if(this.mode==='level'){
      if(this.bots.every(b=>b.hp<=0)){
        this.endGame(true,{level:(this.opts.level||1), cleared:true});
      }
    } else if(this.mode==='endless'){
      if(this.bots.every(b=>b.hp<=0)){ setTimeout(()=>{ if(this.state==='playing') this.nextWave(); },2500); }
    } else if(this.mode==='free'){
      // 补兵
      const alive=this.bots.filter(b=>b.hp>0).length;
      const want=this.opts.freeOpts?.bots??8;
      for(let i=alive;i<want;i++) this.spawnBot(rand(-this.mapBounds*0.7,this.mapBounds*0.7),rand(-this.mapBounds*0.7,this.mapBounds*0.7),parseFloat(this.opts.freeOpts?.strength??0.8),this.bots.length);
    }
  }

  // ---------------- 远程玩家（联机） ----------------
  addRemote(p){ // p:{id,name,skin,team}
    const mesh=createHumanoid(p.skin==='hero'?0xffc84d:(p.team===1?0x3a6ab0:0xb03a3a), p.skin==='hero');
    this.scene.add(mesh);
    const ud={part:'remote', remote:p};
    mesh.userData.hitMeshes.forEach(m=>m.userData=ud);
    this.remotePlayers.set(p.id,{...p,mesh,lastSeen:performance.now()});
    this.onTip(`${p.name} 加入了战场`);
  }
  updateRemote(id,st){
    const rp=this.remotePlayers.get(id); if(!rp||!rp.mesh) return;
    rp.lastSeen=performance.now();
    rp.mesh.position.set(st.p[0],st.p[1],st.p[2]);
    rp.mesh.rotation.y=st.yaw;
    if(rp.mesh.userData.hp!==st.hp){
      rp.mesh.userData.hp=st.hp;
      const body=rp.mesh.userData.hitMeshes[0];
      body.material=body.material.clone(); body.material.color.multiplyScalar(0.8);
    }
    if(st.hp<=0) rp.mesh.rotation.z=Math.PI/2; else rp.mesh.rotation.z=0;
  }
  removeRemote(id){
    const rp=this.remotePlayers.get(id);
    if(rp&&rp.mesh) this.scene.remove(rp.mesh);
    this.remotePlayers.delete(id);
    this.onTip(`${rp?.name||'玩家'} 离开了`);
  }

  // ---------------- 物理与更新 ----------------
  collide(nx,nz){
    // 简单 AABB 圆柱碰撞（半径 0.42）
    const R=0.42, feetY=this.pos.y+0.05, headY=this.pos.y+(this.stance==='prone'?0.6:1.7);
    for(const c of this.colliders){
      if(headY<c.min.y||feetY>c.max.y) continue;
      const cx=clamp(nx,c.min.x,c.max.x), cz=clamp(nz,c.min.z,c.max.z);
      const dx=nx-cx, dz=nz-cz, d2=dx*dx+dz*dz;
      if(d2<R*R){
        const d=Math.sqrt(d2)||0.001;
        nx=cx+dx/d*R; nz=cz+dz/d*R;
      }
    }
    return [nx,nz];
  }
  updatePlayer(dt){
    // 输入合成
    let f=this.input.fwd, r=this.input.right;
    if(this.keys['KeyW']||this.keys['ArrowUp'])f+=1;
    if(this.keys['KeyS']||this.keys['ArrowDown'])f-=1;
    if(this.keys['KeyA']||this.keys['ArrowLeft'])r-=1;
    if(this.keys['KeyD']||this.keys['ArrowRight'])r+=1;
    // 视角
    const adsMul=this.adsK>0.5?this.settings.sensAds??0.8:1;
    this.yaw   -= this.input.look.dx*0.0022*(this.settings.sensX??1)*adsMul;
    this.pitch -= this.input.look.dy*0.0022*(this.settings.sensY??1)*adsMul;
    this.pitch=clamp(this.pitch,-1.45,1.45);
    this.input.look.dx=0; this.input.look.dy=0;
    // 姿态
    if(this.input.crouchHeld){ this.stance=this.stance==='crouch'?'stand':'crouch'; this.input.crouchHeld=false; }
    if(this.input.proneHeld){ this.stance=this.stance==='prone'?'stand':'prone'; this.input.proneHeld=false; }
    const targetEye={stand:1.6,crouch:1.05,prone:0.45}[this.stance];
    this.eyeY+=(targetEye-this.eyeY)*Math.min(1,dt*8);
    // 移动
    const speed={stand:(this.keys["ShiftLeft"]?3.2:6.2),crouch:2.4,prone:1.0}[this.stance]*(this.adsK>0.5?0.55:1)*((this.cheats&&this.cheats.speedMul>1)?this.cheats.speedMul:1);
    const len=Math.hypot(f,r)||1;
    const mx=(Math.sin(this.yaw)*-f + Math.cos(this.yaw)*r)/len*speed;
    const mz=(Math.cos(this.yaw)*-f - Math.sin(this.yaw)*r)/len*speed;
    this.vel.x+=(mx-this.vel.x)*Math.min(1,dt*10);
    this.vel.z+=(mz-this.vel.z)*Math.min(1,dt*10);
    // 跳跃/重力
    if(this.input.jump && this.pos.y<=0.01 && this.stance!=='prone'){
      this.vel.y=6.2; this.stance='stand'; this.input.jump=false;
    } else this.input.jump=false;
    this.vel.y-=16*dt;
    let ny=this.pos.y+this.vel.y*dt;
    // 空中记录最高点（坠落伤害用）
    if(this.pos.y>0.05||this.vel.y>0) this.peakY=Math.max(this.peakY,this.pos.y);
    const wasFalling=this.vel.y<-0.1;
    let landedY=null;
    if(ny<=0){ landedY=0; ny=0; this.vel.y=0; }
    // 屋顶碰撞（简化：站上低箱）
    let standH=0;
    for(const c of this.colliders){
      if(this.pos.x>c.min.x-0.3&&this.pos.x<c.max.x+0.3&&this.pos.z>c.min.z-0.3&&this.pos.z<c.max.z+0.3){
        if(c.max.y<=this.pos.y+1.2&&c.max.y>standH) standH=c.max.y;
      }
    }
    if(landedY===null&&ny<standH&&this.vel.y<=0&&this.pos.y>=standH-0.3){ landedY=standH; ny=standH; this.vel.y=0; }
    this.pos.y=ny;
    // 高空坠落伤害（超过 3.5 米开始，越 high 越疼）
    if(landedY!==null&&wasFalling){
      const fallH=this.peakY-landedY;
      if(fallH>3.5){
        const dmg=Math.max(1,Math.round((fallH-3.5)*11));
        this.damagePlayer(dmg);
        this.onTip(`高空坠落 -${dmg} HP`);
        this.sfx.beep(110,0.2,0.5);
      }
      this.peakY=0;
    }
    if(this.pos.y<=0.05&&landedY===null) this.peakY=0;
    let [nx,nz]=this.collide(this.pos.x+this.vel.x*dt,this.pos.z+this.vel.z*dt);
    nx=clamp(nx,-this.mapBounds,this.mapBounds); nz=clamp(nz,-this.mapBounds,this.mapBounds);
    this.pos.x=nx; this.pos.z=nz;
    // 武器状态
    this.fireCd-=dt; this.boltCd-=dt;
    if(this.reloading>0){ this.reloading-=dt; if(this.reloading<=0){ this.reloading=0; this.finishReload(); } }
    if(this.input.fire && this.alive) this.shoot();
    const w=this.weapon;
    const adsTarget=this.input.ads?1:0;
    this.adsK+=(adsTarget-this.adsK)*Math.min(1,dt*8);
    this.camera.fov=(this.settings.fov??75)/ (1+this.adsK*(w.zoom-1)*0.55);
    this.camera.updateProjectionMatrix();
    this.recoil=Math.max(0,this.recoil-dt*0.25);
    // 使用道具
    if(this.input.healHeld){ if(this.medkits>0&&this.hp<100){ this.useAction='heal'; this.useT=0; this.medkits--; this.input.healHeld=false; this.showUseItem('heal'); this.onTip('使用急救包…'); } else this.input.healHeld=false; }
    if(this.input.drinkHeld){ if(this.drinks>0&&this.boost<100){ this.useAction='drink'; this.useT=0; this.drinks--; this.input.drinkHeld=false; this.showUseItem('drink'); this.onTip('饮用能量饮料…'); } else this.input.drinkHeld=false; }
    if(this.useAction){
      this.useT+=dt;
      if(this.useItemMesh) this.useItemMesh.rotation.y+=dt*3;
      if(this.useT>=3.5){
        if(this.useAction==='heal') this.hp=Math.min(this.maxHp,this.hp+75);
        else this.boost=Math.min(100,this.boost+40);
        this.useAction=null; this.removeUseItem(); this.onTip('使用完成');
      }
    }
    if(this.boost>0){ this.boost=Math.max(0,this.boost-dt*2.2); this.hp=Math.min(this.maxHp,this.hp+dt*3.2); }
    // 输入开关槽位
    if(this.input.switchSlot!==null){ this.switchTo(this.input.switchSlot); this.input.switchSlot=null; }
    // 相机
    const bob=Math.sin(performance.now()*0.011)*(Math.hypot(this.vel.x,this.vel.z)>1?0.015:0);
    this.camera.position.set(this.pos.x,this.pos.y+this.eyeY+bob,this.pos.z);
    this.camera.rotation.set(this.pitch+this.recoil, this.yaw, 0,'YXZ');
    // 受伤屏幕
    const vg=document.getElementById('vignette');
    if(vg) vg.style.boxShadow=`inset 0 0 ${this.hp<40?200:120}px rgba(160,0,0,${this.hp<40?0.55:0.25})`;
  }

  updateBots(dt){
    if(this.mode==='multi') return;
    const espOn=!!(this.cheats&&this.cheats.esp);
    const pp=this.pos;
    for(const bot of this.bots){
      if(bot.esp) bot.esp.visible=espOn&&bot.hp>0;
      if(bot.hp<=0) continue;
      // 视线检测（每 0.4s）
      bot.losCache-=dt;
      if(bot.losCache<=0){
        bot.losCache=0.4;
        const eye=V3(bot.mesh.position.x,1.6,bot.mesh.position.z);
        const to=V3(pp.x,pp.y+1.4,pp.z).sub(eye);
        const dist=to.length();
        bot.dist=dist;
        if(dist<70){
          this.raycaster.set(eye,to.normalize()); this.raycaster.far=dist-0.6;
          const block=this.raycaster.intersectObjects(this.shootables,false);
          bot.los=block.length===0 && !this.smokeBlocks(eye, V3(pp.x,pp.y+1.4,pp.z));
        } else bot.los=false;
      }
      // GLM 指令有效期
      const useCmd=performance.now()<bot.cmd.until;
      let mvx,mvz,shoot;
      if(useCmd){
        mvx=bot.cmd.move[0]; mvz=bot.cmd.move[1]; shoot=bot.cmd.shoot;
        bot.cmd.until= useCmd&&performance.now()>bot.cmd.until-100 ? bot.cmd.until : bot.cmd.until;
      } else {
        // 本地兜底 FSM
        const t=this.localBotThink(bot,dt);
        mvx=t[0]; mvz=t[1]; shoot=t[2];
      }
      const spd=(1.6+bot.strength*2.2)* (bot.state==='chase'?1:0.7);
      let nx=bot.mesh.position.x+mvx*spd*dt, nz=bot.mesh.position.z+mvz*spd*dt;
      nx=clamp(nx,-this.mapBounds,this.mapBounds); nz=clamp(nz,-this.mapBounds,this.mapBounds);
      // 障碍避让（简单推离）
      for(const c of this.colliders){
        if(c.max.y<0.6) continue;
        const cx=clamp(nx,c.min.x,c.max.x), cz=clamp(nz,c.min.z,c.max.z);
        const dx=nx-cx,dz=nz-cz,d2=dx*dx+dz*dz;
        if(d2<0.36){ const d=Math.sqrt(d2)||0.01; nx=cx+dx/d*0.6; nz=cz+dz/d*0.6; }
      }
      bot.mesh.position.x=nx; bot.mesh.position.z=nz;
      // 朝向
      if(bot.los){
        bot.yaw=Math.atan2(pp.x-nx,pp.z-nz);
        bot.mesh.rotation.y=bot.yaw;
      } else if(mvx||mvz){ bot.mesh.rotation.y=Math.atan2(mvx,mvz); }
      // 射击
      bot.shootCd-=dt;
      if(shoot&&bot.los&&bot.shootCd<=0&&this.alive&&bot.dist<60&&performance.now()>(bot.blindUntil||0)){
        bot.shootCd=Math.max(0.12,(0.9-bot.strength*0.35))*rand(0.7,1.3);
        bot.burst=3;
        const acc=0.14/bot.strength * (this.stance==='prone'?1.6:1);
        const hitP=clamp(0.42*bot.strength - (this.stance==='prone'?0.08:0), 0.03, 0.75);
        if(Math.random()<hitP*(1/(1+bot.dist*0.012))){
          const dmg=(7+bot.strength*8)*(Math.random()<0.15?1.8:1);
          this.damagePlayer(dmg);
        }
        // 弹道特效（朝玩家）
        const eye=V3(bot.mesh.position.x,1.5,bot.mesh.position.z);
        const end=V3(pp.x+rand(-1.5,1.5),pp.y+1.3+rand(-0.6,0.6),pp.z+rand(-1.5,1.5));
        this.addTracer(eye,end,0xffb090);
        if(bot.dist<45) this.sfx.shot('ar');
      }
    }
  }
  localBotThink(bot,dt){
    // 简单 FSM：巡逻→追击→扫射
    const p=this.pos, bp=bot.mesh.position;
    if(bot.los&&bot.dist<55){ bot.state='chase'; }
    else if(bot.state==='chase'&&(!bot.los||bot.dist>70)) bot.state='patrol';
    if(bot.state==='patrol'){
      const d=V3(bot.wp.x-bp.x,0,bot.wp.z-bp.z);
      if(d.length()<2){ bot.wp.set(rand(-this.mapBounds*0.75,this.mapBounds*0.75),0,rand(-this.mapBounds*0.75,this.mapBounds*0.75)); }
      d.normalize();
      return [d.x,d.z,false];
    }
    // chase：保持中距 + 横向走位
    const to=V3(p.x-bp.x,0,p.z-bp.z); const dist=to.length(); to.normalize();
    const side=V3(-to.z,0,to.x).multiplyScalar(Math.sin(performance.now()*0.001*0.7+bot.mesh.position.x)>0?1:-1);
    const hold=dist>22?1:(dist<10?-0.8:0);
    return [to.x*hold+side.x*0.7, to.z*hold+side.z*0.7, true];
  }

  endGame(win,extra={}){
    if(this.state!=='playing') return;
    this.state='over';
    this.onOver({win,kills:this.kills,deaths:this.deaths,wave:this.wave,...extra});
  }

  // ---------------- 主循环 ----------------
  loop(){
    this._raf=requestAnimationFrame(()=>this.loop());
    const dt=Math.min(this.clock.getDelta(),0.05);
    if(this.enabled!==false){
      if(this.alive||this.respawnT>0) this.updatePlayer(dt);
      this.updateBots(dt);
      this.updateEffects(dt);
      this.updateProjectiles(dt);
      this.updateZones(dt);
      if(this.respawnT>0){
        this.respawnT-=dt;
        if(this.respawnT<=0){ this.spawnPlayer(); this.onTip('重新部署'); }
      }
      if(!this.alive&&this.mode==='multi'&&this.respawnT<=0&&this.state==='playing'){
        // 联机死亡后 3 秒重生
        this.respawnT=0.01;
      }
      if(this.timeLeft>0&&this.state==='playing'){
        this.timeLeft-=dt;
        if(this.timeLeft<=0){ this.timeLeft=0; this.endGame(true,{timeout:true}); }
      }
      this.opts.net?.tickNet?.(dt,this);
      this.onHud({dt});
    }
    this.renderer.render(this.scene,this.camera);
  }
  resize(){ this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth,innerHeight); }
  dispose(){
    cancelAnimationFrame(this._raf); this._cleanupInput?.();
    this.renderer.dispose();
    this.scene.traverse(o=>{ o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
}
function rand2(rng,a,b){ return a+rng()*(b-a); }
