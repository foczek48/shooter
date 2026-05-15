const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const BROADCAST_RATE = 1000 / 20;
const PLAYER_SPEED = 240;
const BULLET_SPEED = 600;
const BULLET_LIFETIME = 1800;

app.use(express.static('public'));

const players = {};
const bullets = [];
let lastBroadcast = Date.now();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createPlayer(id) {
  return {
    id,
    x: Math.random() * 700 + 50,
    y: Math.random() * 500 + 50,
    color: `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`,
    name: `Player ${id.slice(0, 4)}`,
    input: { up: false, down: false, left: false, right: false, aimX: 0, aimY: 0, shoot: false },
    lastShot: 0
  };
}

function update(dt) {
  const time = Date.now();

  Object.values(players).forEach(player => {
    const { up, down, left, right } = player.input;
    let dx = 0;
    let dy = 0;

    if (up) dy -= 1;
    if (down) dy += 1;
    if (left) dx -= 1;
    if (right) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;
    }

    player.x += dx * PLAYER_SPEED * dt;
    player.y += dy * PLAYER_SPEED * dt;

    player.x = clamp(player.x, 20, 780);
    player.y = clamp(player.y, 20, 580);

    if (player.input.shoot && time - player.lastShot > 200) {
      const angle = Math.atan2(player.input.aimY - player.y, player.input.aimX - player.x);
      bullets.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        shooter: player.id,
        created: time
      });
      player.lastShot = time;
    }
  });

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    if (Date.now() - bullet.created > BULLET_LIFETIME || bullet.x < -50 || bullet.x > 850 || bullet.y < -50 || bullet.y > 650) {
      bullets.splice(i, 1);
    }
  }
}

function getGameState() {
  return {
    players: Object.values(players).map(p => ({ id: p.id, x: p.x, y: p.y, color: p.color, name: p.name })),
    bullets: bullets.map(b => ({ x: b.x, y: b.y }))
  };
}

io.on('connection', socket => {
  const player = createPlayer(socket.id);
  players[socket.id] = player;

  socket.emit('connected', { id: socket.id });
  socket.broadcast.emit('playerJoined', { id: socket.id, player: { x: player.x, y: player.y, color: player.color, name: player.name } });

  socket.on('input', data => {
    if (!players[socket.id]) return;
    players[socket.id].input = Object.assign(players[socket.id].input, data);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });
  });
});

setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - (global.lastUpdate || now)) / 1000, 0.05);
  global.lastUpdate = now;
  update(dt);

  if (Date.now() - lastBroadcast > BROADCAST_RATE) {
    io.emit('state', getGameState());
    lastBroadcast = Date.now();
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
