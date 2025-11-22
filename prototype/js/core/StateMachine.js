/**
 *  State machine for the game loop.
 * @constructor
 */
function StateMachine() {
    this.states = {}; // name -> factory returning state instance
    this.current = null; // { name, state }
}

/**
 *  Register a new state with the machine.
 *  State factories are expected to return an object with update/render methods.
 *  @param name Unique name for the state.
 *  @param factory Factory function that returns the state instance.
 *  @returns The StateMachine instance for chaining.
 */
StateMachine.prototype.add = function (name, factory) {
    this.states[name] = factory;
    return this;
};

/**
 *  Change the current state of the machine.
 *  The factory function will be called with any params provided.
 *  @param params Optional parameters to pass to the state factory.
 *  @param name The name of the state to transition to.
 *  @returns The new state instance.
 */
StateMachine.prototype.change = function (name, params) {
    if (!this.states[name]) {
        console.error('[StateMachine] Unknown state:', name);
        return;
    }
    if (this.current && this.current.state.exit) {
        try {
            this.current.state.exit();
        } catch (e) {
            console.error('[StateMachine] exit error', e);
        }
    }
    const instance = this.states[name](params || {});
    this.current = {name, state: instance};
    if (instance.enter) {
        try {
            instance.enter(params || {});
        } catch (e) {
            console.error('[StateMachine] enter error', e);
        }
    }
};

/**
 * Update the current state.
 * @param dt Time has elapsed since last frame, in seconds.
 */
StateMachine.prototype.update = function (dt) {
    const s = this.current && this.current.state;
    if (s && s.update) s.update(dt);
};

/**
 * Render the current state.
 * @param ctx Canvas rendering context.
 */
StateMachine.prototype.render = function (ctx) {
    const s = this.current && this.current.state;
    if (s && s.render) s.render(ctx);
};

// Expose the class globally
window.StateMachine = StateMachine;
