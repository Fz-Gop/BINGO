import { createRoom, createPlayer } from "./logic.js";
import { generateCode, otherRole } from "./utils.js";

const rooms = new Map();

export function getRoom(code) {
  return rooms.get(code);
}

export function listRooms() {
  return rooms;
}

export function createRoomForPlayer({ playerId, name, socketId }) {
  const code = generateCode(rooms);
  const room = createRoom(code);
  room.players.A = createPlayer({ id: playerId, name, role: "A", socketId });
  rooms.set(code, room);
  return room;
}

export function joinRoom({ code, playerId, name, socketId }) {
  const room = rooms.get(code);
  if (!room) {
    return { error: "Room not found." };
  }

  // Rejoin if same player ID exists
  const existingRole = findRoleByPlayerId(room, playerId);
  if (existingRole) {
    attachSocket(room, existingRole, socketId);
    if (name) room.players[existingRole].name = name;
    return { room, role: existingRole, rejoined: true };
  }

  if (!room.players.A) {
    room.players.A = createPlayer({ id: playerId, name, role: "A", socketId });
    return { room, role: "A" };
  }
  if (!room.players.B) {
    room.players.B = createPlayer({ id: playerId, name, role: "B", socketId });
    return { room, role: "B" };
  }

  return { error: "Room is full." };
}

export function rejoinRoom({ code, playerId, socketId }) {
  const room = rooms.get(code);
  if (!room) {
    return { error: "Room not found." };
  }
  const role = findRoleByPlayerId(room, playerId);
  if (!role) {
    return { error: "Player not found in room." };
  }
  attachSocket(room, role, socketId);
  if (room.players.A?.connected && room.players.B?.connected) {
    room.disconnect = { A: false, B: false };
    if (room.status === "in_match") {
      room.paused = false;
    }
  }
  return { room, role, rejoined: true };
}

export function detachSocket(room, socketId) {
  const role = findRoleBySocketId(room, socketId);
  if (!role) return null;
  room.players[role].connected = false;
  room.players[role].socketId = null;
  return role;
}

export function attachSocket(room, role, socketId) {
  const player = room.players[role];
  if (!player) return;
  player.socketId = socketId;
  player.connected = true;
  room.disconnect[role] = false;
}

export function findRoleByPlayerId(room, playerId) {
  if (room.players.A?.id === playerId) return "A";
  if (room.players.B?.id === playerId) return "B";
  return null;
}

export function findRoleBySocketId(room, socketId) {
  if (room.players.A?.socketId === socketId) return "A";
  if (room.players.B?.socketId === socketId) return "B";
  return null;
}

export function maybeRemoveRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  const noPlayers =
    !room.players.A?.connected && !room.players.B?.connected;
  if (noPlayers) rooms.delete(code);
}

export function getOpponentRole(role) {
  return otherRole(role);
}
