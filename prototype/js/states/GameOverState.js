/**
 * Game Over state: shows winner/draw, per-player stats, and supports a rematch when both players press fire.
 * @param game
 * @param stage
 * @param winner
 * @param stats
 * @constructor
 */
function GameOverState(game, stage, winner, stats) {
    this.game = game;
    this.stage = stage;
    this.winner = (typeof winner === 'number') ? winner : -1;
    this.stats = stats || {p1: {kills: 0, deaths: 0, pickups: 0}, p2: {kills: 0, deaths: 0, pickups: 0}};

    this.p1Ready = false;
    this.p2Ready = false;

    // UI delegate
    this.ui = (window.GameOverUi) ? new window.GameOverUi(this.game, this.stage) : null;
}

GameOverState.prototype.enter = function () {
    // Disable cheats/effects and freeze gameplay. Keep stage for background render only.
    if (this.stage && this.stage.players) {
        for (let i = 0; i < this.stage.players.length; i++) {
            const p = this.stage.players[i];
            p.vx = 0;
            p.vy = 0;
            p.onGround = false;
            p.hurtTimerMs = 0;
            p.shieldMs = 0;
        }
    }
};

/**
 * Update the game state: check for rematch when both players are ready.
 */
GameOverState.prototype.update = function () {
    // Read inputs; we use Stage controllers to get edge flags
    const ctrls = this.stage && this.stage.controllers;
    if (ctrls && ctrls.length >= 2) {
        const i1 = ctrls[0].readIntents();
        const i2 = ctrls[1].readIntents();
        if (i1.firePressed) this.p1Ready = true;
        if (i2.firePressed) this.p2Ready = true;
    } else if (this.game && this.game.input) {
        // Fallback: use input snapshot without edge detection
        const snap = this.game.input.getSnapshot();
        if (snap && snap.p1 && snap.p1.fire) this.p1Ready = true;
        if (snap && snap.p2 && snap.p2.fire) this.p2Ready = true;
    }

    if (this.p1Ready && this.p2Ready) {
        this._startRematch();
    }
};

GameOverState.prototype._resetStageForRematch = function () {
    if (!this.stage) return;
    const g = this.game && this.game.config;
    const maxLives = (g && g.player && g.player.maxLives) || 3;

    // Clear transient arrays
    this.stage.bullets = [];
    this.stage.powerUps = [];

    // Reset power-up timers (use config-driven values as in constructor)
    const pcfg = (g && g.powerUp) || {};
    const getGunCfg = pcfg.getGun || {};
    const othersCfg = pcfg.others || {};
    this.stage._getGunTimer = (typeof getGunCfg.firstSpawnSec === 'number') ? getGunCfg.firstSpawnSec : 5.0;
    this.stage._getGunInterval = (typeof getGunCfg.intervalSec === 'number') ? getGunCfg.intervalSec : 10.0;
    this.stage._getGunTtl = (typeof getGunCfg.ttlSec === 'number') ? getGunCfg.ttlSec : 9.0;
    this.stage._otherPuTimer = (typeof othersCfg.firstSpawnSec === 'number') ? othersCfg.firstSpawnSec : 15.0;
    this.stage._otherPuInterval = (typeof othersCfg.intervalSec === 'number') ? othersCfg.intervalSec : 15.0;
    this.stage._otherPuTtl = (typeof othersCfg.ttlSec === 'number') ? othersCfg.ttlSec : 14.0;

    // Reset player state and lives
    for (let i = 0; i < this.stage.players.length; i++) {
        const p = this.stage.players[i];
        p.lives = maxLives;
        p.vx = 0;
        p.vy = 0;
        p.onGround = false;
        p.dropThroughTimer = 0;
        p.hurtTimerMs = 0;
        p.shieldMs = 0;
        this.stage.respawnPlayer(i);
    }

    // Reset stats for a fresh match
    if (this.stage.stats) {
        this.stage.stats.p1.kills = 0;
        this.stage.stats.p1.deaths = 0;
        this.stage.stats.p1.pickups = 0;
        this.stage.stats.p2.kills = 0;
        this.stage.stats.p2.deaths = 0;
        this.stage.stats.p2.pickups = 0;
    }

    // Clear readiness
    this.p1Ready = false;
    this.p2Ready = false;
};

GameOverState.prototype._startRematch = function () {
    this._resetStageForRematch();
    // Switch to count down to start the next match
    if (this.game && this.game.changeState) {
        this.game.changeState('countdown', {game: this.game, stage: this.stage});
    }
};

GameOverState.prototype.render = function (ctx) {
    // Render the stage as a background
    if (this.stage && this.stage.render) {
        this.stage.render(ctx);
    }

    // Delegate all overlay/UI drawing to the UI module
    if (this.ui && this.ui.render) {
        this.ui.render(ctx, {
            winner: this.winner,
            stats: this.stats,
            p1Ready: this.p1Ready,
            p2Ready: this.p2Ready
        });
    }
};

GameOverState.prototype.exit = function () {
    // nothing special
};

function createGameOverState(params) {
    return new GameOverState(params.game, params.stage, params.winner, params.stats);
}

window.createGameOverState = createGameOverState;
