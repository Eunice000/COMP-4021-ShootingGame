const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'user.json');
const ROOMS_FILE = path.join(__dirname, 'data', 'rooms.json');

app.use(bodyParser.json());
// serve static site files so front-end can run from same origin
app.use(express.static(path.join(__dirname)));

async function readUsers(){
  try{
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    const obj = JSON.parse(txt);
    return obj.users || [];
  } catch(e){
    console.error('readUsers error:', e);
    return [];
  }
}
async function writeUsers(users){
  try {
    const dir = path.dirname(DATA_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify({ users }, null, 2), 'utf8');
  } catch (e) {
    console.error('writeUsers error:', e);
    throw e;
  }
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
    console.error('readRooms error:', e);
    return [];
  }
}
async function writeRooms(rooms){
  try {
    const dir = path.dirname(ROOMS_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(ROOMS_FILE, JSON.stringify({ rooms }, null, 2), 'utf8');
  } catch (e) {
    console.error('writeRooms error:', e);
    throw e;
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
 *   status: 'lobby'|'countdown'|'playing',
 *   players: [ { name: string, socketId: string, ready: boolean } ],
 *   countdown: number | null,
 *   countdownTimer: NodeJS.Timeout | null
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
    countdownTimer: null
  });
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

// Global error handlers for better visibility
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
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
        io.to(room.id).emit('gameStart', { roomId: room.id });
      }
    }, 1000);
  }
}

function removeRoom(id){
  const room = roomsById.get(id);
  if (!room) return;
  clearCountdown(room);
  roomsById.delete(id);
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
        countdownTimer: null
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
    forceLeaveRoom(room);
  });
});

httpServer.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
httpServer.on('error', (err) => console.error('Server error:', err));
