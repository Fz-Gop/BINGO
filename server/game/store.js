import { createPlayer, createRoom, getPlayer, getRoomPlayers } from "./logic.js";
import { PRECONFIG_JOIN_LIMIT, generateCode } from "./utils.js";

const rooms = new Map();
const cleanupTimers = new Map();
const ROOM_CLEANUP_TTL_MS = 30 * 60 * 1000;

export function getRoom(code) {
  return rooms.get(code) ?? null;
}

export function listRooms() {
  return rooms;
}

export function createRoomForPlayer({ playerId, name, socketId }) {
  const code = generateCode(rooms);
  const hostPlayer = createPlayer({ id: playerId, name, seat: 1, socketId });
  const room = createRoom(code, hostPlayer);
  rooms.set(code, room);
  return room;
}

export function joinRoom({ code, playerId, name, socketId }) {
  const room = rooms.get(code);
  if (!room) {
    return { error: "Room not found." };
  }

  clearRoomCleanup(code);

  const existingPlayer = room.players.find((player) => player.id === playerId);
  if (existingPlayer) {
    if (existingPlayer.left) {
      return { error: "You already left this room." };
    }
    attachSocket(room, existingPlayer.id, socketId, name);
    return { room, playerId: existingPlayer.id, rejoined: true };
  }

  if (room.config.locked) {
    return { error: "Room is locked." };
  }

  const nonLeftPlayers = room.players.filter((player) => !player.left);
  const joinLimit = room.config.configured
    ? room.config.maxPlayersConfigured
    : PRECONFIG_JOIN_LIMIT;

  if (nonLeftPlayers.length >= joinLimit) {
    return { error: room.config.configured ? "Room is full." : "Room is waiting for host configuration." };
  }

  const seat = getRoomPlayers(room).length + 1;
  const player = createPlayer({ id: playerId, name, seat, socketId });
  room.players.push(player);
  return { room, playerId: player.id, rejoined: false };
}

export function rejoinRoom({ code, playerId, socketId }) {
  const room = rooms.get(code);
  if (!room) {
    return { error: "Room not found." };
  }

  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    return { error: "Player not found in room." };
  }
  if (player.left) {
    return { error: "You already left this room." };
  }

  clearRoomCleanup(code);
  const wasDisconnected = !player.connected;
  attachSocket(room, player.id, socketId);

  return { room, playerId: player.id, wasDisconnected };
}

export function attachSocket(room, playerId, socketId, name) {
  const player = getPlayer(room, playerId);
  if (!player) return null;
  player.socketId = socketId;
  player.connected = true;
  player.disconnectDeadline = null;
  if (name) player.name = name;
  clearRoomCleanup(room.code);
  return player;
}

export function detachSocket(room, socketId) {
  const player = room.players.find((entry) => entry.socketId === socketId);
  if (!player) return null;
  player.socketId = null;
  player.connected = false;
  scheduleRoomCleanupIfIdle(room.code);
  return player;
}

export function findPlayerBySocketId(room, socketId) {
  return room.players.find((player) => player.socketId === socketId) ?? null;
}

export function maybeRemoveRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (canDeleteImmediately(room)) {
    clearRoomCleanup(code);
    rooms.delete(code);
  }
}

export function scheduleRoomCleanupIfIdle(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (canDeleteImmediately(room)) {
    clearRoomCleanup(code);
    rooms.delete(code);
    return;
  }
  if (room.players.some((player) => player.connected)) return;
  if (cleanupTimers.has(code)) return;

  const timeout = setTimeout(() => {
    cleanupTimers.delete(code);
    const latest = rooms.get(code);
    if (!latest) return;
    if (latest.players.some((player) => player.connected)) return;
    rooms.delete(code);
  }, ROOM_CLEANUP_TTL_MS);

  cleanupTimers.set(code, timeout);
}

export function clearRoomCleanup(code) {
  const timer = cleanupTimers.get(code);
  if (!timer) return;
  clearTimeout(timer);
  cleanupTimers.delete(code);
}

function canDeleteImmediately(room) {
  if (room.players.length === 0) return true;
  return room.players.every((player) => player.left);
}
