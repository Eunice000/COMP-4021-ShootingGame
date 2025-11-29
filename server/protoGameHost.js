// Server-authoritative host that runs the original prototype Stage at 60 Hz
// using server-side controllers fed by client input bitmasks.

const path = require('path');

// Bitmask constants must match the client
const LEFT=1, RIGHT=2, UP=4, DOWN=8, FIRE=16, CHEAT=32;

class ServerController {
  constructor(){
    this.hold = 0;
    this.pressed = 0;
    this.released = 0;
  }
  applyBitmask(pkt){
    if (!pkt || typeof pkt !== 'object') return;
    if (typeof pkt.hold === 'number') this.hold = pkt.hold|0;
    if (typeof pkt.press === 'number') this.pressed |= (pkt.press|0);
    if (typeof pkt.release === 'number') this.released |= (pkt.release|0);
  }
  _down(bit){ return (this.hold & bit) !== 0; }
  _pressed(bit){ return (this.pressed & bit) !== 0; }
  _released(bit){ return (this.released & bit) !== 0; }
  readIntents(){
    // Match the prototype controller intents consumed by Player.applyInput and Stage
    const intents = {
      left: this._down(LEFT),
      right: this._down(RIGHT),
      up: this._down(UP),
      down: this._down(DOWN),
      fire: this._down(FIRE),
      // Edge flags
      upPressed: this._pressed(UP),
      upReleased: this._released(UP),
      downPressed: this._pressed(DOWN),
      downReleased: this._released(DOWN),
      firePressed: this._pressed(FIRE),
      fireReleased: this._released(FIRE),
      cheatPressed: this._pressed(CHEAT)
    };
    // Clear edge flags after consumption (one-tick)
    this.pressed = 0;
    this.released = 0;
    return intents;
  }
}

class ProtoGameHost {
  /**
   * @param {{io:any, room:any}} params
   */
  constructor(params){
    this.io = params.io;
    this.room = params.room;
    this.interval = null;
    this.tickRate = (global.window && window.GameConfig && window.GameConfig.tickRate) || 60;
    this.dt = 1 / this.tickRate;
    this.tick = 0;
    this.timeLeft = (window.GameConfig && window.GameConfig.roundTimer) || 180;
    this.stage = null;
    this.controllers = [new ServerController(), new ServerController()];
  }

  _buildStage(){
    const GC = window.GameConfig || { canvas: { width:1920, height:1080 } };
    const game = {
      config: GC,
      canvas: { width: GC.canvas.width, height: GC.canvas.height },
      input: null, // not used by ServerController
      renderer: null // server-side, no renderer
    };

    // Map data: try to use GameMap provider if available; else minimal defaults
    let mapData = null;
    if (window.GameMap && typeof window.GameMap.getById === 'function' && GC.stage && GC.stage.mapId) {
      mapData = window.GameMap.getById(GC.stage.mapId);
    }
    if (!mapData && window.GameMap && typeof window.GameMap.getDefaultArena === 'function'){
      mapData = window.GameMap.getDefaultArena();
    }
    if (!mapData){
      // Fallback flat arena
      mapData = {
        width: GC.canvas.width,
        height: GC.canvas.height,
        platforms: [ { x:0, y: GC.canvas.height - 80, w: GC.canvas.width, h: 80 } ],
        playerSpawns: [
          { x: Math.floor(GC.canvas.width*0.3), y: GC.canvas.height - 80 },
          { x: Math.floor(GC.canvas.width*0.7), y: GC.canvas.height - 80 }
        ],
        background: null
      };
    }

    const Stage = window.Stage;
    this.stage = new Stage(game, mapData);
    // Replace default controllers with server ones
    this.stage.controllers = this.controllers;

    // Ensure player lives are initialized to config maxLives
    const maxLives = (GC.player && GC.player.maxLives) || 3;
    if (Array.isArray(this.stage.players)){
      for (let i=0;i<this.stage.players.length;i++){
        const p = this.stage.players[i];
        if (p && (typeof p.lives !== 'number' || p.lives <= 0)) p.lives = maxLives;
      }
    }
  }

  start(){
    if (this.interval) return;
    this.tick = 0;
    this.timeLeft = (window.GameConfig && window.GameConfig.roundTimer) || 180;
    this._buildStage();
    const stepMs = Math.floor(1000 / this.tickRate);
    this.interval = setInterval(()=>{
      try{
        this._step();
      }catch(e){
        console.error('ProtoGameHost step error:', e);
        this.stop();
        // end via server.js lifecycle
      }
    }, stepMs);
  }

  stop(){
    if (this.interval){ clearInterval(this.interval); this.interval = null; }
  }

  applyInput(role, pkt){
    const idx = role === 'p1' ? 0 : 1;
    const c = this.controllers[idx];
    if (c) c.applyBitmask(pkt);
  }

  _computeWinnerByLives(){
    if (!this.stage || !this.stage.players) return -1;
    const p1 = this.stage.players[0];
    const p2 = this.stage.players[1];
    const l1 = p1 ? (p1.lives|0) : 0;
    const l2 = p2 ? (p2.lives|0) : 0;
    if (l1 > l2) return 0;
    if (l2 > l1) return 1;
    return -1; // draw
  }

  _step(){
    this.tick++;
    this.timeLeft = Math.max(0, this.timeLeft - this.dt);

    // Advance stage simulation
    if (this.stage && typeof this.stage.update === 'function'){
      this.stage.update(this.dt);
    }

    // Kill condition: if any player's lives reach 0, end immediately
    if (this.stage && Array.isArray(this.stage.players)){
      const p1 = this.stage.players[0];
      const p2 = this.stage.players[1];
      const l1 = p1 ? (p1.lives|0) : 0;
      const l2 = p2 ? (p2.lives|0) : 0;
      if (l1 <= 0 || l2 <= 0){
        const winner = (l1 <= 0 && l2 <= 0) ? -1 : (l1 <= 0 ? 1 : 0);
        const snap = this._buildSnapshot();
        this.io.to(this.room.id).volatile.emit('snapshot', snap);
        if (this.onKill) this.onKill(winner);
        return;
      }
    }

    // Game over by time
    if (this.timeLeft <= 0){
      // server.js will handle endGame based on this signal; emit a final snapshot first
      const snap = this._buildSnapshot();
      this.io.to(this.room.id).volatile.emit('snapshot', snap);
      if (this.onTimeUp) this.onTimeUp(this._computeWinnerByLives());
      return;
    }

    // Emit snapshot each tick
    const snap = this._buildSnapshot();
    this.io.to(this.room.id).volatile.emit('snapshot', snap);
  }

  _buildSnapshot(){
    const GC = window.GameConfig || {};
    const colors = (GC.colors) || { ui:'#000', p1:'#FF4040', p2:'#99CCFF', background:'#FFFFFF', canvas:'#FFFFFF' };
    const players = [];
    if (this.stage && Array.isArray(this.stage.players)){
      for (let i=0;i<this.stage.players.length;i++){
        const p = this.stage.players[i];
        if (!p) { players.push(null); continue; }
        const gun = p.gun || {};
        players.push({
          x: Math.round(p.x||0),
          y: Math.round(p.y||0),
          vx: Math.round(p.vx||0),
          vy: Math.round(p.vy||0),
          facing: p.facing >= 0 ? 1 : -1,
          lives: (p.lives|0),
          gun: { name: gun.name || 'pistol', ammo: (typeof gun.ammo==='number'? gun.ammo : -1) }
        });
      }
    }

    const bullets = [];
    if (this.stage && Array.isArray(this.stage.bullets)){
      for (let i=0;i<this.stage.bullets.length;i++){
        const b = this.stage.bullets[i];
        if (!b || b.alive === false) continue;
        bullets.push({ x: Math.round(b.x||0), y: Math.round(b.y||0), owner: (b.ownerId!=null? b.ownerId : (b.owner!=null? b.owner : 0)) });
      }
    }

    const powerUps = [];
    if (this.stage && Array.isArray(this.stage.powerUps)){
      for (let i=0;i<this.stage.powerUps.length;i++){
        const pu = this.stage.powerUps[i];
        if (!pu || pu.active === false) continue;
        powerUps.push({ type: pu.type || 'unknown', x: Math.round(pu.x||0), y: Math.round(pu.y||0), color: pu.color || null });
      }
    }

    const platforms = [];
    if (this.stage && Array.isArray(this.stage.platforms)){
      for (let i=0;i<this.stage.platforms.length;i++){
        const pf = this.stage.platforms[i];
        if (!pf) continue;
        platforms.push({ x: pf.x|0, y: pf.y|0, w: pf.w|0, h: pf.h|0 });
      }
    }

    const background = (this.stage && this.stage.backgroundSrc) || null;

    return {
      tick: this.tick,
      timeLeft: this.timeLeft,
      players,
      bullets,
      powerUps,
      platforms,
      colors,
      background
    };
  }
}

module.exports = { ProtoGameHost };
