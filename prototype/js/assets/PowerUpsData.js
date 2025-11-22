(function () {
    'use strict';
    const powerUps = [
        {id: "extra_life", sprite: "assets/game/powerups/extra_life_sprite.png"},
        {id: "shield", sprite: "assets/game/powerups/shield_sprite.png"},
        {id: "get_gun", sprite: "assets/game/powerups/get_gun_sprite.png"}
    ];
    window.GameData = window.GameData || {};
    window.GameData.powerUps = powerUps;
})();