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
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

app.use(express.static('public'));

const players = {};
const bullets = [];
const powerCubes = [];
const explosions = [];
const walls = [
  { x: 200, y: 120, width: 400, height: 20 },
  { x: 200, y: 480, width: 400, height: 20 },
  { x: 120, y: 220, width: 20, height: 160 },
  { x: 660, y: 220, width: 20, height: 160 }
];
let pickup = null;
let lastPickupTime = Date.now();
let nextPickupDelay = 3000;
const pickupLocations = [
  { x: 320, y: 260 },
  { x: 480, y: 260 },
  { x: 400, y: 260 }
];
const pickupTypes = ['heal', 'bazooka', 'sniper', 'shield', 'tnt'];
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

function reflectCircleVelocityFromRect(body, rect, radius) {
  const closestX = clamp(body.x, rect.x, rect.x + rect.width);
  const closestY = clamp(body.y, rect.y, rect.y + rect.height);
  const dx = body.x - closestX;
  const dy = body.y - closestY;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx === 0) {
      body.vx = -body.vx;
    } else {
      body.vx = -body.vx;
      body.x = closestX + Math.sign(dx) * (radius + 1);
    }
  } else {
    if (dy === 0) {
      body.vy = -body.vy;
    } else {
      body.vy = -body.vy;
      body.y = closestY + Math.sign(dy) * (radius + 1);
    }
  }
}

function bounceFromBounds(body, radius, damping = 1) {
  if (body.x - radius < 0) {
    body.x = radius;
    body.vx = -body.vx * damping;
  } else if (body.x + radius > WORLD_WIDTH) {
    body.x = WORLD_WIDTH - radius;
    body.vx = -body.vx * damping;
  }

  if (body.y - radius < 0) {
    body.y = radius;
    body.vy = -body.vy * damping;
  } else if (body.y + radius > WORLD_HEIGHT) {
    body.y = WORLD_HEIGHT - radius;
    body.vy = -body.vy * damping;
  }
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
  return 3000 + Math.floor(Math.random() * 3000);
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
    name: `Player ${id.slice(0, 6)}`,
    health: 100,
    maxHealth: 100,
    damageMultiplier: 1,
    powerCubes: 0,
    powerup: null,
    input: { up: false, down: false, left: false, right: false, aimX: 0, aimY: 0, shoot: false },
    lastShot: 0
  };
}

function respawnPlayer(player) {
  const spawn = getSpawnPoint();
  player.x = spawn.x;
  player.y = spawn.y;
  player.health = player.maxHealth;
  player.powerup = null;
}

function dropPowerCubes(player, time) {
  const dropCount = Math.max(1, Math.ceil(player.powerCubes * 0.5));
  const lost = Math.min(player.powerCubes, dropCount);
  player.powerCubes -= lost;
  player.maxHealth = Math.max(100, player.maxHealth - lost * 15);
  player.damageMultiplier = Math.max(1, player.damageMultiplier - lost * 0.1);
  player.health = Math.min(player.health, player.maxHealth);

  for (let c = 0; c < dropCount; c++) {
    const angle = (Math.PI * 2 * c) / dropCount;
    powerCubes.push({
      x: player.x + Math.cos(angle) * 30,
      y: player.y + Math.sin(angle) * 30,
      vx: Math.cos(angle) * 150,
      vy: Math.sin(angle) * 150,
      created: time
    });
  }
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
          player.health = Math.min(player.maxHealth, player.health + 40);
        } else {
          player.powerup = {
            type: pickup.type,
            expires: time + (pickup.type === 'bazooka' ? 10000 : pickup.type === 'shield' ? 12000 : 15000)
          };
        }
        pickup = null;
        lastPickupTime = time;
        nextPickupDelay = getPickupDelay();
      }
    }

    for (let i = powerCubes.length - 1; i >= 0; i--) {
      const cube = powerCubes[i];
      const dxCube = player.x - cube.x;
      const dyCube = player.y - cube.y;
      if (dxCube * dxCube + dyCube * dyCube < (18 + 8) * (18 + 8)) {
        player.maxHealth += 15;
        player.health = Math.min(player.health + 15, player.maxHealth);
        player.damageMultiplier += 0.1;
        player.powerCubes += 1;
        powerCubes.splice(i, 1);
      }
    }

    if (player.input.shoot && time - player.lastShot > 200) {
      const angle = Math.atan2(player.input.aimY - player.y, player.input.aimX - player.x);
      const type = player.powerup ? player.powerup.type : 'normal';
      bullets.push({
        x: player.x,
        y: player.y,
        startX: player.x,
        startY: player.y,
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        shooter: player.id,
        type,
        created: time,
        explodeAt: type === 'tnt' ? time + 2000 : null
      });
      if (type === 'tnt') {
        player.powerup = null;
      }
      player.lastShot = time;
    }
  });

  if (!pickup && time - lastPickupTime > nextPickupDelay) {
    spawnPickup();
  }

  const getBulletRadius = (bullet) => {
    if (bullet.type === 'bazooka') return 10;
    if (bullet.type === 'sniper') return 5 + Math.min(10, bullet.distance * 0.03);
    if (bullet.type === 'tnt') return 8;
    return 5;
  };

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.distance = Math.sqrt((bullet.x - bullet.startX) * (bullet.x - bullet.startX) + (bullet.y - bullet.startY) * (bullet.y - bullet.startY));

    const bulletRadius = getBulletRadius(bullet);
    if (Date.now() - bullet.created > BULLET_LIFETIME) {
      bullets.splice(i, 1);
      continue;
    }

    if (bullet.type === 'bazooka') {
      bounceFromBounds(bullet, bulletRadius, 0.9);
    } else if (bullet.x < -50 || bullet.x > WORLD_WIDTH + 50 || bullet.y < -50 || bullet.y > WORLD_HEIGHT + 50) {
      bullets.splice(i, 1);
      continue;
    }

    if (bullet.type === 'tnt' && bullet.explodeAt && time >= bullet.explodeAt) {
      const explosionRadius = 80;
      explosions.push({ x: bullet.x, y: bullet.y, radius: explosionRadius, created: time });
      for (const player of Object.values(players)) {
        if (player.id === bullet.shooter) continue;
        const dx = bullet.x - player.x;
        const dy = bullet.y - player.y;
        if (dx * dx + dy * dy <= explosionRadius * explosionRadius) {
          const shooter = players[bullet.shooter];
          let damage = 80;
          if (shooter) {
            damage = Math.ceil(damage * shooter.damageMultiplier);
          }
          if (player.powerup && player.powerup.type === 'shield') {
            damage = Math.ceil(damage * 0.55);
          }
          player.health -= damage;
          if (player.health <= 0) {
            dropPowerCubes(player, time);
            respawnPlayer(player);
          }
        }
      }
      bullets.splice(i, 1);
      continue;
    }

    let hit = false;
    for (const wall of walls) {
      if (circleRectOverlap(bullet.x, bullet.y, bulletRadius, wall)) {
        if (bullet.type === 'bazooka') {
          reflectCircleVelocityFromRect(bullet, wall, bulletRadius);
          hit = false;
        } else if (bullet.type === 'tnt') {
          bullet.vx = 0;
          bullet.vy = 0;
        } else {
          hit = true;
        }
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
      if (dx * dx + dy * dy < (18 + bulletRadius) * (18 + bulletRadius)) {
        const shooter = players[bullet.shooter];
        let damage = 25;
        if (bullet.type === 'bazooka') {
          damage = 45;
        } else if (bullet.type === 'sniper') {
          damage = 15 + Math.min(35, bullet.distance * 0.2);
        }
        if (shooter) {
          damage = Math.ceil(damage * shooter.damageMultiplier);
        }

        if (player.powerup && player.powerup.type === 'shield') {
          damage = Math.ceil(damage * 0.55);
        }

        player.health -= damage;
        bullets.splice(i, 1);
        if (player.health <= 0) {
          dropPowerCubes(player, time);
          respawnPlayer(player);
        }
        hit = true;
        break;
      }
    }
  }

  for (let i = powerCubes.length - 1; i >= 0; i--) {
    const cube = powerCubes[i];
    cube.x += cube.vx * dt;
    cube.y += cube.vy * dt;
    cube.vx *= 0.98;
    cube.vy *= 0.98;
    if (circleRectOverlap(cube.x, cube.y, 8, { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT })) {
      // inside bounds
    } else {
      bounceFromBounds(cube, 8, 0.8);
    }
    for (const wall of walls) {
      if (circleRectOverlap(cube.x, cube.y, 8, wall)) {
        reflectCircleVelocityFromRect(cube, wall, 8);
      }
    }
    if (time - cube.created > 30000) {
      powerCubes.splice(i, 1);
    }
  }

  for (let i = explosions.length - 1; i >= 0; i--) {
    if (time - explosions[i].created > 600) {
      explosions.splice(i, 1);
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
      maxHealth: p.maxHealth,
      damageMultiplier: p.damageMultiplier,
      powerCubes: p.powerCubes,
      powerup: p.powerup ? p.powerup.type : null
    })),
    bullets: bullets.map(b => {
      const distance = b.distance || 0;
      const radius = b.type === 'bazooka' ? 10 : b.type === 'sniper' ? 5 + Math.min(10, distance * 0.03) : b.type === 'tnt' ? 8 : 5;
      return { x: b.x, y: b.y, type: b.type, radius };
    }),
    powerCubes: powerCubes.map(c => ({ x: c.x, y: c.y })),
    explosions,
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
