/**
 * Game Over UI: draws the end-of-round overlay (title, stats table, readiness badges).
 * Purely visual; no state mutations. Delegated by GameOverState.
 * @param game {Game}
 * @param stage {Stage}
 * @constructor
 */
function GameOverUi(game, stage) {
    this.game = game;
    this.stage = stage;
}

GameOverUi.prototype._drawCenteredPanel = function (ctx, x, y, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'white';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
};

GameOverUi.prototype._kd = function (k, d) {
    const kills = k | 0;
    const deaths = d | 0;
    if (deaths === 0) {
        return kills > 0 ? '∞' : '0.00';
    }
    const ratio = kills / deaths;
    return (Math.round(ratio * 100) / 100).toFixed(2);
};

/**
 * Render the full Game Over overlay.
 * @param ctx
 * @param model
 */
GameOverUi.prototype.render = function (ctx, model) {
    if (!this.game) return;
    const g = this.game;
    const w = g.canvas.width;
    const h = g.canvas.height;

    // Dim the background
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Title
    const winner = (model && typeof model.winner === 'number') ? model.winner : -1;
    let title;
    if (winner === -1) title = 'Draw!';
    else title = (winner === 0 ? 'Player 1 Wins!' : 'Player 2 Wins!');
    g.renderer.drawText(title, w / 2, h * 0.20, {
        font: '84px Segoe UI, Arial, sans-serif',
        color: '#111',
        textAlign: 'center',
        textBaseline: 'middle'
    });

    // Stats panel
    const panelW = 700, panelH = 180;
    const px = Math.floor((w - panelW) / 2);
    const py = Math.floor(h * 0.28);
    this._drawCenteredPanel(ctx, px, py, panelW, panelH);

    // Column headers
    const headersY = py + 30;
    const headerStyle = {font: '24px Segoe UI, Arial, sans-serif', color: '#111'};
    g.renderer.drawText('Player', px + 30, headersY, headerStyle);
    g.renderer.drawText('Kills', px + 260, headersY, headerStyle);
    g.renderer.drawText('Deaths', px + 360, headersY, headerStyle);
    g.renderer.drawText('K/D', px + 480, headersY, headerStyle);
    g.renderer.drawText('Pickups', px + 560, headersY, headerStyle);

    // Rows
    const s1 = model && model.stats && model.stats.p1 ? model.stats.p1 : {kills: 0, deaths: 0, pickups: 0};
    const s2 = model && model.stats && model.stats.p2 ? model.stats.p2 : {kills: 0, deaths: 0, pickups: 0};
    let rows;
    if (winner === 0) rows = [{label: 'P1', color: g.config.colors && g.config.colors.p1, s: s1}, {label:'P2', color: g.config.colors && g.config.colors.p2, s: s2}];
    else if (winner === 1) rows = [{label: 'P2', color: g.config.colors && g.config.colors.p2, s: s2}, {label:'P1', color: g.config.colors && g.config.colors.p1, s: s1}];
    else rows = [{label: 'P1', color: g.config.colors && g.config.colors.p1, s: s1}, {label:'P2', color: g.config.colors && g.config.colors.p2, s: s2}];

    for (let r = 0; r < rows.length; r++) {
        const rowY = py + 70 + r * 80;
        const row = rows[r];
        // Player label with color swatch
        ctx.fillStyle = row.color || '#666';
        ctx.fillRect(px + 30, rowY - 18, 20, 20);
        g.renderer.drawText(row.label, px + 60, rowY, {font: '28px Segoe UI, Arial, sans-serif', color: '#111'});
        // Values
        g.renderer.drawText(String(row.s.kills | 0), px + 270, rowY, {font: '28px Segoe UI, Arial, sans-serif', color: '#111'});
        g.renderer.drawText(String(row.s.deaths | 0), px + 380, rowY, {font: '28px Segoe UI, Arial, sans-serif', color: '#111'});
        g.renderer.drawText(this._kd(row.s.kills, row.s.deaths), px + 480, rowY, {font: '28px Segoe UI, Arial, sans-serif', color: '#111'});
        g.renderer.drawText(String(row.s.pickups | 0), px + 580, rowY, {font: '28px Segoe UI, Arial, sans-serif', color: '#111'});
        // Rank badge
        const rankText = (winner === -1) ? (r === 0 ? 'T-1' : 'T-1') : (r === 0 ? '1st' : '2nd');
        g.renderer.drawText(rankText, px + panelW - 80, rowY, {font: '24px Segoe UI, Arial, sans-serif', color: '#555'});
    }

    // Readiness badges
    const p1Ready = !!(model && model.p1Ready);
    const p2Ready = !!(model && model.p2Ready);
    const p1ReadyText = p1Ready ? 'P1 Ready' : 'P1 Waiting…';
    const p2ReadyText = p2Ready ? 'P2 Ready' : 'P2 Waiting…';

    // Instruction line (centered) above readiness badges
    g.renderer.drawText('Press fire to rematch', w / 2, py + panelH + 50, {
        font: '24px Segoe UI, Arial, sans-serif',
        color: '#111',
        textAlign: 'center',
        textBaseline: 'top'
    });

    g.renderer.drawText(p1ReadyText, w / 2 - 220, py + panelH + 86, {
        font: '22px Segoe UI, Arial, sans-serif',
        color: p1Ready ? (g.config.colors && g.config.colors.p1) : '#000',
        textAlign: 'right',
        textBaseline: 'top'
    });
    g.renderer.drawText(p2ReadyText, w / 2 + 220, py + panelH + 86, {
        font: '22px Segoe UI, Arial, sans-serif',
        color: p2Ready ? (g.config.colors && g.config.colors.p2) : '#000',
        textAlign: 'left',
        textBaseline: 'top'
    });
};

window.GameOverUi = GameOverUi;
