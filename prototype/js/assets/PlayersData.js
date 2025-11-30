(function () {
    'use strict';
    const players = [
        {id: "p1", sprite: "prototype/assets/game/players/player1.svg"},
        {id: "p2", sprite: "prototype/assets/game/players/player2.svg"}
    ];
    window.GameData = window.GameData || {};
    window.GameData.players = players;
})();