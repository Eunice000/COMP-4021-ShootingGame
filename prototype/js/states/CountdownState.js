/**
 * Countdown state: shows a countdown before starting the game.
 * @param game
 * @param stage
 * @constructor
 */
function CountdownState(game, stage) {
    this.game = game;
    this.stage = stage; // existing Stage instance prepared by BootState
    this.timeLeft = 3.0; // seconds for 3..2..1
    this._shownGo = false;
    this._goTimer = 0.5; // show "GO!" for 0.5 s before switching
}

/**
 * Initialize the countdown timer.
 */
CountdownState.prototype.enter = function () {
    // Reset players' velocities and ground flags so the countdown starts clean
    if (this.stage && this.stage.players) {
        for (let i = 0; i < this.stage.players.length; i++) {
            const p = this.stage.players[i];
            p.vx = 0;
            p.vy = 0;
            p.onGround = false;
            p.dropThroughTimer = 0;
        }
    }
};

/**
 * Update the countdown timer.
 * @param dt
 */
CountdownState.prototype.update = function (dt) {
    if (this.timeLeft > 0) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this._shownGo = true;
        }
        return;
    }
    // Show "GO!" briefly
    if (this._shownGo) {
        this._goTimer -= dt;
        if (this._goTimer <= 0) {
            // Switch to gameplay
            if (this.game && this.game.changeState) {
                this.game.changeState('gameplay', {game: this.game, stage: this.stage});
            }
        }
    }
};

/**
 * Render the countdown timer.
 * @param ctx
 */
CountdownState.prototype.render = function (ctx) {
    // Draw world static during countdown
    if (this.stage && this.stage.render) {
        this.stage.render(ctx);
    }

    const g = this.game;
    const w = g.canvas.width;
    const h = g.canvas.height;

    let text = '';
    if (this.timeLeft > 2) {
        text = '3';
    } else if (this.timeLeft > 1) {
        text = '2';
    } else if (this.timeLeft > 0) {
        text = '1';
    } else if (this._shownGo) {
        text = 'GO!';
    }

    if (text) {
        g.renderer.drawText(text, w / 2, h / 2, {
            font: '96px Segoe UI, Arial, sans-serif',
            color: '#111',
            textAlign: 'center',
            textBaseline: 'middle'
        });
    }
};

/**
 * Factory helper to register with StateMachine.
 * @param params
 * @returns {CountdownState}
 */
function createCountdownState(params) {
    return new CountdownState(params.game, params.stage);
}

window.createCountdownState = createCountdownState;

