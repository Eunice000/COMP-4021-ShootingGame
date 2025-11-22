/**
 * Default arena data for the game.
 * @returns {{id: string, width: number, height: number, platforms: [{x: number, y, w: number, h: number},{x: number, y: number, w: number, h: number}], playerSpawns: [{x: number, y: number},{x: number, y: number}]}}
 */
function getDefaultArena() {
    // Build a simple arena relative to canvas size
    const w = window.GameConfig && window.GameConfig.canvas && window.GameConfig.canvas.width;
    const h = window.GameConfig && window.GameConfig.canvas && window.GameConfig.canvas.height;
    const floorH = 24;
    const mid = {x: Math.floor(w * 0.25), y: Math.floor(h * 0.8), w: Math.floor(w * 0.5), h: 18};
    return {
        id: 'arena_rect_default',
        width: w,
        height: h,
        platforms: [
            {x: 0, y: h - floorH, w: w, h: floorH},
            mid
        ],
        playerSpawns: [
            {x: Math.floor(w * 0.3), y: Math.floor(h * 0.6)},
            {x: Math.floor(w * 0.6), y: Math.floor(h * 0.6)}
        ],
        // Optional power-up spawn points; if absent, Stage will derive from platforms
        powerUpSpawns: [
            {x: mid.x + Math.floor(mid.w * 0.5) - 16, y: mid.y - 40}
        ]
    };
}

/**
 * Normalize minimal schema. Width/height are sourced from GameConfig only
 * to keep all maps at a fixed resolution (e.g., 1920x1080). Any width/height
 * @param json
 * @returns {{id: *, width: number, height: number, platforms: {x, y, w, h}[]|*[], playerSpawns: {x, y}[]|*[], powerUpSpawns: {x, y}[]|*[]}}
 */
function fromJSON(json) {
 
    const data = json || {};

    const cfgW = (window.GameConfig && window.GameConfig.canvas && window.GameConfig.canvas.width);
    const cfgH = (window.GameConfig && window.GameConfig.canvas && window.GameConfig.canvas.height);

    return {
        id: data.id,
        width: cfgW,
        height: cfgH,
        background: (typeof data.background === 'string') ? data.background : null,
        platforms: Array.isArray(data.platforms) ? data.platforms.map(function (p) {
            return {x: p.x | 0, y: p.y | 0, w: p.w | 0, h: p.h | 0};
        }) : [],
        playerSpawns: Array.isArray(data.playerSpawns) ? data.playerSpawns.map(function (s) {
            return {x: s.x | 0, y: s.y | 0};
        }) : [],
        powerUpSpawns: Array.isArray(data.powerUpSpawns) ? data.powerUpSpawns.map(function (s) {
            return {x: s.x | 0, y: s.y | 0};
        }) : []
    };
}

/**
 * Load a map from embedded data or JSON; fall back to default arena.
 * @param mapIdOrConfig
 * @returns {Promise<unknown>}
 */
function load(mapIdOrConfig) {
    return new Promise(function (resolve) {
        let entry = mapIdOrConfig;
        if (typeof mapIdOrConfig === 'string') {
            const mapsCfg = window.ContentConfig && window.ContentConfig.maps;
            entry = mapsCfg && mapsCfg[mapIdOrConfig];
        }
        const path = entry && entry.path;

        // Prefer embedded maps if available (works under file://)
        if (window.GameData && Array.isArray(window.GameData.maps) && window.GameData.maps.length) {
            const json = window.GameData.maps;
            let selected = json[0];
            const cfg = (window.GameConfig && window.GameConfig.stage) || {};
            const desiredId = (cfg && cfg.mapId) || (entry && entry.id);
            if (desiredId) {
                selected = json.find(function (m) { return m && m.id === desiredId; }) || json[0];
            }
            resolve(fromJSON(selected));
            return;
        }

        // If no path or running under file://, return default
        const isFileProto = (typeof location !== 'undefined' && location.protocol === 'file:');
        if (!path || isFileProto || typeof fetch !== 'function') {
            resolve(getDefaultArena());
            return;
        }

        fetch(path).then(function (r) {
            return r.json();
        }).then(function (json) {
            let selected = json;
            if (Array.isArray(json)) {
                const cfg = (window.GameConfig && window.GameConfig.stage) || {};
                const desiredId = (cfg && cfg.mapId) || (entry && entry.id);
                if (desiredId) {
                    selected = json.find(function (m) { return m && m.id === desiredId; }) || json[0];
                } else {
                    selected = json[0];
                }
            }
            resolve(fromJSON(selected));
        }).catch(function () {
            resolve(getDefaultArena());
        });
    });
}

window.GameMap = {
    load: load,
    getDefaultArena: getDefaultArena,
    fromJSON: fromJSON
};

