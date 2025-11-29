/**
 * Client-side game renderer - only renders server state, no game logic
 * All game logic is handled on the server
 */

(function() {
  let game = null;
  let isPlayer1 = false;
  let socket = null;
  let currentRoomId = null;
  let serverGameState = null; // Current state from server
  let gameInitialized = false;
  let localInput = null; // Local input state to send to server
  
  // Image cache
  const imageCache = {
    players: {},
    powerUps: {},
    background: null,
    backgroundReady: false
  };

  /**
   * Initialize the game renderer
   */
  function initGameRenderer() {
    if (gameInitialized) return;
    
    const canvas = document.getElementById('game');
    if (!canvas) {
      console.error('[client-game-renderer] Canvas #game not found');
      return;
    }

    // Get socket and room info
    socket = window.gameSocket();
    currentRoomId = window.currentRoomId();
    
    if (!socket || !currentRoomId) {
      console.error('[client-game-renderer] Socket or roomId not available');
      return;
    }

    // Determine player number
    let assignmentReceived = false;
    
    socket.on('player-assignment', (data) => {
      if (!assignmentReceived) {
        assignmentReceived = true;
        isPlayer1 = data.playerId === 'p1';
        console.log('[client-game-renderer] Assigned as', data.playerId);
        if (!gameInitialized) {
          startRenderer();
        }
      }
    });

    // Request player assignment
    socket.emit('request-player-assignment', { roomId: currentRoomId });

    // Listen for game start
    socket.on('game-start', (data) => {
      console.log('[client-game-renderer] Game start event received');
      if (!assignmentReceived) {
        isPlayer1 = true; // Fallback
      }
      if (!gameInitialized) {
        startRenderer();
      }
    });
  }

  /**
   * Start the renderer
   */
  function startRenderer() {
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

    // Create the Game instance (only for rendering)
    game = new window.Game(canvas, window.GameConfig || {});
    game.renderer.attachAutoResize();
    
    // Load images
    loadImages();

    // Initialize local input state
    const myPlayerId = isPlayer1 ? 'p1' : 'p2';
    localInput = {
      left: false,
      right: false,
      up: false,
      down: false,
      fire: false
    };

    // Set up input handling (only to send to server)
    setupInputHandling();

    // Listen for server game state
    socket.on('server-game-state', (state) => {
      serverGameState = state;
      if (window.DEBUG_MULTIPLAYER) {
        console.log('[client-game-renderer] Received server state:', state);
        if (state.players) {
          console.log('[client-game-renderer] Players:', state.players);
        }
      }
      
      // Show back button when game is over
      if (state.gameOver && state.winner !== undefined) {
        setTimeout(() => {
          const backBtn = document.getElementById('back-to-room-btn');
          if (backBtn) {
            backBtn.classList.add('visible');
          }
        }, 2000); // Show button 2 seconds after game over
      }
      
      // Render will be called by game loop
    });
    
    // Listen for player leaving room
    socket.on('player-left-room', (data) => {
      console.log('[client-game-renderer] Player left room:', data);
      alert(data.message || 'The other player has left. Returning to room selection...');
      window.location.href = '/';
    });
    
    // Listen for disconnect
    socket.on('disconnect', () => {
      console.log('[client-game-renderer] Socket disconnected');
      alert('Connection lost. Returning to room selection...');
      window.location.href = '/';
    });

    // Register states (simplified - only rendering)
    // Skip boot/countdown for server-authoritative mode
    game.addState('gameplay', function(params) {
      // Create a render-only gameplay state
      return createRenderOnlyGameplayState(params);
    });
    game.addState('gameover', function(params) {
      return window.createGameOverState(params);
    });

    // Start directly in gameplay state (server handles all logic)
    game.changeState('gameplay', {game: game});
    game.start();
    
    // Enable debug mode
    window.DEBUG_MULTIPLAYER = true;

    // Send ready signal
    if (window.sendPlayerReady) {
      window.sendPlayerReady();
    }
  }

  /**
   * Create a render-only gameplay state that uses server state
   */
  function createRenderOnlyGameplayState(params) {
    return {
      enter: function() {
        // Nothing to initialize - server handles everything
      },
      update: function(dt) {
        // No local updates - server handles all logic
        // Just send input state periodically
        sendInputToServer();
      },
      render: function(ctx) {
        // Get context from game renderer if not provided
        const renderCtx = ctx || (game && game.renderer && game.renderer.ctx);
        if (!renderCtx) {
          console.error('[client-game-renderer] No render context available');
          return;
        }
        
        // Render server state
        renderServerState(renderCtx);
      },
      exit: function() {
        // Cleanup if needed
      }
    };
  }

  /**
   * Set up input handling - only sends to server
   */
  function setupInputHandling() {
    if (!socket || !currentRoomId) return;

    const myPlayerId = isPlayer1 ? 'p1' : 'p2';
    const controlsConfig = window.ControlsConfig || {};
    const myControls = controlsConfig.players ? controlsConfig.players[myPlayerId] : {};
    const myKeys = new Set(Object.values(myControls || {}));

    // Track key states
    const keyStates = {};
    
    document.addEventListener('keydown', (e) => {
      if (myKeys.has(e.code)) {
        keyStates[e.code] = true;
        updateLocalInputFromKeys(keyStates, myControls);
        sendInputToServer();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (myKeys.has(e.code)) {
        keyStates[e.code] = false;
        updateLocalInputFromKeys(keyStates, myControls);
        sendInputToServer();
      }
    });

    // Also send periodic input updates
    setInterval(() => {
      sendInputToServer();
    }, 50); // Every 50ms
  }

  /**
   * Update local input from key states
   */
  function updateLocalInputFromKeys(keyStates, controls) {
    localInput.left = keyStates[controls.left] || false;
    localInput.right = keyStates[controls.right] || false;
    localInput.up = keyStates[controls.up] || false;
    localInput.down = keyStates[controls.down] || false;
    localInput.fire = keyStates[controls.fire] || false;
  }

  /**
   * Send input to server
   */
  function sendInputToServer() {
    if (!socket || !currentRoomId || !localInput) return;

    socket.emit('player-input', {
      roomId: currentRoomId,
      input: {
        state: { ...localInput },
        timestamp: Date.now()
      }
    });
  }

  /**
   * Load all game images
   */
  function loadImages() {
    // Load player sprites
    if (window.GameData && window.GameData.players) {
      window.GameData.players.forEach(playerData => {
        if (playerData.id && playerData.sprite) {
          const img = new Image();
          img.onload = function() {
            imageCache.players[playerData.id] = {
              image: img,
              ready: true
            };
          };
          img.onerror = function() {
            console.warn('[client-game-renderer] Failed to load player sprite:', playerData.sprite);
            imageCache.players[playerData.id] = {
              image: null,
              ready: false
            };
          };
          img.src = playerData.sprite;
        }
      });
    }
    
    // Load power-up sprites
    if (window.GameData && window.GameData.powerUps) {
      window.GameData.powerUps.forEach(puData => {
        if (puData.id && puData.sprite) {
          const img = new Image();
          img.onload = function() {
            imageCache.powerUps[puData.id] = {
              image: img,
              ready: true
            };
          };
          img.onerror = function() {
            console.warn('[client-game-renderer] Failed to load power-up sprite:', puData.sprite);
            imageCache.powerUps[puData.id] = {
              image: null,
              ready: false
            };
          };
          img.src = puData.sprite;
        }
      });
    }
    
    // Load background image (use first map's background or default)
    let backgroundSrc = null;
    if (window.GameData && window.GameData.maps && window.GameData.maps.length > 0) {
      // Try to find map1 or use first map
      const map = window.GameData.maps.find(m => m.id === 'map1') || window.GameData.maps[0];
      if (map && map.background) {
        backgroundSrc = map.background;
      }
    }
    
    if (backgroundSrc) {
      const img = new Image();
      img.onload = function() {
        imageCache.background = img;
        imageCache.backgroundReady = true;
      };
      img.onerror = function() {
        console.warn('[client-game-renderer] Failed to load background:', backgroundSrc);
        imageCache.background = null;
        imageCache.backgroundReady = false;
      };
      img.src = backgroundSrc;
    }
  }

  /**
   * Render server game state using game's renderer
   */
  function renderServerState(ctx) {
    if (!serverGameState) {
      // Show waiting message
      ctx.save();
      ctx.font = '40px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Waiting for game state...', game.canvas.width / 2, game.canvas.height / 2);
      ctx.restore();
      return;
    }

    // Clear canvas using game's renderer
    game.renderer.clear();
    
    // Get context from renderer if not provided
    if (!ctx) {
      ctx = game.renderer.ctx;
    }

    // Draw background
    if (imageCache.backgroundReady && imageCache.background) {
      ctx.drawImage(imageCache.background, 0, 0, game.canvas.width, game.canvas.height);
    } else {
      // Fallback: solid background
      ctx.fillStyle = game.config && game.config.canvas && game.config.canvas.background || '#BEBEBE';
      ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
    }

    // Draw power-ups
    if (serverGameState.powerUps) {
      serverGameState.powerUps.forEach(pu => {
        if (!pu || !pu.active) return;
        
        const puCache = imageCache.powerUps[pu.type];
        if (puCache && puCache.ready && puCache.image) {
          // Draw sprite
          ctx.drawImage(puCache.image, Math.floor(pu.x), Math.floor(pu.y), pu.w, pu.h);
        } else {
          // Fallback: colored rectangle
          ctx.save();
          let color = '#ffff00';
          if (pu.type === 'extra_life') color = '#ff0000';
          else if (pu.type === 'shield') color = '#0000ff';
          
          ctx.fillStyle = color;
          ctx.fillRect(pu.x, pu.y, pu.w, pu.h);
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#fff';
          ctx.fillRect(pu.x + 4, pu.y + 4, Math.max(0, pu.w - 8), Math.max(0, pu.h - 8));
          ctx.restore();
        }
      });
    }

    // Draw players
    if (serverGameState.players && serverGameState.players.length > 0) {
      serverGameState.players.forEach(pl => {
        if (!pl) return;
        
        // Ensure player has dimensions
        const w = pl.w || 80;
        const h = pl.h || 120;
        const x = pl.x || 0;
        const y = pl.y || 0;
        
        if (window.DEBUG_MULTIPLAYER && !pl.w) {
          console.warn('[client-game-renderer] Player missing dimensions:', pl);
        }
        
        ctx.save();
        
        // Draw player sprite if available
        const playerCache = imageCache.players[pl.id];
        if (playerCache && playerCache.ready && playerCache.image) {
          // Draw sprite with facing direction
          if (pl.facing === -1) {
            // Flip horizontally
            const cx = x + w / 2;
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(playerCache.image, -Math.floor(w / 2), Math.floor(y), w, h);
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
          } else {
            ctx.drawImage(playerCache.image, Math.floor(x), Math.floor(y), w, h);
          }
        } else {
          // Fallback: colored rectangle
          const color = pl.id === 'p1' ? '#FF4040' : '#99CCFF';
          ctx.fillStyle = color;
          ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
          
          // Draw facing indicator
          ctx.fillStyle = '#000';
          const indicatorX = (pl.facing > 0) ? x + w - 10 : x + 10;
          ctx.fillRect(Math.floor(indicatorX), Math.floor(y + h / 2 - 5), 5, 10);
        }
        
        // Draw shield if active
        if (pl.shieldMs > 0) {
          const cx = Math.floor(x + w / 2);
          const cy = Math.floor(y + h / 2);
          const r = Math.floor(Math.max(w, h) * 0.65);
          ctx.strokeStyle = '#0000ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
          ctx.stroke();
        }
        
        ctx.restore();
      });
    } else {
      // Debug: show if no players
      if (window.DEBUG_MULTIPLAYER) {
        console.warn('[client-game-renderer] No players in state. State:', serverGameState);
        // Show debug text on screen
        ctx.save();
        ctx.font = '20px monospace';
        ctx.fillStyle = '#ff0000';
        ctx.textAlign = 'left';
        ctx.fillText('No players received from server', 10, 30);
        ctx.restore();
      }
    }

    // Draw bullets
    if (serverGameState.bullets) {
      ctx.fillStyle = '#222';
      serverGameState.bullets.forEach(b => {
        if (!b || !b.alive) return;
        ctx.fillRect(b.x, b.y, b.w || 24, b.h || 8);
      });
    }

    // Draw platforms (debug mode - optional)
    if (window.DEBUG_PLATFORMS && serverGameState.platforms) {
      ctx.save();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      serverGameState.platforms.forEach(pf => {
        ctx.strokeRect(pf.x, pf.y, pf.w, pf.h);
      });
      ctx.restore();
    }

    // Draw UI
    renderUI(ctx);
  }

  /**
   * Calculate K/D ratio
   */
  function calculateKD(kills, deaths) {
    const k = kills | 0;
    const d = deaths | 0;
    if (d === 0) {
      return k > 0 ? '∞' : '0.00';
    }
    const ratio = k / d;
    return (Math.round(ratio * 100) / 100).toFixed(2);
  }

  /**
   * Draw centered panel
   */
  function drawCenteredPanel(ctx, x, y, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'white';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /**
   * Render game over screen with statistics
   */
  function renderGameOverScreen(ctx, state) {
    const w = game.canvas.width;
    const h = game.canvas.height;

    // Dim the background
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Title
    const winner = state.winner;
    let title;
    if (winner === -1) title = 'Draw!';
    else title = (winner === 0 ? 'Player 1 Wins!' : 'Player 2 Wins!');
    
    ctx.save();
    ctx.font = '84px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, w / 2, h * 0.20);
    ctx.restore();

    // Stats panel
    const panelW = 700;
    const panelH = 180;
    const px = Math.floor((w - panelW) / 2);
    const py = Math.floor(h * 0.28);
    drawCenteredPanel(ctx, px, py, panelW, panelH);

    // Column headers
    const headersY = py + 30;
    ctx.save();
    ctx.font = '24px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Player', px + 30, headersY);
    ctx.fillText('Kills', px + 260, headersY);
    ctx.fillText('Deaths', px + 360, headersY);
    ctx.fillText('K/D', px + 480, headersY);
    ctx.fillText('Pickups', px + 560, headersY);
    ctx.restore();

    // Get stats
    const stats = state.stats || {p1: {kills: 0, deaths: 0, pickups: 0}, p2: {kills: 0, deaths: 0, pickups: 0}};
    const s1 = stats.p1 || {kills: 0, deaths: 0, pickups: 0};
    const s2 = stats.p2 || {kills: 0, deaths: 0, pickups: 0};
    
    // Determine row order (winner first)
    let rows;
    const p1Color = game.config && game.config.colors && game.config.colors.p1 || '#FF4040';
    const p2Color = game.config && game.config.colors && game.config.colors.p2 || '#99CCFF';
    
    if (winner === 0) {
      rows = [
        {label: 'P1', color: p1Color, s: s1},
        {label: 'P2', color: p2Color, s: s2}
      ];
    } else if (winner === 1) {
      rows = [
        {label: 'P2', color: p2Color, s: s2},
        {label: 'P1', color: p1Color, s: s1}
      ];
    } else {
      rows = [
        {label: 'P1', color: p1Color, s: s1},
        {label: 'P2', color: p2Color, s: s2}
      ];
    }

    // Draw rows
    for (let r = 0; r < rows.length; r++) {
      const rowY = py + 70 + r * 80;
      const row = rows[r];
      
      // Player label with color swatch
      ctx.save();
      ctx.fillStyle = row.color || '#666';
      ctx.fillRect(px + 30, rowY - 18, 20, 20);
      ctx.font = '28px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#111';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(row.label, px + 60, rowY);
      
      // Values
      ctx.fillText(String(row.s.kills | 0), px + 270, rowY);
      ctx.fillText(String(row.s.deaths | 0), px + 380, rowY);
      ctx.fillText(calculateKD(row.s.kills, row.s.deaths), px + 480, rowY);
      ctx.fillText(String(row.s.pickups | 0), px + 580, rowY);
      
      // Rank badge
      const rankText = (winner === -1) ? 'T-1' : (r === 0 ? '1st' : '2nd');
      ctx.font = '24px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#555';
      ctx.textAlign = 'right';
      ctx.fillText(rankText, px + panelW - 80, rowY);
      ctx.restore();
    }
  }

  /**
   * Render UI
   */
  function renderUI(ctx) {
    if (!serverGameState) return;

    const w = game.canvas.width;
    const h = game.canvas.height;
    const pad = 16;
    const panelW = 240;
    const panelH = 65;

    // Player 1 UI
    const p1 = serverGameState.players && serverGameState.players.find(p => p.id === 'p1');
    if (p1) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(pad, pad, panelW, panelH);
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = '#FF4040';
      ctx.lineWidth = 2;
      ctx.strokeRect(pad + 0.5, pad + 0.5, panelW - 1, panelH - 1);
      
      ctx.font = '22px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#FF4040';
      ctx.textAlign = 'left';
      ctx.fillText('P1', pad + 10, pad + 8);
      
      ctx.font = '20px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillText('Lives: ' + (p1.lives | 0), pad + 60, pad + 8);
      ctx.fillText('Gun: ' + (p1.gun ? p1.gun.name : 'Pistol') + '  Ammo: ' + (p1.gun ? p1.gun.ammo : '—'), pad + 10, pad + 36);
      ctx.restore();
    }

    // Player 2 UI
    const p2 = serverGameState.players && serverGameState.players.find(p => p.id === 'p2');
    if (p2) {
      const rx = w - pad - panelW;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(rx, pad, panelW, panelH);
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = '#99CCFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx + 0.5, pad + 0.5, panelW - 1, panelH - 1);
      
      ctx.font = '22px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#99CCFF';
      ctx.textAlign = 'right';
      ctx.fillText('P2', rx + panelW - 10, pad + 8);
      
      ctx.font = '20px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillText('Lives: ' + (p2.lives | 0), rx + panelW - 60, pad + 8);
      ctx.fillText('Gun: ' + (p2.gun ? p2.gun.name : 'Pistol') + '  Ammo: ' + (p2.gun ? p2.gun.ammo : '—'), rx + panelW - 10, pad + 36);
      ctx.restore();
    }

    // Round timer (centered at top)
    if (serverGameState.timeRemaining !== undefined) {
      const timeText = Math.max(0, Math.ceil(serverGameState.timeRemaining)).toString();
      ctx.save();
      ctx.font = '80px Segoe UI, Arial, sans-serif, monospace';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(timeText, w / 2, 16);
      ctx.restore();
    }
    
    // Game Over overlay with stats
    if (serverGameState.gameOver && serverGameState.winner !== undefined) {
      renderGameOverScreen(ctx, serverGameState);
    }
  }

  // Make startGame available globally
  window.startGame = initGameRenderer;

  // Export for debugging
  window.clientGameRenderer = {
    game: () => game,
    isPlayer1: () => isPlayer1,
    socket: () => socket,
    roomId: () => currentRoomId,
    serverState: () => serverGameState
  };
})();

