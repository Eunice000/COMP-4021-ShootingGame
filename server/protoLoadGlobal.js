// Loads the browser-based prototype game files into the Node global scope (single-match mode)
// without using VM isolation. This allows us to reuse the prototype Stage/game logic on the server.

const fs = require('fs');
const path = require('path');

function evalFileSync(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  // Evaluate in the current global context so that `window.*` attaches to globals
  // eslint-disable-next-line no-new-func
  const fn = new Function(code + `\n//# sourceURL=${filePath.replace(/\\/g,'/')}`);
  fn.call(global);
}

function listJsFilesRecursive(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listJsFilesRecursive(p));
    } else if (ent.isFile() && p.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

function loadPrototypeIntoGlobal(protoRootDir) {
  // Provide a minimal browser-like environment
  if (!global.window) global.window = global;
  if (!global.globalThis) global.globalThis = global.window;
  if (typeof global.Image === 'undefined') {
    global.Image = function ImageStub() { /* no-op for server */ };
  }
  if (typeof global.performance === 'undefined') {
    global.performance = { now: () => Date.now() };
  }

  const jsRoot = path.join(protoRootDir, 'js');
  if (!fs.existsSync(jsRoot)) {
    throw new Error('Prototype js root not found at: ' + jsRoot);
  }

  // Load in a deterministic order: configs first, then the rest.
  const configFiles = [
    path.join(jsRoot, 'config', 'gameConfig.js'),
    path.join(jsRoot, 'config', 'contentConfig.js'),
    path.join(jsRoot, 'config', 'controlsConfig.js'),
  ].filter(fs.existsSync);

  // Track files that have been evaluated to avoid duplicates
  const loaded = new Set();
  for (const f of configFiles) {
    evalFileSync(f);
    loaded.add(path.normalize(f));
  }

  // Helper to load a file if it exists and hasn't been loaded yet
  function evalIfExists(relPath) {
    const full = path.join(jsRoot, relPath);
    const norm = path.normalize(full);
    if (fs.existsSync(full) && !loaded.has(norm)) {
      evalFileSync(full);
      loaded.add(norm);
    }
  }

  // Preload critical modules in dependency-safe order so bases exist before dependents.
  // 1) Map provider (used by Stage for defaults)
  evalIfExists(path.join('world', 'StageLoader.js'));
  // 1a) Embedded asset data (maps/guns) so server can build Stage from configured maps and load gun registry without fetch
  evalIfExists(path.join('assets', 'MapsData.js'));
  evalIfExists(path.join('assets', 'GunsData.js'));
  evalIfExists(path.join('assets', 'PowerUpsData.js'));
  // 2) Base entity and physics/collision helpers
  evalIfExists(path.join('entities', 'Entity.js'));
  evalIfExists(path.join('core', 'Physics.js'));
  evalIfExists(path.join('core', 'Collision.js'));
  // 3) Weapons/Guns (some Player/Bullet paths refer to these)
  evalIfExists(path.join('guns', 'Gun.js'));
  evalIfExists(path.join('guns', 'GunLoader.js'));
  // Load embedded gun list before Stage so power-ups can pick random weapons; prefer embedded over fetch
  try {
    if (global.window.Weapons && typeof global.window.Weapons.loadAll === 'function') {
      const p = global.window.Weapons.loadAll();
      // Best-effort: if a Promise is returned, attach a noop handler
      if (p && typeof p.then === 'function') p.then(()=>{}).catch(()=>{});
    }
  } catch(e) {
    // ignore
  }
  // 3b) PowerUps registry
  evalIfExists(path.join('powerups', 'PowerUpLoader.js'));
  try {
    if (global.window.PowerUps && typeof global.window.PowerUps.load === 'function'){
      const p = global.window.PowerUps.load();
      if (p && typeof p.then === 'function') p.then(()=>{}).catch(()=>{});
    }
  } catch(e) { /* ignore */ }
  // 4) Players and controllers
  evalIfExists(path.join('players', 'Player.js'));
  evalIfExists(path.join('players', 'PlayerController.js'));
  // 5) Other entities in safe order
  evalIfExists(path.join('entities', 'Platform.js'));
  evalIfExists(path.join('powerups', 'PowerUp.js'));
  evalIfExists(path.join('entities', 'Bullet.js'));
  // 6) Stage world (relies on above)
  evalIfExists(path.join('world', 'Stage.js'));

  // Then load only safe JS files needed for simulation (avoid DOM-dependent files like game.js, renderer, ui, states)
  const allJs = listJsFilesRecursive(jsRoot);
  const configSet = new Set(configFiles.map(p => path.normalize(p)));
  const SAFE_DIRS = ['core', 'entities', 'players', 'powerups', 'world', 'guns'];
  const prioritized = [];
  for (const f of allJs) {
    const norm = path.normalize(f);
    if (configSet.has(norm)) continue;
    if (loaded.has(norm)) continue;
    const rel = path.relative(jsRoot, f).replace(/\\/g, '/');
    const base = path.basename(f).toLowerCase();
    // Skip known browser-only entry points and UI/state files
    if (base === 'game.js') continue;
    if (rel.startsWith('ui/') || rel.startsWith('states/') || rel.startsWith('render') ) continue;
    // Only include safe directories
    if (SAFE_DIRS.some(dir => rel.startsWith(dir + '/'))) {
      prioritized.push(f);
    }
  }
  for (const f of prioritized) {
    const norm = path.normalize(f);
    if (!loaded.has(norm)) {
      evalFileSync(f);
      loaded.add(norm);
    }
  }

  // Basic presence checks
  if (!global.window.GameConfig) {
    throw new Error('Prototype GameConfig not loaded');
  }
  if (!global.window.Stage) {
    throw new Error('Prototype Stage not loaded (check ordered preload for dependencies like Entity/StageLoader)');
  }

  return {
    GameConfig: global.window.GameConfig,
    ContentConfig: global.window.ContentConfig || {},
    Stage: global.window.Stage
  };
}

module.exports = { loadPrototypeIntoGlobal };
