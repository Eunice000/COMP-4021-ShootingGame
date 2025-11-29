(function(){
  let socket = null;
  let joinedRoomId = null;
  let isReady = false;

  // views & elements
  const lobbyView = document.getElementById('lobbyView');
  const roomView = document.getElementById('roomView');
  const roomTitle = document.getElementById('roomTitle');
  const roomCountdown = document.getElementById('roomCountdown');
  const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');
  const playerBox = document.getElementById('playerBox');
  const readyBtn = document.getElementById('readyBtn');
  const leaveRoomBtn = document.getElementById('leaveRoomBtn');

  function showRoomView(){
    if (lobbyView) lobbyView.classList.add('login-hidden');
    if (roomView) roomView.classList.remove('login-hidden');
  }
  function showLobbyView(){
    if (roomView) roomView.classList.add('login-hidden');
    if (lobbyView) lobbyView.classList.remove('login-hidden');
  }

  function ensureSocket(){
    if (!socket){
      socket = io();

      socket.on('roomUpdate', (payload)=>{
        // payload: { id, host, status, players: [{name, ready}] }
        joinedRoomId = payload.id;
        showRoomView();
        renderRoom(payload);
      });

      socket.on('countdown', ({ seconds })=>{
        if (roomCountdown){
          roomCountdown.textContent = `Starting in ${seconds}...`;
        }
      });

      socket.on('gameStart', ()=>{
        // Optional: show brief message on countdown line
        if (roomCountdown){ roomCountdown.textContent = 'Game started!'; }
      });

      socket.on('forceLeave', ({ reason })=>{
        joinedRoomId = null;
        isReady = false;
        if (readyBtn){ readyBtn.disabled = true; readyBtn.textContent = 'Ready'; }
        if (leaveRoomBtn){ leaveRoomBtn.disabled = true; }
        if (playerBox){ playerBox.innerHTML = ''; }
        if (roomCountdown){ roomCountdown.textContent = ''; }
        showLobbyView();
      });

      socket.on('errorMsg', ({ error })=>{
        alert(error || 'Error');
      });
    }
    return socket;
  }

  function renderRoom(payload){
    const me = window.CURRENT_USER || '';
    const players = payload.players || [];
    if (roomTitle){
      roomTitle.textContent = `Room ${payload.id}`;
    }
    // Clear countdown text if not in countdown status
    if (roomCountdown){
      if (payload.status !== 'countdown') roomCountdown.textContent = '';
    }
    // build two rows (P1/P2)
    const rows = [players[0] || null, players[1] || null];
    if (playerBox){
      playerBox.innerHTML = '';
      rows.forEach((p, idx)=>{
        const role = idx === 0 ? 'P1' : 'P2';
        const row = document.createElement('div');
        row.className = 'player-row';
        const c1 = document.createElement('div'); c1.className = 'player-cell player-role'; c1.textContent = role;
        const c2 = document.createElement('div'); c2.className = 'player-cell'; c2.textContent = p ? p.name : '';
        const c3 = document.createElement('div'); c3.className = 'player-cell';
        const badge = document.createElement('div');
        badge.className = 'status-badge ' + (p && p.ready ? 'status-ready' : 'status-waiting');
        badge.textContent = p ? (p.ready ? 'Ready!' : 'Waiting...') : 'Waiting...';
        c3.appendChild(badge);
        row.appendChild(c1); row.appendChild(c2); row.appendChild(c3);
        playerBox.appendChild(row);
      });
    }
    const mePlayer = players.find(p=>p.name===me);
    if (mePlayer){
      isReady = !!mePlayer.ready;
      if (readyBtn){ readyBtn.disabled = false; readyBtn.textContent = isReady ? 'Unready' : 'Ready'; }
      if (leaveRoomBtn){ leaveRoomBtn.disabled = true; /* enabled after joined below */ }
    }
    // enable leave when inside a room regardless
    if (leaveRoomBtn) leaveRoomBtn.disabled = false;
  }

  function joinRoom(roomId){
    const s = ensureSocket();
    const name = window.CURRENT_USER || '';
    if (!name){
      return alert('Please login first');
    }
    if (!roomId){
      return alert('Enter a room number to join');
    }
    s.emit('joinRoom', { roomId, name });
    showRoomView();
  }

  if (readyBtn){
    readyBtn.addEventListener('click', ()=>{
      if (!joinedRoomId) return;
      isReady = !isReady;
      ensureSocket().emit('setReady', { ready: isReady });
      readyBtn.textContent = isReady ? 'Unready' : 'Ready';
    });
  }

  if (leaveRoomBtn){
    leaveRoomBtn.addEventListener('click', ()=>{
      if (!joinedRoomId){ return showLobbyView(); }
      // Emit leave and locally return to lobby without alerts
      ensureSocket().emit('leaveRoom');
      joinedRoomId = null;
      isReady = false;
      if (readyBtn){ readyBtn.disabled = true; readyBtn.textContent = 'Ready'; }
      if (leaveRoomBtn){ leaveRoomBtn.disabled = true; }
      if (playerBox){ playerBox.innerHTML = ''; }
      if (roomCountdown){ roomCountdown.textContent = ''; }
      showLobbyView();
    });
  }

  if (copyRoomIdBtn){
    copyRoomIdBtn.addEventListener('click', async ()=>{
      if (!joinedRoomId) return;
      try{
        await navigator.clipboard.writeText(joinedRoomId);
        copyRoomIdBtn.textContent = 'Copied!';
        setTimeout(()=>copyRoomIdBtn.textContent = 'Copy Room ID', 1000);
      }catch(e){
        alert('Unable to copy: ' + e.message);
      }
    });
  }

  // Events from auth.js
  window.addEventListener('roomCreated', (e)=>{
    const id = e && e.detail && e.detail.id;
    if (id) joinRoom(id);
  });
  window.addEventListener('roomJoinRequest', (e)=>{
    const id = e && e.detail && e.detail.id;
    if (id) joinRoom(id);
  });
  window.addEventListener('userLogout', ()=>{
    if (joinedRoomId){ ensureSocket().emit('leaveRoom'); }
    showLobbyView();
  });
  window.addEventListener('loginSuccess', ()=>{ ensureSocket(); });
})();
