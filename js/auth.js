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
  // post-login views
  const pairup = document.getElementById('pairupContainer');
  const lobbyView = document.getElementById('lobbyView');
  const roomView = document.getElementById('roomView');
  const findRoomsView = document.getElementById('findRoomsView');
  const currentUsernameEl = document.getElementById('currentUsername');
  const logoutBtn = document.getElementById('logoutBtn');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const findRoomBtn = document.getElementById('findRoomBtn');

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
        // expose globally for other modules (lobby.js)
        window.CURRENT_USER = currentUser;
        window.dispatchEvent(new CustomEvent('loginSuccess', { detail: { name: currentUser } }));
        // show pair-up panel (hide login)
        const login = document.querySelector('.login-container');
        if (login) {
          login.classList.remove('login-visible');
          login.classList.add('login-hidden');
        }
        if (pairup) {
          pairup.classList.remove('login-hidden');
          pairup.classList.add('login-visible');
        }
        if (currentUsernameEl) currentUsernameEl.textContent = 'Current user: ' + currentUser;
        if (lobbyView && roomView){
          lobbyView.classList.remove('login-hidden');
          roomView.classList.add('login-hidden');
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

  // Pair-up controls (server-backed rooms)

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
          // switch to room view visually; actual player list populates from socket events
          if (lobbyView && roomView){
            lobbyView.classList.add('login-hidden');
            roomView.classList.remove('login-hidden');
          }
          // let lobby.js auto-join via socket
          // notify lobby to socket-join this room
          window.dispatchEvent(new CustomEvent('roomCreated', { detail: { id: data.room.id } }));
        } else {
          showMessage(data.error || 'Failed to create room');
        }
      } catch(err){
        showMessage('Unable to create room: ' + err.message);
      }
    });
  }

  // Find Room: open the search/list panel instead of prompt
  if (findRoomBtn) {
    findRoomBtn.addEventListener('click', function(){
      if (lobbyView && findRoomsView){
        lobbyView.classList.add('login-hidden');
        findRoomsView.classList.remove('login-hidden');
      }
      // Notify finder module to load/refresh rooms
      window.dispatchEvent(new CustomEvent('findRoomsOpen'));
    });
  }

  // Logout: go back to login and notify lobby to leave any room
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(){
      const login = document.querySelector('.login-container');
      if (pairup) {
        pairup.classList.remove('login-visible');
        pairup.classList.add('login-hidden');
      }
      if (login) {
        login.classList.remove('login-hidden');
        login.classList.add('login-visible');
      }
      window.dispatchEvent(new CustomEvent('userLogout'));
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
