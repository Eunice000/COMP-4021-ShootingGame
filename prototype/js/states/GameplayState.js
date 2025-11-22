/**
 * Main gameplay state: updates and renders the game world.
 * @param game
 * @param stage
 * @constructor
 */
function GameplayState(game, stage) {
    this.game = game;
    this.stage = stage; // Stage built in BootState
    this._winner = null; // 0 or 1 when the round ends; -1 for draw
    this._roundOverTimer = 0; // seconds

    const cfg = this.game.config || {};
    this.maxLives = (cfg.player && cfg.player.maxLives) || 3;

    // Round timer (seconds)
    this.roundDuration = (typeof cfg.roundTimer === 'number' ? cfg.roundTimer : 180);
    this.timeRemaining = this.roundDuration;

    // GameplayUI instance (created on Enter to ensure the stage is ready)
    this.hud = null;
}

/**
 * Initialize the game world and player controllers.
 */
GameplayState.prototype.enter = function () {
    // Reset round timer at the beginning of gameplay
    this.timeRemaining = this.roundDuration;
    this._winner = null;
    this._roundOverTimer = 0;

    // Ensure players have lives set
    if (this.stage && this.stage.players) {
        for (let i = 0; i < this.stage.players.length; i++) {
            const p = this.stage.players[i];
            if (typeof p.lives !== 'number' || p.lives <= 0) {
                p.lives = this.maxLives;
            }
        }
    }
    // Create GameplayUI instance now that stage is available
    if (window.GameplayUI) {
        this.hud = new window.GameplayUI(this.game, this.stage);
    }
};

/**
 * Check if any player has gone out of bounds and respawn them.
 * @private
 */
GameplayState.prototype._checkOutOfBoundsAndRespawn = function () {
    const st = this.stage;
    if (!st) return;
    for (let i = 0; i < st.players.length; i++) {
        const p = st.players[i];
        if (st.isOutOfBounds(p)) {
            // Attribution: death and possible kill credit
            const pid = (i === 0 ? 'p1' : 'p2');
            if (st.stats && st.stats[pid]) st.stats[pid].deaths++;
            if (p.lastHitBy && p.lastHitByTimer != null && p.lastHitByTimer > 0) {
                const killer = p.lastHitBy; // 'p1' or 'p2'
                if (st.stats && st.stats[killer]) st.stats[killer].kills++;
                p.lastHitBy = null;
                p.lastHitByTimer = 0;
            }
            // Lose a life
            p.lives = Math.max(0, (p.lives | 0) - 1);
            if (p.lives <= 0) {
                const winnerIndex = (i === 0 ? 1 : 0);
                // Transition to game over immediately
                this._goToGameOver(winnerIndex);
                return; // stop further checks this frame
            } else {
                st.respawnPlayer(i);
            }
        }
    }
};

/**
 * Update the game world and player movement.
 * @param dt
 */
GameplayState.prototype.update = function (dt) {
    if (this._roundOverTimer > 0) {
        // Legacy banner path disabled; we transition to GameOverState immediately now.
        return; // freeze simulation if any timer remains (should not occur)
    }

    // Countdown the round timer
    if (this.timeRemaining > 0) {
        this.timeRemaining = Math.max(0, this.timeRemaining - dt);
        if (this.timeRemaining <= 0) {
            // Time's up: decide winner based on lives
            const p1 = this.stage && this.stage.players && this.stage.players[0];
            const p2 = this.stage && this.stage.players && this.stage.players[1];
            const l1 = p1 ? (p1.lives | 0) : 0;
            const l2 = p2 ? (p2.lives | 0) : 0;
            let winnerIdx;
            if (l1 > l2) winnerIdx = 0;
            else if (l2 > l1) winnerIdx = 1;
            else winnerIdx = -1; // draw
            this._goToGameOver(winnerIdx);
            return; // stop updates this frame
        }
    }

    // Normal simulation step
    if (this.stage && this.stage.update) {
        this.stage.update(dt);
    }
    this._checkOutOfBoundsAndRespawn();
};


/**
 * Transition to GameOver state with stats and winner.
 * @param winnerIdx - 0,1 or -1 for draw
 * @private
 */
GameplayState.prototype._goToGameOver = function (winnerIdx) {
    const st = this.stage;
    // Snapshot stats to avoid mutation during GameOver
    const stats = st && st.stats ? {
        p1: {kills: st.stats.p1.kills|0, deaths: st.stats.p1.deaths|0, pickups: st.stats.p1.pickups|0},
        p2: {kills: st.stats.p2.kills|0, deaths: st.stats.p2.deaths|0, pickups: st.stats.p2.pickups|0}
    } : {p1:{kills:0,deaths:0,pickups:0}, p2:{kills:0,deaths:0,pickups:0}};
    if (this.game && this.game.changeState) {
        this.game.changeState('gameover', {game: this.game, stage: st, winner: winnerIdx, stats: stats});
    }
};

/**
 * Render the game world and GameplayUI.
 * @param ctx
 */
GameplayState.prototype.render = function (ctx) {
    // Draw world
    if (this.stage && this.stage.render) {
        this.stage.render(ctx);
    }

    const g = this.game;
    const w = g.canvas.width;
    const h = g.canvas.height;

    // GameplayUI panels
    if (this.hud && this.hud.render) {
        this.hud.render(ctx);
    }

    // Center-top round timer UI (delegated to GameplayUI)
    if (this.hud && this.hud.drawRoundTimer) {
        this.hud.drawRoundTimer(ctx, this.timeRemaining);
    }

    // Round over banner (overlay on top of GameplayUI)
    if (this._roundOverTimer > 0 && this._winner != null) {
        let msg;
        if (this._winner === -1) msg = 'Draw!';
        else msg = this._winner === 0 ? 'Player 1 Wins!' : 'Player 2 Wins!';
        g.renderer.drawText(msg, w / 2, h / 2, {
            font: '80px Segoe UI, Arial, sans-serif',
            color: '#111',
            textAlign: 'center',
            textBaseline: 'middle',
        });
    }
};

/**
 * Cleanup when leaving Gameplay state: remove any bullets from the stage.
 */
GameplayState.prototype.exit = function () {
    if (!this.stage) return;

    // 1) Clear bullets
    if (Array.isArray(this.stage.bullets)) {
        for (let i = 0; i < this.stage.bullets.length; i++) {
            const b = this.stage.bullets[i];
            if (b) b.alive = false;
        }
        this.stage.bullets.length = 0;
    }

    // 2) Remove power-ups from the canvas (deactivate and clear list)
    if (Array.isArray(this.stage.powerUps)) {
        for (let i = 0; i < this.stage.powerUps.length; i++) {
            const pu = this.stage.powerUps[i];
            if (pu) pu.active = false;
        }
        this.stage.powerUps.length = 0;
    }

    // 3) Reset players' guns to the default pistol
    if (Array.isArray(this.stage.players)) {
        for (let i = 0; i < this.stage.players.length; i++) {
            const pl = this.stage.players[i];
            if (!pl) continue;
            if (window.Weapons && typeof Weapons.newGun === 'function') {
                const defId = (Weapons.getDefaultId && Weapons.getDefaultId()) || 1;
                pl.gun = Weapons.newGun(defId);
            } else {
                // Fallback inline default pistol
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
    }
};

function createGameplayState(params) {
    return new GameplayState(params.game, params.stage);
}

window.createGameplayState = createGameplayState;