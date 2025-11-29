// Authoritative server-side game engine that reuses the prototype Stage logic.
// It runs a fixed-timestep loop, accepts per-player input bitmasks, and produces render snapshots.

const path = require('path');
const { loadPrototypeIntoGlobal } = require('./protoLoadGlobal');

// Input bitmask (must match js/netgame/inputClient.js)
const INPUT = {
  LEFT: 1,
  RIGHT: 2,
  UP: 4,
  DOWN: 8,
  FIRE: 16,
  CHEAT: 32
};

function makeServerInput() {
  // Maintains current button booleans per player id 'p1'/'p2'
  const state = {
    p1: { left: false, right: false, up: false, down: false, fire: false, cheat: false },
    p2: { left: false, right: false, up: false, down: false, fire: false, cheat: false }
  };
  return {
    _state: state,
    // Minimal API consumed by PlayerController
    getSnapshot() {
      return {
        p1: { ...state.p1 },
        p2: { ...state.p2 }
      };
    }
  };
}

function applyBitmaskTo(state, bitmask) {
  // Translate bitmask to controller booleans
  state.left = (bitmask & INPUT.LEFT) !== 0;
  state.right = (bitmask & INPUT.RIGHT) !== 0;
  state.up = (bitmask & INPUT.UP) !== 0;
  state.down = (bitmask & INPUT.DOWN) !== 0;
  state.fire = (bitmask & INPUT.FIRE) !== 0;
  state.cheat = (bitmask & INPUT.CHEAT) !== 0;
}

class GameEngine {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.running = false;
    this.timer = null;
    this.tickRate = 60;
    this.dt = 1 / this.tickRate;
    this.timeLeft = 0;
    this._callbacks = { onSnapshot: null, onGameOver: null };
    this._roleBySocket = new Map(); // socketId -> 'p1'|'p2'
    this._inputHold = { p1: 0, p2: 0 };
    this._serverInput = makeServerInput();

    // Load prototype code (Stage, GameConfig) into global window
    const protoRoot = path.join(this.projectRoot, 'prototype');
    const { Stage, GameConfig } = loadPrototypeIntoGlobal(protoRoot);
    this.Stage = Stage;
    this.GameConfig = GameConfig;

    // Build a minimal Game object expected by Stage
    const canvasW = (GameConfig && GameConfig.canvas && GameConfig.canvas.width) || 1920;
    const canvasH = (GameConfig && GameConfig.canvas && GameConfig.canvas.height) || 1080;
    this.game = {
      canvas: { width: canvasW, height: canvasH },
      config: GameConfig,
      input: this._serverInput
    };

    // World/Stage: use the same configured map as prototype config (GameConfig.stage.mapId)
    let mapData = null;
    try {
      const GD = global.window.GameData || {};
      const maps = Array.isArray(GD.maps) ? GD.maps : [];
      const desiredId = (this.GameConfig && this.GameConfig.stage && this.GameConfig.stage.mapId) || null;
      if (desiredId && maps.length){
        mapData = maps.find(m => m && m.id === desiredId) || null;
      }
    } catch(e) { /* ignore and fall back below */ }
    this.stage = new this.Stage(
      this.game,
      mapData || ((global.window.GameMap && global.window.GameMap.getDefaultArena && global.window.GameMap.getDefaultArena()) || null)
    );
    this.colors = (GameConfig && GameConfig.colors) || { canvas: '#FFFFFF', p1: '#FF4040', p2: '#99CCFF' };
  }

  assignRoles(p1SocketId, p2SocketId) {
    this._roleBySocket.clear();
    if (p1SocketId) this._roleBySocket.set(p1SocketId, 'p1');
    if (p2SocketId) this._roleBySocket.set(p2SocketId, 'p2');
  }

  setOnSnapshot(cb) { this._callbacks.onSnapshot = cb; }
  setOnGameOver(cb) { this._callbacks.onGameOver = cb; }

  handleInputPacket(socketId, pkt) {
    // Only hold is necessary; edges are derived in PlayerController
    const role = this._roleBySocket.get(socketId);
    if (!role) return;
    const hold = (pkt && typeof pkt.hold === 'number') ? pkt.hold : 0;
    this._inputHold[role] = hold;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.tickRate = (this.GameConfig && this.GameConfig.tickRate) || 60;
    this.dt = 1 / this.tickRate;
    this.timeLeft = (this.GameConfig && this.GameConfig.roundTimer) || 180;
    const stepMs = Math.floor(1000 / this.tickRate);
    this.timer = setInterval(() => this._step(), stepMs);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _step() {
    // Update server input states from bitmasks captured last interval
    applyBitmaskTo(this._serverInput._state.p1, this._inputHold.p1);
    applyBitmaskTo(this._serverInput._state.p2, this._inputHold.p2);

    // Update stage
    if (this.stage && this.stage.update) this.stage.update(this.dt);

    // Post-update: handle out-of-bounds (blast zone) and respawn like prototype GameplayState
    const cfg = this.GameConfig || {};
    const st = this.stage;
    if (st && st.players && typeof st.isOutOfBounds === 'function' && Array.isArray(st.playerSpawns)){
      for (let i = 0; i < st.players.length; i++){
        const p = st.players[i];
        if (!p) continue;
        if (st.isOutOfBounds(p)){
          // increment deaths for this player, kills for opponent
          const pid = (i === 0 ? 'p1' : 'p2');
          const oid = (i === 0 ? 'p2' : 'p1');
          if (st.stats){
            if (st.stats[pid]) st.stats[pid].deaths = (st.stats[pid].deaths|0) + 1;
            if (st.stats[oid]) st.stats[oid].kills = (st.stats[oid].kills|0) + 1;
          }
          // lose a life
          p.lives = Math.max(0, (p.lives|0) - 1);
          // respawn at spawn point
          const spawn = st.playerSpawns[i] || { x: (this.game.canvas.width/2)|0, y: (this.game.canvas.height/2)|0 };
          p.x = spawn.x|0;
          p.y = spawn.y|0;
          // reset motion
          p.vx = 0; p.vy = 0;
          // face toward center
          const centerX = (st.map && st.map.width) ? (st.map.width/2) : (this.game.canvas.width/2);
          p.facing = ((centerX - p.x) >= 0) ? 1 : -1;
        }
      }
    }

    // Decrease timer and check win conditions
    this.timeLeft -= this.dt;
    if (this.timeLeft < 0) this.timeLeft = 0;

    const players = this.stage.players || [];
    const p1 = players[0];
    const p2 = players[1];

    let winner = null; // 0 or 1
    // Lives reaching 0 ends the game
    if (p1 && (p1.lives | 0) <= 0 && p2 && (p2.lives | 0) <= 0) {
      winner = null; // draw
    } else if (p1 && (p1.lives | 0) <= 0) {
      winner = 1;
    } else if (p2 && (p2.lives | 0) <= 0) {
      winner = 0;
    }
    // Time up => decide by lives
    if (this.timeLeft <= 0 && winner === null) {
      const l1 = p1 ? (p1.lives | 0) : 0;
      const l2 = p2 ? (p2.lives | 0) : 0;
      if (l1 > l2) winner = 0; else if (l2 > l1) winner = 1; else winner = null;
    }

    // Emit snapshot for rendering
    const snap = this._makeSnapshot();
    if (typeof this._callbacks.onSnapshot === 'function') {
      this._callbacks.onSnapshot(snap);
    }

    // End match if decided
    if (winner !== undefined && winner !== null) {
      const cb = this._callbacks.onGameOver;
      this.stop();
      if (typeof cb === 'function') cb({ winner, stats: (this.stage && this.stage.stats) || null });
    }
  }

  _makeSnapshot() {
    const st = this.stage;
    const players = (st.players || []).map(p => ({
      x: p.x | 0,
      y: p.y | 0,
      w: p.w | 0,
      h: p.h | 0,
      facing: (p.facing || 1),
      lives: (p.lives | 0),
      shieldMs: (p.shieldMs | 0) || 0,
      gun: p.gun ? { 
        id: (typeof p.gun.id === 'number' ? p.gun.id : null), 
        type: p.gun.type || null,
        name: p.gun.name || null, 
        ammo: (typeof p.gun.ammo === 'number' ? p.gun.ammo : null) 
      } : { id: 1, type: 'pistol', name: 'Pistol', ammo: null }
    }));
    const bullets = (st.bullets || []).filter(b => b && b.active !== false).map(b => ({ x: b.x | 0, y: b.y | 0 }));
    const powerUps = (st.powerUps || []).filter(pu => pu && pu.active !== false).map(pu => ({ x: pu.x | 0, y: pu.y | 0, w: (pu.w|0)||40, h: (pu.h|0)||40, type: pu.type }));
    const platforms = (st.platforms || []).map(pf => ({ x: pf.x | 0, y: pf.y | 0, w: pf.w | 0, h: pf.h | 0 }));
    return {
      players,
      bullets,
      powerUps,
      platforms,
      background: st.backgroundSrc || null,
      timeLeft: Math.max(0, Math.ceil(this.timeLeft)),
      colors: this.colors
    };
  }
}

module.exports = { GameEngine, INPUT };
