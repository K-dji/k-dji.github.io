// ============================================================
// peace-strike-3d · 多人联机（WebRTC 点对点 + D1 轮询信令）
// 纯 Pages 架构：无 WebSocket / 无 Durable Objects，国内可直连。
// 信令（SDP/ICE/房间事件）通过 /api/room sync 与 /api/presence 轮询中转，
// 游戏数据在连接建立后走 P2P DataChannel，不经过服务器。
// ============================================================

import { API_BASE } from './config.js';
const ICE = { iceServers:[ {urls:['stun:stun.l.google.com:19302','stun:stun.qq.com','stun:stun1.l.google.com:19302']} ] };

function genPid(){ return 'p'+Math.random().toString(36).slice(2,10); }

// ---------- 大厅在线（心跳轮询：在线列表 / 邀请 / 好友申请） ----------
export class PresencePoll {
  constructor(opts){ this.opts=opts; this.name=null; this.room=null; this.timer=null; this.stopped=false; }
  async connect(name){
    this.name=name; this.stopped=false;
    await this.beat();                          // hello 即首次 beat
    this.timer=setInterval(()=>this.beat(), 5000);
  }
  async beat(){
    if(this.stopped) return;
    try{
      const res=await fetch(API_BASE+'/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'beat', name:this.name, inRoom:this.room})});
      if(!res.ok) return;
      const data=await res.json();
      if(data.list) this.opts.onPresence?.(data.list);
      for(const msg of data.inbox||[]){
        if(msg.kind==='invite') this.opts.onInvite?.(msg);
        else if(msg.kind==='friendReq') this.opts.onFriendReq?.(msg);
      }
    }catch(e){ /* 网络抖动忽略，下轮再试 */ }
  }
  setRoom(code){ this.room=code; }
  async invite(to, code){
    try{ await fetch(API_BASE+'/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'beat', name:this.name, inRoom:this.room, invite:to, code})}); }catch(e){}
  }
  async requestJoin(to){
    try{ await fetch(API_BASE+'/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'beat', name:this.name, inRoom:this.room, friendReqTo:to})}); }catch(e){}
  }
  close(){ this.stopped=true; if(this.timer) clearInterval(this.timer); }
}

// ---------- 房间（D1 轮询信令 + WebRTC 网状） ----------
export class RoomClient {
  constructor(opts){
    // opts: {name, skin, onMsg, onClose}
    this.opts=opts;
    this.pid=genPid();
    this.myId=this.pid;
    this.code=null; this.isHost=false;
    this.players=new Map();
    this.peers=new Map();     // pid -> RTCPeerConnection
    this.channels=new Map();  // pid -> {reliable, fast}
    this.requests=[];         // 入组申请（房主视角）
    this.timeLimit=600; this.mapId='training';
    this.started=false;
    this.outbox=[];
    this.timer=null;
    this._sendAcc=0;
    this.lastPlayersKey='';
  }

  // ---------- 创建 / 加入 ----------
  async create(mapId, timeLimit){
    const r=await this._post({action:'create', name:this.opts.name, skin:this.opts.skin,
      map:mapId, time:timeLimit, pid:this.pid});
    this._applyJoin(r, true);
  }
  async joinByCode(code){
    const r=await this._post({action:'join', code:code.toUpperCase(), name:this.opts.name, skin:this.opts.skin, pid:this.pid});
    if(!r.ok){ this.opts.onMsg?.({type:r.error||'badCode'}); return; }
    this._applyJoin(r, false);
    this.opts.onMsg?.({type:'pending'});   // 等待房主同意
  }
  _applyJoin(r, host){
    this.code=r.code; this.isHost=host; this.hostPid=r.host||this.pid;
    this.timeLimit=r.time; this.mapId=r.map;
    this.players=new Map((r.players||[]).map(p=>[p.pid,p]));
    this._startSync();
    this.opts.onMsg?.({type:'welcome', you:this.pid, code:r.code, host,
      players:[...this.players.values()], time:r.time, map:r.map});
  }
  async _post(body){
    const res=await fetch(API_BASE+'/api/room',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({error:'网络错误'}));
    if(!res.ok && data.error) throw new Error(data.error);
    return data;
  }

  // ---------- 轮询（信令通道） ----------
  _startSync(){
    this.timer=setInterval(()=>this._sync(), 700);
    this._sync();
  }
  async _sync(){
    if(!this.code) return;
    const outbox=this.outbox.splice(0, this.outbox.length);
    try{
      const r=await this._post({action:'sync', code:this.code, pid:this.pid, outbox});
      if(r.left){
        // 被移出房间：先送达最后的通知（如踢出），再断开
        for(const msg of r.inbox||[]){
          if(msg.t==='kicked') this.opts.onMsg?.({type:'kicked', by:msg.by});
        }
        this._disconnected();
        return;
      }
      this._applyState(r);
    }catch(e){
      if(e.message==='left'){ this._disconnected(); }
      // 其他错误静默重试
    }
  }
  _applyState(r){
    this.timeLimit=r.time??this.timeLimit; this.mapId=r.map??this.mapId;
    if(r.started && !this.started){
      this.started=true;
      this.opts.onMsg?.({type:'start', map:r.map, time:r.time, peers:r.players.map(p=>p.pid)});
      this.connectMesh(r.players.map(p=>p.pid));
    }
    const key=JSON.stringify(r.players)+JSON.stringify(r.requests)+(r.host||'');
    if(key!==this.lastPlayersKey){
      const prevHost=this.hostPid;
      this.hostPid=r.host;
      this.players=new Map(r.players.map(p=>[p.pid,p]));
      if(prevHost!==undefined && prevHost!==r.host){
        const name=(r.players.find(p=>p.pid===r.host)||{}).name||'';
        this.isHost=(r.host===this.pid);
        this.opts.onMsg?.({type:'hostChange', host:name});
      }
      this.requests=r.requests||[];
      this.opts.onMsg?.({type:'update', players:[...this.players.values()]});
      this.lastPlayersKey=key;
    }
    for(const msg of r.inbox||[]){
      switch(msg.t){
        case 'kicked': this.opts.onMsg?.({type:'kicked', by:msg.by}); this.leave(); break;
        case 'denied': this.opts.onMsg?.({type:'denied'}); break;
        case 'approved': this.opts.onMsg?.({type:'approved'}); break;
        case 'settings': this.opts.onMsg?.({type:'settings', map:msg.map, time:msg.time}); break;
        case 'rtc': this.onRtc({data:msg}); break;
      }
    }
  }
  _disconnected(){
    this.stopSync();
    this.teardownPeers();
    this.opts.onClose?.();
  }
  stopSync(){ if(this.timer) clearInterval(this.timer); this.timer=null; }

  // ---------- 房主操作 / 成员操作 ----------
  send(obj){ this.outbox.push(obj); }
  hostSetSettings(map,time){ this.send({t:'settings', map, time}); }
  hostStart(){ this.send({t:'start'}); }
  hostKick(pid){ this.send({t:'kick', target:pid}); }
  hostResolve(rid, approve){ this.send({t:'resolve', rid, approve}); }
  hostInvite(name){ this.send({t:'invite', name}); }
  toggleReady(){ this.send({t:'ready'}); }
  leave(){
    this.stopSync();
    if(this.code) fetch(API_BASE+'/api/room',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'leave', code:this.code, pid:this.pid})}).catch(()=>{});
    this.code=null;
    this.teardownPeers();
  }

  // ---------- WebRTC 网状连接 ----------
  connectMesh(peerIds){
    for(const pid of peerIds){
      if(pid===this.pid) continue;
      if(this.myId<pid) this.createPeer(pid,true);
    }
  }
  createPeer(pid, initiator){
    if(this.peers.has(pid)) return this.peers.get(pid);
    const pc=new RTCPeerConnection(ICE);
    this.peers.set(pid,pc);
    pc.onicecandidate=e=>{ if(e.candidate) this.send({t:'rtc', to:pid, data:{t:'cand', c:e.candidate.toJSON(), _from:this.pid}}); };
    pc.onconnectionstatechange=()=>{
      if(['failed','closed','disconnected'].includes(pc.connectionState)) this.peers.delete(pid);
    };
    if(initiator){
      const reliable=pc.createDataChannel('game',{ordered:true});
      const fast=pc.createDataChannel('fast',{ordered:false, maxRetransmits:0});
      this._wireChannel(pid, reliable, fast);
      pc.createOffer().then(o=>pc.setLocalDescription(o))
        .then(()=>this.send({t:'rtc', to:pid, data:{t:'offer', s:pc.localDescription, _from:this.pid}}));
    } else {
      pc.ondatachannel=e=>{
        const ch=e.channel;
        if(ch.label==='game'){ this._wireChannel(pid,ch,pc.__fast); }
        else pc.__fast=ch;
      };
    }
    return pc;
  }
  _wireChannel(pid, reliable, fast){
    this.channels.set(pid,{reliable,fast});
    const onmsg=e=>{
      try{ this.onGameData?.(pid, JSON.parse(e.data)); }catch(err){}
    };
    reliable.onmessage=onmsg; if(fast) fast.onmessage=onmsg;
  }
  async onRtc(m){
    const data=m.data||m;
    const from=data._from||m.from;
    if(!from||!data.t) return;
    if(data.t==='offer'){
      const pc=this.createPeer(from,false);
      await pc.setRemoteDescription(data.s);
      await pc.setLocalDescription(await pc.createAnswer());
      this.send({t:'rtc', to:from, data:{t:'answer', s:pc.localDescription, _from:this.pid}});
    } else if(data.t==='answer'){
      const pc=this.peers.get(from);
      if(pc) await pc.setRemoteDescription(data.s);
    } else if(data.t==='cand'){
      const pc=this.peers.get(from);
      if(pc) try{ await pc.addIceCandidate(data.c); }catch(e){}
    }
  }

  // ---------- 游戏数据广播（P2P DataChannel） ----------
  broadcastState(st){
    const msg=JSON.stringify({k:'st',...st});
    for(const [,ch] of this.channels){
      try{ (ch.fast||ch.reliable).send(msg); }catch(e){}
    }
  }
  broadcastEvent(ev, reliable=true){
    const msg=JSON.stringify(ev);
    for(const [,ch] of this.channels){
      try{ (reliable?ch.reliable:(ch.fast||ch.reliable)).send(msg); }catch(e){}
    }
  }
  sendHit(targetId,dmg){
    this.broadcastEvent({k:'hit', target:targetId, dmg, by:this.pid});
  }
  // net 每帧钩子：15Hz 同步自身状态
  tickNet(dt, game){
    if(!this.started) return;
    this._sendAcc+=dt;
    if(this._sendAcc>1/15){
      this._sendAcc=0;
      this.broadcastState({p:[+game.pos.x.toFixed(2),+game.pos.y.toFixed(2),+game.pos.z.toFixed(2)],
        yaw:+game.yaw.toFixed(3), hp:Math.round(game.hp), stance:game.stance});
    }
  }
  teardownPeers(){
    for(const [,pc] of this.peers) try{pc.close();}catch(e){}
    this.peers.clear(); this.channels.clear();
  }
}
