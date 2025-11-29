
(function(){
  const WORLD_W = 1920;
  const WORLD_H = 1080;
  // Border styling around the world view
  const BORDER_SCALE = 0.010; // fraction of min(canvasWidth, canvasHeight) — halved
  const BORDER_MIN = 7;       // minimum border thickness in pixels — halved
  const RADIUS_CAP = 32;      // maximum corner radius in pixels

  function GameRenderer(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.latest = null; // latest snapshot
    this.running = false;
    this._raf = null;
    // Track last snapshot bullets to detect new spawns for SFX
    this._lastBulletsCount = 0;
    // Optional art assets
    this.images = {
      bg: null,
      p1: null,
      p2: null,
      powerUps: {}, // id -> HTMLImageElement
      guns: {}      // id -> { img: HTMLImageElement, offset: {x:number,y:number} }
    };
    this._initAssets();
    // Audio: simple pool for overlapping gun shot sounds
    this._initAudio();
    // Game over overlay model
    this.gameOver = null; // { winner:number|null, stats:{p1:{kills,deaths,pickups},p2:{...}} }
  }

  function roundedRectPath(ctx, x, y, w, h, r){
    const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
  }

  GameRenderer.prototype.setSnapshot = function(snap){
    // Detect new bullet spawns by comparing counts
    try {
      const prevCount = (this.latest && Array.isArray(this.latest.bullets)) ? this.latest.bullets.length : 0;
      const nextCount = (snap && Array.isArray(snap.bullets)) ? snap.bullets.length : 0;
      const spawned = Math.max(0, nextCount - prevCount);
      if (spawned > 0) this._playGunShot(spawned);
    } catch(e) { /* ignore SFX errors */ }
    this.latest = snap;
  };
  GameRenderer.prototype.setGameOver = function(data){
    this.gameOver = data || null;
  };

  GameRenderer.prototype.start = function(){
    if (this.running) return;
    this.running = true;
    const loop = ()=>{
      if (!this.running) return;
      this.render();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  };

  GameRenderer.prototype.stop = function(){
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  GameRenderer.prototype.render = function(){
    const ctx = this.ctx;
    const cw = this.canvas.width;   // backing store size (we set to CSS*DPR)
    const ch = this.canvas.height;

    // Letterbox scale to keep 1920x1080 world centered
    const scale = Math.min(cw / WORLD_W, ch / WORLD_H);
    const drawW = WORLD_W * scale;
    const drawH = WORLD_H * scale;
    const offX = Math.floor((cw - drawW) / 2);
    const offY = Math.floor((ch - drawH) / 2);

    // Clear entire canvas
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cw,ch);

    // Do not draw opaque letterbox bars; keep outside area transparent so the page background shows through

    // Draw a black border: outer rounded-rect ring around the world rectangle
    // Compute world rectangle in screen space
    const border = Math.max(BORDER_MIN, Math.floor(Math.min(cw, ch) * BORDER_SCALE));
    const radius = Math.min(RADIUS_CAP, Math.floor(border * 2));
    const outerX = offX - border;
    const outerY = offY - border;
    const outerW = drawW + border * 2;
    const outerH = drawH + border * 2;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    roundedRectPath(ctx, outerX, outerY, outerW, outerH, radius);
    // Cut out the inner (world) rectangle so only the ring remains
    ctx.rect(offX, offY, drawW, drawH);
    try {
      ctx.fill('evenodd');
    } catch(e) {
      // Fallback if evenodd is unsupported: draw outer, then punch inner with composite
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(offX, offY, drawW, drawH);
      ctx.restore();
    }
    ctx.restore();

    // Transform to world space centered
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    // Clip all world rendering strictly to the world rectangle so nothing draws outside
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();

    // World background (use snapshot background if provided)
    const snap = this.latest;
    const bgColor = (snap && snap.colors && snap.colors.canvas) || '#FFFFFF';
    // Prefer dynamic background path from server snapshot; fall back to preloaded image or color
    const bgPath = snap && snap.background;
    if (bgPath) {
      // Cache by URL to avoid reloading every frame
      if (!this.images.bg || this.images.bg._src !== bgPath) {
        const img = new Image();
        img.src = bgPath;
        img._src = bgPath;
        this.images.bg = img;
      }
    }
    if (this.images.bg && this.images.bg.complete) {
      ctx.drawImage(this.images.bg, 0, 0, WORLD_W, WORLD_H);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    // Draw background image not supported yet; placeholder solid bg

    // Do NOT render platform rectangles. Platforms are baked into the background image.

    if (snap){
      // Draw players (match prototype scale 80x120)
      const players = snap.players || [];
      for (let i=0;i<players.length;i++){
        const p = players[i];
        if (!p) continue;
        const px = (p.x|0); const py = (p.y|0);
        const w = (p.w|0) || 80; const h = (p.h|0) || 120;
        const img = (i===0 ? this.images.p1 : this.images.p2);
        if (img && img.complete) {
          // Draw sprite aligned to top-left of physics box; flip horizontally if facing left
          const drawX = px;
          const drawY = py;
          if (p.facing && p.facing < 0) {
            ctx.save();
            ctx.translate(drawX + w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, drawY, w, h);
            ctx.restore();
          } else {
            ctx.drawImage(img, drawX, drawY, w, h);
          }
        } else {
          const color = (snap.colors && (i===0 ? snap.colors.p1 : snap.colors.p2)) || (i===0 ? '#FF4040' : '#99CCFF');
          ctx.fillStyle = color;
          ctx.fillRect(px, py, w, h);
        }
        // Draw current gun sprite from GunsData if available.
        // Requirements:
        // - Scale real-gun sprites to 2x
        // - Place the gun so that its grip top aligns just below player's mid-height
        // - Keep the gun about 3px inside the player edge on the facing side
        if (p.gun){
          const art = this._getGunArt(p.gun);
          if (art && art.img && art.img.complete){
            const srcW = (art.img.naturalWidth || art.img.width || 40);
            const srcH = (art.img.naturalHeight || art.img.height || 20);
            const SCALE = 2; // render at double size
            const gw = Math.round(srcW * SCALE);
            const gh = Math.round(srcH * SCALE);
            const off = art.offset || {x:0,y:0};
            const anchorGripTop = (typeof art.anchorGripTop === 'number') ? art.anchorGripTop : Math.round(srcH/2);
            // Desired world Y for the grip top is just below the player's vertical middle
            const desiredGripTop = py + Math.floor(h/2) + 1;
            // Convert anchor from source pixels to world with scaling
            const gy = desiredGripTop - Math.floor(anchorGripTop * SCALE) + (off.y|0);
            const INSET = 3;
            if (p.facing && p.facing < 0){
              // Facing left: flip horizontally around the player's left edge (px),
              // and position so the gun sits ~3px inside the player box.
              ctx.save();
              ctx.translate(px, 0);
              ctx.scale(-1, 1);
              // After transform, worldX = px - gxLocal - gw; target worldX = px + INSET + off.x
              // => gxLocal = - (gw + INSET - off.x)
              const gxLocal = -((gw + INSET) - (off.x|0));
              ctx.drawImage(art.img, gxLocal, gy, gw, gh);
              ctx.restore();
            } else {
              // Facing right: draw so the gun sits ~3px inside the right edge
              const gx = (px + w - INSET - gw) + (off.x|0);
              ctx.drawImage(art.img, gx, gy, gw, gh);
            }
          }
        }
        // Shield visual: blue circle around player when shield is active
        if ((p.shieldMs|0) > 0){
          const cx = px + w/2;
          const cy = py + h/2;
          const r = Math.max(w, h) * 0.65;
          ctx.save();
          ctx.lineWidth = 6;
          ctx.strokeStyle = 'rgba(80,160,255,0.9)';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI*2);
          ctx.stroke();
          ctx.restore();
        }
        // facing indicator
        ctx.fillStyle = '#111';
        const indX = px + (p.facing>0 ? (w - 2) : -2);
        ctx.fillRect(indX, py + 14, 4, 14);

        // lives text
        ctx.fillStyle = '#111';
        ctx.font = '22px monospace';
        ctx.fillText('L'+(p.lives||0), px, py - 8);
      }

      // Draw bullets
      const bullets = snap.bullets || [];
      ctx.fillStyle = '#222';
      for (let i=0;i<bullets.length;i++){
        const b = bullets[i];
        if (!b) continue;
        ctx.fillRect((b.x|0)-6, (b.y|0)-2, 12, 4);
      }

      // Draw power-ups using sprite from PowerUpsData.js when available
      if (Array.isArray(snap.powerUps)){
        for (let i=0;i<snap.powerUps.length;i++){
          const pu = snap.powerUps[i];
          if (!pu) continue;
          const img = pu.type && this.images.powerUps ? this.images.powerUps[pu.type] : null;
          const w = (pu.w|0) || 40, h = (pu.h|0) || 40;
          const x = (pu.x|0), y = (pu.y|0);
          if (img && img.complete){
            ctx.drawImage(img, x, y, w, h);
          } else {
            ctx.fillStyle = '#FFC107';
            ctx.fillRect(x, y, w, h);
          }
        }
      }
    }

    // Remove world clip before drawing UI/overlays in screen space
    ctx.restore();

    // UI in screen space: time left top-center
    ctx.setTransform(1,0,0,1,0,0);
    this._drawHUD(ctx, cw, ch, offY);

    // Game Over overlay if present
    if (this.gameOver){
      this._drawGameOver(ctx, cw, ch, this.gameOver);
    }
  };

  GameRenderer.prototype._initAssets = function(){
    try {
      const GD = window.GameData || {};
      // Players
      const players = Array.isArray(GD.players) ? GD.players : [];
      const p1 = players.find(p => p && p.id === 'p1');
      const p2 = players.find(p => p && p.id === 'p2');
      if (p1 && p1.sprite){ const i1 = new Image(); i1.src = p1.sprite; this.images.p1 = i1; }
      if (p2 && p2.sprite){ const i2 = new Image(); i2.src = p2.sprite; this.images.p2 = i2; }
      // PowerUps
      const pus = Array.isArray(GD.powerUps) ? GD.powerUps : [];
      for (let i=0;i<pus.length;i++){
        const pu = pus[i];
        if (pu && pu.id && pu.sprite){ const img = new Image(); img.src = pu.sprite; this.images.powerUps[pu.id] = img; }
      }
      // Guns
      const guns = Array.isArray(GD.guns) ? GD.guns : [];
      for (let i=0;i<guns.length;i++){
        const g = guns[i];
        if (!g || typeof g.id !== 'number' || !g.sprite) continue;
        const img = new Image(); img.src = g.sprite;
        this.images.guns[g.id] = {
          img,
          offset: (g.offset || {x:0,y:0}),
          // Optional per-gun anchor in source pixels: distance from image top
          // to the top of the pistol/weapon grip. Used to align to player mid-height.
          anchorGripTop: (typeof g.anchorGripTop === 'number') ? g.anchorGripTop : undefined
        };
      }
    } catch(e) {
      // Ignore asset errors in classroom setting
    }
  };

  GameRenderer.prototype._initAudio = function(){
    try {
      const src = 'sound_effect/gun_shot.mp3';
      const poolSize = 6;
      const pool = [];
      for (let i=0;i<poolSize;i++){
        const a = new Audio(src);
        a.preload = 'auto';
        a.volume = 0.5; // comfortable default
        pool.push(a);
      }
      this._sfx = { gun: { pool, idx: 0 } };
    } catch(e) {
      this._sfx = { gun: { pool: [], idx: 0 } };
    }
  };

  GameRenderer.prototype._playGunShot = function(times){
    const gun = this._sfx && this._sfx.gun;
    if (!gun || !Array.isArray(gun.pool) || gun.pool.length === 0) return;
    const n = Math.max(1, times|0);
    for (let k=0;k<n;k++){
      const a = gun.pool[gun.idx % gun.pool.length];
      gun.idx = (gun.idx + 1) % gun.pool.length;
      try {
        // restart and play
        a.currentTime = 0;
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(()=>{});
      } catch(e) { /* ignore */ }
    }
  };

  GameRenderer.prototype._getGunArt = function(gunSnap){
    // Prefer by id
    if (gunSnap && typeof gunSnap.id === 'number'){
      return this.images.guns[gunSnap.id] || null;
    }
    // Fallback by name or type
    const guns = this.images.guns;
    if (!guns) return null;
    const keys = Object.keys(guns);
    for (let k=0;k<keys.length;k++){
      const entry = guns[keys[k]];
      // No reverse map of names/types; cannot reliably match
    }
    // Default to pistol (id 1) if present
    return guns[1] || null;
  };

  // ---- UI drawing (mirrors prototype GameplayUI and GameOverUi in spirit) ----
  GameRenderer.prototype._drawHUD = function(ctx, cw, ch, offY){
    const snap = this.latest || {};
    const players = snap.players || [];
    const p1 = players[0] || {}; const p2 = players[1] || {};
    // Colors similar to config
    const cP1 = '#FF4040';
    const cP2 = '#99CCFF';
    const cUI = '#111';

    // Round timer big at top center (prototype style) — hidden when game over shows its own timer
    ctx.save();
    ctx.font = '80px Segoe UI, Arial, sans-serif, monospace';
    ctx.fillStyle = cUI;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const t = Math.max(0, Math.ceil(snap.timeLeft||0)) + '';
    if (!this.gameOver){
      ctx.fillText(t, Math.floor(cw/2), 16);
    }
    ctx.restore();

    const pad = 16; const panelW = 240; const panelH = 65;
    // Panel helper
    const drawPanel = (x,y,color)=>{
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x,y,panelW,panelH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x+0.5,y+0.5,panelW-1,panelH-1);
      ctx.restore();
    };
    const drawText = (text,x,y,align,color,font)=>{
      ctx.save(); ctx.font = font || '20px Segoe UI, Arial, sans-serif'; ctx.fillStyle = color||cUI; ctx.textAlign = align||'left'; ctx.textBaseline='top'; ctx.fillText(text,x,y); ctx.restore();
    };
    // Left (P1)
    drawPanel(pad, pad, cP1);
    drawText('P1', pad+10, pad+8, 'left', cP1, '22px Segoe UI, Arial, sans-serif');
    drawText('Lives: ' + ((p1.lives|0)||0), pad+60, pad+8, 'left', cUI);
    const g1 = p1.gun || {}; const wname1 = g1.name || 'pistol'; const ammo1 = (typeof g1.ammo==='number')? g1.ammo : '—';
    drawText('Gun: ' + wname1 + '  Ammo: ' + ammo1, pad+10, pad+36, 'left', cUI);
    // Right (P2)
    const rx = cw - pad - panelW;
    drawPanel(rx, pad, cP2);
    drawText('P2', rx + panelW - 10, pad+8, 'right', cP2, '22px Segoe UI, Arial, sans-serif');
    drawText('Lives: ' + ((p2.lives|0)||0), rx + panelW - 60, pad+8, 'right', cUI);
    const g2 = p2.gun || {}; const wname2 = g2.name || 'pistol'; const ammo2 = (typeof g2.ammo==='number')? g2.ammo : '—';
    drawText('Gun: ' + wname2 + '  Ammo: ' + ammo2, rx + panelW - 10, pad+36, 'right', cUI);
  };

  GameRenderer.prototype._drawGameOver = function(ctx, cw, ch, model){
    // Dim
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0,0,cw,ch); ctx.restore();
    // Title
    const winner = (typeof model.winner === 'number') ? model.winner : -1;
    const title = (winner === -1) ? 'Draw!' : (winner === 0 ? 'Player 1 Wins!' : 'Player 2 Wins!');
    ctx.save(); ctx.font = '84px Segoe UI, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(title, cw/2, ch*0.20);
    ctx.restore();
    // Stats panel
    const panelW = 700, panelH = 180; const px = Math.floor((cw-panelW)/2); const py = Math.floor(ch*0.28);
    ctx.save(); ctx.globalAlpha=0.85; ctx.fillStyle='#fff'; ctx.fillRect(px,py,panelW,panelH); ctx.globalAlpha=1; ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.strokeRect(px+0.5,py+0.5,panelW-1,panelH-1); ctx.restore();
    // Headers
    const drawHdr=(text,x)=>{ ctx.save(); ctx.font='24px Segoe UI, Arial, sans-serif'; ctx.fillStyle='#111'; ctx.fillText(text,x,py+30); ctx.restore(); };
    drawHdr('Player', px+30); drawHdr('Kills', px+260); drawHdr('Deaths', px+360); drawHdr('K/D', px+480); drawHdr('Pickups', px+560);
    const s1 = (model.stats && model.stats.p1) || {kills:0,deaths:0,pickups:0};
    const s2 = (model.stats && model.stats.p2) || {kills:0,deaths:0,pickups:0};
    const rows = (winner===0) ? [{l:'P1',c:'#FF4040',s:s1},{l:'P2',c:'#99CCFF',s:s2}] : (winner===1) ? [{l:'P2',c:'#99CCFF',s:s2},{l:'P1',c:'#FF4040',s:s1}] : [{l:'P1',c:'#FF4040',s:s1},{l:'P2',c:'#99CCFF',s:s2}];
    const kd = (k,d)=>{ const deaths=d|0; const kills=k|0; if (deaths===0) return kills>0?'∞':'0.00'; return (Math.round((kills/deaths)*100)/100).toFixed(2); };
    for (let r=0;r<rows.length;r++){
      const rowY = py+70 + r*80; const row = rows[r];
      ctx.fillStyle=row.c; ctx.fillRect(px+30,rowY-18,20,20);
      ctx.save(); ctx.font='28px Segoe UI, Arial, sans-serif'; ctx.fillStyle='#111'; ctx.fillText(row.l, px+60,rowY); ctx.restore();
      const drawVal=(text,x)=>{ ctx.save(); ctx.font='28px Segoe UI, Arial, sans-serif'; ctx.fillStyle='#111'; ctx.fillText(text,x,rowY); ctx.restore(); };
      drawVal(String(row.s.kills|0), px+270);
      drawVal(String(row.s.deaths|0), px+380);
      drawVal(kd(row.s.kills,row.s.deaths), px+480);
      drawVal(String(row.s.pickups|0), px+580);
      // Rank
      const rankText = (winner === -1) ? (r===0?'T-1':'T-1') : (r===0?'1st':'2nd');
      ctx.save(); ctx.font='24px Segoe UI, Arial, sans-serif'; ctx.fillStyle='#555'; ctx.fillText(rankText, px+panelW-80, rowY); ctx.restore();
    }
    // Rematch boxes and countdown at top-middle
    const rem = model && model.rematch;
    const remainingMs = rem && typeof rem.remainingMs === 'number' ? rem.remainingMs : null;
    if (remainingMs !== null){
      const sec = Math.max(0, Math.ceil(remainingMs/1000));
      ctx.save(); ctx.font='64px Segoe UI, Arial, sans-serif, monospace'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillText(String(sec), cw/2, 16);
      ctx.restore();
    }
    // Two decision boxes under the stats panel
    const boxW = 300, boxH = 80; const gap = 40;
    const bx1 = Math.floor(cw/2 - gap/2 - boxW);
    const bx2 = Math.floor(cw/2 + gap/2);
    const by = py + panelH + 40;
    const drawChoiceBox = (x, y, label, state, color)=>{
      ctx.save();
      ctx.globalAlpha = 0.9; ctx.fillStyle='#fff'; ctx.fillRect(x,y,boxW,boxH); ctx.globalAlpha=1; ctx.strokeStyle=color; ctx.lineWidth=3; ctx.strokeRect(x+0.5,y+0.5,boxW-1,boxH-1);
      ctx.font='22px Segoe UI, Arial, sans-serif'; ctx.fillStyle='#111'; ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText(label, x+14, y+10);
      let msg = 'Waiting…';
      if (state === 'ready') msg = 'Ready!'; else if (state === 'left') msg = 'Left';
      ctx.font='28px Segoe UI, Arial, sans-serif'; ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillText(msg, x+boxW-14, y+boxH-12);
      ctx.restore();
    };
    const sP1 = rem && rem.p1 || 'waiting';
    const sP2 = rem && rem.p2 || 'waiting';
    drawChoiceBox(bx1, by, 'Player 1', sP1, '#FF4040');
    drawChoiceBox(bx2, by, 'Player 2', sP2, '#99CCFF');
    // Small legend at bottom
    ctx.save(); ctx.font='20px Segoe UI, Arial, sans-serif'; ctx.fillStyle='#fff'; ctx.textAlign='center';
    ctx.fillText('Press Z to rematch or X to return to room', cw/2, by + boxH + 36);
    ctx.restore();
  };

  window.GameRenderer = GameRenderer;
})();
