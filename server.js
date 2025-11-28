const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

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
const activeRooms = new Map(); // roomId -> { players: Set of socketIds, gameState: {...} }

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join-room', async ({ roomId, playerName }) => {
    try {
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
          gameState: null,
          readyPlayers: new Set()
        });
      }

      const roomData = activeRooms.get(roomId);
      roomData.players.add(socket.id);

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

  // Player ready to start game
  socket.on('player-ready', ({ roomId }) => {
    const roomData = activeRooms.get(roomId);
    if (roomData) {
      roomData.readyPlayers.add(socket.id);
      
      // If both players ready, start game
      if (roomData.readyPlayers.size === 2) {
        io.to(roomId).emit('game-start', { roomId });
      }
    }
  });

  // Game state updates (player movement, shooting, etc.)
  socket.on('game-update', ({ roomId, gameState }) => {
    // Broadcast to other players in room
    socket.to(roomId).emit('game-state', gameState);
  });

  // Player input (movement, shooting)
  socket.on('player-input', ({ roomId, input }) => {
    // Broadcast input to other players
    socket.to(roomId).emit('player-input-received', {
      playerName: socket.playerName,
      input
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    if (socket.roomId) {
      const roomData = activeRooms.get(socket.roomId);
      if (roomData) {
        roomData.players.delete(socket.id);
        roomData.readyPlayers.delete(socket.id);
        
        // Notify other players
        socket.to(socket.roomId).emit('player-left', {
          playerName: socket.playerName
        });

        // Clean up empty rooms
        if (roomData.players.size === 0) {
          activeRooms.delete(socket.roomId);
        }
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server accessible from network at http://<YOUR_IP>:${PORT}`);
  console.log(`To find your IP: Windows: ipconfig | Mac/Linux: ifconfig`);
});
