# Shooter 2D

Simple starter pack for a 2D multiplayer shooter using Node.js + Socket.IO.

## Project contents

- `server.js` — Node.js backend with Express and Socket.IO
- `public/index.html` — simple HTML page with canvas
- `public/main.js` — client logic, controls, rendering, and websockets
- `public/style.css` — UI styles
- `package.json` — dependencies and start script

## Local run

1. `npm install`
2. `npm start`
3. Open `http://localhost:3000`
4. Open another tab to test multiplayer

## Controls

- `WASD` / `Arrow keys` — move
- `Click` — shoot
- `Mouse` — aim

## Deployment on Render

1. Create a new `Web Service` on Render
2. Point it to this repository
3. Set `Build Command` to `npm install`
4. Set `Start Command` to `npm start`
5. Render will set the `PORT` automatically

## Customization

- Add collision, player health, teleporters, power-ups, and maps
- Switch rendering to Phaser if you want a more advanced frontend
