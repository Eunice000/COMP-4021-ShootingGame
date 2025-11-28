(function () {
    'use strict';
    const guns = [
        {
            id: 1,
            name: "Pistol",
            color: "#000000",
            type: "pistol",
            power: 2500, // Increased knockback for Gun Mayhem 2 feel
            recoil: 250,
            cooldownMs: 500, // Faster firing
            ammo: 12, // More ammo
            sprite: "assets/game/guns/pistol_sprite.png",
            offset: {x: 0, y: 2}
        },
        {
            id: 2,
            name: "Sniper",
            color: "#000000",
            type: "sniper",
            power: 8000, // Massive knockback - sends players flying
            recoil: 800,
            cooldownMs: 1800,
            ammo: 3, // Less ammo but powerful
            sprite: "assets/game/guns/sniper_sprite.png",
            offset: {x: 60, y: 2}
        },
        {
            id: 3,
            name: "Assault Rifle",
            color: "#000000",
            type: "AR",
            power: 2200, // Good knockback
            recoil: 250,
            cooldownMs: 350, // Faster firing
            ammo: 30, // More ammo
            sprite: "assets/game/guns/ar_sprite.png",
            offset: {x: 20, y: 2}
        },
        {
            id: 4,
            name: "SMG",
            color: "#000000",
            type: "SMG",
            power: 1000, // Lower knockback but high fire rate
            recoil: 120,
            cooldownMs: 150, // Very fast firing
            ammo: 40, // Lots of ammo
            sprite: "assets/game/guns/smg_sprite.png",
            offset: {x: 10, y: 2}
        }
    ];
    window.GameData = window.GameData || {};
    window.GameData.guns = guns;
})();