const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const state = { players: [], bullets: [], explosions: [], powerCubes: [], walls: [], pickup: null };
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
  state.explosions = payload.explosions || [];
  state.powerCubes = payload.powerCubes || [];
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
    } else if (bullet.type === 'tnt') {
      ctx.fillStyle = '#dc2626';
    } else {
      ctx.fillStyle = '#ffd966';
    }
    const radius = bullet.radius || 5;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  state.explosions.forEach(explosion => {
    ctx.fillStyle = 'rgba(248, 113, 113, 0.35)';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();
  });

  state.powerCubes.forEach(cube => {
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(cube.x - 8, cube.y - 8, 16, 16);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.strokeRect(cube.x - 8, cube.y - 8, 16, 16);
  });

  if (state.pickup) {
    const label = state.pickup.type === 'heal'
      ? '+'
      : state.pickup.type === 'bazooka'
      ? 'B'
      : state.pickup.type === 'sniper'
      ? 'S'
      : state.pickup.type === 'shield'
      ? 'SH'
      : state.pickup.type === 'tnt'
      ? 'T'
      : '?';
    const color = state.pickup.type === 'heal'
      ? '#34d399'
      : state.pickup.type === 'bazooka'
      ? '#f59e0b'
      : state.pickup.type === 'sniper'
      ? '#60a5fa'
      : state.pickup.type === 'shield'
      ? '#a78bfa'
      : state.pickup.type === 'tnt'
      ? '#ef4444'
      : '#a78bfa';
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
    ctx.fillRect(barX, barY, (barWidth * player.health) / player.maxHealth, barHeight);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    if (player.powerCubes > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.powerCubes, player.x, player.y - 42);
    }

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
    ctx.fillText(`Health: ${local.health}/${local.maxHealth}`, 16, 24);
    ctx.fillText(`Cubes: ${local.powerCubes}`, 16, 46);
    if (local.powerup) {
      const display = local.powerup === 'heal'
        ? 'Heal'
        : local.powerup === 'bazooka'
        ? 'Bazooka'
        : local.powerup === 'shield'
        ? 'Shield'
        : local.powerup === 'tnt'
        ? 'TNT'
        : 'Sniper';
      ctx.fillText(`Power: ${display}`, 16, 68);
    }
  }

  requestAnimationFrame(draw);
}

setInterval(sendInput, 50);
requestAnimationFrame(draw);
