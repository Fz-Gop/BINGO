import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { Server as SocketIOServer } from "socket.io";

import {
  appendEventLog,
  canHostStart,
  canStartReadyRound,
  castRematchVote,
  configureRoom,
  createRematchVote,
  expireRematchVote,
  forfeitRound,
  getNonLeftPlayers,
  getPlayer,
  leaveRoom,
  markPlayerDisconnected,
  reconnectPlayer,
  setPlayerReady,
  startFirstMatch,
  startNextRound,
  timeoutPlayer,
  applyCall
} from "./game/logic.js";
import {
  clearRoomCleanup,
  createRoomForPlayer,
  detachSocket,
  findPlayerBySocketId,
  getRoom,
  joinRoom,
  listRooms,
  maybeRemoveRoom,
  rejoinRoom,
  scheduleRoomCleanupIfIdle
} from "./game/store.js";
import { toPlayerView } from "./game/serialize.js";
import {
  DISCONNECT_GRACE_MS,
  PLAYABLE_BOARD_SIZES,
  PLAYABLE_PLAYER_COUNTS,
  REMATCH_VOTE_MS,
  now
} from "./game/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(__dirname, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          origin: true,
          methods: ["GET", "POST"]
        }
});

const disconnectTimers = new Map();
const rematchVoteTimers = new Map();

function emitState(room) {
  room.players.forEach((player) => {
    if (!player.socketId || player.left) return;
    io.to(player.socketId).emit("room:state", {
      view: toPlayerView(room, player.id)
    });
  });
}

function emitError(socket, message) {
  socket.emit("room:error", { message });
}

function emitLeft(socket) {
  socket.emit("room:left");
}

function locateRoomBySocket(socketId) {
  for (const room of listRooms().values()) {
    const player = findPlayerBySocketId(room, socketId);
    if (player) {
      return { room, player };
    }
  }
  return { room: null, player: null };
}

function clearDisconnectTimer(roomCode, playerId) {
  const key = `${roomCode}:${playerId}`;
  const timeout = disconnectTimers.get(key);
  if (!timeout) return;
  clearTimeout(timeout);
  disconnectTimers.delete(key);
}

function clearRematchVoteTimer(roomCode) {
  const timeout = rematchVoteTimers.get(roomCode);
  if (!timeout) return;
  clearTimeout(timeout);
  rematchVoteTimers.delete(roomCode);
}

function syncTimers(room) {
  room.players.forEach((player) => {
    if (!player.disconnectDeadline || player.left || player.connected) {
      clearDisconnectTimer(room.code, player.id);
      return;
    }
    scheduleDisconnectTimeout(room, player.id, player.disconnectDeadline);
  });

  if (!room.rematchVote) {
    clearRematchVoteTimer(room.code);
  } else {
    scheduleRematchVoteTimeout(room, room.rematchVote.expiresAt);
  }
}

function scheduleDisconnectTimeout(room, playerId, deadline) {
  const key = `${room.code}:${playerId}`;
  clearDisconnectTimer(room.code, playerId);
  const delay = Math.max(0, deadline - now());
  const timeout = setTimeout(() => {
    disconnectTimers.delete(key);
    const liveRoom = getRoom(room.code);
    if (!liveRoom) return;
    const player = getPlayer(liveRoom, playerId);
    if (!player || player.left || player.connected) return;
    if (player.disconnectDeadline !== deadline) return;

    appendEventLog(liveRoom, { type: "timeout-left", playerId });
    timeoutPlayer(liveRoom, playerId);
    clearRematchVoteTimer(liveRoom.code);
    syncTimers(liveRoom);
    maybeRemoveRoom(liveRoom.code);
    const latest = getRoom(liveRoom.code);
    if (latest) {
      emitState(latest);
      scheduleRoomCleanupIfIdle(latest.code);
    }
  }, delay);
  disconnectTimers.set(key, timeout);
}

function scheduleRematchVoteTimeout(room, expiresAt) {
  clearRematchVoteTimer(room.code);
  const delay = Math.max(0, expiresAt - now());
  const timeout = setTimeout(() => {
    rematchVoteTimers.delete(room.code);
    const liveRoom = getRoom(room.code);
    if (!liveRoom || !liveRoom.rematchVote) return;
    if (liveRoom.rematchVote.expiresAt !== expiresAt) return;
    expireRematchVote(liveRoom);
    emitState(liveRoom);
  }, delay);
  rematchVoteTimers.set(room.code, timeout);
}

function cleanupRoomIfGone(room) {
  maybeRemoveRoom(room.code);
  const latest = getRoom(room.code);
  if (!latest) {
    clearRematchVoteTimer(room.code);
    room.players.forEach((player) => clearDisconnectTimer(room.code, player.id));
    return true;
  }
  return false;
}

function validateConfig({ maxPlayers, boardSize }, room) {
  if (!PLAYABLE_PLAYER_COUNTS.includes(maxPlayers)) {
    return "That player count is not available yet.";
  }
  if (!PLAYABLE_BOARD_SIZES.includes(boardSize)) {
    return "That grid size is not available yet.";
  }
  if (maxPlayers < getNonLeftPlayers(room).length) {
    return "You cannot configure fewer players than have already joined.";
  }
  return null;
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ playerId, name }) => {
    if (!playerId || !name?.trim()) {
      emitError(socket, "Name is required.");
      return;
    }
    const room = createRoomForPlayer({
      playerId,
      name: name.trim(),
      socketId: socket.id
    });
    emitState(room);
  });

  socket.on("room:join", ({ code, playerId, name }) => {
    if (!code || !playerId || !name?.trim()) {
      emitError(socket, "Room code and name are required.");
      return;
    }
    const result = joinRoom({
      code: code.trim().toUpperCase(),
      playerId,
      name: name.trim(),
      socketId: socket.id
    });
    if (result.error) {
      emitError(socket, result.error);
      return;
    }
    emitState(result.room);
  });

  socket.on("room:rejoin", ({ code, playerId }) => {
    if (!code || !playerId) return;
    const result = rejoinRoom({
      code: code.trim().toUpperCase(),
      playerId,
      socketId: socket.id
    });
    if (result.error) {
      emitError(socket, result.error);
      return;
    }
    reconnectPlayer(result.room, playerId, socket.id);
    clearDisconnectTimer(result.room.code, playerId);
    if (result.wasDisconnected) {
      appendEventLog(result.room, { type: "reconnect", playerId });
    }
    syncTimers(result.room);
    emitState(result.room);
  });

  socket.on("room:configure", ({ maxPlayers, boardSize }) => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player) return;
    if (room.hostPlayerId !== player.id || room.config.locked) {
      emitError(socket, "Only the host can configure this room.");
      return;
    }

    const error = validateConfig({ maxPlayers, boardSize }, room);
    if (error) {
      emitError(socket, error);
      return;
    }

    configureRoom(room, { maxPlayers, boardSize });
    emitState(room);
  });

  socket.on("room:start", () => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player) return;
    if (!canHostStart(room, player.id)) {
      emitError(socket, "Only the host can start when at least two connected players are present.");
      return;
    }

    const result = startFirstMatch(room);
    if (!result.ok) {
      emitError(socket, result.error);
      return;
    }

    syncTimers(room);
    emitState(room);
  });

  socket.on("room:ready", ({ ready }) => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player) return;
    if (room.status !== "ended") return;
    setPlayerReady(room, player.id, Boolean(ready));
    if (canStartReadyRound(room)) {
      startNextRound(room);
    }
    syncTimers(room);
    emitState(room);
  });

  socket.on("game:call", ({ number }) => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player) return;
    const result = applyCall(room, player.id, number);
    if (!result.ok) {
      emitError(socket, result.error);
      return;
    }
    if (!room.rematchVote) {
      clearRematchVoteTimer(room.code);
    }
    syncTimers(room);
    emitState(room);
  });

  socket.on("game:forfeit", () => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player) return;
    const result = forfeitRound(room, player.id);
    if (!result.ok) {
      emitError(socket, result.error);
      return;
    }
    if (!room.rematchVote) {
      clearRematchVoteTimer(room.code);
    }
    syncTimers(room);
    emitState(room);
  });

  socket.on("game:rematch:request", () => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player) return;
    const result = createRematchVote(room, player.id);
    if (!result.ok) {
      emitError(socket, result.error);
      return;
    }
    scheduleRematchVoteTimeout(room, room.rematchVote.expiresAt);
    emitState(room);
  });

  socket.on("game:rematch:vote", ({ vote }) => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player) return;
    const result = castRematchVote(room, player.id, vote);
    if (!result.ok) {
      emitError(socket, result.error);
      return;
    }
    if (result.restarted) {
      clearRematchVoteTimer(room.code);
    } else {
      syncTimers(room);
    }
    emitState(room);
  });

  socket.on("room:leave", () => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player) return;
    clearDisconnectTimer(room.code, player.id);
    appendEventLog(room, { type: "left-room", playerId: player.id });
    leaveRoom(room, player.id);
    emitLeft(socket);
    if (cleanupRoomIfGone(room)) {
      return;
    }
    syncTimers(room);
    emitState(room);
  });

  socket.on("disconnect", () => {
    const { room, player } = locateRoomBySocket(socket.id);
    if (!room || !player || player.left) return;
    const detached = detachSocket(room, socket.id);
    if (!detached) return;
    markPlayerDisconnected(room, player.id);
    appendEventLog(room, { type: "disconnect", playerId: player.id });
    scheduleDisconnectTimeout(room, player.id, getPlayer(room, player.id)?.disconnectDeadline ?? now() + DISCONNECT_GRACE_MS);
    emitState(room);
  });
});

httpServer.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
