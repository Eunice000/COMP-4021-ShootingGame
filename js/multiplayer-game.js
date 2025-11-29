/**
 * Multiplayer game integration for prototype game
 * Handles network synchronization between two players on different PCs
 */

(function() {
  let game = null;
  let isPlayer1 = false; // Will be determined when game starts
  let socket = null;
  let currentRoomId = null;
  let networkInput = null; // Network input adapter
  let gameInitialized = false;

  /**
   * Network Input Adapter - intercepts input for remote player
   */
  function NetworkInputAdapter(originalInput, playerId) {
    this.originalInput = originalInput;
    this.playerId = playerId;
    this.remotePlayerId = playerId === 'p1' ? 'p2' : 'p1';
    this.remoteInputState = {
      left: false,
      right: false,
      up: false,
      down: false,
      fire: false,
      cheat: false
    };
    this._prevRemoteState = {
      left: false,
      right: false,
      up: false,
      down: false,
      fire: false,
      cheat: false
    };
  }

  NetworkInputAdapter.prototype.getSnapshot = function() {
    const original = this.originalInput.getSnapshot();
    // Replace the remote player's input with network input
    if (this.playerId === 'p1') {
      // I'm p1, so p2's input comes from network
      return {
        p1: original.p1, // My local input
        p2: this.remoteInputState // Remote input
      };
    } else {
      // I'm p2, so p1's input comes from network
      return {
        p1: this.remoteInputState, // Remote input
        p2: original.p2 // My local input
      };
    }
  };

  NetworkInputAdapter.prototype.setRemoteInput = function(inputState) {
    // Update the remote input state and trigger edge events
    const prevState = this._prevRemoteState;
    const newState = Object.assign({}, inputState);
    
    // Check for state changes and update the original input's internal state
    const actions = ['left', 'right', 'up', 'down', 'fire', 'cheat'];
    actions.forEach(action => {
      if (prevState[action] !== newState[action]) {
        // State changed - use _setState to properly update state and edges
        // This is critical for jumpPressed, firePressed detection
        if (this.originalInput._setState) {
          // This will update both players state and edges
          this.originalInput._setState(this.remotePlayerId, action, newState[action]);
        } else {
          // Fallback: directly update the players state and edge states
          if (this.originalInput.players && this.originalInput.players[this.remotePlayerId]) {
            this.originalInput.players[this.remotePlayerId][action] = newState[action];
            
            // Update edge states for proper event detection (jumpPressed, firePressed, etc.)
            if (this.originalInput._edges && this.originalInput._edges[this.remotePlayerId]) {
              const edge = newState[action] ? 'pressed' : 'released';
              this.originalInput._edges[this.remotePlayerId][edge][action] = true;
            }
          }
        }
      }
    });
    
    this._prevRemoteState = Object.assign({}, newState);
    this.remoteInputState = newState;
    
    // Debug: log state changes
    if (window.DEBUG_MULTIPLAYER) {
      const changes = actions.filter(a => prevState[a] !== newState[a]);
      if (changes.length > 0) {
        console.log('[multiplayer-game] Remote input state changed:', {
          playerId: this.remotePlayerId,
          changes: changes.map(a => `${a}: ${prevState[a]} -> ${newState[a]}`)
        });
      }
    }
  };

  // Proxy other methods to original input
  NetworkInputAdapter.prototype.enable = function() {
    return this.originalInput.enable();
  };

  NetworkInputAdapter.prototype.disable = function() {
    return this.originalInput.disable();
  };

  NetworkInputAdapter.prototype.clearEdges = function() {
    return this.originalInput.clearEdges();
  };

  /**
   * Initialize the prototype game for multiplayer
   */
  function initMultiplayerGame() {
    if (gameInitialized) return;
    
    const canvas = document.getElementById('game');
    if (!canvas) {
      console.error('[multiplayer-game] Canvas #game not found');
      return;
    }

    // Get socket and room info
    socket = window.gameSocket();
    currentRoomId = window.currentRoomId();
    
    if (!socket || !currentRoomId) {
      console.error('[multiplayer-game] Socket or roomId not available');
      return;
    }

    // Determine player number based on join order
    // The first player to join will be p1, second will be p2
    // We'll get this info from the server when game starts
    let assignmentReceived = false;
    
    socket.on('player-assignment', (data) => {
      if (!assignmentReceived) {
        assignmentReceived = true;
        isPlayer1 = data.playerId === 'p1';
        console.log('[multiplayer-game] Assigned as', data.playerId);
        if (!gameInitialized) {
          startGame();
        }
      }
    });

    // Request player assignment
    socket.emit('request-player-assignment', { roomId: currentRoomId });

    // Also listen for game-start event as a trigger
    socket.on('game-start', (data) => {
      console.log('[multiplayer-game] Game start event received');
      // If we haven't received assignment yet, use a fallback
      if (!assignmentReceived) {
        // Try to determine based on socket order in room
        // For now, default to p1 - the server will correct this
        isPlayer1 = true;
        console.log('[multiplayer-game] Using fallback: assigned as p1');
      }
      if (!gameInitialized) {
        startGame();
      }
    });
  }

  /**
   * Start the game
   */
  function startGame() {
    if (gameInitialized) return;
    gameInitialized = true;

    const canvas = document.getElementById('game');
    
    // Hide UI elements
    const pairup = document.getElementById('pairupContainer');
    const login = document.querySelector('.login-container');
    const startGame = document.getElementById('start-game');
    if (pairup) pairup.style.display = 'none';
    if (login) login.style.display = 'none';
    if (startGame) startGame.style.display = 'none';
    
    // Show canvas
    canvas.style.display = 'block';
    canvas.style.margin = '20px auto';
    canvas.style.border = '2px solid black';

    // Create the Game instance
    game = new window.Game(canvas, window.GameConfig || {});
    
    // Make the canvas scale with the window
    game.renderer.attachAutoResize();

    // Wrap the input system with network adapter
    const originalInput = game.input;
    const myPlayerId = isPlayer1 ? 'p1' : 'p2';
    networkInput = new NetworkInputAdapter(originalInput, myPlayerId);
    game.input = networkInput;

    // Set up input synchronization
    setupInputSync();

    // Register states
    game.addState('boot', function() {
      return window.createBootState({game: game});
    });
    game.addState('countdown', function(params) {
      return window.createCountdownState(params);
    });
    game.addState('gameplay', function(params) {
      return window.createGameplayState(params);
    });
    game.addState('gameover', function(params) {
      return window.createGameOverState(params);
    });

    // Start in boot state
    game.changeState('boot');
    game.start();
    
    // Hook into power-up spawning after a short delay to ensure stage is ready
    setTimeout(() => {
      hookPowerUpSpawning();
    }, 2000);

    // Send ready signal
    if (window.sendPlayerReady) {
      window.sendPlayerReady();
    }
  }

  /**
   * Set up input synchronization via WebSocket
   */
  function setupInputSync() {
    if (!socket) return;

    const myPlayerId = isPlayer1 ? 'p1' : 'p2';
    const originalInput = networkInput.originalInput;

    // Get the controls config to determine which keys belong to which player
    const controlsConfig = window.ControlsConfig || {};
    const myControls = controlsConfig.players ? controlsConfig.players[myPlayerId] : {};
    const myKeys = new Set(Object.values(myControls || {}));

    // Intercept key events to send to network (only for my keys)
    const originalOnKeyDown = originalInput._onKeyDown.bind(originalInput);
    const originalOnKeyUp = originalInput._onKeyUp.bind(originalInput);

    originalInput._onKeyDown = function(e) {
      // Only process keys that belong to my player
      if (myKeys.has(e.code)) {
        originalOnKeyDown(e);
        // Send input immediately
        sendInputToNetwork('keydown', e.code);
      }
      // Ignore keys for the other player
    };

    originalInput._onKeyUp = function(e) {
      // Only process keys that belong to my player
      if (myKeys.has(e.code)) {
        originalOnKeyUp(e);
        // Send input immediately
        sendInputToNetwork('keyup', e.code);
      }
      // Ignore keys for the other player
    };
    
    // Also send periodic input state updates to ensure sync (more frequently)
    const inputSyncInterval = setInterval(() => {
      if (gameInitialized && networkInput && socket && currentRoomId) {
        const myPlayerId = isPlayer1 ? 'p1' : 'p2';
        const inputSnapshot = networkInput.originalInput.getSnapshot();
        const myInput = inputSnapshot[myPlayerId];
        
        // Send current input state every frame to ensure sync
        socket.emit('player-input', {
          roomId: currentRoomId,
          input: {
            playerId: myPlayerId,
            eventType: 'state',
            state: myInput,
            timestamp: Date.now()
          }
        });
      }
    }, 16); // Send every 16ms (~60 times per second for real-time sync)
    
    // Store interval for cleanup if needed
    window._inputSyncInterval = inputSyncInterval;

    // Listen for remote input - handle immediately for real-time response
    socket.on('remote-input', (data) => {
      if (data.playerId && data.playerId !== myPlayerId) {
        // Process immediately for real-time response
        handleRemoteInput(data);
      }
    });

    // Listen for game state updates (for synchronization)
    socket.on('game-state-update', (data) => {
      if (window.updateGameState) {
        window.updateGameState(data);
      }
    });
  }

  /**
   * Send input to network
   */
  function sendInputToNetwork(eventType, keyCode) {
    if (!socket || !currentRoomId) {
      if (window.DEBUG_MULTIPLAYER) {
        console.warn('[multiplayer-game] Cannot send input: socket or roomId not available');
      }
      return;
    }

    const myPlayerId = isPlayer1 ? 'p1' : 'p2';
    const inputSnapshot = networkInput.originalInput.getSnapshot();
    const myInput = inputSnapshot[myPlayerId];

    const inputData = {
      roomId: currentRoomId,
      input: {
        playerId: myPlayerId,
        eventType: eventType,
        keyCode: keyCode,
        state: myInput,
        timestamp: Date.now()
      }
    };

    // Send immediately without throttling for real-time response
    socket.emit('player-input', inputData);
    
    // Debug logging
    if (window.DEBUG_MULTIPLAYER) {
      console.log('[multiplayer-game] Sending input:', {
        playerId: myPlayerId,
        eventType: eventType,
        keyCode: keyCode,
        state: myInput
      });
    }
  }

  /**
   * Handle remote input from network
   */
  function handleRemoteInput(data) {
    if (!networkInput) {
      console.warn('[multiplayer-game] NetworkInput not initialized');
      return;
    }

    const remotePlayerId = data.playerId;
    const input = data.input;

    // Always prefer full state if available (most reliable)
    if (input.state) {
      // Immediately update remote input state
      networkInput.setRemoteInput(input.state);
      
      // Debug logging
      if (window.DEBUG_MULTIPLAYER) {
        console.log('[multiplayer-game] Remote state received:', {
          playerId: remotePlayerId,
          state: input.state
        });
      }
    } else if (input.keyCode && input.eventType) {
      // Fallback: simulate key events based on keyCode
      const controlsConfig = window.ControlsConfig || {};
      const remoteControls = controlsConfig.players ? controlsConfig.players[remotePlayerId] : {};
      
      // Map keyCode to action
      let action = null;
      for (const [act, code] of Object.entries(remoteControls || {})) {
        if (code === input.keyCode) {
          action = act;
          break;
        }
      }

      if (action) {
        const currentState = Object.assign({}, networkInput.remoteInputState);
        
        if (input.eventType === 'keydown') {
          currentState[action] = true;
        } else if (input.eventType === 'keyup') {
          currentState[action] = false;
        }
        
        networkInput.setRemoteInput(currentState);
        
        // Debug logging
        if (window.DEBUG_MULTIPLAYER) {
          console.log('[multiplayer-game] Remote key event:', {
            playerId: remotePlayerId,
            action: action,
            eventType: input.eventType
          });
        }
      }
    }
  }

  /**
   * Update game state from network (for synchronization)
   */
  window.updateGameState = function(gameState) {
    if (!game || !game.sm || !game.sm.current || !game.sm.current.stage) return;
    
    const stage = game.sm.current.stage;
    if (!stage) return;
    
    // Sync player positions if provided (for lag compensation and visual sync)
    if (gameState.players && Array.isArray(gameState.players)) {
      const remotePlayerIndex = isPlayer1 ? 1 : 0;
      if (stage.players && stage.players[remotePlayerIndex]) {
        const remotePlayer = stage.players[remotePlayerIndex];
        const networkPlayer = gameState.players[remotePlayerIndex];
        if (networkPlayer) {
          // Smooth interpolation for position
          const lerpFactor = 0.3; // Adjust for smoother movement
          remotePlayer.x = remotePlayer.x + (networkPlayer.x - remotePlayer.x) * lerpFactor;
          remotePlayer.y = remotePlayer.y + (networkPlayer.y - remotePlayer.y) * lerpFactor;
          
          // Sync other important properties
          if (networkPlayer.velocityX !== undefined) {
            remotePlayer.velocityX = networkPlayer.velocityX;
          }
          if (networkPlayer.velocityY !== undefined) {
            remotePlayer.velocityY = networkPlayer.velocityY;
          }
          if (networkPlayer.facing !== undefined) {
            remotePlayer.facing = networkPlayer.facing;
          }
          if (networkPlayer.lives !== undefined) {
            remotePlayer.lives = networkPlayer.lives;
          }
        }
      }
    }
    
    // Sync bullets - merge network bullets with local bullets
    if (gameState.bullets && Array.isArray(gameState.bullets)) {
      if (!stage.bullets) stage.bullets = [];
      
      // Create a map of existing bullets by ID
      const existingBullets = new Map();
      stage.bullets.forEach(b => {
        if (b && b.alive) {
          const id = b.id || (b.ownerId + '_' + b.x + '_' + b.y);
          if (!b.id) b.id = id; // Assign ID if not present
          existingBullets.set(id, b);
        }
      });
      
      // Update or create bullets from network
      gameState.bullets.forEach(netBullet => {
        if (!netBullet) return;
        
        const id = netBullet.id || (netBullet.ownerId + '_' + netBullet.x + '_' + netBullet.y);
        let bullet = existingBullets.get(id);
        
        if (bullet) {
          // Update existing bullet position and state
          bullet.x = netBullet.x;
          bullet.y = netBullet.y;
          if (netBullet.velocityX !== undefined) {
            bullet.vx = netBullet.velocityX;
            bullet.velocityX = netBullet.velocityX;
          }
          if (netBullet.velocityY !== undefined) {
            bullet.vy = netBullet.velocityY;
            bullet.velocityY = netBullet.velocityY;
          }
          bullet.alive = netBullet.alive;
          if (netBullet.lifetimeMs !== undefined) bullet.lifetimeMs = netBullet.lifetimeMs;
        } else if (netBullet.alive && window.Bullet) {
          // Create new bullet from network state
          const newBullet = new window.Bullet({
            x: netBullet.x,
            y: netBullet.y,
            w: netBullet.w || 16,
            h: netBullet.h || 6,
            vx: netBullet.velocityX || 0,
            lifetimeMs: netBullet.lifetimeMs || 1000,
            ownerId: netBullet.ownerId || 'p1',
            power: netBullet.power,
            color: netBullet.color || '#222'
          });
          newBullet.id = id;
          stage.bullets.push(newBullet);
        }
      });
      
      // Remove bullets that are no longer in network state or are dead
      stage.bullets = stage.bullets.filter(b => {
        if (!b || !b.alive) return false;
        const id = b.id || (b.ownerId + '_' + b.x + '_' + b.y);
        return gameState.bullets.some(nb => {
          const netId = nb.id || (nb.ownerId + '_' + nb.x + '_' + nb.y);
          return netId === id && nb.alive;
        });
      });
    }
    
    // Sync power-ups - this is critical for item synchronization
    if (gameState.powerUps && Array.isArray(gameState.powerUps)) {
      if (!stage.powerUps) stage.powerUps = [];
      
      // Create a map of existing power-ups by ID
      const existingPowerUps = new Map();
      stage.powerUps.forEach(pu => {
        if (pu && pu.active) {
          const id = pu.id || (pu.x + '_' + pu.y + '_' + pu.type);
          existingPowerUps.set(id, pu);
        }
      });
      
      // Update or create power-ups from network
      gameState.powerUps.forEach(netPU => {
        if (!netPU) return;
        
        const id = netPU.id || (netPU.x + '_' + netPU.y + '_' + netPU.type);
        let powerUp = existingPowerUps.get(id);
        
        if (powerUp) {
          // Update existing power-up
          powerUp.active = netPU.active;
          if (netPU._ttlSec !== undefined) powerUp._ttlSec = netPU._ttlSec;
          if (netPU._baseY !== undefined) powerUp._baseY = netPU._baseY;
        } else if (netPU.active) {
          // Create new power-up from network state
          if (window.PowerUp) {
            const registry = (window.ContentConfig && window.ContentConfig.powerUps) || {};
            const entry = registry[netPU.type] || {};
            
            const newPU = new window.PowerUp({
              type: netPU.type,
              x: netPU.x,
              y: netPU.y,
              w: netPU.w,
              h: netPU.h,
              color: entry.color || (netPU.type === 'shield' ? '#0000ff' : netPU.type === 'extra_life' ? '#ff0000' : '#ffff00'),
              payload: entry.payload || undefined
            });
            
            newPU.id = id;
            newPU.active = netPU.active;
            if (netPU._ttlSec !== undefined) newPU._ttlSec = netPU._ttlSec;
            if (netPU._baseY !== undefined) newPU._baseY = netPU._baseY;
            
            // Assign sprite if available
            if (window.PowerUps && typeof PowerUps.get === 'function') {
              const def = PowerUps.get(netPU.type);
              if (def && def.sprite && typeof newPU.setSprite === 'function') {
                newPU.setSprite(def.sprite);
              }
            }
            
            stage.powerUps.push(newPU);
          }
        }
      });
      
      // Remove power-ups that are no longer in network state
      stage.powerUps = stage.powerUps.filter(pu => {
        if (!pu || !pu.active) return false;
        const id = pu.id || (pu.x + '_' + pu.y + '_' + pu.type);
        return gameState.powerUps.some(npu => {
          const netId = npu.id || (npu.x + '_' + npu.y + '_' + npu.type);
          return netId === id && npu.active;
        });
      });
    }
    
    // Sync power-up spawn timers to keep spawns synchronized
    // This ensures power-ups spawn at the same time on both clients
    if (gameState.powerUpTimers && stage) {
      // Sync timers from host (player 1)
      if (!isPlayer1) {
        // Non-host: sync timers from host
        if (gameState.powerUpTimers._getGunTimer !== undefined) {
          stage._getGunTimer = gameState.powerUpTimers._getGunTimer;
        }
        if (gameState.powerUpTimers._otherPuTimer !== undefined) {
          stage._otherPuTimer = gameState.powerUpTimers._otherPuTimer;
        }
        if (gameState.powerUpTimers._otherPuSpawnCount !== undefined) {
          stage._otherPuSpawnCount = gameState.powerUpTimers._otherPuSpawnCount;
        }
      } else {
        // Host: use minimum to sync with other client if needed
        if (gameState.powerUpTimers._getGunTimer !== undefined) {
          stage._getGunTimer = Math.min(stage._getGunTimer || Infinity, gameState.powerUpTimers._getGunTimer);
        }
        if (gameState.powerUpTimers._otherPuTimer !== undefined) {
          stage._otherPuTimer = Math.min(stage._otherPuTimer || Infinity, gameState.powerUpTimers._otherPuTimer);
        }
      }
    }
  };
  
  /**
   * Hook into Stage's power-up spawn methods to ensure synchronization
   * Only Player 1 (host) generates power-ups, Player 2 receives and creates them
   */
  function hookPowerUpSpawning() {
    if (!game || !game.sm || !game.sm.current || !game.sm.current.stage) return;
    
    const stage = game.sm.current.stage;
    const isHost = isPlayer1; // Player 1 is the host
    
    // Store original spawn methods
    if (!stage._originalSpawnGetGun) {
      stage._originalSpawnGetGun = stage._spawnGetGunPowerUp.bind(stage);
      stage._originalSpawnOther = stage._spawnOtherPowerUp.bind(stage);
      
      // Override spawn methods
      if (isHost) {
        // Host: Generate power-up and broadcast to others
        stage._spawnGetGunPowerUp = function() {
          const pos = this._pickFreePowerUpSpawn();
          if (!pos) return;
          
          // Create power-up locally using the original method logic
          const registry = (window.ContentConfig && window.ContentConfig.powerUps) || {};
          const entry = registry['get_gun'] || {};
          const pu = new window.PowerUp({
            type: 'get_gun',
            x: pos.x | 0,
            y: pos.y | 0,
            color: (entry.color != null ? entry.color : '#ffff00'),
            payload: entry.payload || undefined
          });
          
          // Assign sprite if available
          if (window.PowerUps && typeof PowerUps.get === 'function') {
            const def = PowerUps.get('get_gun');
            if (def && def.sprite && typeof pu.setSprite === 'function') {
              pu.setSprite(def.sprite);
            }
          }
          
          // Set TTL and ID
          pu._ttlSec = (typeof this._getGunTtl === 'number') ? this._getGunTtl : 9.0;
          pu.id = 'get_gun_' + pos.x + '_' + pos.y + '_' + Date.now();
          pu.active = true; // Ensure active is set
          
          // Ensure _baseY is set for bobbing animation
          if (pu._baseY === undefined) {
            pu._baseY = pu.y;
          }
          
          // Add to powerUps array
          this.powerUps.push(pu);
          
          // Debug log
          if (window.DEBUG_MULTIPLAYER) {
            console.log('[multiplayer-game] Host spawned power-up:', {
              id: pu.id,
              type: pu.type,
              x: pu.x,
              y: pu.y,
              active: pu.active,
              powerUpsCount: this.powerUps.length
            });
          }
          
          // Broadcast to other players with exact position and type
          if (socket && currentRoomId) {
            socket.emit('powerup-spawn', {
              roomId: currentRoomId,
              powerUp: {
                id: pu.id,
                type: 'get_gun',
                x: pu.x,
                y: pu.y,
                w: pu.w,
                h: pu.h,
                color: pu.color,
                _ttlSec: pu._ttlSec,
                _baseY: pu._baseY,
                active: pu.active
              }
            });
          }
        };
        
        stage._spawnOtherPowerUp = function() {
          const pos = this._pickFreePowerUpSpawn();
          if (!pos) return;
          
          // 50% chance either extra_life or shield
          // Use a deterministic method based on spawn count to ensure consistency
          const spawnCount = (this._otherPuSpawnCount || 0) + 1;
          this._otherPuSpawnCount = spawnCount;
          const type = (spawnCount % 2 === 0) ? 'extra_life' : 'shield';
          
          const registry = (window.ContentConfig && window.ContentConfig.powerUps) || {};
          const entry = registry[type] || {};
          const pu = new window.PowerUp({
            type: type,
            x: pos.x | 0,
            y: pos.y | 0,
            color: (entry.color != null ? entry.color : (type === 'shield' ? '#0000ff' : '#ff0000')),
            payload: entry.payload || undefined
          });
          
          // Assign sprite if available
          if (window.PowerUps && typeof PowerUps.get === 'function') {
            const def = PowerUps.get(type);
            if (def && def.sprite && typeof pu.setSprite === 'function') {
              pu.setSprite(def.sprite);
            }
          }
          
          // Set TTL and ID
          pu._ttlSec = (typeof this._otherPuTtl === 'number') ? this._otherPuTtl : 14.0;
          pu.id = type + '_' + pos.x + '_' + pos.y + '_' + Date.now();
          pu.active = true; // Ensure active is set
          
          // Ensure _baseY is set for bobbing animation
          if (pu._baseY === undefined) {
            pu._baseY = pu.y;
          }
          
          // Add to powerUps array
          this.powerUps.push(pu);
          
          // Debug log
          if (window.DEBUG_MULTIPLAYER) {
            console.log('[multiplayer-game] Host spawned power-up:', {
              id: pu.id,
              type: pu.type,
              x: pu.x,
              y: pu.y,
              active: pu.active,
              powerUpsCount: this.powerUps.length
            });
          }
          
          // Broadcast to other players with exact position and type
          if (socket && currentRoomId) {
            socket.emit('powerup-spawn', {
              roomId: currentRoomId,
              powerUp: {
                id: pu.id,
                type: type,
                x: pu.x,
                y: pu.y,
                w: pu.w,
                h: pu.h,
                color: pu.color,
                _ttlSec: pu._ttlSec,
                _baseY: pu._baseY,
                active: pu.active
              }
            });
          }
        };
      } else {
        // Non-host: Disable local spawning, wait for network events
        stage._spawnGetGunPowerUp = function() {
          // Don't spawn locally, wait for network event
          return;
        };
        
        stage._spawnOtherPowerUp = function() {
          // Don't spawn locally, wait for network event
          return;
        };
      }
    }
    
    // Listen for power-up spawn events from host
    if (socket) {
      socket.on('powerup-spawn', (data) => {
        if (data.roomId === currentRoomId && data.powerUp && !isHost) {
          // Create power-up from network data
          const netPU = data.powerUp;
          if (window.PowerUp && stage) {
            const registry = (window.ContentConfig && window.ContentConfig.powerUps) || {};
            const entry = registry[netPU.type] || {};
            
            const newPU = new window.PowerUp({
              type: netPU.type,
              x: netPU.x,
              y: netPU.y,
              w: netPU.w,
              h: netPU.h,
              color: netPU.color || entry.color || (netPU.type === 'shield' ? '#0000ff' : netPU.type === 'extra_life' ? '#ff0000' : '#ffff00'),
              payload: entry.payload || undefined
            });
            
            newPU.id = netPU.id;
            newPU.active = netPU.active;
            if (netPU._ttlSec !== undefined) newPU._ttlSec = netPU._ttlSec;
            if (netPU._baseY !== undefined) newPU._baseY = netPU._baseY;
            
            // Assign sprite if available
            if (window.PowerUps && typeof PowerUps.get === 'function') {
              const def = PowerUps.get(netPU.type);
              if (def && def.sprite && typeof newPU.setSprite === 'function') {
                newPU.setSprite(def.sprite);
              }
            }
            
            // Check if power-up already exists
            const existing = stage.powerUps.find(pu => pu && pu.id === newPU.id);
            if (!existing) {
              stage.powerUps.push(newPU);
            }
          }
        }
      });
    }
  }

  /**
   * Send game state update to network
   */
  function sendGameStateUpdate() {
    if (!socket || !currentRoomId || !game) return;
    if (!game.sm || !game.sm.current || !game.sm.current.stage) return;

    const stage = game.sm.current.stage;
    const gameState = {
      players: stage.players ? stage.players.map(p => ({
        x: p.x,
        y: p.y,
        velocityX: p.velocityX,
        velocityY: p.velocityY,
        lives: p.lives,
        facing: p.facing
      })) : [],
      bullets: stage.bullets ? stage.bullets.map(b => ({
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        velocityX: b.vx || b.velocityX || 0,
        velocityY: b.vy || b.velocityY || 0,
        ownerId: b.ownerId || b.owner,
        alive: b.alive,
        power: b.power,
        color: b.color,
        lifetimeMs: b.lifetimeMs,
        id: b.id || (b.ownerId + '_' + b.x + '_' + b.y + '_' + Date.now()) // Generate ID if not present
      })) : [],
      powerUps: stage.powerUps ? stage.powerUps.map(pu => ({
        x: pu.x,
        y: pu.y,
        w: pu.w,
        h: pu.h,
        type: pu.type,
        active: pu.active,
        _ttlSec: pu._ttlSec,
        _baseY: pu._baseY,
        id: pu.id || (pu.x + '_' + pu.y + '_' + pu.type) // Generate ID if not present
      })) : [],
      // Sync power-up spawn timers to keep spawns synchronized
      powerUpTimers: {
        _getGunTimer: stage._getGunTimer,
        _otherPuTimer: stage._otherPuTimer,
        _otherPuSpawnCount: stage._otherPuSpawnCount || 0
      },
      timestamp: Date.now()
    };

    socket.emit('game-update', {
      roomId: currentRoomId,
      gameState: gameState
    });
  }

  // Periodically send game state updates (more frequently for better sync)
  const gameStateSyncInterval = setInterval(() => {
    if (gameInitialized && game && game.sm && game.sm.current) {
      const currentState = game.sm.current;
      if (currentState.constructor.name === 'GameplayState') {
        sendGameStateUpdate();
      }
    }
  }, 33); // Send updates every 33ms (~30 times per second) for better real-time sync
  
  // Store interval for cleanup if needed
  window._gameStateSyncInterval = gameStateSyncInterval;

  // Make startGame available globally
  window.startGame = initMultiplayerGame;

  // Export for debugging
  window.multiplayerGame = {
    game: () => game,
    isPlayer1: () => isPlayer1,
    socket: () => socket,
    roomId: () => currentRoomId,
    networkInput: () => networkInput,
    // Debug function to check input state
    checkInputState: () => {
      if (!networkInput) {
        console.log('NetworkInput not initialized');
        return;
      }
      const snapshot = networkInput.getSnapshot();
      console.log('Current input state:', {
        local: snapshot[isPlayer1 ? 'p1' : 'p2'],
        remote: snapshot[isPlayer1 ? 'p2' : 'p1'],
        remoteState: networkInput.remoteInputState
      });
    },
    // Debug function to check power-ups
    checkPowerUps: () => {
      if (!game || !game.sm || !game.sm.current || !game.sm.current.stage) {
        console.log('Game or stage not available');
        return;
      }
      const stage = game.sm.current.stage;
      console.log('Power-ups:', {
        count: stage.powerUps ? stage.powerUps.length : 0,
        active: stage.powerUps ? stage.powerUps.filter(pu => pu && pu.active).length : 0,
        list: stage.powerUps ? stage.powerUps.map(pu => ({
          id: pu.id,
          type: pu.type,
          x: pu.x,
          y: pu.y,
          active: pu.active
        })) : []
      });
    },
    // Enable debug mode
    enableDebug: () => {
      window.DEBUG_MULTIPLAYER = true;
      console.log('Multiplayer debug mode enabled');
    }
  };
  
  // Auto-enable debug in development (you can remove this in production)
  // Uncomment the next line to enable debug by default
  // window.DEBUG_MULTIPLAYER = true;
})();

