# Smashfire Arena — Prototype

## Run the game
run or double‑click `game.html` to open it in your browser.

## What’s in the Prototype
- Player
  - Movement/Control (left, right, jump, drop down, fire, cheat)
  - Shield (temporary knockback immunity)
  - Physics (gravity, friction, collisions)
  - Configurable player control scheme
  - Player image (sprite) set via `js/assets/PlayersData.js`
- Gun system
  - Four gun types + Bullet objects
  - Ammo system
  - Custom stats (knockback power, recoil, ammo, fire rate)
  - Add extra guns and gun images via `js/assets/GunsData.js`
- Bullet
  - Collision detection
  - Applies knockback based on gun stats
- Platform
  - Player can stand on it
- Power‑ups
  - Extra Life, Shield, Weapon Crate ("get_gun")
  - Spawn periodically at fixed locations on the stage
- Maps
  - Add maps via `js/assets/MapsData.js` (including background image path)
- Cheat Mode
  - Grants knockback immunity
  - Grants a powerful cheat gun
- Gameplay
  - Health system, Round timer, Win condition, Ranking system
- UI
  - Minimalistic HUD
  - You can customize UI in `js/ui/GameOverUi.js` and `js/ui/GameplayUI.js`

## Controls and Gameplay
Two players on one keyboard. Default bindings are defined in `js/config/controlsConfig.js`.

- Player 1
  - Left: `A`
  - Right: `D`
  - Jump: `W`
  - Drop down through one‑way platform: `S`
  - Fire: `F`
  - Cheat (debug): `C` (grants shield + special gun)
- Player 2
  - Left: `←`
  - Right: `→`
  - Jump: `↑`
  - Drop down through one‑way platform: `↓`
  - Fire: `/` (slash key)
  - Cheat (debug): `.` (period key, left of slash)

Core rules and flow:
- A round starts after a short countdown. Players spawn on the stage.
- Objective: knock your opponent off the arena. Going out of bounds costs one life and triggers a respawn. When a player has no lives left, the other player wins the round.
- Round timer: configurable (default 180 seconds). If time expires, the player with more lives remaining wins; ties result in a draw.
- Guns and ammo:
  - Players start with a default pistol.
  - Gun Crate (id: `get_gun`) power‑ups spawn periodically and grant a random non‑default gun from `window.GameData.guns` (see `js/assets/GunsData.js`).
  - Each gun has `power`, `recoil`, `cooldownMs`, and `ammo`. Ammo is shown in the HUD.
- Power‑ups:
  - See `js/config/contentConfig.js` for visual color hints and IDs.
  - Data for sprites lives in `js/assets/PowerUpsData.js`.
- Movement/physics:
  - Fixed‑timestep simulation (default 60 Hz), gravity, simple collisions, friction, and one‑way platform drop‑through.
  - Double jump count is configurable.
- HUD shows player lives, current gun, ammo, and the round timer.

## Changing Gameplay Configuration
Most gameplay parameters live in `js/config/gameConfig.js`.
- Canvas settings:
  - `canvas.width`, `canvas.height`, `canvas.background` (background color when no map image fills the canvas)
  - Default: 1920×1080
- Timing:
  - `tickRate` (logic updates per second), default: 60
  - `roundTimer` (seconds per round), default: 180
- Physics:
  - `gravity` (x, y), `friction.ground`, `friction.air` (acceleration‑based physics)
- Player:
  - `width`, `height`, `moveAccel`, `maxSpeedX`, `jumpSpeed`, `maxLives`, `maxAirJumps`
- Projectiles (bullets):
  - `speed`, `lifetimeMs`, `width`, `height`, `knockbackX`, `knockbackY`, `recoilX`
  - Bullet hit box: 24×8; bullets move at constant speed
- Guns:
  - `guns.pistolEmptyCooldownMs` — lockout after auto‑reload of the default pistol (pistol otherwise acts like infinite ammo over time)
- Power‑ups spawn schedule (seconds):
  - `powerUp.getGun`: `firstSpawnSec`, `intervalSec`, `ttlSec` (default 10, 10, 9; set `ttlSec` at least 1s less than `intervalSec` so only one crate exists per interval)
  - `powerUp.others`: shared schedule for `extra_life`, `shield`
- Colors for UI and players: `colors.ui`, `colors.p1`, `colors.p2`
- Stage:
  - `stage.outOfBoundsMargin` (how far off‑screen counts as out of bounds)
  - `stage.mapId` preferred map ID to load from `window.GameData.maps` (see `js/assets/MapsData.js`)

Controls configuration is in `js/config/controlsConfig.js`.
- Update key codes using `KeyboardEvent.code` values (e.g., `KeyA`, `ArrowLeft`, `Slash`).

Content color hints are in `js/config/contentConfig.js` (IDs must match those used in data files).

## Entry points and main files
- `game.html`: loads all scripts in order and provides the `<canvas id="game">` element.
- `js/game.js`: boots the game, registers states, and starts the loop.
- States: `js/states/BootState.js`, `CountdownState.js`, `GameplayState.js`, `GameOverState.js`.
- Loaders/Registries: `js/utils/RegistryLoader.js`, `js/guns/GunLoader.js`, `js/players/PlayerLoader.js`, `js/powerups/PowerUpLoader.js`, `js/world/StageLoader.js`.
- Data: `js/assets/PlayersData.js`, `js/assets/GunsData.js`, `js/assets/MapsData.js`, `js/assets/PowerUpsData.js`.

## Changing Assets and Content (maps, players, guns, offsets)
All content is driven by plain JS arrays under `js/assets/*.js` which populate `window.GameData`. Update file paths to point to images under `assets/game/...` or add your own files there.

After changing any of these files, just refresh the page; no build step is required.

### Change the map background image or add a new map
File: `js/assets/MapsData.js`

- Each map has an `id`, a `background` image path, platform rectangles, player spawn points, and power‑up spawn points.
- Example entry:

```js
const exampleMap = {
  id: "testing2",
  background: "assets/game/backgrounds/map_background_testing2.png",
  platforms: [{x: 192, y: 950, w: 1536, h: 8}, {x: 192, y: 600, w: 1536, h: 8}],
  playerSpawns: [{x: 344, y: 700}, {x: 1496, y: 700}],
  powerUpSpawns: [{x: 536, y: 850}, {x: 920, y: 850}, {x: 1304, y: 850}]
};
```
#### Field
- id: unique identifier of a map
- background: path to background image
- platforms: array of platform rectangles
- playerSpawns: array of player spawn points
- powerUpSpawns: array of power-up spawn points

#### Notes
- (0,0) is the top-left corner of the canvas.
- Platforms are invisible and used only for collisions. Draw their visuals into the background image.
- Images are drawn scaled to the canvas; using 1920×1080 avoids scaling artifacts if the canvas is left at the default size.
- Platform height is typically 8 pixels.
- Recommended: at least two power‑up spawns
- Exactly two player spawns are expected (P1 then P2)
- (x,y) coordinates for platforms are the left-top corner of the rectangle.
- (x,y) coordinates for powerUpSpawns are the top‑left corner of the power‑up.
- (x,y) coordinates for playerSpawns are the top‑left corner of the player rectangle
- you can add a new map by adding a new entry in MapsData.js

```
// Converting a desired center (Cx, Cy) to top‑left input values: 
// With default sizes
Player (80×120): { x: Cx - 40, y: Cy - 60 }
PowerUp (80×80): { x: Cx - 40, y: Cy - 40 }
```

- To switch the default map, set `stage.mapId` in `js/config/gameConfig.js` to the desired `id` (e.g., `testing` or `testing2`).
- To use your own background image, put it in `assets/game/backgrounds/` and set the `background` path accordingly.

### Change player images (sprites)
File: `js/assets/PlayersData.js`

- Players are listed by id with a `sprite` path:

```js
const players = [
  { id: "p1", sprite: "assets/game/players/player_1_sprite.png" },
  { id: "p2", sprite: "assets/game/players/player_2_sprite.png" }
];
```

- Replace the paths with your own images placed in `assets/game/players/`.
- Tip: Keep aspect ratios similar to avoid unexpected overlaps. Player render size is also influenced by `GameConfig.player.width/height` for collisions.

### Change gun images and adjust gun offsets
File: `js/assets/GunsData.js`

- Each gun entry can specify an image `sprite` and a drawing `offset` relative to the player’s hand.
- Example (existing):

```js
const sniperExample = {
  id: 2,
  name: "Sniper",
  type: "sniper",
  power: 6000,
  recoil: 600,
  cooldownMs: 1500,
  ammo: 4,
  sprite: "assets/game/guns/sniper_sprite.png",
  offset: { x: 60, y: 2 }
};
```

- Steps to change a gun image:
  1. Place your image in `assets/game/guns/` (e.g., `my_rifle.png`).
  2. Update the gun’s `sprite` path in `GunsData.js`.
  3. Adjust `offset` so the gun appears aligned in the player’s hands. Positive `x` moves the sprite to the right; positive `y` moves it down.

- Optional visuals supported by the engine (via `js/guns/GunLoader.js`):
  - `scale`: number > 0 to uniformly scale the gun sprite when drawing, e.g., `scale: 0.8`.
  - `size`: `{ w, h }` to force a specific draw size in pixels.
  - If omitted, the raw image size is used.

### Change the power‑up images
File: `js/assets/PowerUpsData.js`

- Update `sprite` paths for `extra_life`, `shield`, and `get_gun` to point to your images under `assets/game/powerups/`.

### TODO
##### Art
- Add real sprites for players, guns, power-ups, and map backgrounds.
- Add a real map layout
- Add a real music track, sound effects, and UI.

##### Controls
- Websocket support for multiplayer.

##### Server
- Link to the matching system

##### Gameplay Balance
- Gun states
- Power-up spawning
