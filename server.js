const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const { GameEngine } = require(path.join(__dirname, 'server', 'gameEngine'));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'user.json');
const ROOMS_FILE = path.join(__dirname, 'data', 'rooms.json');

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(bodyParser.json());

// Handle favicon request to avoid 404 errors
app.get('/favicon.ico', (req, res) => {
  // Return a simple SVG favicon
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎮</text></svg>';
  res.type('image/svg+xml');
  res.send(svg);
});

// serve static site files so front-end can run from same origin
app.use(express.static(path.join(__dirname)));

async function readUsers(){
  try{
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const obj = JSON.parse(txt);
    return obj.users || [];
  } catch(e){
    return [];
  }
}
async function writeUsers(users){
  const dir = path.dirname(DATA_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify({ users }, null, 2), 'utf8');
}

app.post('/api/register', async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: 'name and password required' });
  const users = await readUsers();
  const exists = users.find(u => u.name.toLowerCase() === name.toLowerCase());
  if (exists) return res.status(400).json({ error: 'user already exists' });
  const hash = await bcrypt.hash(password, 10);
  users.push({ name, passwordHash: hash });
  await writeUsers(users);
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: 'name and password required' });
  const users = await readUsers();
  const user = users.find(u => u.name.toLowerCase() === name.toLowerCase());
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(400).json({ error: 'invalid credentials' });
  res.json({ ok: true, name: user.name });
});

// Rooms persistence helpers
async function readRooms(){
  try{
    const txt = await fs.readFile(ROOMS_FILE, 'utf8');
    const obj = JSON.parse(txt);
    return obj.rooms || [];
  } catch(e){
    return [];
  }
}
async function writeRooms(rooms){
  const dir = path.dirname(ROOMS_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(ROOMS_FILE, JSON.stringify({ rooms }, null, 2), 'utf8');
}

// --- Room persistence maintenance ---
async function deleteRoomFromPersistence(id){
  try{
    const rooms = await readRooms();
    const next = rooms.filter(r => r.id !== id);
    if (next.length !== rooms.length){
      await writeRooms(next);
    }
  }catch(e){
    console.error('deleteRoomFromPersistence error:', e);
  }
}

async function clearAllRoomsPersistence(){
  try{
    await writeRooms([]);
  }catch(e){
    console.error('clearAllRoomsPersistence error:', e);
  }
}

function generateRoomId(existing){
  // 6-digit room id, ensure uniqueness against existing array
  const set = new Set(existing.map(r => r.id));
  for (let i=0;i<1000;i++){
    const id = Math.floor(100000 + Math.random()*900000).toString();
    if (!set.has(id)) return id;
  }
  // fallback
  return Date.now().toString().slice(-6);
}

// In-memory room state for real-time play
/**
 * roomsById structure:
 * {
 *   id: string,
 *   host: string,
 *   status: 'lobby'|'countdown'|'playing'|'gameover',
 *   players: [ { name: string, socketId: string, ready: boolean } ],
 *   countdown: number | null,
 *   countdownTimer: NodeJS.Timeout | null,
 *   engine?: GameEngine | null,
 *   // Game over / rematch phase
 *   gameOverPayload?: any,
 *   rematch?: { p1: 'waiting'|'ready'|'left', p2: 'waiting'|'ready'|'left', deadline: number },
 *   rematchTimer?: NodeJS.Timeout | null
 * }
 */
const roomsById = new Map();

// Create room (REST) — also seed in-memory room for sockets
app.post('/api/rooms', async (req, res) => {
  const { host } = req.body || {};
  const rooms = await readRooms();
  const id = generateRoomId(rooms);
  const room = { id, host: host || 'anonymous', players: [ host || 'anonymous' ], createdAt: new Date().toISOString() };
  rooms.push(room);
  await writeRooms(rooms);
  // seed in-memory real-time room (empty sockets until clients join)
  roomsById.set(id, {
    id,
    host: room.host,
    status: 'lobby',
    players: [],
    countdown: null,
    countdownTimer: null,
    engine: null,
    gameOverPayload: null,
    rematch: null,
    rematchTimer: null
  });
  res.json({ ok: true, room });
});

// List rooms (optional substring filter by id via ?q=digits)
app.get('/api/rooms', async (req, res) => {
  try{
    const q = (req.query && req.query.q ? String(req.query.q) : '').trim();
    const rooms = await readRooms();
    const filtered = q ? rooms.filter(r => (r && typeof r.id === 'string' && r.id.includes(q))) : rooms;
    // For privacy, only expose id and host and createdAt (omit players list as it may be stale)
    const out = filtered.map(r => ({ id: r.id, host: r.host, createdAt: r.createdAt }));
    res.json({ ok: true, rooms: out });
  }catch(e){
    console.error('GET /api/rooms error:', e);
    res.status(500).json({ ok: false, error: 'failed to read rooms' });
  }
});

// Get room by id
app.get('/api/rooms/:id', async (req, res) => {
  const id = req.params.id;
  const rooms = await readRooms();
  const room = rooms.find(r => r.id === id);
  if (!room) return res.status(404).json({ error: 'room not found' });
  res.json({ ok: true, room });
});

// Join a room (REST helper only — real join happens via Socket.IO)
app.post('/api/rooms/:id/join', async (req, res) => {
  const id = req.params.id;
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required to join' });
  const rooms = await readRooms();
  const room = rooms.find(r => r.id === id);
  if (!room) return res.status(404).json({ error: 'room not found' });
  if (!room.players.includes(name)) room.players.push(name);
  await writeRooms(rooms);
  res.json({ ok: true, room });
});

// Store active game rooms in memory (in addition to file storage)
const activeRooms = new Map(); // roomId -> { players: Set of socketIds, gameState: ServerGameState, readyPlayers: Set, playerAssignments: Map }

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join-room', async ({ roomId, playerName }) => {
    try {
      // If player is already in another room, leave it first
      if (socket.roomId && socket.roomId !== roomId) {
        console.log('[server] Player already in room', socket.roomId, ', leaving before joining', roomId);
        const oldRoomId = socket.roomId;
        const oldRoomData = activeRooms.get(oldRoomId);
        if (oldRoomData) {
          // Remove player from old room
          oldRoomData.players.delete(socket.id);
          if (oldRoomData.readyPlayers) {
            oldRoomData.readyPlayers.delete(socket.id);
          }
          if (oldRoomData.startRequests) {
            oldRoomData.startRequests.delete(socket.id);
          }
          
          // Stop game if running
          if (oldRoomData.gameState) {
            if (oldRoomData.gameState.running) {
              oldRoomData.gameState.stop();
            }
            if (oldRoomData.gameStateInterval) {
              clearInterval(oldRoomData.gameStateInterval);
              oldRoomData.gameStateInterval = null;
            }
            oldRoomData.gameState = null;
          }
          
          // Get remaining players in old room
          const remainingPlayers = Array.from(oldRoomData.players);
          
          // Notify remaining players if any
          if (remainingPlayers.length > 0) {
            io.to(oldRoomId).emit('player-left-room', {
              playerName: socket.playerName || 'A player',
              message: 'The other player has left. Room is closing. You can create or join a new room.'
            });
            
            setTimeout(() => {
              io.to(oldRoomId).emit('room-closed', {
                roomId: oldRoomId,
                message: 'Room has been closed due to player leaving.'
              });
              
              remainingPlayers.forEach(playerSocketId => {
                const playerSocket = io.sockets.sockets.get(playerSocketId);
                if (playerSocket) {
                  playerSocket.leave(oldRoomId);
                  playerSocket.roomId = null;
                }
              });
              
              activeRooms.delete(oldRoomId);
              console.log('[server] Old room closed:', oldRoomId);
            }, 1000); // Changed to 1 second to allow reconnection
          } else {
            // No remaining players, just close the room
            activeRooms.delete(oldRoomId);
            console.log('[server] Old room closed (no remaining players):', oldRoomId);
          }
          
          // Remove player from old socket room
          socket.leave(oldRoomId);
        }
      }
      
      const rooms = await readRooms();
      const room = rooms.find(r => r.id === roomId);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Add player to room if not already there
      if (!room.players.includes(playerName)) {
        room.players.push(playerName);
        await writeRooms(rooms);
      }

      socket.join(roomId);
      socket.roomId = roomId;
      socket.playerName = playerName;

      // Initialize room in memory if needed
      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, {
          players: new Set(),
          gameState: null, // Will be ServerGameState instance when game starts
          readyPlayers: new Set(),
          startRequests: new Set(), // Track players who pressed Start button
          playerAssignments: new Map(), // socketId -> 'p1' or 'p2'
          gameStarted: false // Track if game has started (room should be closed to new players)
        });
      }

      // Check if room exists in activeRooms
      let roomData = activeRooms.get(roomId);
      
      // If room doesn't exist in activeRooms, create it (for reconnection after room was closed)
      if (!roomData) {
        console.log('[server] Room not in activeRooms, creating new room data for:', roomId);
        roomData = {
          players: new Set(),
          gameState: null,
          readyPlayers: new Set(),
          startRequests: new Set(),
          playerAssignments: new Map(),
          gameStarted: false // Reset gameStarted flag for new room session
        };
        activeRooms.set(roomId, roomData);
      }
      
      // If room has gameStarted flag, don't allow new players to join
      if (roomData.gameStarted) {
        socket.emit('error', { message: 'Game has already started. This room is closed to new players.' });
        return;
      }
      
      roomData.players.add(socket.id);
      
      // Assign player number based on join order
      if (roomData.players.size === 1) {
        roomData.playerAssignments.set(socket.id, 'p1');
        socket.playerId = 'p1';
      } else if (roomData.players.size === 2) {
        // Second player is p2
        const firstPlayerId = Array.from(roomData.players)[0];
        if (firstPlayerId !== socket.id) {
          roomData.playerAssignments.set(socket.id, 'p2');
          socket.playerId = 'p2';
        }
      }

      // Notify all players in room
      io.to(roomId).emit('player-joined', {
        playerName,
        players: Array.from(roomData.players).map(id => {
          const s = io.sockets.sockets.get(id);
          return s ? s.playerName : null;
        }).filter(Boolean)
      });

      // If 2 players, notify that game can start
      if (roomData.players.size === 2) {
        io.to(roomId).emit('room-ready', { roomId });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Request player assignment
  socket.on('request-player-assignment', ({ roomId }) => {
    const roomData = activeRooms.get(roomId);
    if (roomData && socket.playerId) {
      socket.emit('player-assignment', { 
        playerId: socket.playerId,
        roomId: roomId 
      });
    }
  });

  // Player leaves room (active leave, not disconnect)
  socket.on('leave-room', ({ roomId }) => {
    console.log('[server] Player leaving room:', socket.id, 'from room', roomId);
    const roomData = activeRooms.get(roomId);
    if (roomData) {
      // Get remaining players BEFORE removing the leaving player
      const remainingPlayers = Array.from(roomData.players).filter(id => id !== socket.id);
      
      // First, remove the leaving player from socket room (so they won't receive notifications)
      socket.leave(roomId);
      socket.roomId = null;
      
      // Now remove the leaving player from room data
      roomData.players.delete(socket.id);
      if (roomData.readyPlayers) {
        roomData.readyPlayers.delete(socket.id);
      }
      if (roomData.startRequests) {
        roomData.startRequests.delete(socket.id);
      }
      
      // Stop game if running
      if (roomData.gameState) {
        if (roomData.gameState.running) {
          roomData.gameState.stop();
        }
        if (roomData.gameStateInterval) {
          clearInterval(roomData.gameStateInterval);
          roomData.gameStateInterval = null;
        }
        roomData.gameState = null;
      }
      
      // Notify remaining players (NOT the leaving player) that a player is leaving
      if (remainingPlayers.length > 0) {
        // Notify remaining players that a player left
        io.to(roomId).emit('player-left-room', {
          playerName: socket.playerName || 'A player',
          message: 'The other player has left. Room is closing. You can create or join a new room.'
        });
        
        // Small delay to ensure notification is received before closing
        setTimeout(() => {
          // Then send room-closed event to remaining players
          io.to(roomId).emit('room-closed', {
            roomId: roomId,
            message: 'Room has been closed due to player leaving.'
          });
          
          // Remove remaining players from the room (they need to rejoin)
          remainingPlayers.forEach(playerSocketId => {
            const playerSocket = io.sockets.sockets.get(playerSocketId);
            if (playerSocket) {
              playerSocket.leave(roomId);
              playerSocket.roomId = null;
            }
          });
          
          // Close the room - remove it completely (after notifications are sent)
          activeRooms.delete(roomId);
          console.log('[server] Room closed due to player leaving:', roomId, 'Remaining players notified');
        }, 1000); // Changed to 1 second to allow reconnection
      } else {
        // No remaining players, just close the room
        activeRooms.delete(roomId);
        console.log('[server] Room closed (no remaining players):', roomId);
      }
    }
  });

  // Track players who want to start (on index.html)
  socket.on('request-start-game', ({ roomId }) => {
    console.log('[server] request-start-game received from', socket.id, 'for room', roomId);
    const roomData = activeRooms.get(roomId);
    if (roomData) {
      if (!roomData.startRequests) {
        roomData.startRequests = new Set();
      }
      roomData.startRequests.add(socket.id);
      console.log('[server] startRequests size:', roomData.startRequests.size, 'players size:', roomData.players.size);
      
      // If both players requested start, disconnect users first, then close room
      if (roomData.startRequests.size === 2 && roomData.players.size === 2) {
        console.log('[server] Both players ready, starting disconnect and room close sequence');
        
        // Step 1: Send notification to players (they will navigate to game.html)
        io.to(roomId).emit('both-players-ready', { roomId });
        
        // Step 2: Disconnect all players from the socket.io room FIRST
        // This ensures users are disconnected before room is closed
        setTimeout(() => {
          console.log('[server] Step 1: Disconnecting all players from room:', roomId);
          const playerSocketIds = Array.from(roomData.players);
          
          playerSocketIds.forEach(playerSocketId => {
            const playerSocket = io.sockets.sockets.get(playerSocketId);
            if (playerSocket) {
              // Disconnect from socket.io room
              playerSocket.leave(roomId);
              // Clear roomId to prevent reconnection attempts
              playerSocket.roomId = null;
              console.log('[server] Disconnected player:', playerSocketId, 'from room:', roomId);
            }
          });
          
          // Step 3: After disconnecting, close the room immediately
          setTimeout(() => {
            console.log('[server] Step 2: Closing room:', roomId);
            
            // Remove room from activeRooms - room is now closed
            // This allows users to reconnect and create a new room session
            activeRooms.delete(roomId);
            
            console.log('[server] Room closed after both players started game:', roomId, '- Room removed from activeRooms');
            
            // Step 4: After room is closed, allow reconnection
            // The room data is now gone, so users can reconnect and create new rooms
            // When they reconnect, a new roomData will be created in join-room handler with gameStarted = false
            console.log('[server] Step 3: Room closed. Users can now reconnect and create new rooms.');
          }, 100); // Small delay to ensure disconnection is complete
        }, 200); // Delay to ensure both-players-ready event is received and processed
      }
    } else {
      console.warn('[server] Room not found:', roomId);
    }
  });

  // Player ready to start game (on game.html)
  socket.on('player-ready', ({ roomId }) => {
    const roomData = activeRooms.get(roomId);
    if (roomData) {
      if (!roomData.readyPlayers) {
        roomData.readyPlayers = new Set();
      }
      roomData.readyPlayers.add(socket.id);
      
      // If both players ready, start game and send assignments
      if (roomData.readyPlayers.size === 2 && !roomData.gameState) {
        // Send player assignments to both players
        roomData.players.forEach(playerSocketId => {
          const playerSocket = io.sockets.sockets.get(playerSocketId);
          if (playerSocket && playerSocket.playerId) {
            playerSocket.emit('player-assignment', {
              playerId: playerSocket.playerId,
              roomId: roomId
            });
          }
        });
        
        // Initialize server-side game state (but don't start yet)
        roomData.gameState = new ServerGameState(roomId);
        // Don't start the game loop yet - wait for 3 second countdown to finish
        
        // Small delay to ensure assignments are received, then send game-start
        // This triggers the 3-second countdown on clients
        setTimeout(() => {
          io.to(roomId).emit('game-start', { roomId });
          
          // After 3.5 seconds (3 second countdown + 0.5 second "GO!"), actually start the game
          setTimeout(() => {
            if (roomData.gameState && roomData.players.size === 2) {
              roomData.gameState.start();
              
              // Start sending game state updates to clients
              const gameStateInterval = setInterval(() => {
                if (roomData.gameState) {
                  const state = roomData.gameState.getGameState();
                  io.to(roomId).emit('server-game-state', state);
                  
                  // If game is over, send game-over event and stop the interval
                  if (state.gameOver && state.winner !== undefined) {
                    io.to(roomId).emit('game-over', { 
                      winner: state.winner,
                      stats: state.stats 
                    });
                    clearInterval(gameStateInterval);
                    roomData.gameStateInterval = null;
                  }
                } else {
                  clearInterval(gameStateInterval);
                  roomData.gameStateInterval = null;
                }
              }, 1000 / 60); // 60 updates per second
              
              roomData.gameStateInterval = gameStateInterval;
            }
          }, 3500); // Wait for 3 second countdown + 0.5 second "GO!"
        }, 100);
      }
    }
  });

  // Game state updates (player movement, shooting, etc.)
  socket.on('game-update', ({ roomId, gameState }) => {
    // Broadcast to other players in room
    socket.to(roomId).emit('game-state-update', gameState);
  });

  // Player input (movement, shooting) - server authoritative
  socket.on('player-input', ({ roomId, input }) => {
    const roomData = activeRooms.get(roomId);
    if (!roomData || !roomData.gameState) return;
    
    const playerId = socket.playerId;
    if (!playerId) return;
    
    // Update server game state with player input
    if (input.state) {
      // Full input state
      roomData.gameState.updatePlayerInput(playerId, input.state);
    } else if (input.keyCode && input.eventType) {
      // Individual key event - convert to state
      const controlsConfig = {
        p1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', fire: 'KeyF' },
        p2: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', fire: 'Slash' }
      };
      
      const playerControls = controlsConfig[playerId] || {};
      let action = null;
      for (const [act, code] of Object.entries(playerControls)) {
        if (code === input.keyCode) {
          action = act;
          break;
        }
      }
      
      if (action) {
        const currentInput = roomData.gameState.playerInputs[playerId] || {};
        const newInput = { ...currentInput };
        
        if (input.eventType === 'keydown') {
          newInput[action] = true;
        } else if (input.eventType === 'keyup') {
          newInput[action] = false;
        }
        
        roomData.gameState.updatePlayerInput(playerId, newInput);
      }
    }
  });

  // Power-up spawn event (for synchronization)
  socket.on('powerup-spawn', ({ roomId, powerUp }) => {
    // Broadcast power-up spawn to other players in room
    socket.to(roomId).emit('powerup-spawn', {
      roomId: roomId,
      powerUp: powerUp
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('[server] User disconnected:', socket.id);
    if (socket.roomId) {
      const roomId = socket.roomId;
      const roomData = activeRooms.get(roomId);
      if (roomData) {
        // Check if game has started (gameState exists and is running)
        const gameStarted = roomData.gameState && roomData.gameState.running;
        
        // Get remaining players BEFORE removing the disconnected player
        const remainingPlayers = Array.from(roomData.players).filter(id => id !== socket.id);
        
        // First, notify other players that a player left (before closing room)
        if (remainingPlayers.length > 0) {
          // Notify remaining players that a player left
          io.to(roomId).emit('player-left-room', {
            playerName: socket.playerName || 'A player',
            message: 'The other player has left. Room is closing. You can create or join a new room.'
          });
          
          // If game has started, wait 3 seconds before closing room to allow reconnection
          // Otherwise, use shorter delay (1 second)
          const closeDelay = gameStarted ? 3000 : 1000;
          
          setTimeout(() => {
            // Then send room-closed event
            io.to(roomId).emit('room-closed', {
              roomId: roomId,
              message: 'Room has been closed due to player leaving.'
            });
            
            // Remove remaining players from the room (they need to rejoin)
            remainingPlayers.forEach(playerSocketId => {
              const playerSocket = io.sockets.sockets.get(playerSocketId);
              if (playerSocket) {
                playerSocket.leave(roomId);
                playerSocket.roomId = null;
              }
            });
          }, closeDelay);
        }
        
        // Now remove the disconnected player from room data
        roomData.players.delete(socket.id);
        if (roomData.readyPlayers) {
          roomData.readyPlayers.delete(socket.id);
        }
        if (roomData.startRequests) {
          roomData.startRequests.delete(socket.id);
        }
      
        // Stop game if running
        if (roomData.gameState) {
          if (roomData.gameState.running) {
            roomData.gameState.stop();
          }
          if (roomData.gameStateInterval) {
            clearInterval(roomData.gameStateInterval);
            roomData.gameStateInterval = null;
          }
          roomData.gameState = null;
        }

        // Close the room - remove it completely (after notification)
        // If game has started, wait 3 seconds; otherwise 1 second
        
        setTimeout(() => {
          activeRooms.delete(roomId);
          console.log('[server] Room closed:', roomId, 'Remaining players notified');
        });
      }
    }
  });
});

// HTTP + Socket.IO server
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*'
  }
});

function getRoomStatePayload(room){
  return {
    id: room.id,
    host: room.host,
    status: room.status,
    players: room.players.map(p => ({ name: p.name, ready: p.ready }))
  };
}

function broadcastRoomUpdate(room){
  io.to(room.id).emit('roomUpdate', getRoomStatePayload(room));
}

function clearCountdown(room){
  if (room.countdownTimer){
    clearInterval(room.countdownTimer);
    room.countdownTimer = null;
  }
  room.countdown = null;
  if (room.status === 'countdown') room.status = 'lobby';
}

function clearRematch(room){
  if (room.rematchTimer){
    clearInterval(room.rematchTimer);
    room.rematchTimer = null;
  }
  room.rematch = null;
  room.gameOverPayload = null;
}

function tryStartCountdown(room){
  if (room.status !== 'lobby') return;
  if (room.players.length === 2 && room.players.every(p => p.ready)){
    room.status = 'countdown';
    room.countdown = 3;
    io.to(room.id).emit('countdown', { seconds: room.countdown });
    room.countdownTimer = setInterval(()=>{
      if (room.countdown === null) return;
      room.countdown -= 1;
      if (room.countdown > 0){
        io.to(room.id).emit('countdown', { seconds: room.countdown });
      } else {
        clearCountdown(room);
        room.status = 'playing';
        // Start authoritative game for this room
        startRoomGame(room);
      }
    }, 1000);
  }
}

function removeRoom(id){
  const room = roomsById.get(id);
  if (!room) return;
  // stop engine if running
  stopRoomGame(room);
  clearCountdown(room);
  clearRematch(room);
  roomsById.delete(id);
  // remove from persistence (fire-and-forget)
  deleteRoomFromPersistence(id);
}

function forceLeaveRoom(room){
  // Inform all clients in the room to go back to post-login (pairup panel)
  io.to(room.id).emit('forceLeave', { reason: 'player_left_or_disconnected' });
  // Make sockets leave the room
  for (const p of room.players){
    const s = io.sockets.sockets.get(p.socketId);
    if (s){
      s.leave(room.id);
    }
  }
  removeRoom(room.id);
}

// New: remove a player from a room without forcing the other player to leave
function removePlayerFromRoom(room, socketId){
  const idx = room.players.findIndex(p => p.socketId === socketId);
  if (idx === -1) return;
  // Cancel any countdown and return to lobby state
  clearCountdown(room);
  room.status = 'lobby';
  // Remove player
  room.players.splice(idx, 1);
  // Re-index/host: ensure remaining player (if any) is P1 and host
  if (room.players.length > 0){
    room.host = room.players[0].name;
  }
}

io.on('connection', (socket)=>{
  socket.data.userName = null;
  socket.data.roomId = null;

  socket.on('joinRoom', async ({ roomId, name }) => {
    if (!roomId || !name) return socket.emit('errorMsg', { error: 'roomId and name required' });
    let room = roomsById.get(roomId);
    if (!room){
      // verify this room exists in persistence (created via REST)
      const rooms = await readRooms();
      const exists = rooms.find(r => r.id === roomId);
      if (!exists){
        return socket.emit('errorMsg', { error: 'room not found' });
      }
      room = {
        id: roomId,
        host: exists.host || name,
        status: 'lobby',
        players: [],
        countdown: null,
        countdownTimer: null,
        engine: null
      };
      roomsById.set(roomId, room);
    }
    if (room.players.find(p => p.name === name)){
      // If same name reconnects, replace socketId
      room.players = room.players.map(p => p.name === name ? { ...p, socketId: socket.id } : p);
    } else {
      if (room.players.length >= 2){
        return socket.emit('errorMsg', { error: 'room full' });
      }
      room.players.push({ name, socketId: socket.id, ready: false });
    }
    socket.data.userName = name;
    socket.data.roomId = room.id;
    socket.join(room.id);
    broadcastRoomUpdate(room);
  });

  socket.on('leaveRoom', ()=>{
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomsById.get(roomId);
    if (!room) return;
    // New requirement: player leaves room; remaining player (if any) stays and shifts to P1
    removePlayerFromRoom(room, socket.id);
    socket.leave(room.id);
    socket.data.roomId = null;
    // If a game is running, stop it and force leave everyone back to lobby
    if (room.status === 'playing' || room.status === 'gameover'){
      clearRematch(room);
      forceLeaveRoom(room);
      return;
    }
    if (room.players.length === 0){
      removeRoom(room.id);
    } else {
      broadcastRoomUpdate(room);
    }
  });

  socket.on('setReady', ({ ready }) => {
    const roomId = socket.data.roomId;
    const name = socket.data.userName;
    if (!roomId || !name) return;
    const room = roomsById.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.name === name);
    if (!player) return;
    player.ready = !!ready;
    broadcastRoomUpdate(room);
    // If countdown should no longer continue (e.g., someone unreadied), cancel it
    if (room.status === 'countdown'){
      const allReady = (room.players.length === 2) && room.players.every(p => p.ready);
      if (!allReady){
        clearCountdown(room);
        broadcastRoomUpdate(room);
      }
    }
    tryStartCountdown(room);
  });

  socket.on('requestRoomState', ()=>{
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomsById.get(roomId);
    if (room) socket.emit('roomUpdate', getRoomStatePayload(room));
  });

  socket.on('disconnect', ()=>{
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomsById.get(roomId);
    if (!room) return;
    // Keep original requirement: any disconnect makes both leave
    clearRematch(room);
    forceLeaveRoom(room);
  });

  // Runtime input from clients during gameplay
  socket.on('input', (pkt)=>{
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomsById.get(roomId);
    if (!room || !room.engine) return;
    room.engine.handleInputPacket(socket.id, pkt);
  });

  // Rematch decision from client during Game Over phase
  socket.on('rematchChoice', ({ choice }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = roomsById.get(roomId);
    if (!room || room.status !== 'gameover' || !room.rematch) return;
    const p1 = room.players[0];
    const p2 = room.players[1];
    const idx = (p1 && p1.socketId === socket.id) ? 0 : ((p2 && p2.socketId === socket.id) ? 1 : -1);
    if (idx === -1) return;
    const otherIdx = (idx === 0 ? 1 : 0);
    const youKey = (idx === 0 ? 'p1' : 'p2');
    const otherKey = (otherIdx === 0 ? 'p1' : 'p2');
    const yourState = room.rematch[youKey];
    const otherState = room.rematch[otherKey];
    const c = (choice === 'left') ? 'left' : (choice === 'ready' ? 'ready' : null);
    if (!c) return;

    // Apply rules
    if (yourState === 'left') return; // already left; final

    if (c === 'left'){
      // New rule: if you had pressed Z (ready), you may press X to leave
      // when the opponent has already left. Otherwise, keep your Ready.
      if (yourState === 'ready' && otherState !== 'left'){
        return;
      }
      // Mark this player as left; do not immediately force-return just this player.
      // Both players must press X or the timer must expire to return to room.
      room.rematch[youKey] = 'left';
    } else if (c === 'ready'){
      // If the other has already left, you can no longer ready up
      if (otherState === 'left'){
        return; // only X is allowed now for the remaining player
      }
      // Otherwise, allow ready regardless of the other player's state
      room.rematch[youKey] = 'ready';
    }

    // Check resolution
    const a = room.rematch.p1;
    const b = room.rematch.p2;
    if (a === 'ready' && b === 'ready'){
      // Restart game
      endRematchAndRestart(room);
      return;
    }
    // If both have left (both X), end rematch for both players
    if (a === 'left' && b === 'left'){
      endRematchReturnToRoom(room);
      return;
    }
  });
});

httpServer.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
httpServer.on('error', (err) => console.error('Server error:', err));

// On server shutdown, wipe persisted rooms so stale rooms don't linger
let shuttingDown = false;
async function handleShutdown(signal){
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down signal:', signal);
  try{
    await clearAllRoomsPersistence();
  }catch(e){
    console.error('Error clearing rooms on shutdown', e);
  } finally {
    try { httpServer.close(()=>{}); } catch(e) {}
    // Give a short grace period then exit
    setTimeout(()=> process.exit(0), 200);
  }
}
process.on('SIGINT', ()=> handleShutdown('SIGINT'));
process.on('SIGTERM', ()=> handleShutdown('SIGTERM'));
process.on('beforeExit', async ()=>{
  // Attempt to clear rooms if process is about to exit for any reason
  try{ await clearAllRoomsPersistence(); }catch(e){ /* ignore */ }
});

// ---- Game lifecycle helpers ----
function startRoomGame(room){
  // Assign roles by join order
  const p1 = room.players[0];
  const p2 = room.players[1];
  if (!p1 || !p2){
    room.status = 'lobby';
    broadcastRoomUpdate(room);
    return;
  }
  // Notify clients of their role
  const s1 = io.sockets.sockets.get(p1.socketId);
  const s2 = io.sockets.sockets.get(p2.socketId);
  s1 && s1.emit('gameAssign', { role: 'p1', roomId: room.id });
  s2 && s2.emit('gameAssign', { role: 'p2', roomId: room.id });

  // Create and start engine
  const engine = new GameEngine(__dirname);
  room.engine = engine;
  engine.assignRoles(p1.socketId, p2.socketId);
  engine.setOnSnapshot((snap)=>{
    io.to(room.id).emit('snapshot', snap);
  });
  engine.setOnRoundCountdown((sec)=>{
    io.to(room.id).emit('roundCountdown', { seconds: sec|0 });
  });
  engine.setOnGameOver((payload)=>{
    // Enter gameover/rematch phase
    stopRoomGame(room);
    room.status = 'gameover';
    room.gameOverPayload = payload || {};
    const now = Date.now();
    room.rematch = { p1: 'waiting', p2: 'waiting', deadline: now + 15000 };
    // Periodically emit gameOver with rematch remaining time
    if (room.rematchTimer) { clearInterval(room.rematchTimer); room.rematchTimer = null; }
    room.rematchTimer = setInterval(()=>{
      const remaining = Math.max(0, (room.rematch.deadline - Date.now()));
      const out = { ...room.gameOverPayload, rematch: { p1: room.rematch.p1, p2: room.rematch.p2, remainingMs: remaining } };
      io.to(room.id).emit('gameOver', out);
      // Resolve by timeout
      if (remaining <= 0){
        endRematchReturnToRoom(room);
      }
    }, 300);
  });
  engine.start();
}

function stopRoomGame(room){
  if (room && room.engine){
    try{ room.engine.stop(); }catch(e){}
    room.engine = null;
  }
}

function endRematchReturnToRoom(room){
  if (!room) return;
  if (room.rematchTimer){ clearInterval(room.rematchTimer); room.rematchTimer = null; }
  room.status = 'lobby';
  // Clear players' ready state for next match
  room.players = room.players.map(pl => ({ ...pl, ready: false }));
  // Notify clients to return to room; also send a final gameOver with 0 remaining
  const out = { ...(room.gameOverPayload||{}), rematch: { p1: room.rematch?.p1 || 'waiting', p2: room.rematch?.p2 || 'waiting', remainingMs: 0 } };
  io.to(room.id).emit('gameOver', out);
  broadcastRoomUpdate(room);
  clearRematch(room);
}

function endRematchAndRestart(room){
  if (!room) return;
  if (room.rematchTimer){ clearInterval(room.rematchTimer); room.rematchTimer = null; }
  clearRematch(room);
  // Restart game immediately
  room.status = 'playing';
  startRoomGame(room);
}
