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
    roundTimer: 180, // 3 minutes like Gun Mayhem 2
    player: {
        width: 80,
        height: 120,
        moveAccel: 6000, // Increased for more responsive movement like Gun Mayhem 2
        maxSpeedX: 450, // Slightly faster movement
        jumpSpeed: 750, // Higher jump for better platforming
        maxLives: 3,
        maxAirJumps: 1 // Double jump like Gun Mayhem 2
    },
    projectile: {
        speed: 1800, // Faster bullets for more action
        lifetimeMs: 2000, // Longer range
        width: 24,
        height: 8,
        knockbackX: 1200,    // Increased knockback for more dramatic launches (Gun Mayhem 2 style)
        knockbackY: -300,   // More upward knockback to send players flying
        recoilX: 200,       // More recoil for weapon feel
        knockbackDurationMs: 200 // Slightly longer stun for impact feel
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
        // Power-up spawn schedules (seconds) - More frequent like Gun Mayhem 2
        // get_gun: first spawn delay, interval between spawns, and time-to-live
        getGun: {
            firstSpawnSec: 5,   // Faster first spawn for more action
            intervalSec: 8,     // More frequent weapon crates
            ttlSec: 7           // Time-to-live (after spawn, power-up disappears)
        },
        // other power-ups (extra_life, shield): shared schedule
        others: {
            firstSpawnSec: 10,  // Faster spawn
            intervalSec: 12,    // More frequent power-ups
            ttlSec: 10          // Longer time to pick up
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
        mapId: 'map1'
    }
};
