/**
 * The bullet shot by a player.
 * Noticed that the bullet is always horizontal, no gravity, fire in the direction of player facing
 * @param opts
 * @constructor
 */
function Bullet(opts) {
    opts = opts || {};
    window.Entity.call(this, opts);

    const gProj = window.GameConfig && window.GameConfig.projectile;

    // Dimensions (default from GameConfig)
    this.w = (typeof opts.w === 'number') ? opts.w : gProj.width;
    this.h = (typeof opts.h === 'number') ? opts.h : gProj.height;

    // Motion: horizontal only (no gravity)
    this.vx = (typeof opts.vx === 'number') ? opts.vx : 0;

    // Ownership and lifetime
    this.ownerId = opts.ownerId; // 'p1' | 'p2'
    this.lifetimeMs = (typeof opts.lifetimeMs === 'number') ? opts.lifetimeMs : gProj.lifetimeMs;
    this.alive = true;

    // Payload: power for knockback (horizontal)
    this.power = (typeof opts.power === 'number') ? opts.power : undefined;

    // Optional color override
    this.color = opts.color || '#222';
}

Bullet.prototype = Object.create(window.Entity.prototype);
Bullet.prototype.constructor = Bullet;

/**
 * Integrate motion
 * @param dt
 */
Bullet.prototype.update = function (dt) {
    // Move horizontally; ignore gravity
    this.x += this.vx * dt;
    // Lifetime countdown
    if (this.lifetimeMs > 0) {
        this.lifetimeMs -= dt * 1000;
        if (this.lifetimeMs <= 0) {
            this.alive = false;
        }
    }
};

window.Bullet = Bullet;
