(function(){
  /**
   * Thin UI adapter for the netgame GameOverState.
   * The actual drawing is implemented inside GameRenderer._drawGameOver().
   * This class only shapes the data and forwards to the renderer via setGameOver().
   */
  function NetGameOverUI(renderer){
    this.renderer = renderer || null;
  }

  /**
   * Update the renderer overlay model.
   * @param {{ winner:number|null, stats:{ p1:{kills:number,deaths:number,pickups:number}, p2:{kills:number,deaths:number,pickups:number} } }} model
   */
  NetGameOverUI.prototype.show = function(model){
    if (!this.renderer || typeof this.renderer.setGameOver !== 'function') return;
    this.renderer.setGameOver({
      winner: (typeof model.winner === 'number') ? model.winner : -1,
      stats: model.stats || { p1:{kills:0,deaths:0,pickups:0}, p2:{kills:0,deaths:0,pickups:0} }
    });
  };

  NetGameOverUI.prototype.hide = function(){
    if (!this.renderer || typeof this.renderer.setGameOver !== 'function') return;
    this.renderer.setGameOver(null);
  };

  window.NetGameOverUI = NetGameOverUI;
})();
