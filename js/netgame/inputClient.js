// Net input capture for online mode (both players share Arrow keys + Z shoot + L cheat)
(function(){
  const LEFT=1, RIGHT=2, UP=4, DOWN=8, FIRE=16, CHEAT=32;

  let hold = 0;
  let press = 0;
  let release = 0;
  let active = false;

  function bitForCode(code){
    switch(code){
      case 'ArrowLeft': return LEFT;
      case 'ArrowRight': return RIGHT;
      case 'ArrowUp': return UP;
      case 'ArrowDown': return DOWN;
      case 'KeyZ': return FIRE;
      case 'KeyL': return CHEAT;
      default: return 0;
    }
  }

  function onKeyDown(e){
    // Ignore when typing in inputs
    const t = e.target;
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    const bit = bitForCode(e.code);
    if (!bit) return;
    if ((hold & bit) === 0){
      hold |= bit;
      // only set edge for buttons where press matters (UP/FIRE/CHEAT). Movement edges are optional.
      press |= bit;
    }
    if (bit) {
      // Prevent page scroll on arrows/space-like
      e.preventDefault();
    }
  }

  function onKeyUp(e){
    const t = e.target;
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    const bit = bitForCode(e.code);
    if (!bit) return;
    if ((hold & bit) !== 0){
      hold &= ~bit;
      release |= bit;
    }
    if (bit) {
      e.preventDefault();
    }
  }

  function start(){
    if (active) return;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    active = true;
  }

  function stop(){
    if (!active) return;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    active = false;
    hold = press = release = 0;
  }

  function poll(){
    const out = { hold, press, release };
    // clear edges after each poll
    press = 0; release = 0;
    return out;
  }

  window.NetInput = {
    start,
    stop,
    poll,
    consts: { LEFT, RIGHT, UP, DOWN, FIRE, CHEAT }
  };
})();
