(function () {
    'use strict';
    const factory = window.RegistryLoader && window.RegistryLoader.createSpriteRegistryLoader;
    let loader;
    if (typeof factory === 'function') {
        loader = factory({
            path: function () {
                const playersCfg = window.ContentConfig && window.ContentConfig.players;
                return playersCfg && playersCfg.path;
            },
            extractList: function (json) {
                return Array.isArray(json) ? json : (json && Array.isArray(json.players) ? json.players : []);
            },
            pick: function (it) {
                if (it && typeof it.id === 'string' && typeof it.sprite === 'string') {
                    return {id: it.id, sprite: it.sprite};
                }
                return null;
            },
            getGameDataList: function () {
                return (window.GameData && Array.isArray(window.GameData.players)) ? window.GameData.players : [];
            }
        });
    } else {
        // Minimal fallback without shared util
        loader = (function () {
            let _registry = {};
            let _loaded = false;

            function setRegistry(list) {
                _registry = {};
                if (Array.isArray(list)) {
                    for (let i = 0; i < list.length; i++) {
                        const it = list[i] || {};
                        if (it && typeof it.id === 'string' && typeof it.sprite === 'string') {
                            _registry[it.id] = {id: it.id, sprite: it.sprite};
                        }
                    }
                }
                _loaded = true;
            }

            return {
                load: function (path) {
                    return new Promise(function (resolve) {
                        // Prefer embedded data
                        if (window.GameData && Array.isArray(window.GameData.players) && window.GameData.players.length) {
                            setRegistry(window.GameData.players);
                            resolve(Object.keys(_registry).length);
                            return;
                        }
                        const playersCfg = window.ContentConfig && window.ContentConfig.players;
                        const jsonPath = path || (playersCfg && playersCfg.path);
                        const isFileProto = (typeof location !== 'undefined' && location.protocol === 'file:');
                        if (!jsonPath || isFileProto || typeof fetch !== 'function') {
                            setRegistry([]);
                            resolve(Object.keys(_registry).length);
                            return;
                        }
                        fetch(jsonPath).then(function (r) {
                            return r.json();
                        }).then(function (json) {
                            const list = Array.isArray(json) ? json : (json && Array.isArray(json.players) ? json.players : []);
                            setRegistry(list);
                            resolve(Object.keys(_registry).length);
                        }).catch(function () {
                            setRegistry([]);
                            resolve(Object.keys(_registry).length);
                        });
                    });
                },
                get: function (id) {
                    return _registry[id] || null;
                },
                isLoaded: function () {
                    return _loaded;
                }
            };
        })();
    }
    window.Players = loader;
})();

