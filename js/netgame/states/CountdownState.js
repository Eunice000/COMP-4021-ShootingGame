(function(){
  /**
   * Lightweight visual countdown overlay for the online (web socket) client.
   * It displays 3 → 2 → 1 → GO! over the canvas without blocking input or snapshots.
   *
   * Usage:
   *   const cs = new window.NetCountdownState(document.getElementById('gameView'));
   *   cs.start(3);
   */
  function NetCountdownState(container){
    this.container = container || null;
    this.overlay = null;
    this.timerId = null;
    this.textEl = null;
  }

  NetCountdownState.prototype._ensureOverlay = function(){
    if (!this.container) return null;
    if (this.overlay) return this.overlay;
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.inset = '0';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.pointerEvents = 'none';
    // Text
    const txt = document.createElement('div');
    txt.style.font = 'bold 120px Segoe UI, Arial, sans-serif';
    txt.style.color = '#FFFFFF';
    txt.style.textShadow = '0 2px 6px rgba(0,0,0,0.6)';
    txt.style.userSelect = 'none';
    txt.setAttribute('aria-live','polite');
    div.appendChild(txt);
    this.container.appendChild(div);
    this.overlay = div;
    this.textEl = txt;
    return div;
  };

  NetCountdownState.prototype._setText = function(text){
    if (!this._ensureOverlay()) return;
    this.textEl.textContent = text || '';
    this.overlay.style.opacity = text ? '1' : '0';
  };

  // Server-driven sync: directly show current seconds or GO!
  NetCountdownState.prototype.sync = function(seconds){
    if (seconds > 0){
      this._setText(String(seconds|0));
    } else {
      this._setText('GO!');
      // auto hide shortly after
      const self = this;
      if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
      this.timerId = setTimeout(function(){ self.stop(); }, 500);
    }
  };

  NetCountdownState.prototype.start = function(seconds){
    const total = Math.max(1, Math.floor(seconds||3));
    this._ensureOverlay();
    let left = total;
    this._setText(String(left));
    const step = ()=>{
      if (left > 1){
        left -= 1;
        this._setText(String(left));
        this.timerId = setTimeout(step, 1000);
      } else if (left === 1){
        left = 0;
        this._setText('GO!');
        this.timerId = setTimeout(()=>this.stop(), 500);
      }
    };
    this.timerId = setTimeout(step, 1000);
  };

  NetCountdownState.prototype.stop = function(){
    if (this.timerId){ clearTimeout(this.timerId); this.timerId = null; }
    if (this.overlay && this.overlay.parentNode){
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null; this.textEl = null;
  };

  window.NetCountdownState = NetCountdownState;
})();
