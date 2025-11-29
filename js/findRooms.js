(function(){
  const API_BASE = window.location.origin;

  // Views
  const lobbyView = document.getElementById('lobbyView');
  const findView = document.getElementById('findRoomsView');

  // Controls
  const searchInput = document.getElementById('findRoomSearch');
  const refreshBtn = document.getElementById('refreshRoomsBtn');
  const returnBtn = document.getElementById('returnToLobbyBtn');
  const listEl = document.getElementById('roomsList');
  const emptyEl = document.getElementById('roomsEmpty');

  let roomsCache = [];
  let lastQuery = '';
  let debounceTimer = null;
  let pollTimer = null;

  function showLobby(){
    if (findView) findView.classList.add('login-hidden');
    if (lobbyView) lobbyView.classList.remove('login-hidden');
    stopPoll();
  }

  function showFind(){
    if (lobbyView) lobbyView.classList.add('login-hidden');
    if (findView) findView.classList.remove('login-hidden');
    startPoll();
  }

  async function fetchRooms(q){
    try{
      const url = new URL(API_BASE + '/api/rooms');
      if (q) url.searchParams.set('q', q);
      const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      if (res.ok && data.ok){
        roomsCache = Array.isArray(data.rooms) ? data.rooms : [];
      } else {
        roomsCache = [];
      }
    }catch(e){
      roomsCache = [];
    }
    renderRooms();
  }

  function renderRooms(){
    if (!listEl) return;
    listEl.innerHTML = '';
    const list = roomsCache;
    if (!list || list.length === 0){
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    list.forEach(r => {
      const row = document.createElement('div');
      row.setAttribute('role','listitem');
      row.className = 'room-row';

      const info = document.createElement('div');
      info.className = 'room-info';

      const idLine = document.createElement('div');
      idLine.className = 'room-id';
      idLine.textContent = `Room ID: ${r.id}`;

      const hostLine = document.createElement('div');
      hostLine.className = 'room-host';
      hostLine.textContent = `Player: ${r.host || 'unknown'}`;

      info.appendChild(idLine);
      info.appendChild(hostLine);

      const joinBtn = document.createElement('button');
      joinBtn.className = 'primary-btn room-join';
      joinBtn.textContent = 'Join';
      joinBtn.addEventListener('click', () => {
        // Hide find view then request join through lobby.js event
        if (findView) findView.classList.add('login-hidden');
        stopPoll();
        window.dispatchEvent(new CustomEvent('roomJoinRequest', { detail: { id: r.id } }));
      });

      row.appendChild(info);
      row.appendChild(joinBtn);
      listEl.appendChild(row);
    });
  }

  function onSearchChanged(){
    const raw = (searchInput && searchInput.value) ? searchInput.value : '';
    // accept any substring; optionally restrict to digits
    const q = raw.trim();
    lastQuery = q;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=> fetchRooms(q), 120);
  }

  // Event wiring
  if (searchInput){
    searchInput.addEventListener('input', onSearchChanged);
  }
  if (refreshBtn){
    refreshBtn.addEventListener('click', ()=> fetchRooms(lastQuery));
  }
  if (returnBtn){
    returnBtn.addEventListener('click', ()=>{
      showLobby();
    });
  }

  // When user clicks Find Room in auth.js
  window.addEventListener('findRoomsOpen', ()=>{
    showFind();
    if (searchInput) searchInput.value = '';
    lastQuery = '';
    fetchRooms('');
  });

  function startPoll(){
    stopPoll();
    pollTimer = setInterval(()=>{
      fetchRooms(lastQuery);
    }, 5000);
  }

  function stopPoll(){
    if (pollTimer){
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }
})();
