(function(){
  /**
   * Minimal socket shape for IDE hints.
   * @typedef {{ on:(event:string, cb:Function)=>void, emit:(event:string, payload?:any)=>void }} SimpleSocket
   */
  /**
   * NetInput facade type
   * @typedef {{ start:()=>void, stop:()=>void, poll:()=>{hold:number, press:number, release:number} }} NetInputType
   */
  /**
   * @returns {SimpleSocket|null}
   */
  function getSocket(){ return window['GAME_SOCKET'] || null; }
  /**
   * @returns {NetInputType|null}
   */
  function getNetInput(){ return window['NetInput'] || null; }
  let inputTimer = null;
  /** @type {null | { start:()=>void, stop:()=>void, setSnapshot:(snap:any)=>void }} */
  let renderer = null;
  let role = null;
  let inputPaused = false; // pause input during server pre-start countdown
  // Lightweight states/overlays
  /** @type {any} */
  let countdown = null; // NetCountdownState instance
  /** @type {any} */
  let gameOverState = null; // NetGameOverState instance

  // Views
  const roomView = document.getElementById('roomView');
  const gameView = document.getElementById('gameView');
  const leaveMatchBtn = document.getElementById('leaveMatchBtn');
  const canvas = document.getElementById('netgame');
  const WORLD_W = 1920;
  const WORLD_H = 1080;

  function resizeCanvasToViewport(){
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    // Fill the entire viewport with the canvas. The renderer will letterbox
    // the fixed 1920x1080 world inside this area and draw the border around it.
    const cssW = Math.max(1, Math.floor(window.innerWidth));
    const cssH = Math.max(1, Math.floor(window.innerHeight));

    // Set CSS size to match the viewport
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    // Match backing store to CSS size * DPR for crisp rendering
    const bw = Math.floor(cssW * dpr);
    const bh = Math.floor(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh){
      canvas.width = bw;
      canvas.height = bh;
    }
  }

  function showGame(){
    if (roomView) roomView.classList.add('login-hidden');
    if (gameView){
      gameView.classList.remove('login-hidden');
      gameView.style.display = 'flex';
    }
    // Fullscreen mode styling on body
    document.body && document.body.classList.add('in-game');
    // Resize canvas to viewport while renderer letterboxes to keep aspect ratio
    resizeCanvasToViewport();
    window.addEventListener('resize', resizeCanvasToViewport);
  }
  function showRoom(){
    if (gameView){
      gameView.classList.add('login-hidden');
      gameView.style.display = 'none';
    }
    if (roomView) roomView.classList.remove('login-hidden');
    document.body && document.body.classList.remove('in-game');
    window.removeEventListener('resize', resizeCanvasToViewport);
  }

  function startInputLoop(){
    if (inputTimer) return;
    const ni = getNetInput();
    if (ni) ni.start();
    const stepMs = Math.floor(1000/60);
    inputTimer = setInterval(()=>{
      const ni = getNetInput();
      const pkt = ni ? ni.poll() : { hold:0, press:0, release:0 };
      const s = getSocket();
      if (s) s.emit('input', pkt);
    }, stepMs);
  }

  function stopInputLoop(){
    if (inputTimer){ clearInterval(inputTimer); inputTimer = null; }
    const ni = getNetInput();
    if (ni) ni.stop();
  }

  function startRenderer(){
    if (!canvas) return;
    /** @type {any} */
    const GR = window['GameRenderer'];
    if (!renderer && GR) renderer = new GR(canvas);
    if (renderer && typeof renderer.start === 'function') renderer.start();
  }
  function stopRenderer(){
    if (renderer) renderer.stop();
  }

  let handlersInstalled = false;
  function tryInstallHandlers(){
    if (handlersInstalled) return;
    /** @type {SimpleSocket|null} */
    const socket = getSocket();
    if (!socket) return;
    handlersInstalled = true;
    socket.on('gameAssign', (msg)=>{
      role = msg && msg.role;
      showGame();
      startRenderer();
      // Cleanup any lingering game-over UI
      try { if (renderer && renderer.setGameOver) renderer.setGameOver(null); } catch(e){}
      // Create countdown overlay but do not start a local timer; wait for server sync
      inputPaused = true;
      startInputLoop();
      try {
        const CDS = window['NetCountdownState'];
        if (CDS && gameView){
          countdown = new CDS(gameView);
          // Wait for server 'roundCountdown' events
        }
      } catch(e){}
    });
    socket.on('snapshot', (snap)=>{
      if (renderer) renderer.setSnapshot(snap);
    });
    // Server-driven pre-round countdown
    socket.on('roundCountdown', ({ seconds })=>{
      const sec = (seconds|0);
      if (countdown && typeof countdown.sync === 'function'){
        countdown.sync(sec);
      }
      if (sec === 0){
        // Allow inputs when GO is shown/hidden
        inputPaused = false;
      }
    });
    // Game over with rematch phase streaming
    let goKeyHandler = null;
    let myDecision = 'waiting';
    socket.on('gameOver', (payload)=>{
      // During game over, stop gameplay inputs; we handle keys manually
      stopInputLoop();
      inputPaused = true;
      // Drive renderer overlay continuously with server payload (includes rematch box states and remainingMs)
      if (renderer && renderer.setGameOver) renderer.setGameOver(payload||{});
      // Install one-time key handler for Z/X decisions
      if (!goKeyHandler){
        goKeyHandler = (ev)=>{
          const code = ev.key || '';
          const lower = code.length === 1 ? code.toLowerCase() : code;
          if (lower === 'z'){
            // Attempt Ready
            if (myDecision === 'waiting'){
              // If opponent already ready, server will reject; that's fine
              socket.emit('rematchChoice', { choice: 'ready' });
              myDecision = 'ready';
            } else if (myDecision === 'ready'){
              // No-op; cannot toggle to ready again
            }
          } else if (lower === 'x'){
            // Attempt Leave (always allowed if opponent is ready; server enforces rules)
            if (myDecision !== 'left'){
              socket.emit('rematchChoice', { choice: 'left' });
              myDecision = 'left';
            }
          }
        };
        window.addEventListener('keydown', goKeyHandler);
      }
      // If server indicates timeout reached (remainingMs 0), return to room view
      const rem = payload && payload.rematch;
      if (rem && typeof rem.remainingMs === 'number' && rem.remainingMs <= 0){
        // Cleanup and return to room
        if (goKeyHandler){ window.removeEventListener('keydown', goKeyHandler); goKeyHandler = null; }
        myDecision = 'waiting';
        try { if (countdown && countdown.stop) countdown.stop(); } catch(e){}
        countdown = null;
        try { if (renderer && renderer.setGameOver) renderer.setGameOver(null); } catch(e){}
        stopRenderer();
        showRoom();
      }
    });
    socket.on('forceLeave', ()=>{
      // In case forceLeave is emitted from other flows, ensure cleanup
      try { if (countdown && countdown.stop) countdown.stop(); } catch(e){}
      countdown = null;
      try { if (renderer && renderer.setGameOver) renderer.setGameOver(null); } catch(e){}
      // Remove any game over key handler
      try{ if (typeof goKeyHandler === 'function'){ window.removeEventListener('keydown', goKeyHandler); } }catch(e){}
      goKeyHandler = null;
      stopInputLoop();
      stopRenderer();
      showRoom();
    });
  }

  // Poll until lobby.js sets up the socket
  const waitForSocket = setInterval(()=>{
    tryInstallHandlers();
    if (handlersInstalled) clearInterval(waitForSocket);
  }, 200);

  if (leaveMatchBtn){
    leaveMatchBtn.addEventListener('click', ()=>{
      /** @type {SimpleSocket|null} */
      const socket = getSocket();
      if (socket) socket.emit('leaveRoom');
      try { if (countdown && countdown.stop) countdown.stop(); } catch(e){}
      countdown = null;
      try { if (renderer && renderer.setGameOver) renderer.setGameOver(null); } catch(e){}
      stopInputLoop();
      stopRenderer();
      showRoom();
    });
  }

  // Override input loop sending when paused
  const _origStart = startInputLoop;
  // Redefine startInputLoop to respect inputPaused
  startInputLoop = function(){
    if (inputTimer) return;
    const ni = getNetInput();
    if (ni) ni.start();
    const stepMs = Math.floor(1000/60);
    inputTimer = setInterval(()=>{
      const ni = getNetInput();
      const pkt = ni ? ni.poll() : { hold:0, press:0, release:0 };
      const s = getSocket();
      if (!s) return;
      if (inputPaused){
        s.emit('input', { hold:0, press:0, release:0 });
      } else {
        s.emit('input', pkt);
      }
    }, stepMs);
  };
})();
