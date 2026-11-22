/**
 * Frontend Socket.io Client — Complete Multiplayer Loop:
 * Matchmaking, 15/15 AI Bot Backfill, 20Hz Movement, Networked Combat,
 * Server-Authoritative Safe Zone / Loot / Gloo Walls, Kill Feed, Alive Counter & Match End BOOYAH!
 */
(function (global) {
  'use strict';

  const PREVIEW_WEAPON_STATS = {
    ar:      { label: 'AR',      damage: 34,  headshotMult: 2.0  },
    shotgun: { label: 'SHOTGUN', damage: 22,  headshotMult: 1.75 },
    sniper:  { label: 'SNIPER',  damage: 110, headshotMult: 2.5  },
    grenade: { label: 'FRAG',    damage: 135, headshotMult: 1.0  }
  };

  const PREVIEW_BOT_NAMES = [
    'Vikram_IND', 'Aarav_Pro', 'Neha_Sniper', 'Kabir_99', 'Zoya_Ace',
    'Arjun_OP', 'Rohan_FF', 'Priya_Max', 'Dev_Titan', 'Meera_X',
    'Sahil_King', 'Ananya_BR', 'Karan_77', 'Riya_GG'
  ];

  class BattleRoyaleNetClient {
    constructor(callbacks = {}) {
      this.cb = callbacks;
      this.socket = null;
      this.isLiveServer = false;
      this.inMatch = false;
      this.playerId = null;
      this.username = '';
      this.roomId = null;
      this.localTimer = null;
      this.localPlayers = [];
      this.localCountdown = 15;
    }

    canConnectLive() {
      return (
        typeof global.io === 'function' &&
        global.location &&
        (global.location.protocol === 'http:' || global.location.protocol === 'https:') &&
        global.location.origin &&
        global.location.origin !== 'null'
      );
    }

    connectAndJoin(username) {
      this.username = String(username || '').trim().slice(0, 18) || 'Krrish_01';

      if (this.canConnectLive()) {
        this.isLiveServer = true;
        if (!this.socket) {
          this.socket = global.io();
          this.bindSocketEvents();
        }
        this.socket.emit('join_lobby', { username: this.username });
        return;
      }

      this.isLiveServer = false;
      this.playerId = 'local_self';
      this.roomId = 'BR-PREVIEW';
      this.localCountdown = 15;
      this.localPlayers = [{ id: this.playerId, username: this.username, isBot: false, alive: true, hp: 150, kills: 0 }];
      this.emitLocalLobbyUpdate('waiting');
    }

    bindSocketEvents() {
      this.socket.on('lobby_joined', (data) => {
        this.playerId = data.playerId;
        this.roomId = data.roomId;
        if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate(data);
      });
      this.socket.on('lobby_update', (data) => {
        this.roomId = data.roomId;
        if (this.cb.onLobbyUpdate) this.cb.onLobbyUpdate(data);
      });
      this.socket.on('countdown_tick', (data) => {
        if (this.cb.onCountdownTick) this.cb.onCountdownTick(data);
      });
      this.socket.on('match_start', (data) => {
        this.inMatch = true;
        if (this.cb.onMatchStart) this.cb.onMatchStart(data);
      });
      this.socket.on('player_moved', (data) => {
        if (this.cb.onRemotePlayerMoved) this.cb.onRemotePlayerMoved(data);
      });
      this.socket.on('player_shot', (data) => {
        if (this.cb.onRemotePlayerShot) this.cb.onRemotePlayerShot(data);
      });
      this.socket.on('health_update', (data) => {
        if (this.cb.onHealthUpdate) this.cb.onHealthUpdate(data);
      });
      this.socket.on('player_eliminated', (data) => {
        if (this.cb.onPlayerEliminated) this.cb.onPlayerEliminated(data);
      });
      this.socket.on('match_end', (data) => {
        this.inMatch = false;
        if (this.cb.onMatchEnd) this.cb.onMatchEnd(data);
      });
      this.socket.on('player_left', (data) => {
        if (this.cb.onRemotePlayerLeft) this.cb.onRemotePlayerLeft(data);
      });
      this.socket.on('zone_update', (data) => {
        if (this.cb.onZoneUpdate) this.cb.onZoneUpdate(data);
      });
      this.socket.on('loot_granted', (data) => {
        if (this.cb.onLootGranted) this.cb.onLootGranted(data);
      });
      this.socket.on('loot_removed', (data) => {
        if (this.cb.onLootRemoved) this.cb.onLootRemoved(data);
      });
      this.socket.on('gloo_spawned', (data) => {
        if (this.cb.onGlooSpawned) this.cb.onGlooSpawned(data);
      });
      this.socket.on('gloo_update', (data) => {
        if (this.cb.onGlooUpdate) this.cb.onGlooUpdate(data);
      });
      this.socket.on('gloo_destroyed', (data) => {
        if (this.cb.onGlooDestroyed) this.cb.onGlooDestroyed(data);
      });
    }

    simulatePlayerJoin() {
      if (this.isLiveServer || this.localPlayers.length >= 15) return;
      const name = PREVIEW_BOT_NAMES[(this.localPlayers.length - 1) % PREVIEW_BOT_NAMES.length];
      this.localPlayers.push({ id: 'sim_' + Date.now() + '_' + this.localPlayers.length, username: name, isBot: false, alive: true, hp: 150, kills: 0 });

      if (this.localPlayers.length >= 15) {
        this.startLocalMatch();
        return;
      }

      if (this.localPlayers.length >= 2 && !this.localTimer) {
        this.localCountdown = 15;
        this.emitLocalLobbyUpdate('countdown');
        this.localTimer = setInterval(() => {
          this.localCountdown -= 1;
          if (this.cb.onCountdownTick) {
            this.cb.onCountdownTick({ roomId: this.roomId, countdown: this.localCountdown, playerCount: this.localPlayers.length });
          }
          if (this.localCountdown <= 0) this.startLocalMatch();
        }, 1000);
      } else {
        this.emitLocalLobbyUpdate(this.localTimer ? 'countdown' : 'waiting');
      }
    }

    emitLocalLobbyUpdate(status) {
      if (this.cb.onLobbyUpdate) {
        this.cb.onLobbyUpdate({
          roomId: this.roomId, status, countdown: this.localCountdown,
          maxPlayers: 15, minPlayers: 2, players: this.localPlayers, previewMode: true
        });
      }
    }

    startLocalMatch() {
      if (this.localTimer) { clearInterval(this.localTimer); this.localTimer = null; }
      // Auto-backfill remaining slots to 15/15 with AI bots just like server.js!
      let botIdx = 0;
      while (this.localPlayers.length < 15) {
        const bName = `[BOT] ${PREVIEW_BOT_NAMES[botIdx % PREVIEW_BOT_NAMES.length]}`;
        this.localPlayers.push({
          id: 'preview_bot_' + (botIdx + 1),
          username: bName,
          isBot: true,
          alive: true,
          hp: 150,
          kills: 0
        });
        botIdx++;
      }
      this.inMatch = true;
      if (this.cb.onMatchStart) {
        this.cb.onMatchStart({
          roomId: this.roomId,
          flightAngle: (Math.random() - 0.5) * 0.85,
          startTime: Date.now(),
          totalPlayers: this.localPlayers.length,
          aliveCount: this.localPlayers.length,
          players: this.localPlayers,
          previewMode: true
        });
      }
    }

    leaveLobby() {
      if (this.localTimer) { clearInterval(this.localTimer); this.localTimer = null; }
      this.inMatch = false;
      if (this.isLiveServer && this.socket) this.socket.emit('leave_lobby');
      this.localPlayers = [];
      this.roomId = null;
    }

    sendMove(state) {
      if (this.isLiveServer && this.socket && this.inMatch) this.socket.emit('player_move', state);
    }

    sendShoot(shot) {
      if (this.isLiveServer && this.socket && this.inMatch) this.socket.emit('player_shoot', shot);
    }

    requestLootPickup(lootId) {
      if (this.isLiveServer && this.socket && this.inMatch) {
        this.socket.emit('loot_pickup', { lootId });
        return true;
      }
      return false;
    }

    requestGlooDeploy(x, y, z, yaw) {
      if (this.isLiveServer && this.socket && this.inMatch) {
        this.socket.emit('gloo_deploy', { x, y, z, yaw });
        return true;
      }
      return false;
    }

    sendGlooHit(glooId, damage) {
      if (this.isLiveServer && this.socket && this.inMatch) {
        this.socket.emit('gloo_hit', { glooId, damage });
        return true;
      }
      return false;
    }

    sendHit(report) {
      if (!report || !report.targetId) return;
      if (this.isLiveServer && this.socket && this.inMatch) {
        this.socket.emit('player_hit', {
          targetId: report.targetId,
          weapon: report.weapon,
          hitZone: report.hitZone === 'head' ? 'head' : 'body'
        });
        return;
      }

      const victim = this.localPlayers.find((p) => p.id === report.targetId);
      const self = this.localPlayers.find((p) => p.id === this.playerId);
      const stats = PREVIEW_WEAPON_STATS[report.weapon];
      if (!victim || !victim.alive || !stats) return;

      const hitZone = report.hitZone === 'head' ? 'head' : 'body';
      const damage = Math.round(stats.damage * (hitZone === 'head' ? stats.headshotMult : 1.0));
      victim.hp = Math.max(0, victim.hp - damage);

      if (this.cb.onHealthUpdate) {
        this.cb.onHealthUpdate({
          targetId: victim.id, attackerId: this.playerId, attackerName: this.username,
          hp: victim.hp, maxHp: 150, damage, hitZone, weapon: report.weapon
        });
      }

      if (victim.hp <= 0) {
        victim.alive = false;
        if (self) self.kills = (self.kills || 0) + 1;
        const aliveList = this.localPlayers.filter((p) => p.alive);
        if (this.cb.onPlayerEliminated) {
          this.cb.onPlayerEliminated({
            killerId: this.playerId, killerName: this.username, killerKills: self ? self.kills : 1,
            victimId: victim.id, victimName: victim.username, weapon: stats.label,
            isHeadshot: hitZone === 'head', aliveCount: aliveList.length, totalPlayers: this.localPlayers.length
          });
        }
        if (aliveList.length <= 1 && this.cb.onMatchEnd) {
          this.inMatch = false;
          const winner = aliveList[0] || self;
          this.cb.onMatchEnd({
            roomId: this.roomId,
            winnerId: winner ? winner.id : null,
            winnerName: winner ? winner.username : this.username,
            winnerKills: winner ? (winner.kills || 0) : 0,
            totalPlayers: this.localPlayers.length
          });
        }
      }
    }
  }

  global.BattleRoyaleNetClient = BattleRoyaleNetClient;
})(window);
