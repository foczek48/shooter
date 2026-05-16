const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const serverStatusEl = document.getElementById('serverStatus');
const occupancyEl = document.getElementById('occupancy');
const eventLogEl = document.getElementById('eventLog');

const state = { players: [], bullets: [], explosions: [], powerCubes: [], walls: [], pickup: null };
const input = { up: false, down: false, left: false, right: false, aimX: 400, aimY: 300, shoot: false };
let localId = null;

function sendInput() {
  socket.emit('input', input);
}

function sendEmote(emoji, logText) {
  socket.emit('setEmote', { emoji, text: logText });
  statusEl.textContent = `Selected emote ${emoji}`;
  const localPlayer = state.players.find(p => p.id === localId);
  if (localPlayer) {
    addEventLog(`Player ${localPlayer.name} ${logText}`);
  }
}

function setName(name) {
  socket.emit('setName', { name });
  statusEl.textContent = `Name set to ${name}`;
}

const emoteButtons = document.querySelectorAll('.emote-button');
emoteButtons.forEach(button => {
  button.addEventListener('click', () => sendEmote(button.dataset.emote, button.dataset.logData));
});

const nameInput = document.getElementById('nameInput');
const setNameButton = document.getElementById('setNameButton');
if (setNameButton && nameInput) {
  setNameButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name) setName(name);
  });
  nameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      const name = nameInput.value.trim();
      if (name) setName(name);
    }
  });
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = 800 * ratio;
  canvas.height = 600 * ratio;
  canvas.style.width = '800px';
  canvas.style.height = '600px';
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function addEventLog(message) {
  if (!eventLogEl) return;
  const item = document.createElement('li');
  item.textContent = message;
  eventLogEl.prepend(item);
  while (eventLogEl.children.length > 8) {
    eventLogEl.removeChild(eventLogEl.lastChild);
  }
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
  serverStatusEl.textContent = 'Connected';
  addEventLog(`Connected as ${localId.slice(0, 6)}`);
});

socket.on('state', payload => {
  state.players = payload.players;
  state.bullets = payload.bullets;
  state.explosions = payload.explosions || [];
  state.powerCubes = payload.powerCubes || [];
  state.walls = payload.walls || [];
  state.pickup = payload.pickup || null;
  state.npcs = payload.npcs || [];
  occupancyEl.textContent = `${payload.playerCount}/${payload.maxPlayers} players`;
});

socket.on('playerNameChanged', payload => {
  if (payload && payload.id && payload.name) {
    addEventLog(`Player changed name to ${payload.name}`);
  }
});

socket.on('playerJoined', payload => {
  if (payload && payload.player) {
    addEventLog(`Player ${payload.player.name} joined`);
  }
  statusEl.textContent = 'Player joined';
});

socket.on('playerLeft', payload => {
  if (payload && payload.id) {
    addEventLog(`Player left`);
  }
  statusEl.textContent = 'Player left';
});

socket.on('serverFull', payload => {
  serverStatusEl.textContent = 'Server is full';
  statusEl.textContent = payload && payload.message ? payload.message : 'Server full';
  addEventLog('Server is full. Retrying...');
});

socket.on('connect_error', err => {
  serverStatusEl.textContent = 'Connection error';
  statusEl.textContent = err.message || 'Connection error';
  addEventLog(`Connection error: ${err.message || 'no details'}`);
});

socket.on('reconnect_attempt', () => {
  serverStatusEl.textContent = 'Reconnecting...';
});

socket.on('reconnect', attempt => {
  serverStatusEl.textContent = 'Connected';
  addEventLog(`Reconnected after ${attempt} attempts`);
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

  // draw NPCs
  (state.npcs || []).forEach(npc => {
    const isBoss = npc.type === 'boss';
    const radius = isBoss ? 26 : 16;
    // health bar
    const barWidth = isBoss ? 50 : 36;
    const barHeight = 6;
    const barX = npc.x - barWidth / 2;
    const barY = npc.y - radius - 18;
    ctx.fillStyle = '#111';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#ef4444';
    const healthPct = Math.max(0, Math.min(1, (npc.health || 0) / (isBoss ?  (150*4) : 150)));
    ctx.fillRect(barX, barY, barWidth * healthPct, barHeight);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // name
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isBoss ? 'Boss' : 'Monster', npc.x, npc.y - radius - 26);

    // body
    ctx.fillStyle = isBoss ? '#ef4444' : '#6b7280';
    ctx.beginPath();
    ctx.arc(npc.x, npc.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

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

    const nameY = player.y - 58;
    const cubeY = player.y - 42;
    const emoteY = player.y - 78;

    if (player.emote) {
      ctx.fillStyle = '#fff';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.emote, player.x, emoteY);
    }

    if (player.powerCubes > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.powerCubes, player.x, cubeY);
    }

    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, nameY);

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

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
