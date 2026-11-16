// ============================================================
// peace-strike-3d · 敌人 AI 决策（GLM-4.5-Flash 优先，本地兜底）
// 策略：批量把敌人状态发给 Worker 代理 → Zhipu GLM-4.5-Flash；
//       Worker 不可用 / 模型无响应（超时或连续失败）时自动切回本地 FSM。
// ============================================================

import { API_BASE } from './config.js';

export class AIManager {
  constructor(game, getToken){
    this.game=game;
    this.getToken=getToken;
    this.interval=2.0;          // 决策周期（秒）
    this.timer=1.2;
    this.failCount=0;
    this.maxFail=2;             // 连续失败 N 次进入本地兜底
    this.localUntil=0;          // 本地兜底截止时间戳
    this.retryAfter=30000;      // 兜底 30 秒后重试模型
    this.pending=false;
    this.timeoutMs=3500;        // 模型无响应判定
  }

  update(dt){
    if(this.game.mode==='multi') return;
    this.timer-=dt;
    if(this.timer<=0 && !this.pending){
      this.timer=this.interval;
      const alive=this.game.bots.filter(b=>b.hp>0);
      if(!alive.length) return;
      const now=Date.now();
      if(now<this.localUntil){ return; }   // 兜底期内不请求
      this.requestDecisions(alive);
    }
  }

  buildPayload(bots){
    const g=this.game, p=g.pos;
    return {
      mode: g.mode,
      player: { hp: Math.round(g.hp), pos:[+p.x.toFixed(1),+p.z.toFixed(1)],
                stance:g.stance, alive:g.alive },
      bots: bots.slice(0,8).map(b=>({
        id:b.id,
        hp:Math.round(b.hp/b.maxHp*100),
        pos:[+b.mesh.position.x.toFixed(1),+b.mesh.position.z.toFixed(1)],
        dist:Math.round(b.dist||99),
        los:!!b.los,
        state:b.state
      })),
      bounds: Math.round(g.mapBounds)
    };
  }

  async requestDecisions(bots){
    this.pending=true;
    const ctrl=new AbortController();
    const kill=setTimeout(()=>ctrl.abort(), this.timeoutMs);   // 无响应 → 超时
    try{
      const res=await fetch(API_BASE+'/api/ai/decision',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+(this.getToken()||'')},
        body:JSON.stringify(this.buildPayload(bots)),
        signal:ctrl.signal
      });
      clearTimeout(kill);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      const acts=data.decisions||{};
      let used=0;
      for(const b of bots){
        const a=acts[b.id];
        if(a && Array.isArray(a.move)){
          const [x,z]=a.move;
          const ok=(typeof x==='number'&&typeof z==='number'&&isFinite(x)&&isFinite(z));
          b.cmd.move= ok?[Math.max(-1,Math.min(1,x)),Math.max(-1,Math.min(1,z))]:[0,0];
          b.cmd.shoot= !!a.shoot;
          b.cmd.until= performance.now()+this.interval*1000+600;
          if(ok) used++;
        }
      }
      this.failCount=0;   // 成功 → 恢复模型决策
      if(used===0) throw new Error('模型返回空决策');
    }catch(e){
      clearTimeout(kill);
      this.failCount++;
      if(this.failCount>=this.maxFail){
        this.localUntil=Date.now()+this.retryAfter;
        this.failCount=0;
        // 通知 UI（可选）
        this.game.onTip?.('AI 云端决策暂不可用，已切换本地战术引擎');
      }
    }finally{
      this.pending=false;
    }
  }
}
