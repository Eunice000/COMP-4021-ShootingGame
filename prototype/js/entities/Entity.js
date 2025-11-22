/**
 * Base entity class for objects with position/size and rendering.
 * Thus, Player, Bullet, Platform, and Power-up
 * @param opts
 * @constructor
 */
function Entity(opts) {
    opts = opts || {};
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.w = opts.w || 40;
    this.h = opts.h || 40;
    this.color = opts.color || '#FF0FFF';
}

/**
 * The default update is a no-op. Dynamic subclasses (Player, Bullet)
 * should implement their own integration using their own velocity.
 * @param dt
 * @param gx
 * @param gy
 */
Entity.prototype.update = function (dt, gx, gy) {
};

/**
 * Render the entity at its current position.
 * @param ctx
 */
Entity.prototype.draw = function (ctx) {
    ctx.fillStyle = this.color || '#888';
    ctx.fillRect(this.x, this.y, this.w, this.h);
};

window.Entity = Entity;

