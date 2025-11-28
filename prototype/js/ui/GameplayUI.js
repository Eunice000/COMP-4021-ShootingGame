/**
 * Heads-Up Display (GameplayUI) for lives, weapon, ammo, cooldown.
 * Purely visual; does not mutate game or stage state.
 * @param game {Game}
 * @param stage {Stage}
 * @constructor
 */
function GameplayUI(game, stage) {
    this.game = game;
    this.stage = stage;
}

GameplayUI.prototype._drawPanel = function (ctx, x, y, w, h, bg, border) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
};

GameplayUI.prototype._drawText = function (ctx, text, x, y, align, color, font) {
    ctx.save();
    ctx.font = font || '20px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = color || '#111';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    ctx.restore();
};

GameplayUI.prototype.render = function (ctx) {
    if (!this.game || !this.stage) return;
    const g = this.game;
    const w = g.canvas.width;

    const pad = 16;
    const panelW = 240;
    const panelH = 65;

    const p1 = this.stage.players && this.stage.players[0];
    const p2 = this.stage.players && this.stage.players[1];

    // Colors
    const cP1 = (g.config.colors && g.config.colors.p1) || '#C33';
    const cP2 = (g.config.colors && g.config.colors.p2) || '#39F';
    const cUI = (g.config.colors && g.config.colors.ui) || '#111';

    // Left panel (P1)
    if (p1) {
        this._drawPanel(ctx, pad, pad, panelW, panelH, 'rgba(255,255,255,0.85)', cP1);
        // Name + lives
        this._drawText(ctx, 'P1', pad + 10, pad + 8, 'left', cP1, '22px Segoe UI, Arial, sans-serif');
        this._drawText(ctx, 'Lives: ' + (p1.lives | 0), pad + 60, pad + 8, 'left', cUI);
        // Weapon line
        const g1 = p1.gun || {};
        const weaponName1 = g1.name ;
        const ammo1 = (typeof g1.ammo === 'number') ? g1.ammo : '—';
        this._drawText(ctx, 'Gun: ' + weaponName1 + '  Ammo: ' + ammo1, pad + 10, pad + 36, 'left', cUI);
    }

    // Right panel (P2)
    if (p2) {
        const rx = w - pad - panelW;
        this._drawPanel(ctx, rx, pad, panelW, panelH, 'rgba(255,255,255,0.85)', cP2);
        this._drawText(ctx, 'P2', rx + panelW - 10, pad + 8, 'right', cP2, '22px Segoe UI, Arial, sans-serif');
        this._drawText(ctx, 'Lives: ' + (p2.lives | 0), rx + panelW - 60, pad + 8, 'right', cUI);
        const g2 = p2.gun || {};
        const weaponName2 = g2.name;
        const ammo2 = (typeof g2.ammo === 'number') ? g2.ammo : '—';
        this._drawText(ctx, 'Gun: ' + weaponName2 + '  Ammo: ' + ammo2, rx + panelW - 10, pad + 36, 'right', cUI);
    }
};

/**
 * Format time as a whole seconds like smash
 * @param seconds
 * @returns {string}
 * @private
 */
GameplayUI.prototype._formatTime = function (seconds) {
    const total = Math.max(0, Math.ceil(seconds || 0));
    return '' + total;
};

/**
 * Draws the round timer centered at the top of the screen
 * @param ctx
 * @param seconds
 */
GameplayUI.prototype.drawRoundTimer = function (ctx, seconds) {
    if (seconds == null || typeof seconds !== 'number') return;
    const g = this.game;
    const w = g && g.canvas ? g.canvas.width : 0;
    const uiColor = (g && g.config && g.config.colors && g.config.colors.ui) || '#111';
    const timeText = this._formatTime(seconds);
    this._drawText(ctx, timeText, w / 2, 16, 'center', uiColor, '80px Segoe UI, Arial, sans-serif, monospace');
};

window.GameplayUI = GameplayUI;
