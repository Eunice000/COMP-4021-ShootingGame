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
  const currentUsernameEl = document.getElementById('currentUsername');
  const logoutBtn = document.getElementById('logoutBtn');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const findRoomBtn = document.getElementById('findRoomBtn');

  const API_BASE = window.location.origin;
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
      const data = await res.json();
      if (res.ok) {
        showMessage('Registered successfully. You can now sign in.');
        setMode('login');
      } else {
        showMessage(data.error || 'Registration failed');
      }
    } catch(err){
      showMessage('Unable to register: ' + err.message);
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
      const data = await res.json();
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
      showMessage('Unable to login: ' + err.message);
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

  // Find Room: prompt user for ID then request a join (handled in lobby.js)
  if (findRoomBtn) {
    findRoomBtn.addEventListener('click', function(){
      const want = (window.prompt && window.prompt('Enter Room ID')) || '';
      const id = (want || '').trim();
      if (!id) return;
      if (lobbyView && roomView){
        lobbyView.classList.add('login-hidden');
        roomView.classList.remove('login-hidden');
      }
      window.dispatchEvent(new CustomEvent('roomJoinRequest', { detail: { id } }));
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
