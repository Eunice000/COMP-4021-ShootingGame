(function(){
  /**
   * GameOver state for the web socket client.
   * Purely client-side visual overlay using GameRenderer.setGameOver().
   * Does not manage sockets or input loops; caller (main.js) controls those.
   */
  function NetGameOverState(renderer){
    this.renderer = renderer || null;
    this.ui = new (window.NetGameOverUI || function(){ return { show:()=>{}, hide:()=>{} }; }) (renderer);
    this._timer = null;
    this._active = false;
  }

  /**
   * Enter GameOver with payload from server.
   * @param {{ winner:number|null, stats:{ p1:{kills:number,deaths:number,pickups:number}, p2:{kills:number,deaths:number,pickups:number} } }} payload
   * @param {number} [showMs] - how long to keep the overlay visible (default 3000ms)
   * @param {Function} [onDone] - callback when overlay duration ends
   */
  NetGameOverState.prototype.enter = function(payload, showMs, onDone){
    this._active = true;
    if (this.ui && this.ui.show) this.ui.show(payload || {});
    const ms = Math.max(500, (showMs|0) || 3000);
    this._timer = setTimeout(()=>{
      if (!this._active) return;
      try { this.exit(); } finally { if (typeof onDone === 'function') onDone(); }
    }, ms);
  };

  NetGameOverState.prototype.exit = function(){
    this._active = false;
    if (this._timer){ clearTimeout(this._timer); this._timer = null; }
    if (this.ui && this.ui.hide) this.ui.hide();
  };

  window.NetGameOverState = NetGameOverState;
})();
