function Player(opts) {
    opts = opts || {};
    window.Entity.call(this, opts);

    const cfg = window.GameConfig && window.GameConfig.player;
    this.w = opts.w || (cfg && cfg.width);
    this.h = opts.h || (cfg && cfg.height);

    this.vx = typeof opts.vx === 'number' ? opts.vx : 0;
    this.vy = typeof opts.vy === 'number' ? opts.vy : 0;
    this.onGround = false;

    this.moveAccel = (typeof opts.moveAccel === 'number') ? opts.moveAccel : (cfg && cfg.moveAccel);
    this.maxSpeedX = (typeof opts.maxSpeedX === 'number') ? opts.maxSpeedX : (cfg && cfg.maxSpeedX);
    this.jumpSpeed = opts.jumpSpeed || (cfg && cfg.jumpSpeed);
    this.lives = typeof opts.lives === 'number' ? opts.lives : (cfg && cfg.maxLives);

    // Per-frame accumulated acceleration (forces)
    this.ax = 0;
    this.ay = 0;

    this.color = opts.color;

    // Facing direction: 1 = right, -1 = left (used for firing bullets)
    this.facing = (typeof opts.facing === 'number') ? (opts.facing >= 0 ? 1 : -1) : 1;

    // Legacy weapon fields (kept for compatibility, no longer authoritative)
    this.weaponId = opts.weaponId || 'pistol';
    this.fireCooldownMs = 0;

    // Player's current gun
    if (opts.gun instanceof window.Gun) {
        this.gun = opts.gun;
    } else if (window.Weapons && typeof Weapons.newGun === 'function') {
        this.gun = Weapons.newGun((window.Weapons.getDefaultId && Weapons.getDefaultId()) || 1);
    } else {
        this.gun = new window.Gun({
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

    // Sprite rendering fields
    this.spriteSrc = null;
    this._spriteImage = null;
    this._spriteReady = false;

    // Used to avoid multi-jumping while holding the jump key
    this._canJump = true;

    // Timer that temporarily disables one-way platform collisions to drop through
    this.dropThroughTimer = 0; // seconds

    // Knockback/hurt stun timer (ms). While > 0, horizontal input won't override knockback velocity
    this.hurtTimerMs = 0;

    // Shield knockback immunity timer (ms)
    this.shieldMs = 0;

    // Double jump: allow extra jumps in the air (from config)
    const cfgPlayer = window.GameConfig && window.GameConfig.player;
    this.maxAirJumps = (typeof opts.maxAirJumps === 'number') ? opts.maxAirJumps
        : (cfgPlayer && typeof cfgPlayer.maxAirJumps === 'number' ? cfgPlayer.maxAirJumps : 1);
    this.airJumpsLeft = this.maxAirJumps;
}

Player.prototype = Object.create(window.Entity.prototype);
Player.prototype.constructor = Player;

/**
 * Integrate player motion with optional gravity; called by the game loop.
 * @param dt seconds since last step
 * @param gx optional gravity x (rarely used)
 * @param gy optional gravity y (downward positive)
 */
Player.prototype.update = function (dt, gx, gy) {
    // External accelerations (e.g., wind) still applied directly to velocity
    if (typeof gx === 'number') this.vx += gx * dt;
    if (typeof gy === 'number') this.vy += gy * dt;

    // Integrate player-applied accelerations (forces) -> velocity
    const vBefore = this.vx;
    this.vx += (typeof this.ax === 'number' ? this.ax : 0) * dt;
    this.vy += (typeof this.ay === 'number' ? this.ay : 0) * dt;

    // Clamp only input-driven horizontal speed to maxSpeedX, but do not clamp
    // if we were already above the cap before applying input acceleration.
    if (typeof this.maxSpeedX === 'number' && this.maxSpeedX > 0) {
        const ax = (typeof this.ax === 'number') ? this.ax : 0;
        if (ax !== 0) {
            const crossedCap = (Math.abs(vBefore) < this.maxSpeedX) && (Math.abs(this.vx) > this.maxSpeedX) && (Math.sign(this.vx) === Math.sign(ax));
            if (crossedCap) {
                this.vx = Math.sign(this.vx) * this.maxSpeedX;
            }
        }
    }

    // Integrate position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Clear per-frame accelerations
    this.ax = 0;
    this.ay = 0;

    // Gun cooldown
    if (this.gun && typeof this.gun.tick === 'function') {
        this.gun.tick(dt);
    }

    // Fire cooldown countdown (legacy, not used for Gun)
    if (this.fireCooldownMs > 0) {
        this.fireCooldownMs -= dt * 1000;
        if (this.fireCooldownMs < 0) this.fireCooldownMs = 0;
    }

    // Hurt/knockback timer countdown (ms)
    if (this.hurtTimerMs > 0) {
        this.hurtTimerMs -= dt * 1000;
        if (this.hurtTimerMs < 0) this.hurtTimerMs = 0;
    }

    // Shield timer countdown (ms)
    if (this.shieldMs > 0) {
        this.shieldMs -= dt * 1000;
        if (this.shieldMs < 0) this.shieldMs = 0;
    }

    // countdown drop-through timer
    if (this.dropThroughTimer > 0) {
        this.dropThroughTimer -= dt;
        if (this.dropThroughTimer < 0) this.dropThroughTimer = 0;
    }
};

/**
 * Apply input intents to velocity.
 * @param intents
 */
Player.prototype.applyInput = function (intents) {
    intents = intents || {};

    // Reset air jumps when grounded
    if (this.onGround) {
        this.airJumpsLeft = this.maxAirJumps;
    }

    // Horizontal movement via acceleration (force-based)
    let dir = 0;
    if (intents.left) dir -= 1;
    if (intents.right) dir += 1;
    // Apply horizontal acceleration from input; do not directly set velocity
    const accel = (typeof this.moveAccel === 'number') ? this.moveAccel : 0;
    this.ax += dir * accel;
    // Update facing from input
    if (dir < 0) this.facing = -1; else if (dir > 0) this.facing = 1;

    // Jump: allow ground jump or one air jump
    if (intents.jumpPressed && this._canJump) {
        if (this.onGround) {
            this.vy = -this.jumpSpeed;
            this.onGround = false;
            // keep airJumpsLeft as-is (already reset when grounded)
        } else if (this.airJumpsLeft > 0) {
            this.vy = -this.jumpSpeed; // same height as ground jump
            this.airJumpsLeft -= 1;    // consume one air jump
        }
        // lock until the key is released
        this._canJump = false;
    }

    // Drop-through: on down press while grounded, briefly disable one-way collisions
    if (intents.downPressed && this.onGround) {
        this.dropThroughTimer = 0.2; // seconds window to fall through
        this.onGround = false;
        if (this.vy < 60) this.vy = 60; // ensure downward motion starts
        this.y += 1; // nudge below the platform surface to disengage
    }

    // Reset jump gate when the key is released (controller should also provide jumpPressed edge)
    if (!intents.up) {
        this._canJump = true;
    }
};

Player.prototype.setSprite = function (src) {
    this.spriteSrc = (typeof src === 'string') ? src : null;
    this._spriteReady = false;
    this._spriteImage = null;
    if (this.spriteSrc && typeof Image !== 'undefined') {
        const img = new Image();
        const self = this;
        img.onload = function () {
            self._spriteReady = true;
        };
        img.onerror = function () {
            self._spriteReady = false;
        };
        img.src = this.spriteSrc;
        this._spriteImage = img;
    }
};

// Draw the player body and their gun
Player.prototype.draw = function (ctx) {
    // Draw sprite if available, otherwise fallback to base rectangle
    if (this._spriteImage && this._spriteReady && ctx && ctx.drawImage) {
        const x = this.x | 0;
        const y = this.y | 0;
        const w = this.w | 0;
        const h = this.h | 0;
        ctx.save();
        if (this.facing === -1) {
            // Flip horizontally around the player's center
            const cx = x + Math.floor(w / 2);
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            // After scaling, draw with left edge at -(w/2) to align to original position
            ctx.drawImage(this._spriteImage, -Math.floor(w / 2), y, w, h);
        } else {
            ctx.drawImage(this._spriteImage, x, y, w, h);
        }
        ctx.restore();
    } else {
        // Fallback: colored rectangle
        window.Entity.prototype.draw.call(this, ctx);
    }

    // Shield visual: blue circle outline around the player while active
    if (this.shieldMs > 0 && ctx && ctx.beginPath) {
        const cx = Math.floor(this.x + this.w / 2);
        const cy = Math.floor(this.y + this.h / 2);
        const r = Math.floor(Math.max(this.w, this.h) * 0.65);
        ctx.save();
        ctx.strokeStyle = '#0000ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
        ctx.stroke();
        ctx.restore();
    }

    // Draw gun overlay
    if (this.gun && typeof this.gun.draw === 'function') {
        this.gun.draw(ctx, this);
    }
};

window.Player = Player;
