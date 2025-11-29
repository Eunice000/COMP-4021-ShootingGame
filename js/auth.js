// Authentication front-end: register and login using local server endpoints

(function(){
  const signInBtn = document.querySelector('button[type="submit"]');
  const registerLink = document.getElementById('registerLink');
  const nameInput = document.getElementById('name');
  const passInput = document.getElementById('password');
  const loginContainer = document.querySelector('.login-container');
  const title = loginContainer ? loginContainer.querySelector('h1') : null;
  const divider = loginContainer ? loginContainer.querySelector('.divider') : null;
  const footer = loginContainer ? loginContainer.querySelector('.footer') : null;
  const closeBtn = document.getElementById('closeRegisterBtn');

  // Detect if accessing from wrong port or file:// protocol and suggest correct one
  const currentPort = window.location.port;
  const isFileProtocol = window.location.protocol === 'file:';
  
  // If using file:// protocol or wrong port, default to localhost:3000
  let API_BASE;
  if (isFileProtocol) {
    API_BASE = 'http://localhost:3000';
    console.warn('You are opening the file directly. Please access via http://localhost:3000 after starting the server.');
  } else if (currentPort && currentPort !== '3000' && currentPort !== '') {
    API_BASE = window.location.protocol + '//' + window.location.hostname + ':3000';
    console.warn('You are accessing the page from port ' + currentPort + '. For best results, access via http://localhost:3000');
  } else {
    API_BASE = window.location.origin;
  }
  
  let mode = 'login'; // or 'register'
  let currentUser = null;

  function showMessage(msg){
    alert(msg);
  }

  function setMode(newMode) {
    mode = newMode;
    if (title) title.textContent = (mode === 'login') ? 'LOGIN' : 'REGISTER';
    if (signInBtn) signInBtn.textContent = (mode === 'login') ? 'SIGN IN' : 'REGISTER';
    if (divider) divider.style.display = (mode === 'login') ? '' : 'none';
    if (footer) footer.style.display = (mode === 'login') ? '' : 'none';
    if (closeBtn) closeBtn.style.display = (mode === 'register') ? '' : 'none';
  }

  async function registerUser(){
    const name = nameInput.value.trim();
    const password = passInput.value;
    if (!name || !password) return showMessage('Please enter name and password to register');
    try{
      const res = await fetch(API_BASE + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password })
      });
      
      // Check if response has content
      const text = await res.text();
      if (!text) {
        showMessage('Server returned empty response. Is the server running on ' + API_BASE + '?');
        return;
      }
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        showMessage('Server returned invalid response. Make sure the server is running on port 3000.');
        console.error('Response was:', text);
        return;
      }
      
      if (res.ok) {
        showMessage('Registered successfully. You can now sign in.');
        setMode('login');
      } else {
        showMessage(data.error || 'Registration failed');
      }
    } catch(err){
      if (err.message.includes('fetch')) {
        showMessage('Unable to connect to server. Make sure the server is running on ' + API_BASE);
      } else {
        showMessage('Unable to register: ' + err.message);
      }
    }
  }

  async function loginUser(){
    const name = nameInput.value.trim();
    const password = passInput.value;
    if (!name || !password) return showMessage('Please enter name and password to sign in');
    try{
      const res = await fetch(API_BASE + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password })
      });
      
      // Check if response has content
      const text = await res.text();
      if (!text) {
        showMessage('Server returned empty response. Is the server running on ' + API_BASE + '?');
        return;
      }
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        showMessage('Server returned invalid response. Make sure the server is running on port 3000.');
        console.error('Response was:', text);
        return;
      }
      
      if (res.ok && data.ok) {
        showMessage('Welcome, ' + data.name + '!');
        currentUser = data.name;
        // show pair-up panel (hide login)
        const pairup = document.getElementById('pairupContainer');
        const login = document.querySelector('.login-container');
        if (login) {
          login.classList.remove('login-visible');
          login.classList.add('login-hidden');
        }
        if (pairup) {
          pairup.classList.remove('login-hidden');
          pairup.classList.add('login-visible');
        }
      } else {
        showMessage(data.error || 'Login failed');
      }
    } catch(err){
      if (err.message.includes('fetch')) {
        showMessage('Unable to connect to server. Make sure the server is running on ' + API_BASE);
      } else {
        showMessage('Unable to login: ' + err.message);
      }
    }
  }

  if (registerLink) {
    registerLink.addEventListener('click', function(e){
      e.preventDefault();
      setMode('register');
    });
  }

  if (signInBtn) {
    signInBtn.addEventListener('click', function(e){
      e.preventDefault();
      if (mode === 'login') {
        loginUser();
      } else {
        registerUser();
      }
    });
  }

  // Pair-up controls
  const createRoomBtn = document.getElementById('createRoomBtn');
  const findRoomBtn = document.getElementById('findRoomBtn');
  const findRoomInput = document.getElementById('findRoomInput');
  const createdRoom = document.getElementById('createdRoom');
  const foundRoom = document.getElementById('foundRoom');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const startGameBtn = document.getElementById('startGameBtn');

  // WebSocket variables
  let socket = null;
  let currentRoomId = null;

  // Initialize socket connection
  function initSocket() {
    if (socket && socket.connected) {
      // Socket already exists and is connected, ensure listeners are set up
      setupSocketListeners();
      return socket;
    }
    
    // Always connect to the same origin that served the page
    // This ensures Socket.IO connects correctly whether accessed via localhost or IP address
    // Socket.IO will automatically use the correct protocol and host
    socket = io();
    
    socket.on('connect', () => {
      console.log('Connected to server');
      setupSocketListeners();
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
    
    // Set up listeners immediately if socket is already connected
    if (socket.connected) {
      setupSocketListeners();
    }
  }
  
  // Set up socket event listeners
  function setupSocketListeners() {
    if (!socket) return;

    // Remove existing listeners to avoid duplicates
    socket.off('player-joined');
    socket.off('room-ready');
    socket.off('game-start');
    socket.off('player-input-received');
    socket.off('game-state');
    socket.off('player-left');
    socket.off('player-left-room');
    socket.off('room-closed');
    socket.off('error');
    socket.off('both-players-ready');
    
    socket.on('player-joined', (data) => {
      console.log('Player joined:', data);
      if (foundRoom) {
        foundRoom.textContent = `Room: ${currentRoomId} - Players: ${data.players.join(', ')}`;
      }
      if (createdRoom) {
        createdRoom.textContent = `Room: ${currentRoomId} - Players: ${data.players.join(', ')}`;
      }
      // Hide start game button if not enough players
      if (startGameBtn && data.players.length < 2) {
        startGameBtn.style.display = 'none';
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Start Game';
      }
    });

    socket.on('room-ready', (data) => {
      console.log('Room ready!', data);
      showMessage('Both players connected! Ready to start game.');
      // Show start game button when room is ready
      if (startGameBtn) {
        startGameBtn.style.display = 'block';
      }
    });

    socket.on('game-start', (data) => {
      console.log('Game starting!', data);
      // Hide start game button when game starts
      if (startGameBtn) {
        startGameBtn.style.display = 'none';
      }
      if (window.startGame) {
        window.startGame();
      } else {
        showMessage('Game starting! (Game code not yet implemented)');
      }
    });

    socket.on('player-input-received', (data) => {
      if (window.handleOpponentInput) {
        window.handleOpponentInput(data);
      }
    });

    socket.on('game-state', (gameState) => {
      if (window.updateGameFromState) {
        window.updateGameFromState(gameState);
      }
    });

    socket.on('player-left', (data) => {
      console.log('[auth.js] Player left:', data);
      showMessage(`Player ${data.playerName} left the game`);
      if (foundRoom) foundRoom.textContent = `Player ${data.playerName} left`;
      if (createdRoom) createdRoom.textContent = `Player ${data.playerName} left`;
      // Hide start game button when a player leaves
      if (startGameBtn) {
        startGameBtn.style.display = 'none';
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Start Game';
      }
    });
    
    // Listen for player leaving room (room closing)
    socket.on('player-left-room', (data) => {
      console.log('[auth.js] Player left room, room closing:', data);
      showMessage(data.message || 'The other player has left. Room is closing.');
      
      // Clear room information
      currentRoomId = null;
      if (foundRoom) {
        foundRoom.textContent = '';
      }
      if (createdRoom) {
        createdRoom.textContent = '';
      }
      
      // Hide and reset start game button
      if (startGameBtn) {
        startGameBtn.style.display = 'none';
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Start Game';
      }
      
      // Clear find room input
      if (findRoomInput) {
        findRoomInput.value = '';
      }
      
      // Reset start requests if any
      if (socket && socket.connected) {
        // The server will handle cleaning up startRequests
      }
    });
    
    // Listen for room closed event
    socket.on('room-closed', (data) => {
      console.log('[auth.js] Room closed:', data);
      
      // Only show message if we haven't already shown player-left-room message
      // (to avoid duplicate messages)
      if (currentRoomId) {
        showMessage('Room has been closed. You can create or join a new room.');
      }
      
      // Clear room information
      currentRoomId = null;
      if (foundRoom) {
        foundRoom.textContent = '';
      }
      if (createdRoom) {
        createdRoom.textContent = '';
      }
      
      // Hide and reset start game button
      if (startGameBtn) {
        startGameBtn.style.display = 'none';
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Start Game';
      }
      
      // Clear find room input
      if (findRoomInput) {
        findRoomInput.value = '';
      }
    });

    socket.on('error', (error) => {
      showMessage('Error: ' + error.message);
    });
    
    // Listen for both players ready signal
    socket.on('both-players-ready', (data) => {
      console.log('[auth.js] both-players-ready received:', data);
      if (data.roomId === currentRoomId) {
        console.log('[auth.js] Room ID matches, navigating to game page');
        // Both players pressed start, now navigate
        if (startGameBtn) {
          startGameBtn.textContent = 'Starting...';
        }
        setTimeout(() => {
          window.location.href = '/game.html?roomId=' + encodeURIComponent(currentRoomId);
        }, 100);
      }
    });
  }

  // Make socket and roomId available globally for game code
  window.gameSocket = () => socket;
  window.currentRoomId = () => currentRoomId;
  window.sendPlayerInput = (inputType, value) => {
    if (socket && currentRoomId) {
      socket.emit('player-input', {
        roomId: currentRoomId,
        input: {
          type: inputType,
          value: value,
          timestamp: Date.now()
        }
      });
    }
  };
  window.sendPlayerReady = () => {
    if (socket && currentRoomId) {
      socket.emit('player-ready', { roomId: currentRoomId });
    }
  };

  // server-backed rooms
  
  // Function to leave current room
  function leaveCurrentRoom() {
    if (socket && currentRoomId) {
      console.log('[auth.js] Leaving room:', currentRoomId);
      
      // Ensure socket is connected before sending leave-room
      if (socket.connected) {
        socket.emit('leave-room', { roomId: currentRoomId });
      } else {
        // If socket not connected, wait for connection
        socket.once('connect', () => {
          socket.emit('leave-room', { roomId: currentRoomId });
        });
      }
      
      // Clear local room information immediately
      const roomIdToLeave = currentRoomId;
      currentRoomId = null;
      
      // Clear room information
      if (foundRoom) {
        foundRoom.textContent = '';
      }
      if (createdRoom) {
        createdRoom.textContent = '';
      }
      
      // Hide and reset start game button
      if (startGameBtn) {
        startGameBtn.style.display = 'none';
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Start Game';
      }
      
      // Clear find room input
      if (findRoomInput) {
        findRoomInput.value = '';
      }
    }
  }

  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', async function(){
      // Leave current room if in one
      leaveCurrentRoom();
      
      const hostName = currentUser || (nameInput && nameInput.value.trim()) || 'anonymous';
      try{
        const res = await fetch(API_BASE + '/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: hostName })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          currentRoomId = data.room.id;
          if (createdRoom) createdRoom.textContent = 'Room created: ' + data.room.id;
          
          // Initialize socket and join room
          initSocket();
          // Wait for socket to connect, then join room
          if (socket.connected) {
            socket.emit('join-room', { roomId: data.room.id, playerName: hostName });
          } else {
            socket.once('connect', () => {
              socket.emit('join-room', { roomId: data.room.id, playerName: hostName });
            });
          }
        } else {
          showMessage(data.error || 'Failed to create room');
        }
      } catch(err){
        showMessage('Unable to create room: ' + err.message);
      }
    });
  }

  if (findRoomBtn) {
    findRoomBtn.addEventListener('click', async function(){
      // Leave current room if in one (before joining new room)
      leaveCurrentRoom();
      
      const want = (findRoomInput && findRoomInput.value || '').trim();
      if (!want) return showMessage('Enter a room number to find');
      try{
        const res = await fetch(API_BASE + '/api/rooms/' + encodeURIComponent(want));
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.room) {
            currentRoomId = data.room.id;
            const playerName = currentUser || (nameInput && nameInput.value.trim()) || 'anonymous';
            
            // Join room via API
            const joinRes = await fetch(API_BASE + '/api/rooms/' + want + '/join', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: playerName })
            });
            
            if (joinRes.ok) {
              if (foundRoom) foundRoom.textContent = 'Room found: ' + data.room.id;
              
              // Initialize socket and join room
              initSocket();
              // Wait for socket to connect, then join room
              if (socket.connected) {
                socket.emit('join-room', { roomId: data.room.id, playerName });
              } else {
                socket.once('connect', () => {
                  socket.emit('join-room', { roomId: data.room.id, playerName });
                });
              }
            } else {
              const joinData = await joinRes.json();
              showMessage(joinData.error || 'Failed to join room');
            }
          } else {
            if (foundRoom) foundRoom.textContent = 'Room not found';
          }
        } else if (res.status === 404) {
          if (foundRoom) foundRoom.textContent = 'Room not found';
        } else {
          const data = await res.json();
          showMessage(data.error || 'Error finding room');
        }
      } catch(err){
        showMessage('Unable to find room: ' + err.message);
      }
    });
  }

  if (startGameBtn) {
    startGameBtn.addEventListener('click', function(){
      if (socket && currentRoomId) {
        console.log('[auth.js] Start Game button clicked, roomId:', currentRoomId);
        // Store player name in sessionStorage for game page
        const playerName = currentUser || (nameInput && nameInput.value.trim()) || 'Player';
        sessionStorage.setItem('playerName', playerName);
        
        // Disable button to prevent multiple clicks
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'Waiting for other player...';
        
        // Ensure socket is connected
        if (!socket.connected) {
          console.warn('[auth.js] Socket not connected, waiting...');
          socket.once('connect', () => {
            console.log('[auth.js] Socket connected, sending request-start-game');
            socket.emit('request-start-game', { roomId: currentRoomId });
          });
        } else {
          // Send request to start game (but don't navigate yet)
          console.log('[auth.js] Sending request-start-game');
          socket.emit('request-start-game', { roomId: currentRoomId });
        }
      } else {
        console.error('[auth.js] Socket or roomId not available', { socket: !!socket, currentRoomId });
      }
    });
  }

  if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', function(){
      // Leave current room before logging out
      leaveCurrentRoom();
      
      const pairup = document.getElementById('pairupContainer');
      const login = document.querySelector('.login-container');
      if (pairup) {
        pairup.classList.remove('login-visible');
        pairup.classList.add('login-hidden');
      }
      if (login) {
        login.classList.remove('login-hidden');
        login.classList.add('login-visible');
      }
      // Hide start game button
      if (startGameBtn) {
        startGameBtn.style.display = 'none';
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Start Game';
      }
      // Disconnect socket
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      currentRoomId = null;
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function(e){
      e.preventDefault();
      setMode('login');
    });
  }

  setMode('login');
})();
