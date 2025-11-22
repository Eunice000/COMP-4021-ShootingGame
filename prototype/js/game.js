/**
 *  Main entry point for the game.
 */
function init() {
    const canvas = document.getElementById('game');
    if (!canvas) {
        console.error('[game.js] Canvas #game not found');
        return;
    }

    // Create the Game with Renderer + StateMachine
    const game = new window.Game(canvas, window.GameConfig || {});

    // Make the canvas scale with the window without affecting logic
    game.renderer.attachAutoResize();

    // Register states
    game.addState('boot', function () {
        return window.createBootState({game});
    });
    game.addState('countdown', function (params) {
        return window.createCountdownState(params);
    });
    game.addState('gameplay', function (params) {
        return window.createGameplayState(params);
    });
    game.addState('gameover', function (params) {
        return window.createGameOverState(params);
    });

    // Start in boot state
    game.changeState('boot');
    game.start();
}


// Wait for the DOM to load before starting the game.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
