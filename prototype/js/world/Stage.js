// Holds platforms, players, and updates their interactions.
/**
 * Main game world container.
 * @param game
 * @param mapData
 * @constructor
 */
function Stage(game, mapData) {
    this.game = game;
    this.map = mapData || (window.GameMap && GameMap.getDefaultArena && GameMap.getDefaultArena()) || {
        width: game.canvas.width,
        height: game.canvas.height
    };
    this.platforms = [];
    this.players = [];
    this.controllers = [];
    this.playerSpawns = [];
    this.bullets = [];
    this.powerUps = [];

    // Background image (optional per-map)
    this.backgroundSrc = null;
    this._backgroundImage = null;
    this._backgroundReady = false;

    // Match statistics (persist for the match until Game Over)
    this.stats = {
        p1: {kills: 0, deaths: 0, pickups: 0},
        p2: {kills: 0, deaths: 0, pickups: 0}
    };

    // Power-up spawn control (separate schedules) driven by GameConfig
    const pcfg = (this.game && this.game.config && this.game.config.powerUp) || {};
    const getGunCfg = pcfg.getGun || {};
    const othersCfg = pcfg.others || {};

    // get_gun schedule
    this._getGunTimer = (typeof getGunCfg.firstSpawnSec === 'number') ? getGunCfg.firstSpawnSec : 5.0; // seconds until next get_gun spawn
    this._getGunInterval = (typeof getGunCfg.intervalSec === 'number') ? getGunCfg.intervalSec : 10.0;
    this._getGunTtl = (typeof getGunCfg.ttlSec === 'number') ? getGunCfg.ttlSec : 9.0;
    this._getGunMax = 1;

    // others (extra_life, shield) shared schedule
    this._otherPuTimer = (typeof othersCfg.firstSpawnSec === 'number') ? othersCfg.firstSpawnSec : 15.0; // seconds until next other power-up spawn
    this._otherPuInterval = (typeof othersCfg.intervalSec === 'number') ? othersCfg.intervalSec : 15.0;
    this._otherPuTtl = (typeof othersCfg.ttlSec === 'number') ? othersCfg.ttlSec : 14.0;
    this._otherPuMax = 1;

    this._buildFromMap(this.map);
}

/**
 * Build the game world from a map definition.
 * @param map
 * @private
 */
Stage.prototype._buildFromMap = function (map) {
    // Platforms
    this.platforms = (map.platforms || []).map(function (p) {
        return new window.Platform({x: p.x, y: p.y, w: p.w, h: p.h});
    });

    // Spawns
    const spawns = map.playerSpawns || [];
    const mapW = map.width || (this.game && this.game.canvas && this.game.canvas.width);
    const mapH = map.height || (this.game && this.game.canvas && this.game.canvas.height);
    const p1Spawn = spawns[0] || {x: Math.floor(mapW * 0.3), y: Math.floor(mapH * 0.6)};
    const p2Spawn = spawns[1] || {x: Math.floor(mapW * 0.6), y: Math.floor(mapH * 0.6)};
    this.playerSpawns = [p1Spawn, p2Spawn];

    // Power-up spawn points (optional in map; derive from platforms if absent)
    if (Array.isArray(map.powerUpSpawns) && map.powerUpSpawns.length > 0) {
        this.powerUpSpawns = map.powerUpSpawns.slice();
    } else {
        // derive simple positions: center above each non-floor platform
        this.powerUpSpawns = this.platforms
            .filter(function (pf) {
                return pf.y < mapH - 30;
            })
            .map(function (pf) {
                return {x: Math.floor(pf.x + pf.w / 2) - 16, y: Math.floor(pf.y - 40)};
            });
        if (this.powerUpSpawns.length === 0) {
            // fallback: center of the map, above ground
            this.powerUpSpawns = [{x: Math.floor(mapW / 2) - 16, y: Math.floor(mapH * 0.6) - 40}];
        }
    }

    // Background handling (optional)
    this.backgroundSrc = map.background || null;
    this._backgroundImage = null;
    this._backgroundReady = false;
    if (this.backgroundSrc && typeof Image !== 'undefined') {
        const img = new Image();
        const self = this;
        img.onload = function () {
            self._backgroundReady = true;
        };
        img.onerror = function () {
            self._backgroundReady = false;
        };
        img.src = this.backgroundSrc;
        this._backgroundImage = img;
    }

    const cfg = this.game.config || {};
    const centerX = (map.width || mapW) / 2;
    const p1Facing = (centerX - p1Spawn.x) >= 0 ? 1 : -1; // face toward center
    const p2Facing = (centerX - p2Spawn.x) >= 0 ? 1 : -1; // face toward center
    const p1 = new window.Player({x: p1Spawn.x, y: p1Spawn.y, color: cfg.colors && cfg.colors.p1, facing: p1Facing});
    const p2 = new window.Player({x: p2Spawn.x, y: p2Spawn.y, color: cfg.colors && cfg.colors.p2, facing: p2Facing});

    // Assign sprites from Players registry if available
    if (window.Players && typeof Players.get === 'function') {
        const p1Def = Players.get('p1');
        const p2Def = Players.get('p2');
        if (p1Def && p1Def.sprite && typeof p1.setSprite === 'function') {
            p1.setSprite(p1Def.sprite);
        }
        if (p2Def && p2Def.sprite && typeof p2.setSprite === 'function') {
            p2.setSprite(p2Def.sprite);
        }
    }

    this.players = [p1, p2];

    // Controllers
    this.controllers = [
        new window.PlayerController(this.game.input, 'p1'),
        new window.PlayerController(this.game.input, 'p2')
    ];

};

/**
 * Update the game world state.
 * @param dt
 */
Stage.prototype.update = function (dt) {
    const cfg = this.game.config || {};
    const gravity = (cfg.gravity && cfg.gravity.y) || 0;

    // Update power-up spawn timers and possibly spawn new ones (independent schedules)
    // Count active by category
    let activeGetGun = 0;
    let activeOther = 0;
    for (let i = 0; i < this.powerUps.length; i++) {
        const pu = this.powerUps[i];
        if (!pu || !pu.active) continue;
        if (pu.type === 'get_gun') activeGetGun++; else activeOther++;
    }

    // Tick timers
    this._getGunTimer -= dt;
    this._otherPuTimer -= dt;

    // Spawn get_gun if timer elapsed and none present
    if (this._getGunTimer <= 0 && activeGetGun < this._getGunMax) {
        this._spawnGetGunPowerUp();
        this._getGunTimer += this._getGunInterval; // fixed cadence; do not reset on pickup
    }
    // Spawn other if timer elapsed and none present
    if (this._otherPuTimer <= 0 && activeOther < this._otherPuMax) {
        this._spawnOtherPowerUp();
        this._otherPuTimer += this._otherPuInterval; // fixed cadence
    }

    // Update existing power-ups (no bobbing) and TTL
    for (let i = 0; i < this.powerUps.length; i++) {
        const pu = this.powerUps[i];
        if (!pu || !pu.active) continue;
        // TTL handling
        if (typeof pu._ttlSec === 'number') {
            pu._ttlSec -= dt;
            if (pu._ttlSec <= 0) {
                pu.active = false;
                continue;
            }
        }
        pu.update(dt);
    }

    // Update players
    for (let i = 0; i < this.players.length; i++) {
        const pl = this.players[i];
        // Decay last-hit attribution timer
        if (pl.lastHitByTimer != null) {
            pl.lastHitByTimer -= dt;
            if (pl.lastHitByTimer <= 0) {
                pl.lastHitByTimer = 0;
                pl.lastHitBy = null;
            }
        }
        const ctrl = this.controllers[i];
        const intents = ctrl.readIntents();

        // Movement intents
        pl.applyInput(intents);

        // CHEAT: grant knockback immunity and special gun on cheat button press
        if (intents.cheatPressed) {
            this._applyCheat(i);
        }

        // Integrate with gravity
        pl.update(dt, 0, gravity);

        // Friction
        if (window.Physics && Physics.applyFriction) Physics.applyFriction(pl, dt, cfg);

        // Collide with one-way platforms (respects dropThroughTimer in Collision module)
        if (window.Collision && Collision.collidePlayerVsPlatforms) Collision.collidePlayerVsPlatforms(pl, this.platforms, dt);

        // After collision resolution, if grounded, refresh air jumps immediately
        if (pl.onGround && typeof pl.maxAirJumps === 'number') {
            pl.airJumpsLeft = pl.maxAirJumps;
        }

        // Handle firing: hold-to-fire supported (continuous while held). Rate limited by Gun.canFire()/cooldown.
        if (intents.fire) {
            this._tryFire(i);
        }

        // Handle power-up pickups for this player
        for (let k = 0; k < this.powerUps.length; k++) {
            const pu = this.powerUps[k];
            if (!pu || !pu.active) continue;
            if (this._aabb(pl.x, pl.y, pl.w, pl.h, pu.x, pu.y, pu.w, pu.h)) {
                if (pu.applyTo && pu.applyTo(pl, this.game)) {
                    // consumed; remove from list
                    pu.active = false;
                    // increment pickups stat for this player
                    const pid = (i === 0 ? 'p1' : 'p2');
                    if (this.stats && this.stats[pid]) this.stats[pid].pickups++;
                }
            }
        }
    }

    // Remove inactive power-ups
    this.powerUps = this.powerUps.filter(function (p) {
        return p && p.active;
    });

    // Update bullets
    for (let b = 0; b < this.bullets.length; b++) {
        const bullet = this.bullets[b];
        if (!bullet || !bullet.alive) continue;
        bullet.update(dt);
        if (this.isBulletOutOfBounds(bullet, 150)) {
            bullet.alive = false;
        }
    }

    // Bullet vs player collisions (ignore owner handled inside)
    if (window.Collision && Collision.collideBulletsVsPlayers) {
        const hits = Collision.collideBulletsVsPlayers(this.bullets, this.players);
        if (hits && hits.length) {
            for (let h = 0; h < hits.length; h++) {
                this._applyBulletHit(hits[h]);
            }
        }
    }

    // Cull dead bullets
    this.bullets = this.bullets.filter(function (b) {
        return b && b.alive;
    });
};

// Attempt to fire a bullet for player index (0 -> p1, 1 -> p2)
Stage.prototype._tryFire = function (playerIndex) {
    const pl = this.players[playerIndex];
    if (!pl) return;

    // Use Gun system
    const gun = pl.gun;
    const projCfg = (this.game.config && this.game.config.projectile) || {};
    const speed = projCfg.speed || 800;
    const lifetimeMs = projCfg.lifetimeMs || 1000;
    const w = projCfg.width || 16;
    const h = projCfg.height || 6;

    if (!gun || !gun.canFire || !gun.canFire()) {
        return;
    }

    // Spawn at the front middle of the player
    const dir = pl.facing >= 0 ? 1 : -1;
    const muzzleX = pl.x + (dir > 0 ? pl.w : -w);
    const muzzleY = pl.y + (pl.h * 0.4);

    const bullet = new window.Bullet({
        x: muzzleX,
        y: muzzleY,
        w: w,
        h: h,
        vx: dir * speed,
        lifetimeMs: lifetimeMs,
        ownerId: (playerIndex === 0 ? 'p1' : 'p2'),
        power: gun.power,
        color: gun.color
    });
    this.bullets.push(bullet);

    // Apply pure horizontal recoil to shooter (opposite direction)
    if (typeof gun.recoil === 'number' && gun.recoil !== 0) {
        pl.vx += -dir * gun.recoil;
    }

    // Consume ammo and start cooldown
    if (gun.onFired) gun.onFired();

    // Handle depletion: if not pistol type, swap to default pistol; if pistol, give a fresh pistol (reload)
    if (gun.isDepleted && gun.isDepleted()) {
        if (gun.type && gun.type !== 'pistol') {
            // Depleted non-pistol: swap to default pistol (no special empty cooldown)
            if (window.Weapons && Weapons.newGun) {
                pl.gun = Weapons.newGun((Weapons.getDefaultId && Weapons.getDefaultId()) || 1);
            } else {
                pl.gun = new window.Gun({
                    id: 1,
                    name: 'pistol',
                    type: 'pistol',
                    color: '#333333',
                    power: 900,
                    recoil: 150,
                    cooldownMs: 300,
                    ammo: 12
                });
            }
        } else {
            // Pistol depleted: auto-reload with a fresh pistol AND apply an extra empty cooldown lock from config
            if (window.Weapons && Weapons.newGun) {
                pl.gun = Weapons.newGun((Weapons.getDefaultId && Weapons.getDefaultId()) || 1);
            } else {
                pl.gun = new window.Gun({
                    id: 1,
                    name: 'pistol',
                    type: 'pistol',
                    color: '#333333',
                    power: 900,
                    recoil: 150,
                    cooldownMs: 300,
                    ammo: 12
                });
            }
            // Apply extra cooldown lock so holding fire cannot immediately shoot after reload
            const lockCfg = (this.game && this.game.config && this.game.config.guns) || {};
            const lockMs = (typeof lockCfg.pistolEmptyCooldownMs === 'number') ? lockCfg.pistolEmptyCooldownMs : 500;
            if (pl.gun) {
                pl.gun.cooldownTimerMs = Math.max(pl.gun.cooldownTimerMs | 0, lockMs | 0);
            }
        }
    }
};

// Apply bullet hit effects (knockback)
Stage.prototype._applyBulletHit = function (hit) {
    const pl = hit.player;
    if (!pl) return;
    // Shield: immunity to bullet knockback (bullet still counts as a hit elsewhere)
    if (pl.shieldMs > 0) {
        return; // no knockback or hurt stun applied
    }
    const projCfg = (this.game.config && this.game.config.projectile) || {};
    const baseKbX = (projCfg.knockbackX != null ? projCfg.knockbackX : 800);
    const stunMs = (projCfg.knockbackDurationMs != null ? projCfg.knockbackDurationMs : 180);
    // Prefer bullet power if present
    const power = (hit.bullet && typeof hit.bullet.power === 'number') ? hit.bullet.power : baseKbX;
    // Determine the bullet direction from its vx
    const dir = hit.bullet && hit.bullet.vx < 0 ? -1 : 1;
    // Apply knockback as a horizontal impulse (additive)
    pl.vx += dir * power;
    // Optional brief hurt-stun to preserve the knockback feel (kept from previous behavior)
    if (typeof pl.hurtTimerMs === 'number') pl.hurtTimerMs = Math.max(pl.hurtTimerMs || 0, stunMs);
    // Pure horizontal knockback: do not modify vertical velocity
    pl.onGround = false;

    // Record last hitter for kill attribution
    if (hit.bullet && hit.bullet.ownerId) {
        pl.lastHitBy = hit.bullet.ownerId; // 'p1' or 'p2'
        pl.lastHitByTimer = 3.0; // seconds window to credit a kill on death
    }
};

// CHEAT: apply infinite knockback immunity and special overpowered gun for the given player index
Stage.prototype._applyCheat = function (playerIndex) {
    const pl = this.players[playerIndex];
    if (!pl) return;
    // 1) Knockback immunity for ~infinite time (9,999 seconds)
    pl.shieldMs = Math.max(pl.shieldMs || 0, 9999 * 1000);
    // 2) Equip special cheat gun (not in guns.json, cannot be obtained from get_gun)
    pl.gun = new window.Gun({
        id: 99999,
        name: 'CHEAT',
        type: 'cheat',
        color: '#FF00FF',
        power: 9999,
        recoil: 1,
        cooldownMs: 100,
        ammo: 999
    });
};

/**
 * Render the game world and GameplayUI.
 * @param ctx
 */
Stage.prototype.render = function (ctx) {
    // Draw map background image if available (after renderer.clear has filled bg color)
    if (this._backgroundImage && this._backgroundReady) {
        const w = this.game && this.game.canvas && this.game.canvas.width;
        const h = this.game && this.game.canvas && this.game.canvas.height;
        try {
            ctx.drawImage(this._backgroundImage, 0, 0, w, h);
        } catch (e) {
            // ignore draw errors
        }
    }

    // Platforms are intentionally NOT rendered, but still exist for collisions

    // Draw power-ups beneath players but above background
    for (let i = 0; i < this.powerUps.length; i++) {
        const pu = this.powerUps[i];
        if (!pu || !pu.active) continue;
        pu.draw(ctx);
    }

    // Draw players
    for (let p = 0; p < this.players.length; p++) {
        this.players[p].draw(ctx);
    }

    // Draw bullets on top
    ctx.fillStyle = '#222';
    for (let b = 0; b < this.bullets.length; b++) {
        const bullet = this.bullets[b];
        if (!bullet || !bullet.alive) continue;
        bullet.draw(ctx);
    }
};

/**
 * Check if a bullet is outside the horizontal bounds of the stage plus margin.
 * Bullets are horizontal-only projectiles in this game.
 * @param bullet
 * @param marginOpt optional explicit margin to use
 * @returns {boolean}
 */
Stage.prototype.isBulletOutOfBounds = function (bullet, marginOpt) {
    if (!bullet) return true;
    const w = this.game && this.game.canvas && this.game.canvas.width || 0;
    const cfg = (this.game && this.game.config) || {};
    const defaultMargin = (cfg.stage && typeof cfg.stage.outOfBoundsMargin === 'number') ? cfg.stage.outOfBoundsMargin : 200;
    const m = (typeof marginOpt === 'number') ? marginOpt : defaultMargin;
    return (bullet.x + bullet.w < -m) || (bullet.x > w + m);
};

/**
 * respawn a player at their spawn index
 * @param index
 */
Stage.prototype.respawnPlayer = function (index) {
    const pl = this.players[index];
    const spawn = this.playerSpawns[index];
    if (!pl) return;
    pl.x = spawn.x;
    pl.y = spawn.y;
    pl.vx = 0;
    pl.vy = 0;
    pl.onGround = false;
    pl.dropThroughTimer = 0;
    // Ensure player has a (fresh) default pistol on respawn if missing or depleted
    if (!pl.gun || (pl.gun.isDepleted && pl.gun.isDepleted())) {
        if (window.Weapons && Weapons.newGun) {
            pl.gun = Weapons.newGun((Weapons.getDefaultId && Weapons.getDefaultId()) || 1);
        } else {
            pl.gun = new window.Gun({
                id: 1,
                name: 'pistol',
                type: 'pistol',
                color: '#333333',
                power: 900,
                recoil: 150,
                cooldownMs: 300,
                ammo: 12
            });
        }
    }
    // Reset jump state on respawn
    if (typeof pl.maxAirJumps === 'number') {
        pl.airJumpsLeft = pl.maxAirJumps;
    }
    pl._canJump = true;
};

/**
 * Check if a player is outside the game world bounds plus margin.
 * @param player
 * @returns {boolean}
 */
Stage.prototype.isOutOfBounds = function (player) {
    const w = this.game.canvas.width;
    const h = this.game.canvas.height;
    const cfg = (this.game && this.game.config) || {};
    const margin = (cfg.stage && typeof cfg.stage.outOfBoundsMargin === 'number') ? cfg.stage.outOfBoundsMargin : 200;
    return (player.y > h + margin) || (player.x + player.w < -margin) || (player.x > w + margin);
};

// --- Power-up helpers ---

// Spawn helper to get a free spawn position (avoiding occupied spots)
Stage.prototype._pickFreePowerUpSpawn = function () {
    if (!Array.isArray(this.powerUpSpawns) || this.powerUpSpawns.length === 0) return null;
    const active = this.powerUps.filter(function (p) {
        return p && p.active;
    });
    const freeSpawns = this.powerUpSpawns.filter(function (s) {
        return !active.some(function (p) {
            const px = (p.x | 0);
            const py = (typeof p._baseY === 'number') ? (p._baseY | 0) : (p.y | 0);
            return px === (s.x | 0) && py === (s.y | 0);
        });
    });
    if (freeSpawns.length === 0) return null;
    return freeSpawns[Math.floor(Math.random() * freeSpawns.length)];
};

// Spawn a get_gun power-up with TTL 9s, color yellow, using registry color override
Stage.prototype._spawnGetGunPowerUp = function () {
    const pos = this._pickFreePowerUpSpawn();
    if (!pos) return;
    const registry = (window.ContentConfig && window.ContentConfig.powerUps) || {};
    const entry = registry['get_gun'] || {};
    const pu = new window.PowerUp({
        type: 'get_gun',
        x: pos.x | 0,
        y: pos.y | 0,
        color: (entry.color != null ? entry.color : '#ffff00'),
        payload: entry.payload || undefined
    });
    // Assign sprite if available
    if (window.PowerUps && typeof PowerUps.get === 'function') {
        const def = PowerUps.get('get_gun');
        if (def && def.sprite && typeof pu.setSprite === 'function') {
            pu.setSprite(def.sprite);
        }
    }
    pu._ttlSec = (typeof this._getGunTtl === 'number') ? this._getGunTtl : 9.0; // despawn after configured seconds if not picked up
    this.powerUps.push(pu);
};

// Spawn an "other" category power-up (extra_life or shield) with TTL 14s
Stage.prototype._spawnOtherPowerUp = function () {
    const pos = this._pickFreePowerUpSpawn();
    if (!pos) return;
    // 50% chance either extra_life or shield
    const type = (Math.random() < 0.5) ? 'extra_life' : 'shield';
    const registry = (window.ContentConfig && window.ContentConfig.powerUps) || {};
    const entry = registry[type] || {};
    const pu = new window.PowerUp({
        type: type,
        x: pos.x | 0,
        y: pos.y | 0,
        color: (entry.color != null ? entry.color : (type === 'shield' ? '#0000ff' : '#ff0000')),
        payload: entry.payload || undefined
    });
    // Assign sprite if available
    if (window.PowerUps && typeof PowerUps.get === 'function') {
        const def = PowerUps.get(type);
        if (def && def.sprite && typeof pu.setSprite === 'function') {
            pu.setSprite(def.sprite);
        }
    }
    pu._ttlSec = (typeof this._otherPuTtl === 'number') ? this._otherPuTtl : 14.0; // despawn after configured seconds if not picked up
    this.powerUps.push(pu);
};

Stage.prototype._aabb = function (ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
};

window.Stage = Stage;
