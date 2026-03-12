import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { Server as SocketIOServer } from "socket.io";

import {
  applyCall,
  canStartMatch,
  endMatch,
  startMatch
} from "./game/logic.js";
import {
  createRoomForPlayer,
  detachSocket,
  findRoleBySocketId,
  joinRoom,
  listRooms,
  rejoinRoom
} from "./game/store.js";
import { toPlayerView } from "./game/serialize.js";
import { otherRole } from "./game/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));

// In "play" mode we serve the built client from server so the other laptop
// only needs to open one URL/port.
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

function emitState(room) {
  ["A", "B"].forEach((role) => {
    const player = room.players[role];
    if (!player?.socketId) return;
    io.to(player.socketId).emit("room:state", {
      view: toPlayerView(room, role)
    });
  });
}

function emitError(socket, message) {
  socket.emit("room:error", { message });
}

io.on("connection", (socket) => {
  // eslint-disable-next-line no-console
  console.log("Socket connected", { id: socket.id, origin: socket.handshake.headers.origin });

  socket.on("room:create", ({ playerId, name }) => {
    if (!playerId || !name) {
      emitError(socket, "Name is required.");
      return;
    }
    const room = createRoomForPlayer({
      playerId,
      name,
      socketId: socket.id
    });
    // eslint-disable-next-line no-console
    console.log("Room created", { code: room.code, by: name });
    emitState(room);
  });

  socket.on("room:join", ({ code, playerId, name }) => {
    if (!code || !playerId || !name) {
      emitError(socket, "Room code and name are required.");
      return;
    }
    const result = joinRoom({
      code: code.toUpperCase(),
      playerId,
      name,
      socketId: socket.id
    });
    if (result.error) {
      // eslint-disable-next-line no-console
      console.log("Room join failed", { code, error: result.error });
      emitError(socket, result.error);
      return;
    }
    // eslint-disable-next-line no-console
    console.log("Room joined", { code: result.room.code, by: name });
    emitState(result.room);
  });

  socket.on("room:rejoin", ({ code, playerId }) => {
    if (!code || !playerId) return;
    const result = rejoinRoom({ code: code.toUpperCase(), playerId, socketId: socket.id });
    if (result.error) {
      emitError(socket, result.error);
      return;
    }
    emitState(result.room);
  });

  socket.on("room:ready", ({ ready }) => {
    const { room, role } = locateRoomBySocket(socket.id);
    if (!room) return;
    if (room.status === "in_match") return;
    room.ready[role] = Boolean(ready);
    if (canStartMatch(room)) {
      startMatch(room);
    }
    emitState(room);
  });

  socket.on("game:call", ({ number }) => {
    const { room, role } = locateRoomBySocket(socket.id);
    if (!room) return;
    const result = applyCall(room, role, number);
    if (!result.ok) {
      emitError(socket, result.error);
      return;
    }
    emitState(room);
  });

  socket.on("game:rematch:request", () => {
    const { room, role } = locateRoomBySocket(socket.id);
    if (!room || room.status !== "in_match") return;
    room.rematch = { from: role, status: "pending" };
    emitState(room);
  });

  socket.on("game:rematch:respond", ({ accept }) => {
    const { room, role } = locateRoomBySocket(socket.id);
    if (!room || room.status !== "in_match") return;
    if (!room.rematch || room.rematch.status !== "pending") return;
    if (room.rematch.from === role) return;
    if (accept) {
      endMatch(room, { type: "tie" });
    } else {
      room.rematch = { from: room.rematch.from, status: "declined" };
    }
    emitState(room);
  });

  socket.on("game:rematch:force", () => {
    const { room, role } = locateRoomBySocket(socket.id);
    if (!room || room.status !== "in_match") return;
    if (!room.rematch || room.rematch.status !== "declined") return;
    if (room.rematch.from !== role) return;
    endMatch(room, { type: "forfeit", winnerRole: otherRole(role) });
    emitState(room);
  });

  socket.on("game:tie:disconnect", () => {
    const { room, role } = locateRoomBySocket(socket.id);
    if (!room || room.status !== "in_match") return;
    if (!room.paused) return;
    const opponent = otherRole(role);
    if (!room.disconnect[opponent]) return;
    endMatch(room, { type: "tie" });
    emitState(room);
  });

  socket.on("disconnect", () => {
    const { room, role, code } = locateRoomBySocket(socket.id);
    if (!room || !role) return;
    detachSocket(room, socket.id);
    room.disconnect[role] = true;
    if (room.status === "in_match") {
      room.paused = true;
    }
    emitState(room);
  });
});

function locateRoomBySocket(socketId) {
  for (const [code, room] of listRooms()) {
    const role = findRoleBySocketId(room, socketId);
    if (role) return { room, role, code };
  }
  return { room: null, role: null, code: null };
}

httpServer.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
