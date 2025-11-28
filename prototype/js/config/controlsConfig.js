// Two-player keyboard controls for the prototype
// These are just bindings; the Input system will read these later.
window.ControlsConfig = {
    // Key values use KeyboardEvent.code for clarity and layout-independence
    players: {
        p1: {
            left: 'KeyA',
            right: 'KeyD',
            up: 'KeyW',      // jump
            down: 'KeyS',    // drop
            fire: 'KeyF',
            cheat: 'KeyC'    // CHEAT: give shield + special gun
        },
        p2: {
            left: 'ArrowLeft',
            right: 'ArrowRight',
            up: 'ArrowUp',     // jump
            down: 'ArrowDown', // drop
            fire: 'Slash',     // '/' key
            cheat: 'Period'    // CHEAT: '.' key
        }
    }
};
