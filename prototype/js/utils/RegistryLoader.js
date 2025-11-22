(function () {
    'use strict';

    /**
     * Factory for sprite registry loaders.
     * @param opts
     *  - opts.path(): string path to JSON
     *  - opts.extractList(json): any -> array of raw items
     *  - opts.pick(item): maps raw item -> {id: string, sprite: string}
     *  - opts.getGameDataList(): () => array (optional) — returns pre-embedded list for file:// mode
     * @returns {{load: function(*): Promise<unknown>, get: function(*): *, isLoaded: function(): boolean}}
     */
    function createSpriteRegistryLoader(opts) {
        opts = opts || {};
        var _registry = {};
        var _loaded = false;

        function setRegistry(list) {
            _registry = {};
            if (Array.isArray(list)) {
                for (var i = 0; i < list.length; i++) {
                    var mapped = (typeof opts.pick === 'function') ? opts.pick(list[i]) : null;
                    if (mapped && typeof mapped.id === 'string') {
                        _registry[mapped.id] = mapped;
                    }
                }
            }
            _loaded = true;
        }

        function load(path) {
            return new Promise(function (resolve) {
                var jsonPath = path || (typeof opts.path === 'function' ? opts.path() : null);
                var isFileProto = (typeof location !== 'undefined' && location.protocol === 'file:');

                // Prefer embedded game data if provided
                var listFromGame = (typeof opts.getGameDataList === 'function') ? opts.getGameDataList() : null;
                if (Array.isArray(listFromGame) && listFromGame.length > 0) {
                    setRegistry(listFromGame);
                    resolve(Object.keys(_registry).length);
                    return;
                }

                if (!jsonPath || isFileProto || typeof fetch !== 'function') {
                    setRegistry([]);
                    resolve(Object.keys(_registry).length);
                    return;
                }
                fetch(jsonPath).then(function (r) {
                    return r.json();
                }).then(function (json) {
                    var list = (typeof opts.extractList === 'function') ? opts.extractList(json) : [];
                    setRegistry(list);
                    resolve(Object.keys(_registry).length);
                }).catch(function () {
                    setRegistry([]);
                    resolve(Object.keys(_registry).length);
                });
            });
        }

        function get(id) {
            return _registry[id] || null;
        }

        function isLoaded() {
            return _loaded;
        }

        return {load: load, get: get, isLoaded: isLoaded};
    }

    window.RegistryLoader = {createSpriteRegistryLoader: createSpriteRegistryLoader};
})();