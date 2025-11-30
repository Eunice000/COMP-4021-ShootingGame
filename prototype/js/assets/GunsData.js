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
            sprite: "prototype/assets/game/guns/pistol_sprite.png",
            // Align the grip top slightly below mid-height (renderer uses anchorGripTop)
            anchorGripTop: 16, // source image is 48px tall; grip top ~16px from top
            offset: {x: 50, y: 0}
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
            sprite: "prototype/assets/game/guns/sniper_sprite.png",
            anchorGripTop: 14, // image height ~32px; grip top around 14px
            offset: {x: 100, y: 0}
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
            sprite: "prototype/assets/game/guns/ar_sprite.png",
            anchorGripTop: 22, // image height 48px; grip top near 22px
            offset: {x: 100, y: 30}
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
            sprite: "prototype/assets/game/guns/smg_sprite.png",
            anchorGripTop: 22, // image height 48px; grip top near 22px
            offset: {x: 60, y: 30}
        }
    ];
    window.GameData = window.GameData || {};
    window.GameData.guns = guns;
})();