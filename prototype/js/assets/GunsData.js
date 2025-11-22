(function () {
    'use strict';
    const guns = [
        {
            id: 1,
            name: "Pistol",
            color: "#000000",
            type: "pistol",
            power: 2000,
            recoil: 200,
            cooldownMs: 600,
            ammo: 8,
            sprite: "assets/game/guns/pistol_sprite.png",
            offset: {x: 0, y: 2}
        },
        {
            id: 2,
            name: "Sniper",
            color: "#000000",
            type: "sniper",
            power: 6000,
            recoil: 600,
            cooldownMs: 1500,
            ammo: 4,
            sprite: "assets/game/guns/sniper_sprite.png",
            offset: {x: 60, y: 2}
        },
        {
            id: 3,
            name: "Assault Rifle",
            color: "#000000",
            type: "AR",
            power: 1800,
            recoil: 200,
            cooldownMs: 400,
            ammo: 24,
            sprite: "assets/game/guns/ar_sprite.png",
            offset: {x: 20, y: 2}
        },
        {
            id: 4,
            name: "SMG",
            color: "#000000",
            type: "SMG",
            power: 600,
            recoil: 100,
            cooldownMs: 200,
            ammo: 32,
            sprite: "assets/game/guns/smg_sprite.png",
            offset: {x: 10, y: 2}
        }
    ];
    window.GameData = window.GameData || {};
    window.GameData.guns = guns;
})();