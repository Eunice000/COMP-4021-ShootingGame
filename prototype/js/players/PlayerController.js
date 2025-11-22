/**
 * Controller for a single player.
 * @param input instance of window.Input
 * @param playerId 'p1' or 'p2'
 * @constructor
 */
function PlayerController(input, playerId) {
    this.input = input;           // instance of window.Input
    this.playerId = playerId;     // 'p1' or 'p2'
    this._prevUp = false;         // track previous 'up' to generate jumpPressed edge
    this._prevDown = false;       // track previous 'down' to generate downPressed edge
    this._prevFire = false;       // track previous 'fire' to generate firePressed edge
    this._prevCheat = false;      // track previous 'cheat' to generate cheatPressed edge
}

/**
 * Read the input snapshot and return player intents.
 * @returns {{left: boolean, right: boolean, up: boolean, down: boolean, fire: boolean, cheat: boolean, jumpPressed: boolean, downPressed: boolean, firePressed: boolean, cheatPressed: boolean}}
 */
PlayerController.prototype.readIntents = function () {
    const snap = this.input && this.input.getSnapshot ? this.input.getSnapshot() : {p1: {}, p2: {}};
    const s = snap[this.playerId] || {left: false, right: false, up: false, down: false, fire: false, cheat: false};
    const jumpPressed = s.up && !this._prevUp;
    const downPressed = s.down && !this._prevDown;
    const firePressed = s.fire && !this._prevFire;
    const cheatPressed = s.cheat && !this._prevCheat;
    this._prevUp = !!s.up;
    this._prevDown = !!s.down;
    this._prevFire = !!s.fire;
    this._prevCheat = !!s.cheat;
    return {
        left: !!s.left,
        right: !!s.right,
        up: !!s.up,
        down: !!s.down,
        fire: !!s.fire,
        cheat: !!s.cheat,
        jumpPressed: jumpPressed,
        downPressed: downPressed,
        firePressed: firePressed,
        cheatPressed: cheatPressed
    };
};

window.PlayerController = PlayerController;

