/**
 * Initial state for the game.
 * @param game
 * @constructor
 */
function BootState(game) {
    this.game = game;
    this.t = 0; // time accumulator for any simple effects
    this.players = [];
    this.controllers = [];
    this.platforms = [];
    this.stage = null;
    this._loading = false;
}

/**
 * Initialize the game world and player controllers.
 */
BootState.prototype.enter = function () {
    const g = this.game;
    const self = this;
    this._loading = true;
    this._handoffDone = false;

    const mapsCfg = window.ContentConfig && window.ContentConfig.maps;
    const mapEntry = (mapsCfg && mapsCfg.stage) || null;
    const mapArg = mapEntry || 'stage';

    // First, load weapons, player sprites, and power-up sprites (graceful fallback inside loaders)
    function loadWeaponsIfAvailable() {
        if (window.Weapons && Weapons.loadAll) {
            return Weapons.loadAll();
        }
        return Promise.resolve();
    }

    function loadPlayersIfAvailable() {
        if (window.Players && Players.load) {
            return Players.load();
        }
        return Promise.resolve();
    }

    function loadPowerUpsIfAvailable() {
        if (window.PowerUps && PowerUps.load) {
            return PowerUps.load();
        }
        return Promise.resolve();
    }

    // Load content, then map
    if (window.GameMap && GameMap.load) {
        Promise.all([loadWeaponsIfAvailable(), loadPlayersIfAvailable(), loadPowerUpsIfAvailable()]).then(function () {
            return GameMap.load(mapArg);
        }).then(function (mapData) {
            self.stage = new window.Stage(g, mapData);
            // For debug convenience keep mirrors
            self.players = self.stage.players;
            self.controllers = self.stage.controllers;
            self.platforms = self.stage.platforms;
            self._loading = false;
        }).catch(function (err) {
            console.error('[BootState] Load failed', err);
            self.stage = new window.Stage(g, GameMap.getDefaultArena());
            self.players = self.stage.players;
            self.controllers = self.stage.controllers;
            self.platforms = self.stage.platforms;
            self._loading = false;
            self._error = 'Failed to load content or map; using default.';
        });
    } else {
        // No Map module – build from default (still attempt content loaders)
        Promise.all([loadWeaponsIfAvailable(), loadPlayersIfAvailable(), loadPowerUpsIfAvailable()]).finally(function () {
            self.stage = new window.Stage(g, (window.GameMap && GameMap.getDefaultArena && GameMap.getDefaultArena()) || null);
            self.players = self.stage.players;
            self.controllers = self.stage.controllers;
            self.platforms = self.stage.platforms;
            self._loading = false;
        });
    }
};

/**
 * Update the game world and player movement.
 * @param dt Time has elapsed since last frame, in seconds.
 */
BootState.prototype.update = function (dt) {
    this.t += dt;
    if (this._loading) return;
    // Handoff to countdown once the stage is ready (only once)
    if (!this._handoffDone && this.stage) {
        this._handoffDone = true;
        // Switch to countdown state and pass the prepared stage
        if (this.game && this.game.changeState) {
            this.game.changeState('countdown', {game: this.game, stage: this.stage});
        }
    }
};

/**
 * Clean up any resources used by the game world before switching to another state.
 */
BootState.prototype.exit = function () {
    // Cleanup if needed
    this.players = [];
    this.controllers = [];
    this.platforms = [];
    this.stage = null;
    this._loading = false;
};

// Factory helper to register with StateMachine
function createBootState(params) {
    // Expect params.game
    return new BootState(params.game);
}

window.createBootState = createBootState;
