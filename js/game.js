// Game logic with WebSocket multiplayer support
// This file demonstrates how to integrate your existing game with WebSocket

(function() {
  let canvas, ctx;
  let gameRunning = false;
  let isPlayer1 = false; // Will be determined when game starts
  
  // Player states
  let player1 = {
    x: 100,
    y: 300,
    width: 40,
    height: 40,
    facing: 'right',
    velocityX: 0,
    velocityY: 0,
    onGround: false,
    lives: 3,
    color: 'blue'
  };
  
  let player2 = {
    x: 700,
    y: 300,
    width: 40,
    height: 40,
    facing: 'left',
    velocityX: 0,
    velocityY: 0,
    onGround: false,
    lives: 3,
    color: 'red'
  };
  
  // Game state
  let keys = {};
  const GRAVITY = 0.8;
  const JUMP_STRENGTH = -15;
  const MOVE_SPEED = 5;
  const GROUND_Y = 500;
  
  // Initialize game
  function initGame() {
    // Create canvas
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    canvas.style.border = '2px solid black';
    canvas.style.display = 'block';
    canvas.style.margin = '20px auto';
    canvas.style.backgroundColor = '#87CEEB';
    
    // Hide other UI elements
    const pairup = document.getElementById('pairupContainer');
    const login = document.querySelector('.login-container');
    const startGame = document.getElementById('start-game');
    if (pairup) pairup.style.display = 'none';
    if (login) login.style.display = 'none';
    if (startGame) startGame.style.display = 'none';
    
    // Add canvas to body
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    
    // Determine which player you are (first to join is player1)
    const socket = window.gameSocket();
    if (socket) {
      // You can determine player based on who joined first, or use a different method
      // For simplicity, we'll use the order in the room
      isPlayer1 = true; // You can implement logic to determine this
    }
    
    // Set up keyboard listeners
    setupKeyboardListeners();
    
    // Start game loop
    gameRunning = true;
    gameLoop();
    
    // Send ready signal
    if (window.sendPlayerReady) {
      window.sendPlayerReady();
    }
  }
  
  // Set up keyboard event listeners
  function setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
      keys[e.key] = true;
      handleKeyPress(e.key);
    });
    
    document.addEventListener('keyup', (e) => {
      keys[e.key] = false;
      handleKeyRelease(e.key);
    });
  }
  
  // Handle key press
  function handleKeyPress(key) {
    if (!gameRunning) return;
    
    const player = isPlayer1 ? player1 : player2;
    
    switch(key) {
      case 'ArrowLeft':
        player.velocityX = -MOVE_SPEED;
        player.facing = 'left';
        // Send input to server
        window.sendPlayerInput('move', 'left');
        break;
        
      case 'ArrowRight':
        player.velocityX = MOVE_SPEED;
        player.facing = 'right';
        window.sendPlayerInput('move', 'right');
        break;
        
      case 'ArrowUp':
        if (player.onGround) {
          player.velocityY = JUMP_STRENGTH;
          player.onGround = false;
          window.sendPlayerInput('jump', true);
        }
        break;
        
      case 'ArrowDown':
        // Drop down (if on platform)
        window.sendPlayerInput('drop', true);
        break;
        
      case 'z':
      case 'Z':
        // Shoot
        createBullet(player);
        window.sendPlayerInput('shoot', true);
        break;
    }
  }
  
  // Handle key release
  function handleKeyRelease(key) {
    if (!gameRunning) return;
    
    const player = isPlayer1 ? player1 : player2;
    
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      player.velocityX = 0;
      window.sendPlayerInput('stop', true);
    }
  }
  
  // Handle opponent input received from WebSocket
  window.handleOpponentInput = function(data) {
    if (!gameRunning) return;
    
    const opponent = isPlayer1 ? player2 : player1;
    const input = data.input;
    
    switch(input.type) {
      case 'move':
        if (input.value === 'left') {
          opponent.velocityX = -MOVE_SPEED;
          opponent.facing = 'left';
        } else if (input.value === 'right') {
          opponent.velocityX = MOVE_SPEED;
          opponent.facing = 'right';
        }
        break;
        
      case 'jump':
        if (input.value && opponent.onGround) {
          opponent.velocityY = JUMP_STRENGTH;
          opponent.onGround = false;
        }
        break;
        
      case 'stop':
        opponent.velocityX = 0;
        break;
        
      case 'shoot':
        if (input.value) {
          createBullet(opponent);
        }
        break;
        
      case 'drop':
        // Handle drop
        break;
    }
  };
  
  // Create bullet (simple example)
  let bullets = [];
  function createBullet(player) {
    bullets.push({
      x: player.facing === 'right' ? player.x + player.width : player.x,
      y: player.y + player.height / 2,
      vx: player.facing === 'right' ? 10 : -10,
      owner: player === player1 ? 'player1' : 'player2',
      width: 10,
      height: 5
    });
  }
  
  // Update game state
  function update() {
    // Update player 1
    updatePlayer(player1);
    
    // Update player 2
    updatePlayer(player2);
    
    // Update bullets
    bullets = bullets.filter(bullet => {
      bullet.x += bullet.vx;
      
      // Check collision with players
      if (bullet.owner === 'player1') {
        if (checkCollision(bullet, player2)) {
          player2.lives--;
          return false; // Remove bullet
        }
      } else {
        if (checkCollision(bullet, player1)) {
          player1.lives--;
          return false; // Remove bullet
        }
      }
      
      // Remove if off screen
      return bullet.x > 0 && bullet.x < canvas.width;
    });
  }
  
  // Update individual player
  function updatePlayer(player) {
    // Apply gravity
    player.velocityY += GRAVITY;
    
    // Update position
    player.x += player.velocityX;
    player.y += player.velocityY;
    
    // Ground collision
    if (player.y + player.height >= GROUND_Y) {
      player.y = GROUND_Y - player.height;
      player.velocityY = 0;
      player.onGround = true;
    }
    
    // Boundary checks
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
  }
  
  // Check collision between two objects
  function checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
  }
  
  // Render game
  function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw ground
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    
    // Draw player 1
    ctx.fillStyle = player1.color;
    ctx.fillRect(player1.x, player1.y, player1.width, player1.height);
    
    // Draw player 2
    ctx.fillStyle = player2.color;
    ctx.fillRect(player2.x, player2.y, player2.width, player2.height);
    
    // Draw bullets
    ctx.fillStyle = 'yellow';
    bullets.forEach(bullet => {
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
    });
    
    // Draw UI
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    ctx.fillText(`Player 1 Lives: ${player1.lives}`, 10, 30);
    ctx.fillText(`Player 2 Lives: ${player2.lives}`, 10, 60);
  }
  
  // Game loop
  function gameLoop() {
    if (!gameRunning) return;
    
    update();
    render();
    
    requestAnimationFrame(gameLoop);
  }
  
  // Make startGame available globally (called when both players ready)
  window.startGame = initGame;
  
})();

