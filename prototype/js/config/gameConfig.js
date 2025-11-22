// Global game configuration
window.GameConfig = {
    canvas: {
        width: 1920,
        height: 1080,
        background: '#BEBEBE'
    },
    tickRate: 60, // logic updates per second
    gravity: {x: 0, y: 1800}, // px/s^2 downward
    friction: {
        ground: 0.9,
        air: 0.85
    },
    // Round timer length in seconds
    roundTimer: 180,
    player: {
        width: 80,
        height: 120,
        moveAccel: 5000, // px/s^2 horizontal acceleration from input
        maxSpeedX: 400, // px/s horizontal top speed from input (external impulses may exceed)
        jumpSpeed: 700, // px/s (applied as an instantaneous vertical impulse)
        maxLives: 3,
        maxAirJumps: 1
    },
    projectile: {
        speed: 1500,
        lifetimeMs: 1500,
        width: 24,
        height: 8,
        knockbackX: 900,    // default horizontal impulse on hit (px/s)
        knockbackY: -200,   // default vertical impulse on hit (px/s)
        recoilX: 150        // default shooter recoil opposite direction (px/s)
    },
    guns: {
        // Additional weapon-related config
        // When the default pistol runs out of ammo and auto-reloads, impose a brief lockout
        // during which the player cannot fire. This helps telegraph the reload.
        pistolEmptyCooldownMs: 500
    },
    powerUp: {
        width: 80,
        height: 80,
        offset: 20,         // spawn distance from the platform
        // Power-up spawn schedules (seconds)
        // get_gun: first spawn delay, interval between spawns, and time-to-live
        getGun: {
            firstSpawnSec: 10,  // Delay after game start
            intervalSec: 10,    // Interval between spawns
            ttlSec: 9          // Time-to-live (after spawn, power-up disappears) // Please set to at least 1 second less than intervalSec
        },
        // other power-ups (extra_life, shield): shared schedule
        others: {
            firstSpawnSec: 15,
            intervalSec: 15,
            ttlSec: 9
        }
    },
    colors: {
        background: '#FFFFFF',
        canvas: '#FFFFFF',
        ui: '#000000',
        p1: '#FF4040',
        p2: '#99CCFF'
    },
    stage: {
        // width and height follow the canvas width and height above
        outOfBoundsMargin: 400,
        // Desired map id to load from assets/game/maps.json (overrides ContentConfig.maps.stage.id when set)
        mapId: 'testing'
    }
};
