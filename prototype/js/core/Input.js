/**
 * Input manager. Handles keydown/keyup events and maps them to player intents.
 * @param controlsConfig
 * @constructor
 */
function Input(controlsConfig) {
    this.config = controlsConfig || window.ControlsConfig;

    // Normalize bindings to a Map: code -> [playerId, action]
    this._bindings = new Map();

    // State per player
    this.players = {
        p1: {left: false, right: false, up: false, down: false, fire: false, cheat: false},
        p2: {left: false, right: false, up: false, down: false, fire: false, cheat: false}
    };

    // Edge states per frame (pressed/released) – can be cleared by consumer each update if needed
    this._edges = {
        p1: {pressed: {}, released: {}},
        p2: {pressed: {}, released: {}}
    };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._active = false;

    this._setupBindings();
    this.enable();
}

/**
 *  Set up the input bindings from the global config
 */
Input.prototype._setupBindings = function () {
    this._bindings.clear();
    const p = (this.config && this.config.players) || {};

    function add(map, code, playerId, action) {
        if (!code) return;
        map.set(code, {playerId: playerId, action: action});
    }

    // p1
    if (p.p1) {
        add(this._bindings, p.p1.left, 'p1', 'left');
        add(this._bindings, p.p1.right, 'p1', 'right');
        add(this._bindings, p.p1.up, 'p1', 'up');
        add(this._bindings, p.p1.down, 'p1', 'down');
        add(this._bindings, p.p1.fire, 'p1', 'fire');
        add(this._bindings, p.p1.cheat, 'p1', 'cheat');
    }
    // p2
    if (p.p2) {
        add(this._bindings, p.p2.left, 'p2', 'left');
        add(this._bindings, p.p2.right, 'p2', 'right');
        add(this._bindings, p.p2.up, 'p2', 'up');
        add(this._bindings, p.p2.down, 'p2', 'down');
        add(this._bindings, p.p2.fire, 'p2', 'fire');
        add(this._bindings, p.p2.cheat, 'p2', 'cheat');
    }
};

/**
 *  Enable input handling
 */
Input.prototype.enable = function () {
    if (this._active) return;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this._active = true;
};

/**
 *  Disable input handling
 */
Input.prototype.disable = function () {
    if (!this._active) return;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._active = false;
};

/**
 * Update player state based on key press/release
 * @param playerId 'p1' or 'p2'
 * @param action 'left', 'right', 'up', 'down', 'fire'
 * @param isDown true if key is down, false if released
 */
Input.prototype._setState = function (playerId, action, isDown) {
    const pState = this.players[playerId];
    if (!pState) return;
    if (pState[action] === isDown) return; // no change

    pState[action] = isDown;
    const edge = isDown ? 'pressed' : 'released';
    this._edges[playerId][edge][action] = true;
};

/**
 * Handle keydown events
 */
Input.prototype._onKeyDown = function (e) {
    const bind = this._bindings.get(e.code);
    if (!bind) return;
    // prevent repeat toggling when a key is held down
    if (e.repeat) {
        return;
    }
    this._setState(bind.playerId, bind.action, true);
};

/**
 * Handle keyup events
 */
Input.prototype._onKeyUp = function (e) {
    const bind = this._bindings.get(e.code);
    if (!bind) return;
    this._setState(bind.playerId, bind.action, false);
};

/**
 * Clears the pressed/released edge states for each player
 */
Input.prototype.clearEdges = function () {
    for (const pid in this._edges) {
        if (!Object.prototype.hasOwnProperty.call(this._edges, pid)) continue;
        this._edges[pid].pressed = {};
        this._edges[pid].released = {};
    }
};

/**
 * Returns a snapshot of the current input state for each player (for controllers)
 * @returns {{p1: {left: boolean, right: boolean, up: boolean, down: boolean, fire: boolean},
 *            p2: {left: boolean, right: boolean, up: boolean, down: boolean, fire: boolean}}}
 */
Input.prototype.getSnapshot = function () {
    return {
        p1: Object.assign({}, this.players.p1),
        p2: Object.assign({}, this.players.p2)
    };
};

// Expose the class globally
window.Input = Input;
