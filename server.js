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
const walls = [
  { x: 200, y: 120, width: 400, height: 20 },
  { x: 200, y: 360, width: 400, height: 20 },
  { x: 120, y: 220, width: 20, height: 160 },
  { x: 660, y: 220, width: 20, height: 160 }
];
let pickup = null;
let lastPickupTime = Date.now();
let nextPickupDelay = 8000;
const pickupLocations = [
  { x: 320, y: 260 },
  { x: 480, y: 260 },
  { x: 400, y: 360 }
];
const pickupTypes = ['heal', 'bazooka', 'sniper'];
let lastBroadcast = Date.now();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function circleRectOverlap(cx, cy, radius, rect) {
  const closestX = clamp(cx, rect.x, rect.x + rect.width);
  const closestY = clamp(cy, rect.y, rect.y + rect.height);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function canMoveTo(x, y) {
  for (const wall of walls) {
    if (circleRectOverlap(x, y, 18, wall)) {
      return false;
    }
  }
  return true;
}

const spawnPoints = [
  { x: 60, y: 60 },
  { x: 740, y: 60 },
  { x: 60, y: 540 },
  { x: 740, y: 540 }
];

function getSpawnPoint() {
  return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

function getPickupDelay() {
  return 7000 + Math.floor(Math.random() * 5000);
}

function spawnPickup() {
  const location = pickupLocations[Math.floor(Math.random() * pickupLocations.length)];
  const type = pickupTypes[Math.floor(Math.random() * pickupTypes.length)];
  pickup = {
    x: location.x,
    y: location.y,
    type
  };
}

function createPlayer(id) {
  const spawn = getSpawnPoint();
  return {
    id,
    x: spawn.x,
    y: spawn.y,
    color: `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`,
    name: `Player ${id.slice(0, 4)}`,
    health: 100,
    powerup: null,
    input: { up: false, down: false, left: false, right: false, aimX: 0, aimY: 0, shoot: false },
    lastShot: 0
  };
}

function respawnPlayer(player) {
  const spawn = getSpawnPoint();
  player.x = spawn.x;
  player.y = spawn.y;
  player.health = 100;
  player.powerup = null;
}

function update(dt) {
  const time = Date.now();

  Object.values(players).forEach(player => {
    if (player.powerup && player.powerup.expires <= time) {
      player.powerup = null;
    }
  });

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

    const nextX = clamp(player.x + dx * PLAYER_SPEED * dt, 20, 780);
    const nextY = clamp(player.y + dy * PLAYER_SPEED * dt, 20, 580);

    if (canMoveTo(nextX, player.y)) {
      player.x = nextX;
    }
    if (canMoveTo(player.x, nextY)) {
      player.y = nextY;
    }

    if (pickup) {
      const dxPickup = player.x - pickup.x;
      const dyPickup = player.y - pickup.y;
      if (dxPickup * dxPickup + dyPickup * dyPickup < (18 + 12) * (18 + 12)) {
        if (pickup.type === 'heal') {
          player.health = Math.min(100, player.health + 40);
        } else {
          player.powerup = {
            type: pickup.type,
            expires: time + (pickup.type === 'bazooka' ? 10000 : 15000)
          };
        }
        pickup = null;
        lastPickupTime = time;
        nextPickupDelay = getPickupDelay();
      }
    }

    if (player.input.shoot && time - player.lastShot > 200) {
      const angle = Math.atan2(player.input.aimY - player.y, player.input.aimX - player.x);
      const type = player.powerup ? player.powerup.type : 'normal';
      bullets.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        shooter: player.id,
        type,
        created: time
      });
      player.lastShot = time;
    }
  });

  if (!pickup && time - lastPickupTime > nextPickupDelay) {
    spawnPickup();
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    if (Date.now() - bullet.created > BULLET_LIFETIME || bullet.x < -50 || bullet.x > 850 || bullet.y < -50 || bullet.y > 650) {
      bullets.splice(i, 1);
      continue;
    }

    let hit = false;
    for (const wall of walls) {
      if (circleRectOverlap(bullet.x, bullet.y, 5, wall)) {
        hit = true;
        break;
      }
    }

    if (hit) {
      bullets.splice(i, 1);
      continue;
    }

    for (const player of Object.values(players)) {
      if (player.id === bullet.shooter) continue;
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      if (dx * dx + dy * dy < (18 + 5) * (18 + 5)) {
        let damage = 25;
        if (bullet.type === 'bazooka') {
          damage = 45;
        } else if (bullet.type === 'sniper') {
          const distance = Math.sqrt(dx * dx + dy * dy);
          damage = 15 + Math.min(35, distance * 0.2);
        }
        player.health -= damage;
        bullets.splice(i, 1);
        if (player.health <= 0) {
          respawnPlayer(player);
        }
        hit = true;
        break;
      }
    }
  }
}

function getGameState() {
  return {
    players: Object.values(players).map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      color: p.color,
      name: p.name,
      health: p.health,
      powerup: p.powerup ? p.powerup.type : null
    })),
    bullets: bullets.map(b => ({ x: b.x, y: b.y, type: b.type })),
    walls,
    pickup
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
