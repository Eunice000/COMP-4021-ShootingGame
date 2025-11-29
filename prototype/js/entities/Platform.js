/**
 * Static platform entity.
 * @param opts
 * @constructor
 */
function Platform(opts) {
    opts = opts || {};
    window.Entity.call(this, opts);

    // Optional surface effects (reserved for future use)
    this.friction = typeof opts.friction === 'number' ? opts.friction : 0;
    this.bounce = typeof opts.bounce === 'number' ? opts.bounce : 0;
}

Platform.prototype = Object.create(window.Entity.prototype);
Platform.prototype.constructor = Platform;

// No movement/update needed for static platforms
Platform.prototype.update = function (dt) {
    // Intentionally a no-op: no moving platforms in this game
};

window.Platform = Platform;
