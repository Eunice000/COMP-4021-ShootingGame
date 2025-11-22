/**
 * A power-up entity that can be picked up by a player.
 * @param opts
 * @constructor
 */
function PowerUp(opts) {
    opts = opts || {};

    // Pull defaults from global GameConfig.powerUp if available
    const gcfg = (typeof window !== 'undefined' && window.GameConfig) ? window.GameConfig : {};
    const pcfg = gcfg.powerUp || {};

    // Default size from config unless explicitly provided
    if (opts.w == null) opts.w = (typeof pcfg.width === 'number') ? pcfg.width : 32;
    if (opts.h == null) opts.h = (typeof pcfg.height === 'number') ? pcfg.height : 32;

    window.Entity.call(this, opts);

    this.type = opts.type || 'extra_life';

    // Visuals: prefer ContentConfig color for this type, allow override via opts.color
    const cc = (typeof window !== 'undefined' && window.ContentConfig && window.ContentConfig.powerUps && window.ContentConfig.powerUps[(opts.type || 'extra_life')]) || {};
    this.color = (typeof opts.color === 'string' && opts.color.length > 0) ? opts.color : (cc.color || '#35c94a');

    // Bobbing animation settings
    this._baseY = this.y;

    // Lifecycle
    this.active = true;

    // Power-up config-driven properties (spawn offset only; spawn timing now lives in GameConfig.powerUp schedules)
    this.offset = (typeof opts.offset === 'number') ? opts.offset : (typeof pcfg.offset === 'number' ? pcfg.offset : 20);

    // Arbitrary payload for handler-specific data (e.g., gunId, duration)
    this.payload = opts.payload || {};

    // Sprite rendering fields
    this.spriteSrc = null;
    this._spriteImage = null;
    this._spriteReady = false;
}

PowerUp.prototype = Object.create(window.Entity.prototype);
PowerUp.prototype.constructor = PowerUp;

// Static registry of power-up types and their behavior
// Each entry: { onPickup(player, game, powerUp), color?, onExpire?(player, game, powerUp) }
PowerUp.Types = PowerUp.Types || {};

/**
 * Grants an extra life. No effect on max lives
 * @type {{onPickup: function(*, *): boolean}}
 */
PowerUp.Types.extra_life = {
    onPickup: function (player, game) {
        const cfg = (game && game.config) || window.GameConfig || {};
        const maxLives = (cfg.player && typeof cfg.player.maxLives === 'number') ? cfg.player.maxLives : 3;
        const curr = (player.lives | 0);
        if (curr < maxLives) {
            player.lives = curr + 1;
        }
        return true; // consumed even if already at max (no effect)
    }
};

/**
 * Grants knockback immunity for 5 seconds
 * @type {{onPickup: function(*): boolean}}
 */
PowerUp.Types.shield = {
    onPickup: function (player) {
        const durMs = 5000; // fixed 5 seconds per spec
        player.shieldMs = Math.max(player.shieldMs || 0, durMs);
        return true;
    }
};

/**
 * grants a random non-default gun from assets/game/guns.json
 * @type {{onPickup: function(*): boolean}}
 */
PowerUp.Types.get_gun = {
    onPickup: function (player) {
        const weapons = window.Weapons;
        if (!weapons || typeof weapons.newGun !== 'function') {
            // Weapons are not available; nothing to do but still consume to avoid softlocks
            return true;
        }
        const defaultId = (typeof weapons.getDefaultId === 'function') ? weapons.getDefaultId() : 1;
        const ids = (typeof weapons.getAllIds === 'function') ? weapons.getAllIds() : [];
        // Filter non-default ids
        const choices = [];
        for (let i = 0; i < ids.length; i++) {
            if (ids[i] !== defaultId) choices.push(ids[i]);
        }
        // Uniform random among choices; if empty, fallback to default
        const chosenId = (choices.length > 0) ? choices[Math.floor(Math.random() * choices.length)] : defaultId;
        player.gun = weapons.newGun(chosenId);
        return true;
    }
};

/**
 * Static power-up: no bobbing animation (keeps a fixed Y at spawn).
 */
PowerUp.prototype.update = function () {
    if (!this.active) return;
    // Remove vertical bobbing; always stay at spawn height
    this.y = this._baseY;
};

PowerUp.prototype.setSprite = function(src){
    this.spriteSrc = (typeof src === 'string') ? src : null;
    this._spriteReady = false;
    this._spriteImage = null;
    if (this.spriteSrc && typeof Image !== 'undefined'){
        const img = new Image();
        const self = this;
        img.onload = function(){ self._spriteReady = true; };
        img.onerror = function(){ self._spriteReady = false; };
        img.src = this.spriteSrc;
        this._spriteImage = img;
    }
};

/**
 * Render the power-up at its current position.
 * @param ctx
 */
PowerUp.prototype.draw = function (ctx) {
    if (!this.active) return;
    const x = this.x | 0;
    const y = this.y | 0;
    const w = this.w | 0;
    const h = this.h | 0;
    if (this._spriteImage && this._spriteReady && ctx && ctx.drawImage){
        try {
            ctx.drawImage(this._spriteImage, x, y, w, h);
        } catch (e) {
            // fallback to rectangle on draw error
            ctx.save();
            ctx.fillStyle = this.color;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#fff';
            ctx.fillRect(x + 4, y + 4, Math.max(0, w - 8), Math.max(0, h - 8));
            ctx.restore();
        }
    } else {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.fillRect(x, y, w, h);
        // Simple inner highlight
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 4, y + 4, Math.max(0, w - 8), Math.max(0, h - 8));
        ctx.restore();
    }
};

/**
 * Apply the effect to a player if possible.
 * Returns true if consumed.
 * @param player
 * @param game
 * @returns {boolean}
 */
PowerUp.prototype.applyTo = function (player, game) {
    if (!this.active || !player) return false;
    // Dispatch to a registered handler if available
    const registry = (window.PowerUp && window.PowerUp.Types) || PowerUp.Types;
    const handler = registry && registry[this.type];
    if (!handler || typeof handler.onPickup !== 'function') return false;
    const consumed = !!handler.onPickup(player, game, this);
    if (consumed) this.active = false;
    return consumed;
};

window.PowerUp = PowerUp;
