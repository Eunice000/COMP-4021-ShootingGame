/**
 * Check if two axis-aligned bounding boxes (AABB) intersect.
 * @param ax
 * @param ay
 * @param aw
 * @param ah
 * @param bx
 * @param by
 * @param bw
 * @param bh
 * @returns {boolean}
 */
function aabbIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Resolve Player vs. an array of one-way Platforms (top-only).
 * Rules:
 *  - Only Player has onGround and vy state
 *  - Platforms are static rects: {x,y,w,h}
 *  - Only resolve when the player is moving downward (vy > 0) and intersects the platform top from above
 *  - Side or bottom entries pass through
 * On collision: snap player to platform top, set vy=0, onGround=true
 * @param player
 * @param platforms
 * @param dt
 * @returns {null}
 */
function collidePlayerVsPlatforms(player, platforms, dt) {
    if (!platforms || platforms.length === 0) {
        player.onGround = false;
        return null;
    }

    // If the player is currently dropping through platforms, skip landing checks
    if (player && player.dropThroughTimer > 0) {
        player.onGround = false;
        return null;
    }

    let landed = null;
    // Assume the player has already integrated for dt (x,y updated)
    const prevY = player.y - player.vy * dt; // extrapolate back to the previous position
    const prevBottom = prevY + player.h;
    // var currBottom = player.y + player.h;

    // Only consider if moving downward
    if (player.vy > 0) {
        for (let i = 0; i < platforms.length; i++) {
            const pf = platforms[i];
            // Broad phase AABB overlap at the current position
            if (!aabbIntersect(player.x, player.y, player.w, player.h, pf.x, pf.y, pf.w, pf.h)) continue;

            // Check if the player was above the top in the previous step (approach from above)
            const top = pf.y;
            const wasAbove = prevBottom <= top + 0.5; // epsilon to avoid tunneling
            const horizontallyOver = (player.x + player.w) > pf.x && player.x < (pf.x + pf.w);

            if (wasAbove && horizontallyOver) {
                // Land on this platform
                player.y = top - player.h;
                player.vy = 0;
                player.onGround = true;
                landed = pf;
                break;
            }
        }
    }

    if (!landed) {
        // Not landed this step
        player.onGround = false;
    }
    return landed;
}

/**
 * Check if a bullet hits any player.
 * @param bullets
 * @param players
 * @returns {*[]}
 */
function collideBulletsVsPlayers(bullets, players) {
    if (!bullets || bullets.length === 0 || !players || players.length === 0) return [];
    const hits = [];
    for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b || !b.alive) continue;
        for (let p = 0; p < players.length; p++) {
            const pl = players[p];
            if (!pl) continue;
            // Ignore the owner (no friendly fire to self)
            const pid = (p === 0 ? 'p1' : 'p2');
            if (b.ownerId && b.ownerId === pid) continue;
            if (aabbIntersect(b.x, b.y, b.w, b.h, pl.x, pl.y, pl.w, pl.h)) {
                hits.push({bullet: b, player: pl});
                b.alive = false; // consume bullet on hit
                break; // a bullet hits at most one player
            }
        }
    }
    return hits;
}

window.Collision = {
    collidePlayerVsPlatforms: collidePlayerVsPlatforms,
    collideBulletsVsPlayers: collideBulletsVsPlayers
};
