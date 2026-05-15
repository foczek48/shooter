const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const state = { players: [], bullets: [] };
const input = { up: false, down: false, left: false, right: false, aimX: 400, aimY: 300, shoot: false };
let localId = null;

function sendInput() {
  socket.emit('input', input);
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = 800 * ratio;
  canvas.height = 600 * ratio;
  canvas.style.width = '800px';
  canvas.style.height = '600px';
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

window.addEventListener('keydown', event => {
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp': input.up = true; break;
    case 'KeyS':
    case 'ArrowDown': input.down = true; break;
    case 'KeyA':
    case 'ArrowLeft': input.left = true; break;
    case 'KeyD':
    case 'ArrowRight': input.right = true; break;
  }
});

window.addEventListener('keyup', event => {
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp': input.up = false; break;
    case 'KeyS':
    case 'ArrowDown': input.down = false; break;
    case 'KeyA':
    case 'ArrowLeft': input.left = false; break;
    case 'KeyD':
    case 'ArrowRight': input.right = false; break;
  }
});

canvas.addEventListener('mousemove', event => {
  const rect = canvas.getBoundingClientRect();
  input.aimX = event.clientX - rect.left;
  input.aimY = event.clientY - rect.top;
});

canvas.addEventListener('mousedown', () => {
  input.shoot = true;
});

canvas.addEventListener('mouseup', () => {
  input.shoot = false;
});

socket.on('connected', payload => {
  localId = payload.id;
  statusEl.textContent = `Connected as ${localId.slice(0, 6)}`;
});

socket.on('state', payload => {
  state.players = payload.players;
  state.bullets = payload.bullets;
});

socket.on('playerJoined', () => {
  statusEl.textContent = `Player joined`;
});

socket.on('playerLeft', () => {
  statusEl.textContent = `Player left`;
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 800, 600);

  state.bullets.forEach(bullet => {
    ctx.fillStyle = '#ffd966';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  state.players.forEach(player => {
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y - 28);

    if (player.id === localId) {
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(input.aimX, input.aimY);
      ctx.stroke();
    }
  });

  requestAnimationFrame(draw);
}

setInterval(sendInput, 50);
requestAnimationFrame(draw);
