(function () {
    'use strict';
    const maps = [
        {
            id: "testing",
            background: "prototype/assets/game/backgrounds/map_background_testing.png",
            platforms: [{x: 192, y: 950, w: 1536, h: 8}],
            playerSpawns: [{x: 344, y: 700}, {x: 1496, y: 700}],
            powerUpSpawns: [{x: 536, y: 850}, {x: 920, y: 850}, {x: 1304, y: 850}]
        },
        {
            id: "testing2",
            background: "prototype/assets/game/backgrounds/map_background_testing2.png",
            platforms: [{x: 192, y: 950, w: 1536, h: 8}, {x: 192, y: 600, w: 1536, h: 8}],
            playerSpawns: [{x: 344, y: 700}, {x: 1496, y: 700}],
            powerUpSpawns: [{x: 536, y: 850}, {x: 920, y: 850}, {x: 1304, y: 850}]
        },
        {
            id: "map1",
            background: "prototype/assets/game/backgrounds/map_background_map1.png",
            platforms: [
                // level 1 (Top)
                {x: 100, y: 300, w: 700, h: 8},
                {x: 1120, y: 300, w: 700, h: 8},
                // Level 2
                {x: 100, y: 450, w: 450, h: 8},
                {x: 800, y: 450, w: 320, h: 8},
                {x: 1370, y: 450, w: 450, h: 8},
                // Level 3
                {x: 500, y: 600, w: 920, h: 8},
                // Level 4 (Bottom)
                {x: 200, y: 750, w: 600, h: 8},
                {x: 1220, y: 750, w: 600, h: 8},
            ],
            playerSpawns: [{x: 285, y: 330}, {x: 1555, y: 330}],
            powerUpSpawns: [{x: 410, y: 220}, {x: 1430, y: 220}, {x: 285, y: 370}, {x: 920, y: 370}, {x: 1555, y: 370}, {x: 920, y: 520}, {x: 460, y: 670}, {x: 1480, y: 670}]
        }
    ];
    window.GameData = window.GameData || {};
    window.GameData.maps = maps;
})();