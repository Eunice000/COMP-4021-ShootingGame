(function () {
    'use strict';
    const players = [
        {id: "p1", sprite: "assets/game/players/player_1_sprite.png"},
        {id: "p2", sprite: "assets/game/players/player_2_sprite.png"}
    ];
    window.GameData = window.GameData || {};
    window.GameData.players = players;
})();