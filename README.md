# Island Outpost 3D Battle Royale — Multiplayer Server

Node.js + Express + Socket.io backend server with room matchmaking (up to 15 players per room, 15-second countdown once >= 2 players join) and real-time 3D position/combat sync.

## Quick Start

```bash
npm install
npm start
```

Then open **http://localhost:3000** in two or more browser tabs, enter different usernames, and click **Play (Join Lobby)**. Once 2 players join the room, the 15-second countdown starts automatically and launches everyone into the Airplane Sky-Drop match together!

## Project Structure

- `server.js` — Express HTTP server + Socket.io matchmaking rooms (max 15 players, 15s countdown at >= 2 players) & real-time state sync.
- `package.json` — Dependencies (`express`, `socket.io`) and start script.
- `public/socket-client.js` — Frontend Socket.io client wrapper (`BattleRoyaleNetClient`).
- `public/index.html` — Full 3D Three.js Island Outpost game with Matchmaking Lobby UI and remote 3D player rendering.
