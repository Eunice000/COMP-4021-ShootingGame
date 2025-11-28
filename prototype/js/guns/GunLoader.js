let _weaponsById = {};
let _defaultId = 1;

function _builtinDefaultPistol() {
    return {
        id: 1,
        name: 'pistol',
        color: '#333333',
        type: 'pistol',
        power: 900,
        recoil: 150,
        cooldownMs: 300,
        ammo: 12
    };
}

function setRegistry(list) {
    _weaponsById = {};
    if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
            const w = list[i] || {};
            if (w && typeof w.id === 'number') {
                // basic validation and coercion
                _weaponsById[w.id] = {
                    id: w.id | 0,
                    name: String(w.name || ('weapon_' + w.id)),
                    color: w.color || '#333333',
                    type: String(w.type || 'pistol'),
                    power: (w.power | 0) || 0,
                    recoil: (w.recoil | 0) || 0,
                    cooldownMs: (w.cooldownMs | 0) || 0,
                    ammo: (w.ammo | 0) || 0,
                    // Optional visuals
                    sprite: (typeof w.sprite === 'string') ? w.sprite : null,
                    offset: (w.offset && typeof w.offset === 'object') ? {
                        x: (w.offset.x | 0) || 0,
                        y: (w.offset.y | 0) || 0
                    } : { x: 0, y: 0 },
                    // Optional size controls
                    scale: (typeof w.scale === 'number' && isFinite(w.scale) && w.scale > 0) ? w.scale : 1,
                    size: (w.size && typeof w.size === 'object') ? {
                        w: (w.size.w | 0) || 0,
                        h: (w.size.h | 0) || 0
                    } : null
                };
            }
        }
    }
    // Ensure default exists
    if (!_weaponsById[_defaultId]) {
        _weaponsById[_defaultId] = _builtinDefaultPistol();
    }
}

function loadAll(path) {
    return new Promise(function (resolve) {
        const gunsCfg = window.ContentConfig && window.ContentConfig.guns;
        _defaultId = (gunsCfg && typeof gunsCfg.defaultId === 'number') ? gunsCfg.defaultId : 1;
        const jsonPath = path || (gunsCfg && gunsCfg.path);

        // Prefer embedded data when available
        if (window.GameData && Array.isArray(window.GameData.guns) && window.GameData.guns.length) {
            setRegistry(window.GameData.guns);
            resolve(Object.keys(_weaponsById).length);
            return;
        }

        const isFileProto = (typeof location !== 'undefined' && location.protocol === 'file:');
        if (!jsonPath || isFileProto || typeof fetch !== 'function') {
            setRegistry([_builtinDefaultPistol()]);
            resolve(Object.keys(_weaponsById).length);
            return;
        }

        fetch(jsonPath).then(function (r) {
            return r.json();
        }).then(function (json) {
            let list;
            if (Array.isArray(json)) {
                list = json;
            } else if (json && Array.isArray(json.weapons)) {
                list = json.weapons;
            } else {
                list = [_builtinDefaultPistol()];
            }
            setRegistry(list);
            resolve(Object.keys(_weaponsById).length);
        }).catch(function () {
            setRegistry([_builtinDefaultPistol()]);
            resolve(Object.keys(_weaponsById).length);
        });
    });
}

function getById(id) {
    const n = (typeof id === 'number') ? id : parseInt(id, 10);
    return _weaponsById[n];
}

function getDefaultId() {
    return _defaultId;
}

function getDefaultDef() {
    return _weaponsById[_defaultId] || _builtinDefaultPistol();
}

function getAllIds() {
    return Object.keys(_weaponsById).map(function (k) {
        return k | 0;
    });
}

function newGun(idOrDef) {
    let def = (typeof idOrDef === 'object') ? idOrDef : getById(idOrDef);
    if (!def) def = getDefaultDef();
    return new window.Gun(def);
}

window.Weapons = {
    loadAll: loadAll,
    getDefaultId: getDefaultId,
    getAllIds: getAllIds,
    newGun: newGun
};
