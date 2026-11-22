/**
 * Island Outpost 3D Battle Royale — Complete Server-Authoritative Multiplayer Backend
 * Features:
 *  1) Matchmaking Rooms (up to 15 players, 15s countdown once >= 2 real players join)
 *  2) Automatic Server-Synced AI Bot Backfill to 15/15 players when countdown ends
 *  3) 20Hz Real-Time Movement, Rotation, Stance & Equipped Weapon Sync
 *  4) Authoritative Combat (shot relay, validated hit damage, HP sync, Live Kill Feed, Alive Counter)
 *  5) Authoritative Safe Zone (15-min 6-phase timer), Ground Loot & Gloo Walls (300 HP)
 *  6) Authoritative `match_end` broadcast when 1 survivor remains -> BOOYAH! screen & Play Again
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS_PER_ROOM = 15;
const MIN_PLAYERS_TO_START = 2;
const COUNTDOWN_SECONDS = 15;
const MAX_HP = 150;
const MATCH_DURATION_SECONDS = 900;

const WEAPON_STATS = {
  ar:      { label: 'AR',      damage: 34,  headshotMult: 2.0,  maxRange: 300, minFireMs: 45  },
  shotgun: { label: 'SHOTGUN', damage: 22,  headshotMult: 1.75, maxRange: 110, minFireMs: 0   },
  sniper:  { label: 'SNIPER',  damage: 110, headshotMult: 2.5,  maxRange: 680, minFireMs: 500 },
  grenade: { label: 'FRAG',    damage: 135, headshotMult: 1.0,  maxRange: 140, minFireMs: 0   }
};

const ZONE_PHASES = [
  { wait: 150, shrink: 90, targetRadius: 240, dps: 2  },
  { wait: 120, shrink: 75, targetRadius: 165, dps: 4  },
  { wait: 105, shrink: 65, targetRadius: 105, dps: 7  },
  { wait: 90,  shrink: 60, targetRadius: 58,  dps: 11 },
  { wait: 60,  shrink: 50, targetRadius: 24,  dps: 16 },
  { wait: 20,  shrink: 15, targetRadius: 6,   dps: 22 }
];

const BOT_NAMES = [
  'Vikram_IND', 'Aarav_Pro', 'Neha_Sniper', 'Kabir_99', 'Zoya_Ace',
  'Arjun_OP', 'Rohan_FF', 'Priya_Max', 'Dev_Titan', 'Meera_X',
  'Sahil_King', 'Ananya_BR', 'Karan_77', 'Riya_GG', 'Aditya_HQ'
];

const BOT_SPAWN_POINTS = [
  { x: -16, z: 18 }, { x: 18, z: 16 }, { x: 0, z: -42 }, { x: -28, z: 6 },
  { x: 34, z: -10 }, { x: -64, z: 54 }, { x: 88, z: 112 }, { x: -124, z: -118 },
  { x: 128, z: 14 }, { x: -144, z: 84 }, { x: 142, z: -116 }, { x: -160, z: 26 },
  { x: 46, z: 168 }, { x: -108, z: 138 }, { x: 168, z: 106 }
];

const LOOT_SPAWN_TEMPLATE = [
  { x: -8.5, z: 26, type: 'bag_1' }, { x: 8.5, z: 26, type: 'vest_1' }, { x: -2.0, z: 29, type: 'helm_1' },
  { x: -5.5, z: 28, type: 'gun_ar' }, { x: 5.5, z: 28, type: 'gun_shotgun' }, { x: 0, z: 24, type: 'gun_sniper' },
  { x: -3.5, z: 22, type: 'medkit' }, { x: 3.5, z: 22, type: 'gloo' }, { x: -7.5, z: 23, type: 'grenade' }, { x: 7.5, z: 23, type: 'ammo' },
  { x: -24, z: 9, type: 'gun_ar' }, { x: -22, z: 6, type: 'medkit' }, { x: -27, z: 5, type: 'gloo' }, { x: -20, z: 12, type: 'grenade' },
  { x: 32, z: -11, type: 'gun_shotgun' }, { x: 29, z: -10, type: 'gun_ar' }, { x: 34, z: -8, type: 'gloo' }, { x: 28, z: -15, type: 'medkit' },
  { x: -5, z: -46, type: 'bag_2' }, { x: 5, z: -56, type: 'vest_2' }, { x: -6, z: -56, type: 'helm_2' },
  { x: 0, z: -48, type: 'gun_ar' }, { x: 4, z: -52, type: 'gun_sniper' }, { x: -4, z: -52, type: 'gloo' }, { x: 0, z: -56, type: 'medkit' },
  { x: -131, z: -121, type: 'bag_3' }, { x: -125, z: -129, type: 'vest_3' }, { x: -132, z: -129, type: 'helm_3' },
  { x: -128, z: -122, type: 'gun_sniper' }, { x: -124, z: -125, type: 'gun_ar' }, { x: -132, z: -125, type: 'gloo' },
  { x: -165, z: 30, type: 'gun_shotgun' }, { x: -170, z: 26, type: 'gun_ar' }, { x: -164, z: 24, type: 'grenade' }, { x: -168, z: 33, type: 'medkit' },
  { x: 149, z: -124, type: 'bag_3' }, { x: 141, z: -117, type: 'vest_3' }, { x: 145, z: -122, type: 'gun_sniper' }, { x: 142, z: -125, type: 'gloo' },
  { x: 175, z: 112, type: 'gun_shotgun' }, { x: 170, z: 115, type: 'gun_ar' }, { x: 178, z: 108, type: 'gloo' },
  { x: 135, z: 10, type: 'bag_2' }, { x: 129, z: 16, type: 'vest_2' }, { x: 132, z: 12, type: 'gun_shotgun' }, { x: 136, z: 14, type: 'grenade' },
  { x: 92, z: 124, type: 'gun_sniper' }, { x: 88, z: 121, type: 'bag_3' }, { x: 96, z: 121, type: 'vest_3' }, { x: 92, z: 128, type: 'medkit' },
  { x: -148, z: 91, type: 'gun_ar' }, { x: -144, z: 89, type: 'helm_3' }, { x: -152, z: 89, type: 'bag_2' }, { x: -148, z: 94, type: 'grenade' },
  { x: 286, z: -32, type: 'gun_sniper' }, { x: 284, z: -38, type: 'vest_3' }, { x: 288, z: -35, type: 'gloo' },
  { x: -166, z: -155, type: 'gun_shotgun' }, { x: -163, z: -160, type: 'vest_3' }, { x: -168, z: -162, type: 'grenade' },
  { x: -112, z: 146, type: 'gun_ar' }, { x: -109, z: 148, type: 'bag_2' }, { x: 45, z: 176, type: 'gun_ar' }, { x: 49, z: 172, type: 'medkit' },
  { x: -15, z: -192, type: 'gun_sniper' }, { x: -64, z: 58, type: 'gun_ar' }, { x: -60, z: 60, type: 'medkit' }, { x: -67, z: 55, type: 'gloo' }
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ status: 'ok', activeRooms: rooms.size }));

const rooms = new Map();
let roomSeq = 1;
let glooSeq = 1;

function generateRoomLoot() {
  const map = new Map();
  LOOT_SPAWN_TEMPLATE.forEach((sp, idx) => {
    const id = `loot_${idx}`;
    map.set(id, { id, x: sp.x, z: sp.z, type: sp.type, collected: false });
  });
  return map;
}

function createInitialZone() {
  return {
    center: { x: Math.round((Math.random() - 0.5) * 80), z: Math.round((Math.random() - 0.5) * 80) },
    currentRadius: 325,
    startRadius: 325,
    nextRadius: ZONE_PHASES[0].targetRadius,
    phaseIdx: 0,
    state: 'wait',
    timer: ZONE_PHASES[0].wait,
    matchTimeRemaining: MATCH_DURATION_SECONDS,
    dps: ZONE_PHASES[0].dps
  };
}

function createRoom() {
  const id = `BR-${String(roomSeq++).padStart(3, '0')}`;
  const room = {
    id,
    status: 'waiting', // 'waiting' | 'countdown' | 'playing' | 'ended'
    countdown: COUNTDOWN_SECONDS,
    timerHandle: null,
    zoneTickHandle: null,
    botTickHandle: null,
    players: new Map(), // Real players + server-synced AI bots
    loot: generateRoomLoot(),
    glooWalls: new Map(),
    zone: createInitialZone(),
    totalPlayers: 0,
    flightAngle: (Math.random() - 0.5) * 0.85
  };
  rooms.set(id, room);
  return room;
}

function getRealPlayerCount(room) {
  let count = 0;
  for (const p of room.players.values()) if (!p.isBot) count++;
  return count;
}

function getAliveList(room) {
  const alive = [];
  for (const p of room.players.values()) if (p.alive) alive.push(p);
  return alive;
}

function findAvailableRoom() {
  for (const room of rooms.values()) {
    if ((room.status === 'waiting' || room.status === 'countdown') && room.players.size < MAX_PLAYERS_PER_ROOM) {
      return room;
    }
  }
  return createRoom();
}

function serializeRoom(room) {
  return {
    roomId: room.id,
    status: room.status,
    countdown: room.countdown,
    maxPlayers: MAX_PLAYERS_PER_ROOM,
    minPlayers: MIN_PLAYERS_TO_START,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id, username: p.username, isBot: Boolean(p.isBot),
      x: p.x, y: p.y, z: p.z, yaw: p.yaw,
      crouching: p.crouching, prone: p.prone, jumping: p.jumping, sprinting: p.sprinting,
      weapon: p.weapon, alive: p.alive, hp: p.hp, kills: p.kills
    }))
  };
}

function stopRoomLoops(room) {
  if (room.timerHandle) { clearInterval(room.timerHandle); room.timerHandle = null; }
  if (room.zoneTickHandle) { clearInterval(room.zoneTickHandle); room.zoneTickHandle = null; }
  if (room.botTickHandle) { clearInterval(room.botTickHandle); room.botTickHandle = null; }
}

function stopCountdown(room) {
  if (room.timerHandle) { clearInterval(room.timerHandle); room.timerHandle = null; }
  if (room.status === 'countdown') {
    room.status = 'waiting';
    room.countdown = COUNTDOWN_SECONDS;
  }
}

function checkAndBroadcastMatchEnd(room) {
  if (room.status !== 'playing') return;
  const alive = getAliveList(room);
  if (alive.length <= 1) {
    room.status = 'ended';
    stopRoomLoops(room);
    const winner = alive[0] || null;
    io.to(room.id).emit('match_end', {
      roomId: room.id,
      winnerId: winner ? winner.id : null,
      winnerName: winner ? winner.username : 'No Survivor',
      winnerKills: winner ? winner.kills : 0,
      totalPlayers: room.totalPlayers || room.players.size
    });
    console.log(`[Match End] Room ${room.id} Winner: ${winner ? winner.username : 'None'}`);
  }
}

function eliminatePlayer(room, victim, killerId, killerName, weaponLabel, isHeadshot) {
  if (!victim || !victim.alive) return;
  victim.alive = false;
  victim.hp = 0;

  let killerKills = 0;
  const killer = killerId ? room.players.get(killerId) : null;
  if (killer) {
    killer.kills = (killer.kills || 0) + 1;
    killerKills = killer.kills;
  }

  const aliveCount = getAliveList(room).length;
  io.to(room.id).emit('player_eliminated', {
    killerId: killerId || 'zone',
    killerName: killerName || 'Safe Zone',
    killerKills,
    victimId: victim.id,
    victimName: victim.username,
    weapon: weaponLabel || 'AR',
    isHeadshot: Boolean(isHeadshot),
    aliveCount,
    totalPlayers: room.totalPlayers || room.players.size
  });

  checkAndBroadcastMatchEnd(room);
}

// Fill remaining slots up to 15 with Server-Synced AI Bots!
function backfillBotsToFullRoom(room) {
  const needed = Math.max(0, MAX_PLAYERS_PER_ROOM - room.players.size);
  const weapons = ['ar', 'shotgun', 'sniper'];
  for (let i = 0; i < needed; i++) {
    const botId = `bot_${room.id}_${i + 1}`;
    const sp = BOT_SPAWN_POINTS[i % BOT_SPAWN_POINTS.length];
    const bot = {
      id: botId,
      username: `[BOT] ${BOT_NAMES[i % BOT_NAMES.length]}`,
      isBot: true,
      x: sp.x + (Math.random() - 0.5) * 10,
      y: 4,
      z: sp.z + (Math.random() - 0.5) * 10,
      yaw: Math.random() * Math.PI * 2,
      crouching: false,
      prone: false,
      jumping: false,
      sprinting: true,
      weapon: weapons[i % weapons.length],
      hp: MAX_HP,
      alive: true,
      kills: 0,
      patrolAngle: Math.random() * Math.PI * 2,
      patrolTimer: 2 + Math.random() * 4,
      lastHitAt: 0
    };
    room.players.set(botId, bot);
  }
}

function startServerBotLoop(room) {
  if (room.botTickHandle) clearInterval(room.botTickHandle);
  const tickMs = 200; // 5Hz authoritative bot movement sync (smoothly interpolated on clients!)
  const dt = tickMs / 1000;

  room.botTickHandle = setInterval(() => {
    if (room.status !== 'playing') return;
    const zc = room.zone.center;
    const zr = room.zone.currentRadius;

    for (const bot of room.players.values()) {
      if (!bot.isBot || !bot.alive) continue;

      bot.patrolTimer -= dt;
      const distFromZone = Math.hypot(bot.x - zc.x, bot.z - zc.z);
      if (distFromZone > zr * 0.85) {
        // Move toward Safe Zone center
        bot.patrolAngle = Math.atan2(zc.x - bot.x, zc.z - bot.z);
        bot.sprinting = true;
      } else if (bot.patrolTimer <= 0) {
        bot.patrolAngle += (Math.random() - 0.5) * 2.2;
        bot.patrolTimer = 2.5 + Math.random() * 4.5;
        bot.crouching = Math.random() < 0.14;
      }

      const speed = bot.crouching ? 2.6 : 5.4;
      bot.x = Math.max(-280, Math.min(280, bot.x + Math.sin(bot.patrolAngle) * speed * dt));
      bot.z = Math.max(-280, Math.min(280, bot.z + Math.cos(bot.patrolAngle) * speed * dt));
      bot.yaw = bot.patrolAngle;
      bot.jumping = Math.random() < 0.04;

      io.to(room.id).volatile.emit('player_moved', {
        id: bot.id,
        username: bot.username,
        isBot: true,
        x: +bot.x.toFixed(2),
        y: bot.y,
        z: +bot.z.toFixed(2),
        yaw: +bot.yaw.toFixed(2),
        crouching: bot.crouching,
        prone: false,
        jumping: bot.jumping,
        sprinting: bot.sprinting,
        weapon: bot.weapon,
        hp: bot.hp,
        ts: Date.now()
      });
    }
  }, tickMs);
}

function startAuthoritativeZoneLoop(room) {
  if (room.zoneTickHandle) clearInterval(room.zoneTickHandle);
  room.zoneTickHandle = setInterval(() => {
    if (room.status !== 'playing') return;
    const z = room.zone;
    const ph = ZONE_PHASES[Math.min(z.phaseIdx, ZONE_PHASES.length - 1)];
    z.matchTimeRemaining = Math.max(0, z.matchTimeRemaining - 1);
    z.dps = ph.dps;

    if (z.state === 'wait') {
      z.timer -= 1;
      if (z.timer <= 0) {
        z.state = 'shrink';
        z.startRadius = z.currentRadius;
        z.timer = ph.shrink;
      }
    } else if (z.state === 'shrink') {
      z.timer -= 1;
      const prog = 1 - Math.max(0, z.timer / ph.shrink);
      z.currentRadius = +(z.startRadius + (ph.targetRadius - z.startRadius) * prog).toFixed(2);
      if (z.timer <= 0) {
        z.currentRadius = ph.targetRadius;
        if (z.phaseIdx < ZONE_PHASES.length - 1) {
          z.phaseIdx += 1;
          z.state = 'wait';
          z.timer = ZONE_PHASES[z.phaseIdx].wait;
          z.nextRadius = ZONE_PHASES[z.phaseIdx].targetRadius;
        } else {
          z.state = 'final';
          z.timer = 0;
        }
      }
    }

    io.to(room.id).emit('zone_update', {
      center: z.center, currentRadius: z.currentRadius, nextRadius: z.nextRadius,
      phaseIdx: z.phaseIdx, state: z.state, timer: z.timer,
      matchTimeRemaining: z.matchTimeRemaining, dps: z.dps,
      aliveCount: getAliveList(room).length
    });

    for (const p of room.players.values()) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - z.center.x, p.z - z.center.z) > z.currentRadius) {
        p.hp = Math.max(0, p.hp - z.dps);
        io.to(room.id).emit('health_update', {
          targetId: p.id, attackerId: 'zone', attackerName: 'Safe Zone',
          hp: p.hp, maxHp: MAX_HP, damage: z.dps, hitZone: 'zone', weapon: 'zone'
        });
        if (p.hp <= 0) {
          eliminatePlayer(room, p, 'zone', 'Safe Zone', 'ZONE', false);
        }
      }
    }
  }, 1000);
}

function startMatch(room) {
  stopCountdown(room);
  room.status = 'playing';
  room.flightAngle = (Math.random() - 0.5) * 0.85;
  room.loot = generateRoomLoot();
  room.glooWalls = new Map();
  room.zone = createInitialZone();

  // Reset all real players and auto-fill remaining slots up to 15 with Server-Synced AI Bots!
  for (const p of room.players.values()) {
    p.hp = MAX_HP;
    p.alive = true;
    p.kills = 0;
  }
  backfillBotsToFullRoom(room);
  room.totalPlayers = room.players.size;

  io.to(room.id).emit('match_start', {
    roomId: room.id,
    flightAngle: room.flightAngle,
    startTime: Date.now(),
    totalPlayers: room.totalPlayers,
    aliveCount: getAliveList(room).length,
    players: Array.from(room.players.values()),
    loot: Array.from(room.loot.values()),
    zone: room.zone,
    glooWalls: []
  });

  startAuthoritativeZoneLoop(room);
  startServerBotLoop(room);
  console.log(`[Match Start] Room ${room.id} launched with ${getRealPlayerCount(room)} real players + ${room.players.size - getRealPlayerCount(room)} AI bots (15/15).`);
}

function ensureCountdown(room) {
  if (room.status === 'playing' || room.status === 'ended') return;
  if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
    startMatch(room);
    return;
  }
  if (room.players.size >= MIN_PLAYERS_TO_START && !room.timerHandle) {
    room.status = 'countdown';
    room.countdown = COUNTDOWN_SECONDS;
    io.to(room.id).emit('lobby_update', serializeRoom(room));

    room.timerHandle = setInterval(() => {
      if (room.players.size < MIN_PLAYERS_TO_START) {
        stopCountdown(room);
        io.to(room.id).emit('lobby_update', serializeRoom(room));
        return;
      }
      room.countdown -= 1;
      io.to(room.id).emit('countdown_tick', {
        roomId: room.id,
        countdown: room.countdown,
        playerCount: room.players.size
      });
      if (room.countdown <= 0) startMatch(room);
    }, 1000);
  }
}

function removePlayerFromRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  socket.leave(roomId);
  socket.data.roomId = null;
  if (!room) return;

  room.players.delete(socket.id);
  const aliveCount = getAliveList(room).length;
  io.to(room.id).emit('player_left', { id: socket.id, username: socket.data.username, aliveCount });

  if (getRealPlayerCount(room) === 0) {
    stopRoomLoops(room);
    rooms.delete(room.id);
    console.log(`[Room Closed] ${room.id} (no real players left)`);
    return;
  }

  if (room.status === 'countdown' && room.players.size < MIN_PLAYERS_TO_START) {
    stopCountdown(room);
  }
  if (room.status === 'playing') {
    checkAndBroadcastMatchEnd(room);
  } else {
    io.to(room.id).emit('lobby_update', serializeRoom(room));
  }
}

io.on('connection', (socket) => {
  console.log(`[Connected] ${socket.id}`);

  socket.on('join_lobby', (payload = {}) => {
    removePlayerFromRoom(socket);
    const rawName = String(payload.username || '').trim().slice(0, 18);
    const username = rawName || `Player_${socket.id.slice(0, 4)}`;
    const room = findAvailableRoom();

    room.players.set(socket.id, {
      id: socket.id, username, isBot: false,
      x: 0, y: 138, z: 32, yaw: 0,
      crouching: false, prone: false, jumping: false, sprinting: false,
      weapon: 'hands', hp: MAX_HP, alive: true, kills: 0, lastHitAt: 0, joinedAt: Date.now()
    });

    socket.data.roomId = room.id;
    socket.data.username = username;
    socket.join(room.id);

    socket.emit('lobby_joined', { playerId: socket.id, username, ...serializeRoom(room) });
    io.to(room.id).emit('lobby_update', serializeRoom(room));
    ensureCountdown(room);
  });

  socket.on('leave_lobby', () => removePlayerFromRoom(socket));

  socket.on('player_move', (state) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.status !== 'playing' || !state) return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;

    p.x = Number(state.x) || 0;
    p.y = Number(state.y) || 0;
    p.z = Number(state.z) || 0;
    p.yaw = Number(state.yaw) || 0;
    p.crouching = Boolean(state.crouching);
    p.prone = Boolean(state.prone);
    p.jumping = Boolean(state.jumping);
    p.sprinting = Boolean(state.sprinting);
    p.weapon = typeof state.weapon === 'string' ? state.weapon : 'hands';

    socket.to(room.id).volatile.emit('player_moved', {
      id: socket.id, username: p.username, isBot: false,
      x: p.x, y: p.y, z: p.z, yaw: p.yaw,
      crouching: p.crouching, prone: p.prone, jumping: p.jumping, sprinting: p.sprinting,
      weapon: p.weapon, hp: p.hp, ts: state.ts || Date.now()
    });
  });

  socket.on('loot_pickup', ({ lootId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.status !== 'playing' || !lootId) return;
    const p = room.players.get(socket.id);
    const item = room.loot.get(String(lootId));
    if (!p || !p.alive || !item || item.collected) return;

    item.collected = true;
    socket.emit('loot_granted', { lootId: item.id, type: item.type });
    io.to(room.id).emit('loot_removed', { lootId: item.id, pickedBy: socket.id });
  });

  socket.on('gloo_deploy', (payload = {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.status !== 'playing') return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;

    const id = `gloo_${room.id}_${glooSeq++}`;
    const wall = {
      id, ownerId: socket.id,
      x: Number(payload.x) || p.x, y: Number(payload.y) || p.y, z: Number(payload.z) || p.z,
      yaw: Number(payload.yaw) || 0, hp: 300, maxHp: 300
    };
    room.glooWalls.set(id, wall);
    io.to(room.id).emit('gloo_spawned', wall);
  });

  socket.on('gloo_hit', ({ glooId, damage } = {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.status !== 'playing' || !glooId) return;
    const wall = room.glooWalls.get(String(glooId));
    if (!wall) return;

    const dmg = Math.max(1, Math.min(250, Number(damage) || 25));
    wall.hp = Math.max(0, wall.hp - dmg);
    io.to(room.id).emit('gloo_update', { id: wall.id, hp: wall.hp, maxHp: wall.maxHp });
    if (wall.hp <= 0) {
      room.glooWalls.delete(wall.id);
      io.to(room.id).emit('gloo_destroyed', { id: wall.id });
    }
  });

  socket.on('player_shoot', (shot = {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.status !== 'playing') return;
    const shooter = room.players.get(socket.id);
    if (!shooter || !shooter.alive) return;

    const weaponKey = WEAPON_STATS[shot.weapon] ? shot.weapon : 'ar';
    socket.to(room.id).emit('player_shot', {
      id: socket.id, username: shooter.username, weapon: weaponKey,
      origin: Array.isArray(shot.origin) ? shot.origin.slice(0, 3) : [shooter.x, shooter.y + 1.4, shooter.z],
      target: Array.isArray(shot.target) ? shot.target.slice(0, 3) : [shooter.x, shooter.y + 1.4, shooter.z + 40]
    });
  });

  socket.on('player_hit', (report = {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.status !== 'playing') return;
    const shooter = room.players.get(socket.id);
    const victim = room.players.get(report.targetId);
    if (!shooter || !victim || !shooter.alive || !victim.alive || shooter.id === victim.id) return;

    const weaponKey = String(report.weapon || '').toLowerCase();
    const stats = WEAPON_STATS[weaponKey];
    if (!stats) return;
    const hitZone = report.hitZone === 'head' ? 'head' : 'body';

    const now = Date.now();
    if (stats.minFireMs > 0 && (now - shooter.lastHitAt) < stats.minFireMs) return;
    shooter.lastHitAt = now;

    const dist = Math.hypot(shooter.x - victim.x, shooter.z - victim.z);
    if (dist > stats.maxRange + 45) return;

    const damage = Math.round(stats.damage * (hitZone === 'head' ? stats.headshotMult : 1.0));
    victim.hp = Math.max(0, victim.hp - damage);

    io.to(room.id).emit('health_update', {
      targetId: victim.id, attackerId: shooter.id, attackerName: shooter.username,
      hp: victim.hp, maxHp: MAX_HP, damage, hitZone, weapon: weaponKey
    });

    if (victim.hp <= 0) {
      eliminatePlayer(room, victim, shooter.id, shooter.username, stats.label, hitZone === 'head');
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Disconnected] ${socket.id}`);
    removePlayerFromRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Island Outpost Battle Royale server running at http://localhost:${PORT}`);
});
