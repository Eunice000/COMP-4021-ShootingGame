/**
 *  Main game class.
 *  @param canvas Canvas element to render to.
 *  @param config Global game configuration (optional).
 */
function Game(canvas, config) {
    this.canvas = canvas;
    this.config = config || window.GameConfig; // allow custom config, if not use defaults

    this.renderer = new window.Renderer(canvas, this.config);
    this.input = new window.Input(window.ControlsConfig);
    this.sm = new window.StateMachine();

    this._stopLoop = null; // Placeholder for stopRAF callback
    this._accumulator = 0;

    // Fixed timestep settings: simulate at a fixed 60 Hz (or GameConfig.tickRate)
    this._fixed = true; // fixed-step simulation for consistent physics
    this._step = 1 / (this.config.tickRate);
    this._maxSubSteps = 5; // avoid spiral-of-death on slow frames
}

/**
 *  Register a new state with the game loop.
 *  State factories are expected to return an object with update/render methods.
 *  @param name Unique name for the state.
 *  @param factory A factory is a function that returns a state instance (object) when called.
 */
Game.prototype.addState = function (name, factory) {
    this.sm.add(name, factory);
    return this;
};

/**
 *  Change the current state of the game loop.
 *  @param name The name of the state to transition to.
 *  @param params Optional parameters to pass to the state factory.
 */
Game.prototype.changeState = function (name, params) {
    this.sm.change(name, params);
};

/**
 *  Start the game loop.
 */
Game.prototype.start = function () {
    if (this._stopLoop) return; // already running
    const self = this;
    this._stopLoop = window.Timer.startRAF(function loop(dt) {
        self.update(dt);
        self.render();
    });
};

/**
 *  Stop the game loop.
 */
Game.prototype.stop = function () {
    if (this._stopLoop) {
        this._stopLoop();
        this._stopLoop = null;
    }
};

/**
 *  Update the game state machine and render.
 *  @param dt Time has elapsed since last frame, in seconds.
 */
Game.prototype.update = function (dt) {
    if (this._fixed) {
        // Fixed timestep accumulator pattern
        // Clamp outrageous pauses (e.g., tab inactive) to avoid huge catch-ups
        const clampedDt = Math.min(0.25, Math.max(0, dt));
        this._accumulator += clampedDt;

        let subSteps = 0;
        while (this._accumulator >= this._step && subSteps < this._maxSubSteps) {
            this.sm.update(this._step);
            this._accumulator -= this._step;
            subSteps++;
        }

        // If we hit the substep cap, drop any extra accumulated time to prevent spiral-of-death
        if (subSteps >= this._maxSubSteps) {
            this._accumulator = 0;
        }
    } else {
        // Variable timestep (not recommended for physics-sensitive gameplay)
        this.sm.update(dt);
    }
};

/**
 *  Render the current state.
 */
Game.prototype.render = function () {
    const ctx = this.renderer.ctx;
    this.renderer.clear();
    this.sm.render(ctx);
};

// Expose the class globally
window.Game = Game;
