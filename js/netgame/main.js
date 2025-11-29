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
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
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
      startInputLoop();
    });
    socket.on('snapshot', (snap)=>{
      if (renderer) renderer.setSnapshot(snap);
    });
    socket.on('gameOver', ()=>{
      stopInputLoop();
      stopRenderer();
      // Return to room view automatically
      showRoom();
    });
    socket.on('forceLeave', ()=>{
      // In case forceLeave is emitted from other flows, ensure cleanup
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
      stopInputLoop();
      stopRenderer();
      showRoom();
    });
  }
})();
