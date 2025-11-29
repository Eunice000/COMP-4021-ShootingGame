// Two-player keyboard controls for the prototype
// Both players use the same controls (WASD) since they play on different computers
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
            left: 'KeyA',    // Same as p1
            right: 'KeyD',   // Same as p1
            up: 'KeyW',      // Same as p1 - jump
            down: 'KeyS',    // Same as p1 - drop
            fire: 'KeyF',    // Same as p1
            cheat: 'KeyC'    // Same as p1 - CHEAT: give shield + special gun
        }
    }
};
