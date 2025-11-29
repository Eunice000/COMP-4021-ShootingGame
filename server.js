const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const { ServerGameState } = require('./server-game-logic');

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

// Create room
app.post('/api/rooms', async (req, res) => {
  const { host } = req.body || {};
  const rooms = await readRooms();
  const id = generateRoomId(rooms);
  const room = { id, host: host || 'anonymous', players: [ host || 'anonymous' ], createdAt: new Date().toISOString() };
  rooms.push(room);
  await writeRooms(rooms);
  res.json({ ok: true, room });
});

// Get room by id
app.get('/api/rooms/:id', async (req, res) => {
  const id = req.params.id;
  const rooms = await readRooms();
  const room = rooms.find(r => r.id === id);
  if (!room) return res.status(404).json({ error: 'room not found' });
  res.json({ ok: true, room });
});

// Join a room
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server accessible from network at http://<YOUR_IP>:${PORT}`);
  console.log(`To find your IP: Windows: ipconfig | Mac/Linux: ifconfig`);
});
