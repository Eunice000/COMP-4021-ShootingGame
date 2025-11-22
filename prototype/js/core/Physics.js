/**
 * Apply friction to the player's velocity.'
 * @param player
 * @param dt
 * @param cfg
 */
function applyFriction(player, dt, cfg) {
    if (!player) return;
    const friction = (cfg && cfg.friction) || {ground: 0.85, air: 0.98};
    const factor = player.onGround ? friction.ground : friction.air;
    // Simple exponential decay towards 0
    player.vx *= factor;
    // Avoid denormals / tiny drift
    if (Math.abs(player.vx) < 0.01) player.vx = 0;
}

window.Physics = {
    applyFriction: applyFriction,
};
