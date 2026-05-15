const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const state = { players: [], bullets: [], walls: [], pickup: null };
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
  state.walls = payload.walls || [];
  state.pickup = payload.pickup || null;
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

  state.walls.forEach(wall => {
    ctx.fillStyle = '#334155';
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
  });

  state.bullets.forEach(bullet => {
    if (bullet.type === 'bazooka') {
      ctx.fillStyle = '#f97316';
    } else if (bullet.type === 'sniper') {
      ctx.fillStyle = '#60a5fa';
    } else {
      ctx.fillStyle = '#ffd966';
    }
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (state.pickup) {
    const label = state.pickup.type === 'heal' ? '+' : state.pickup.type === 'bazooka' ? 'B' : 'S';
    const color = state.pickup.type === 'heal' ? '#34d399' : state.pickup.type === 'bazooka' ? '#f59e0b' : '#60a5fa';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(state.pickup.x, state.pickup.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, state.pickup.x, state.pickup.y + 6);
  }

  state.players.forEach(player => {
    const barWidth = 36;
    const barHeight = 6;
    const barX = player.x - barWidth / 2;
    const barY = player.y - 34;

    ctx.fillStyle = '#111';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(barX, barY, (barWidth * player.health) / 100, barHeight);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

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
    ctx.fillText(player.name, player.x, player.y - 48);

    if (player.id === localId) {
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(input.aimX, input.aimY);
      ctx.stroke();
    }
  });

  const local = state.players.find(p => p.id === localId);
  if (local) {
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Health: ${local.health}`, 16, 24);
    if (local.powerup) {
      const display = local.powerup === 'heal' ? 'Heal' : local.powerup === 'bazooka' ? 'Bazooka' : 'Sniper';
      ctx.fillText(`Power: ${display}`, 16, 46);
    }
  }

  requestAnimationFrame(draw);
}

setInterval(sendInput, 50);
requestAnimationFrame(draw);
