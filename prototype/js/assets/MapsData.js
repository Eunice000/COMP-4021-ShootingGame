(function () {
    'use strict';
    const maps = [
        {
            id: "testing",
            background: "assets/game/backgrounds/map_background_testing.png",
            platforms: [{x: 192, y: 950, w: 1536, h: 8}],
            playerSpawns: [{x: 344, y: 700}, {x: 1496, y: 700}],
            powerUpSpawns: [{x: 536, y: 850}, {x: 920, y: 850}, {x: 1304, y: 850}]
        },
        {
            id: "testing2",
            background: "assets/game/backgrounds/map_background_testing2.png",
            platforms: [{x: 192, y: 950, w: 1536, h: 8}, {x: 192, y: 600, w: 1536, h: 8}],
            playerSpawns: [{x: 344, y: 700}, {x: 1496, y: 700}],
            powerUpSpawns: [{x: 536, y: 850}, {x: 920, y: 850}, {x: 1304, y: 850}]
        }
    ];
    window.GameData = window.GameData || {};
    window.GameData.maps = maps;
})();