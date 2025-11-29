/**
 * Server-side game logic for authoritative game state
 * All game simulation happens here, clients only send input and receive state
 */

// Game configuration (simplified version of client config)
const GAME_CONFIG = {
  tickRate: 60,
  gravity: { x: 0, y: 1800 },
  friction: { ground: 0.9, air: 0.85 },
  roundTimer: 180,
  player: {
    width: 80,
    height: 120,
    moveAccel: 6000,
    maxSpeedX: 450,
    jumpSpeed: 750,
    maxLives: 3,
    maxAirJumps: 2, // Double jump enabled
    fastFallSpeed: 2000 // Fast fall speed multiplier
  },
  projectile: {
    speed: 1800,
    lifetimeMs: 2000,
    width: 24,
    height: 8,
    knockbackX: 1200,
    knockbackY: -300,
    recoilX: 200,
    knockbackDurationMs: 200
  },
  powerUp: {
    getGun: {
      firstSpawnSec: 5,
      intervalSec: 8,
      ttlSec: 7
    },
    others: {
      firstSpawnSec: 10,
      intervalSec: 12,
      ttlSec: 10
    }
  },
  stage: {
    outOfBoundsMargin: 400
  }
};

// Gun definitions
const GUNS = {
  1: { id: 1, name: "Pistol", type: "pistol", power: 2500, recoil: 250, cooldownMs: 500, ammo: 12 },
  2: { id: 2, name: "Sniper", type: "sniper", power: 8000, recoil: 800, cooldownMs: 1800, ammo: 3 },
  3: { id: 3, name: "Assault Rifle", type: "assault", power: 2200, recoil: 250, cooldownMs: 350, ammo: 30 },
  4: { id: 4, name: "SMG", type: "smg", power: 1000, recoil: 120, cooldownMs: 150, ammo: 40 }
};

/**
 * Server-side game state manager
 */
class ServerGameState {
  constructor(roomId, mapData) {
    this.roomId = roomId;
    this.mapData = mapData || this.getDefaultMap();
    
    // Players
    this.players = [
      {
        id: 'p1',
        x: this.mapData.playerSpawns[0].x,
        y: this.mapData.playerSpawns[0].y,
        w: GAME_CONFIG.player.width,
        h: GAME_CONFIG.player.height,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        onGround: false,
        facing: 1,
        lives: GAME_CONFIG.player.maxLives,
        gun: { ...GUNS[1], ammo: GUNS[1].ammo, cooldownTimerMs: 0 },
        shieldMs: 0,
        hurtTimerMs: 0,
        airJumpsLeft: GAME_CONFIG.player.maxAirJumps,
        lastHitBy: null,
        lastHitByTimer: 0,
        dropThroughTimer: 0 // Timer to allow dropping through platforms
      },
      {
        id: 'p2',
        x: this.mapData.playerSpawns[1].x,
        y: this.mapData.playerSpawns[1].y,
        w: GAME_CONFIG.player.width,
        h: GAME_CONFIG.player.height,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        onGround: false,
        facing: -1,
        lives: GAME_CONFIG.player.maxLives,
        gun: { ...GUNS[1], ammo: GUNS[1].ammo, cooldownTimerMs: 0 },
        shieldMs: 0,
        hurtTimerMs: 0,
        airJumpsLeft: GAME_CONFIG.player.maxAirJumps,
        lastHitBy: null,
        lastHitByTimer: 0,
        dropThroughTimer: 0 // Timer to allow dropping through platforms
      }
    ];
    
    // Player inputs (stored per player)
    this.playerInputs = {
      p1: { left: false, right: false, up: false, down: false, fire: false },
      p2: { left: false, right: false, up: false, down: false, fire: false }
    };
    
    // Previous input states for edge detection
    this.prevInputs = {
      p1: { up: false, down: false, fire: false },
      p2: { up: false, down: false, fire: false }
    };
    
    // Game state
    this.bullets = [];
    this.powerUps = [];
    this.platforms = this.mapData.platforms || [];
    this.powerUpSpawns = this.mapData.powerUpSpawns || [];
    
    // Timers
    this._getGunTimer = GAME_CONFIG.powerUp.getGun.firstSpawnSec;
    this._otherPuTimer = GAME_CONFIG.powerUp.others.firstSpawnSec;
    this._otherPuSpawnCount = 0;
    this.timeRemaining = GAME_CONFIG.roundTimer;
    
    // Stats
    this.stats = {
      p1: { kills: 0, deaths: 0, pickups: 0 },
      p2: { kills: 0, deaths: 0, pickups: 0 }
    };
    
    // Game loop
    this.running = false;
    this.lastUpdateTime = Date.now();
    this.gameLoopInterval = null;
    
    // Fixed timestep
    this.accumulator = 0;
    this.fixedDt = 1 / GAME_CONFIG.tickRate;
  }
  
  getDefaultMap() {
    // Default map with multiple platforms (no ground platform)
    return {
      width: 1920,
      height: 1080,
      platforms: [
        // Top level platforms
        { x: 100, y: 300, w: 700, h: 8 },
        { x: 1120, y: 300, w: 700, h: 8 },
        // Middle level platforms
        { x: 100, y: 450, w: 450, h: 8 },
        { x: 800, y: 450, w: 320, h: 8 },
        { x: 1370, y: 450, w: 450, h: 8 },
        // Lower level platforms
        { x: 500, y: 600, w: 920, h: 8 },
        { x: 200, y: 750, w: 600, h: 8 },
        { x: 1220, y: 750, w: 600, h: 8 },
        // Bottom platforms (not ground, but lower platforms)
        { x: 400, y: 900, w: 400, h: 8 },
        { x: 1120, y: 900, w: 400, h: 8 }
      ],
      playerSpawns: [
        { x: 285, y: 230 }, // Spawn on top platform
        { x: 1555, y: 230 }
      ],
      powerUpSpawns: [
        { x: 410, y: 220 },
        { x: 1430, y: 220 },
        { x: 285, y: 370 },
        { x: 920, y: 370 },
        { x: 1555, y: 370 },
        { x: 920, y: 520 },
        { x: 460, y: 670 },
        { x: 1480, y: 670 },
        { x: 600, y: 820 },
        { x: 1320, y: 820 }
      ]
    };
  }
  
  /**
   * Load map data (can be extended to load from MapsData)
   */
  loadMapData(mapId) {
    // For now, use default map
    // In the future, can load from MapsData.js equivalent
    return this.getDefaultMap();
  }
  
  /**
   * Update player input from client
   */
  updatePlayerInput(playerId, input) {
    if (this.playerInputs[playerId]) {
      this.playerInputs[playerId] = { ...this.playerInputs[playerId], ...input };
    }
  }
  
  /**
   * Start the game loop
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastUpdateTime = Date.now();
    
    // Run game loop at fixed timestep
    const self = this;
    this.gameLoopInterval = setInterval(() => {
      const now = Date.now();
      const dt = (now - self.lastUpdateTime) / 1000;
      self.lastUpdateTime = now;
      
      // Fixed timestep update
      self.accumulator += Math.min(dt, 0.25); // Cap at 250ms
      
      while (self.accumulator >= self.fixedDt) {
        self.update(self.fixedDt);
        self.accumulator -= self.fixedDt;
      }
    }, 1000 / GAME_CONFIG.tickRate);
  }
  
  /**
   * Stop the game loop
   */
  stop() {
    this.running = false;
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }
  }
  
  /**
   * Update game state (one fixed timestep)
   */
  update(dt) {
    // Update round timer
    if (this.timeRemaining > 0) {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
      if (this.timeRemaining <= 0) {
        // Time's up - determine winner
        this.handleTimeUp();
        return;
      }
    }
    
    // Update power-up spawn timers
    this.updatePowerUpSpawning(dt);
    
    // Update power-ups
    this.updatePowerUps(dt);
    
    // Update players
    this.updatePlayers(dt);
    
    // Update bullets
    this.updateBullets(dt);
    
    // Check collisions
    this.checkCollisions();
    
    // Check out of bounds
    this.checkOutOfBounds();
  }
  
  /**
   * Update power-up spawning
   */
  updatePowerUpSpawning(dt) {
    this._getGunTimer -= dt;
    this._otherPuTimer -= dt;
    
    let activeGetGun = this.powerUps.filter(pu => pu.active && pu.type === 'get_gun').length;
    let activeOther = this.powerUps.filter(pu => pu.active && pu.type !== 'get_gun').length;
    
    if (this._getGunTimer <= 0 && activeGetGun < 1) {
      this.spawnGetGunPowerUp();
      this._getGunTimer += GAME_CONFIG.powerUp.getGun.intervalSec;
    }
    
    if (this._otherPuTimer <= 0 && activeOther < 1) {
      this.spawnOtherPowerUp();
      this._otherPuTimer += GAME_CONFIG.powerUp.others.intervalSec;
    }
  }
  
  /**
   * Spawn get_gun power-up
   */
  spawnGetGunPowerUp() {
    const pos = this.pickFreePowerUpSpawn();
    if (!pos) return;
    
    const pu = {
      id: 'get_gun_' + pos.x + '_' + pos.y + '_' + Date.now(),
      type: 'get_gun',
      x: pos.x,
      y: pos.y,
      w: 80,
      h: 80,
      active: true,
      _ttlSec: GAME_CONFIG.powerUp.getGun.ttlSec,
      _baseY: pos.y
    };
    
    this.powerUps.push(pu);
  }
  
  /**
   * Spawn other power-up
   */
  spawnOtherPowerUp() {
    const pos = this.pickFreePowerUpSpawn();
    if (!pos) return;
    
    this._otherPuSpawnCount++;
    const type = (this._otherPuSpawnCount % 2 === 0) ? 'extra_life' : 'shield';
    
    const pu = {
      id: type + '_' + pos.x + '_' + pos.y + '_' + Date.now(),
      type: type,
      x: pos.x,
      y: pos.y,
      w: 80,
      h: 80,
      active: true,
      _ttlSec: GAME_CONFIG.powerUp.others.ttlSec,
      _baseY: pos.y
    };
    
    this.powerUps.push(pu);
  }
  
  /**
   * Pick a free power-up spawn position
   */
  pickFreePowerUpSpawn() {
    if (!this.powerUpSpawns || this.powerUpSpawns.length === 0) return null;
    
    const active = this.powerUps.filter(pu => pu && pu.active);
    const freeSpawns = this.powerUpSpawns.filter(spawn => {
      return !active.some(pu => {
        const px = Math.floor(pu.x);
        const py = Math.floor(pu._baseY || pu.y);
        return px === Math.floor(spawn.x) && py === Math.floor(spawn.y);
      });
    });
    
    if (freeSpawns.length === 0) return null;
    return freeSpawns[Math.floor(Math.random() * freeSpawns.length)];
  }
  
  /**
   * Update power-ups
   */
  updatePowerUps(dt) {
    for (let i = 0; i < this.powerUps.length; i++) {
      const pu = this.powerUps[i];
      if (!pu || !pu.active) continue;
      
      if (typeof pu._ttlSec === 'number') {
        pu._ttlSec -= dt;
        if (pu._ttlSec <= 0) {
          pu.active = false;
        }
      }
    }
    
    // Remove inactive power-ups
    this.powerUps = this.powerUps.filter(pu => pu && pu.active);
  }
  
  /**
   * Update players
   */
  updatePlayers(dt) {
    for (let i = 0; i < this.players.length; i++) {
      const pl = this.players[i];
      const input = this.playerInputs[pl.id];
      const prevInput = this.prevInputs[pl.id];
      
      // Update timers
      if (pl.shieldMs > 0) {
        pl.shieldMs = Math.max(0, pl.shieldMs - dt * 1000);
      }
      if (pl.hurtTimerMs > 0) {
        pl.hurtTimerMs = Math.max(0, pl.hurtTimerMs - dt * 1000);
      }
      if (pl.lastHitByTimer > 0) {
        pl.lastHitByTimer = Math.max(0, pl.lastHitByTimer - dt);
        if (pl.lastHitByTimer <= 0) {
          pl.lastHitBy = null;
        }
      }
      if (pl.gun && pl.gun.cooldownTimerMs > 0) {
        pl.gun.cooldownTimerMs = Math.max(0, pl.gun.cooldownTimerMs - dt * 1000);
      }
      // Update drop-through timer
      if (pl.dropThroughTimer > 0) {
        pl.dropThroughTimer = Math.max(0, pl.dropThroughTimer - dt);
      }
      
      // Apply input
      this.applyPlayerInput(pl, input, prevInput, dt);
      
      // Apply physics
      this.updatePlayerPhysics(pl, dt);
      
      // Check platform collisions
      this.checkPlatformCollisions(pl, dt);
      
      // Handle firing
      if (input.fire && this.canPlayerFire(pl)) {
        this.tryFire(pl);
      }
      
      // Handle power-up pickups
      this.checkPowerUpPickups(pl);
      
      // Update previous input
      this.prevInputs[pl.id] = {
        up: input.up,
        down: input.down,
        fire: input.fire
      };
    }
  }
  
  /**
   * Apply player input
   */
  applyPlayerInput(pl, input, prevInput, dt) {
    // Horizontal movement
    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    
    // Only apply input if not in hurt stun
    if (pl.hurtTimerMs <= 0) {
      const accel = GAME_CONFIG.player.moveAccel;
      pl.ax += dir * accel;
      
      if (dir < 0) pl.facing = -1;
      else if (dir > 0) pl.facing = 1;
    }
    
    // Drop through platform - press down while on ground to drop through
    const downPressed = input.down && !prevInput.down;
    if (downPressed && pl.onGround) {
      // Set drop-through timer to allow falling through platforms
      pl.dropThroughTimer = 0.2; // 0.2 seconds window to fall through
      pl.onGround = false;
      // Ensure downward motion starts
      if (pl.vy < 60) {
        pl.vy = 60;
      }
      // Nudge player slightly below platform surface to disengage
      pl.y += 1;
    }
    
    // Fast fall (double down) - hold down to fall faster (only when not on ground)
    if (input.down && !pl.onGround && pl.vy > 0) {
      // Apply fast fall acceleration
      pl.vy += GAME_CONFIG.player.fastFallSpeed * dt;
      // Cap the fall speed
      const maxFallSpeed = GAME_CONFIG.gravity.y * 2;
      if (pl.vy > maxFallSpeed) {
        pl.vy = maxFallSpeed;
      }
    }
    
    // Jump (double jump enabled)
    const jumpPressed = input.up && !prevInput.up;
    if (jumpPressed && this.canPlayerJump(pl)) {
      pl.vy = -GAME_CONFIG.player.jumpSpeed;
      pl.onGround = false;
      // Consume air jump if not on ground
      if (!pl.onGround) {
        pl.airJumpsLeft = Math.max(0, pl.airJumpsLeft - 1);
      }
    }
    
    // Refresh air jumps when grounded
    if (pl.onGround) {
      pl.airJumpsLeft = GAME_CONFIG.player.maxAirJumps;
    }
  }
  
  /**
   * Check if player can jump
   */
  canPlayerJump(pl) {
    return pl.onGround || (pl.airJumpsLeft > 0);
  }
  
  /**
   * Update player physics
   */
  updatePlayerPhysics(pl, dt) {
    // Apply gravity
    pl.vy += GAME_CONFIG.gravity.y * dt;
    
    // Apply accelerations
    pl.vx += pl.ax * dt;
    pl.vy += pl.ay * dt;
    
    // Clamp horizontal speed (only if from input)
    if (pl.ax !== 0 && Math.abs(pl.vx) > GAME_CONFIG.player.maxSpeedX) {
      pl.vx = Math.sign(pl.vx) * GAME_CONFIG.player.maxSpeedX;
    }
    
    // Apply friction
    const friction = pl.onGround ? GAME_CONFIG.friction.ground : GAME_CONFIG.friction.air;
    pl.vx *= Math.pow(friction, dt * 60); // Normalize to 60fps
    
    // Update position
    pl.x += pl.vx * dt;
    pl.y += pl.vy * dt;
    
    // Clear accelerations
    pl.ax = 0;
    pl.ay = 0;
  }
  
  /**
   * Check platform collisions
   */
  checkPlatformCollisions(pl, dt) {
    // If player is dropping through platforms, skip collision checks
    if (pl.dropThroughTimer > 0) {
      pl.onGround = false;
      return;
    }
    
    pl.onGround = false;
    
    for (let i = 0; i < this.platforms.length; i++) {
      const pf = this.platforms[i];
      
      // AABB collision
      if (pl.x < pf.x + pf.w && pl.x + pl.w > pf.x &&
          pl.y < pf.y + pf.h && pl.y + pl.h > pf.y) {
        
        // Check if landing from above
        const prevY = pl.y - pl.vy * dt;
        const prevBottom = prevY + pl.h;
        
        if (pl.vy > 0 && prevBottom <= pf.y + 0.5) {
          // Land on platform
          pl.y = pf.y - pl.h;
          pl.vy = 0;
          pl.onGround = true;
          break;
        }
      }
    }
  }
  
  /**
   * Check if player can fire
   */
  canPlayerFire(pl) {
    if (!pl.gun) return false;
    return pl.gun.cooldownTimerMs <= 0 && pl.gun.ammo > 0;
  }
  
  /**
   * Try to fire a bullet
   */
  tryFire(pl) {
    if (!this.canPlayerFire(pl)) return;
    
    const gun = pl.gun;
    const dir = pl.facing >= 0 ? 1 : -1;
    const muzzleX = pl.x + (dir > 0 ? pl.w : -GAME_CONFIG.projectile.width);
    const muzzleY = pl.y + (pl.h * 0.4);
    
    // Create bullet
    const bullet = {
      id: pl.id + '_bullet_' + Date.now() + '_' + Math.random(),
      x: muzzleX,
      y: muzzleY,
      w: GAME_CONFIG.projectile.width,
      h: GAME_CONFIG.projectile.height,
      vx: dir * GAME_CONFIG.projectile.speed,
      vy: 0,
      ownerId: pl.id,
      power: gun.power,
      alive: true,
      lifetimeMs: GAME_CONFIG.projectile.lifetimeMs
    };
    
    this.bullets.push(bullet);
    
    // Apply recoil
    if (gun.recoil) {
      pl.vx += -dir * gun.recoil;
    }
    
    // Consume ammo and start cooldown
    gun.ammo = Math.max(0, gun.ammo - 1);
    gun.cooldownTimerMs = gun.cooldownMs || 500;
    
    // Handle gun depletion
    if (gun.ammo <= 0 && gun.type && gun.type !== 'pistol') {
      // Switch to default pistol
      pl.gun = { ...GUNS[1], ammo: GUNS[1].ammo, cooldownTimerMs: 0 };
    } else if (gun.ammo <= 0 && (!gun.type || gun.type === 'pistol')) {
      // Reload pistol
      gun.ammo = GUNS[1].ammo;
      gun.cooldownTimerMs = 500; // Reload delay
    }
  }
  
  /**
   * Check power-up pickups
   */
  checkPowerUpPickups(pl) {
    for (let i = 0; i < this.powerUps.length; i++) {
      const pu = this.powerUps[i];
      if (!pu || !pu.active) continue;
      
      // AABB collision
      if (pl.x < pu.x + pu.w && pl.x + pl.w > pu.x &&
          pl.y < pu.y + pu.h && pl.y + pl.h > pu.y) {
        
        // Apply power-up effect
        if (pu.type === 'get_gun') {
          // Give random gun
          const gunIds = [2, 3, 4];
          const randomGunId = gunIds[Math.floor(Math.random() * gunIds.length)];
          pl.gun = { ...GUNS[randomGunId], ammo: GUNS[randomGunId].ammo, cooldownTimerMs: 0 };
        } else if (pu.type === 'extra_life') {
          if (pl.lives < GAME_CONFIG.player.maxLives) {
            pl.lives++;
          }
        } else if (pu.type === 'shield') {
          pl.shieldMs = 5000; // 5 seconds
        }
        
        pu.active = false;
        this.stats[pl.id].pickups++;
      }
    }
  }
  
  /**
   * Update bullets
   */
  updateBullets(dt) {
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      if (!b || !b.alive) continue;
      
      // Update position
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      
      // Update lifetime
      b.lifetimeMs -= dt * 1000;
      if (b.lifetimeMs <= 0) {
        b.alive = false;
      }
      
      // Check out of bounds
      if (b.x + b.w < -200 || b.x > this.mapData.width + 200) {
        b.alive = false;
      }
    }
    
    // Remove dead bullets
    this.bullets = this.bullets.filter(b => b && b.alive);
  }
  
  /**
   * Check collisions
   */
  checkCollisions() {
    // Bullet vs player collisions
    for (let i = 0; i < this.bullets.length; i++) {
      const bullet = this.bullets[i];
      if (!bullet || !bullet.alive) continue;
      
      for (let j = 0; j < this.players.length; j++) {
        const pl = this.players[j];
        if (bullet.ownerId === pl.id) continue; // No friendly fire
        
        // AABB collision
        if (bullet.x < pl.x + pl.w && bullet.x + bullet.w > pl.x &&
            bullet.y < pl.y + pl.h && bullet.y + bullet.h > pl.y) {
          
          // Hit!
          this.applyBulletHit(pl, bullet);
          bullet.alive = false;
          break;
        }
      }
    }
  }
  
  /**
   * Apply bullet hit effects
   */
  applyBulletHit(pl, bullet) {
    if (pl.shieldMs > 0) return; // Shield immunity
    
    const kbX = bullet.power || GAME_CONFIG.projectile.knockbackX;
    const kbY = GAME_CONFIG.projectile.knockbackY;
    const dir = bullet.vx < 0 ? -1 : 1;
    
    // Apply knockback
    pl.vx += dir * kbX;
    pl.vy += kbY;
    pl.onGround = false;
    pl.hurtTimerMs = GAME_CONFIG.projectile.knockbackDurationMs;
    
    // Record last hitter
    pl.lastHitBy = bullet.ownerId;
    pl.lastHitByTimer = 3.0;
  }
  
  /**
   * Check out of bounds
   */
  checkOutOfBounds() {
    const margin = GAME_CONFIG.stage.outOfBoundsMargin;
    
    for (let i = 0; i < this.players.length; i++) {
      const pl = this.players[i];
      
      if (pl.x + pl.w < -margin || pl.x > this.mapData.width + margin ||
          pl.y + pl.h < -margin || pl.y > this.mapData.height + margin) {
        
        // Out of bounds - lose a life
        const pid = pl.id;
        this.stats[pid].deaths++;
        
        // Check for kill credit
        const otherPlayer = this.players[1 - i];
        if (pl.lastHitBy === otherPlayer.id && pl.lastHitByTimer > 0) {
          this.stats[otherPlayer.id].kills++;
        }
        
        pl.lives = Math.max(0, pl.lives - 1);
        
        if (pl.lives <= 0) {
          // Game over
          this.handleGameOver(1 - i);
          return;
        } else {
          // Respawn
          this.respawnPlayer(pl);
        }
      }
    }
  }
  
  /**
   * Respawn player
   */
  respawnPlayer(pl) {
    const spawnIndex = pl.id === 'p1' ? 0 : 1;
    pl.x = this.mapData.playerSpawns[spawnIndex].x;
    pl.y = this.mapData.playerSpawns[spawnIndex].y;
    pl.vx = 0;
    pl.vy = 0;
    pl.onGround = false;
    pl.shieldMs = 0;
    pl.hurtTimerMs = 0;
    pl.lastHitBy = null;
    pl.lastHitByTimer = 0;
    pl.airJumpsLeft = GAME_CONFIG.player.maxAirJumps;
    pl.dropThroughTimer = 0;
  }
  
  /**
   * Handle time up
   */
  handleTimeUp() {
    const p1 = this.players[0];
    const p2 = this.players[1];
    const l1 = p1 ? p1.lives : 0;
    const l2 = p2 ? p2.lives : 0;
    
    let winner = -1; // Draw
    if (l1 > l2) winner = 0;
    else if (l2 > l1) winner = 1;
    
    this.handleGameOver(winner);
  }
  
  /**
   * Handle game over
   */
  handleGameOver(winnerIndex) {
    this.stop();
    this._winner = winnerIndex;
    // Server will handle notifying clients
  }
  
  /**
   * Get current game state for clients
   */
  getGameState() {
    return {
      players: this.players.map(pl => ({
        id: pl.id,
        x: pl.x,
        y: pl.y,
        w: pl.w,
        h: pl.h,
        vx: pl.vx,
        vy: pl.vy,
        facing: pl.facing,
        lives: pl.lives,
        gun: {
          id: pl.gun.id,
          name: pl.gun.name,
          ammo: pl.gun.ammo
        },
        shieldMs: pl.shieldMs,
        onGround: pl.onGround
      })),
      bullets: this.bullets.map(b => ({
        id: b.id,
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        ownerId: b.ownerId,
        alive: b.alive
      })),
      powerUps: this.powerUps.map(pu => ({
        id: pu.id,
        type: pu.type,
        x: pu.x,
        y: pu.y,
        w: pu.w,
        h: pu.h,
        active: pu.active,
        _ttlSec: pu._ttlSec
      })),
      platforms: this.platforms.map(pf => ({
        x: pf.x,
        y: pf.y,
        w: pf.w,
        h: pf.h
      })),
      timeRemaining: this.timeRemaining,
      stats: this.stats,
      gameOver: !this.running,
      winner: this._winner !== undefined ? this._winner : (this.running ? null : (this.players[0].lives <= 0 ? 1 : (this.players[1].lives <= 0 ? 0 : -1)))
    };
  }
}

module.exports = { ServerGameState, GAME_CONFIG, GUNS };

