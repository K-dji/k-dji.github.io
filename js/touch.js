// ============================================================
// peace-strike-3d · 触屏控制 + 自定义键位布局（拖拽保存）
// ============================================================

const DEFAULT_BTNS = [
  {id:'fire',  label:'开火', x:86, y:62, big:true},
  {id:'ads',   label:'开镜', x:86, y:38},
  {id:'jump',  label:'跳',   x:74, y:78},
  {id:'crouch',label:'蹲',   x:63, y:86},
  {id:'prone', label:'趴',   x:52, y:90},
  {id:'reload',label:'换弹', x:74, y:52},
  {id:'heal',  label:'打药', x:63, y:70},
  {id:'drink', label:'饮料', x:52, y:72},
  {id:'swap',  label:'换枪', x:90, y:20},
  {id:'throw', label:'投掷', x:74, y:62},
  {id:'cycleTh',label:'换雷', x:63, y:56},
];

export function isTouch(){ return ('ontouchstart' in window) || navigator.maxTouchPoints>0; }

// 移动端全局：禁双击缩放 / 禁长按菜单 / 禁选择复制 / 禁按压反馈
// 输入框（账号、密码、聊天等）保留正常编辑能力
export function suppressTouchFeedback(){
  const isEditable=e=>!!(e.target.closest&&e.target.closest('input,select,textarea,[contenteditable]'));
  // 双击：不缩放、不选词
  document.addEventListener('dblclick', e=>{ if(!isEditable(e)) e.preventDefault(); });
  // 长按菜单（安卓）
  document.addEventListener('contextmenu', e=>{ if(!isEditable(e)) e.preventDefault(); });
  // 选择文本（全局 user-select:none 已挡，这里双保险）
  document.addEventListener('selectstart', e=>{ if(!isEditable(e)) e.preventDefault(); });
  // 复制动作兜底拦截
  document.addEventListener('copy', e=>{ if(!isEditable(e)) e.preventDefault(); });
  // 长按保护：按下 500ms 未松开且不在输入框 → 记录（系统手势由 CSS+contextmenu 拦截）
  let pressT=null;
  document.addEventListener('touchstart', e=>{
    if(isEditable(e)){ clearTimeout(pressT); pressT=null; return; }
    pressT=setTimeout(()=>{ pressT=null; }, 500);
  }, {passive:true});
  document.addEventListener('touchmove', ()=>{ clearTimeout(pressT); pressT=null; }, {passive:true});
  document.addEventListener('touchend', e=>{
    clearTimeout(pressT); pressT=null;
    // 300ms 内二次点触：拦截（防双击缩放/选词）
    const now=Date.now();
    if(now-lastTap<300 && !isEditable(e)) e.preventDefault();
    lastTap=now;
  }, {passive:false});
}

export class TouchControls {
  constructor(gameGetter, settingsGetter){
    this.getGame=gameGetter;
    this.getSettings=settingsGetter;
    this.layout=loadLayout();
    this.zone=null; this.stage=null;
    this.btnEls=new Map();
    this.editing=false;
  }

  build(container){
    this.zone=container;
    container.innerHTML='';
    const ui=document.getElementById('touch-ui');
    // 动态按钮
    for(const b of this.layout){
      const el=document.createElement('div');
      el.className='tbtn'+(b.big?' big':'');
      el.textContent=b.label;
      el.style.left=b.x+'%'; el.style.top=b.y+'%';
      el.dataset.id=b.id;
      ui.appendChild(el);
      this.btnEls.set(b.id, el);
      this.bindButton(el, b);
    }
    this.bindJoystick();
    this.bindLook();
  }

  bindButton(el, b){
    const g=()=>this.getGame();
    const down=e=>{ e.preventDefault();
      if(this.editing) return;
      const game=g(); if(!game) return;
      switch(b.id){
        case 'fire': game.input.fire=true; break;
        case 'ads':  game.input.ads=true; break;
        case 'jump': game.input.jump=true; break;
        case 'crouch': game.input.crouchHeld=true; break;
        case 'prone':  game.input.proneHeld=true; break;
        case 'reload': game.input.reloadHeld=true; break;
        case 'heal':   game.input.healHeld=true; break;
        case 'drink':  game.input.drinkHeld=true; break;
        case 'swap':   game.input.switchSlot=(game.slot+1)%game.slots.length; break;
        case 'throw':  game.throwCurrent(); break;
        case 'cycleTh': game.cycleThrowable(); break;
      }
    };
    const up=e=>{
      const game=g(); if(!game) return;
      if(b.id==='fire') game.input.fire=false;
      if(b.id==='ads')  game.input.ads=false;
    };
    el.addEventListener('touchstart',down,{passive:false});
    el.addEventListener('touchend',up); el.addEventListener('touchcancel',up);
    // 键位编辑：拖动
    el.addEventListener('pointerdown',e=>{
      if(!this.editing) return;
      e.preventDefault();
      const stage=this.stage;
      const move=ev=>{
        const r=stage.getBoundingClientRect();
        const x=clampPct((ev.clientX-r.left)/r.width*100,3,95);
        const y=clampPct((ev.clientY-r.top)/r.height*100,3,95);
        el.style.left=x+'%'; el.style.top=y+'%';
        const item=this.layout.find(i=>i.id===b.id);
        if(item){ item.x=Math.round(x); item.y=Math.round(y); }
      };
      const end=()=>{ removeEventListener('pointermove',move); removeEventListener('pointerup',end); };
      addEventListener('pointermove',move); addEventListener('pointerup',end);
    });
  }

  bindJoystick(){
    const zone=document.getElementById('joy-zone');
    const knob=document.getElementById('joy-knob');
    if(!zone) return;
    let pid=null;
    const handle=e=>{
      const game=this.getGame(); if(!game||this.editing) return;
      const t=[...e.touches].find(t=>t.identifier===pid)||e.touches[0];
      if(!t) return;
      e.preventDefault();
      const r=zone.getBoundingClientRect();
      const cx=r.left+r.width/2, cy=r.top+r.height/2;
      let dx=(t.clientX-cx)/(r.width/2), dy=(t.clientY-cy)/(r.height/2);
      const len=Math.hypot(dx,dy); if(len>1){dx/=len;dy/=len;}
      knob.style.transform=`translate(${dx*70}%,${dy*70}%) translate(-50%,-50%)`;
      game.input.fwd=-dy; game.input.right=dx;
    };
    zone.addEventListener('touchstart',e=>{ pid=e.touches[0].identifier; handle(e); },{passive:false});
    zone.addEventListener('touchmove',handle,{passive:false});
    const end=e=>{
      pid=null; knob.style.transform='translate(-50%,-50%)';
      const game=this.getGame(); if(game){ game.input.fwd=0; game.input.right=0; }
    };
    zone.addEventListener('touchend',end); zone.addEventListener('touchcancel',end);
  }

  bindLook(){
    const zone=document.getElementById('look-zone');
    if(!zone) return;
    let last=null;
    zone.addEventListener('touchstart',e=>{ last=e.touches[0]; },{passive:false});
    zone.addEventListener('touchmove',e=>{
      const game=this.getGame(); if(!game||this.editing){ last=e.touches[0]; return; }
      const t=e.touches[0];
      const game2=game;
      game2.input.look.dx+=(t.clientX-last.clientX)*(t.clientX<last.clientX?1:1);
      game2.input.look.dy+=(t.clientY-last.clientY);
      last=t; e.preventDefault();
    },{passive:false});
    zone.addEventListener('touchend',()=>{ last=null; });
  }

  // ---------- 键位编辑器 ----------
  openEditor(stage){
    this.editing=true;
    this.stage=stage;
    stage.innerHTML='';
    for(const b of this.layout){
      const el=document.createElement('div');
      el.className='tbtn'+(b.big?' big':'');
      el.textContent=b.label;
      el.style.left=b.x+'%'; el.style.top=b.y+'%';
      const item=this.layout.find(i=>i.id===b.id);
      this.bindButton(el, item);
      stage.appendChild(el);
    }
  }
  closeEditor(save){
    this.editing=false;
    if(save) saveLayout(this.layout);
    // 刷新真实按钮位置
    for(const b of this.layout){
      const el=this.btnEls.get(b.id);
      if(el){ el.style.left=b.x+'%'; el.style.top=b.y+'%'; }
    }
  }
  resetLayout(){ this.layout=JSON.parse(JSON.stringify(DEFAULT_BTNS)); saveLayout(this.layout);
    for(const b of this.layout){ const el=this.btnEls.get(b.id); if(el){ el.style.left=b.x+'%'; el.style.top=b.y+'%'; } } }
}

function clampPct(v,a,b){ return Math.max(a,Math.min(b,v)); }
function loadLayout(){
  try{ const s=localStorage.getItem('pe3d_layout'); if(s) return JSON.parse(s); }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_BTNS));
}
function saveLayout(l){ try{ localStorage.setItem('pe3d_layout', JSON.stringify(l)); }catch(e){} }
