import { createRoom, createPlayer } from "./logic.js";
import { generateCode, otherRole } from "./utils.js";

const rooms = new Map();
const cleanupTimers = new Map();
const ROOM_CLEANUP_TTL_MS = 30 * 60 * 1000;

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

  clearRoomCleanup(code);

  // Rejoin if same player ID exists
  const existingRole = findRoleByPlayerId(room, playerId);
  if (existingRole) {
    if (room.players[existingRole]?.left) {
      return { error: "You already left this room." };
    }
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
  if (room.players[role]?.left) {
    return { error: "You already left this room." };
  }
  clearRoomCleanup(code);
  const wasDisconnected = room.players[role]?.connected === false;
  attachSocket(room, role, socketId);
  if (room.players.A?.connected && room.players.B?.connected) {
    room.disconnect = { A: false, B: false };
    if (room.status === "in_match") {
      room.paused = false;
    }
  }
  return { room, role, rejoined: true, wasDisconnected };
}

export function detachSocket(room, socketId) {
  const role = findRoleBySocketId(room, socketId);
  if (!role) return null;
  room.players[role].connected = false;
  room.players[role].socketId = null;
  scheduleRoomCleanupIfIdle(room.code);
  return role;
}

export function attachSocket(room, role, socketId) {
  const player = room.players[role];
  if (!player) return;
  clearRoomCleanup(room.code);
  player.socketId = socketId;
  player.connected = true;
  player.left = false;
  room.disconnect[role] = false;
}

export function markPlayerLeft(room, role) {
  const player = room.players[role];
  if (!player) return;
  player.connected = false;
  player.socketId = null;
  player.left = true;
  room.ready[role] = false;
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
  if (canDeleteImmediately(room)) {
    clearRoomCleanup(code);
    rooms.delete(code);
  }
}

export function getOpponentRole(role) {
  return otherRole(role);
}

export function scheduleRoomCleanupIfIdle(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (canDeleteImmediately(room)) {
    clearRoomCleanup(code);
    rooms.delete(code);
    return;
  }
  if (hasConnectedPlayers(room)) return;
  if (cleanupTimers.has(code)) return;

  const timeout = setTimeout(() => {
    cleanupTimers.delete(code);
    const latest = rooms.get(code);
    if (!latest) return;
    if (hasConnectedPlayers(latest)) return;
    rooms.delete(code);
  }, ROOM_CLEANUP_TTL_MS);

  cleanupTimers.set(code, timeout);
}

export function clearRoomCleanup(code) {
  const timer = cleanupTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(code);
  }
}

function hasConnectedPlayers(room) {
  return Boolean(room.players.A?.connected || room.players.B?.connected);
}

function canDeleteImmediately(room) {
  const players = [room.players.A, room.players.B].filter(Boolean);
  if (players.length === 0) return true;
  if (players.some((player) => player.connected)) return false;
  return players.every((player) => player.left);
}
