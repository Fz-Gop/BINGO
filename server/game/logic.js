import {
  DISCONNECT_GRACE_MS,
  REMATCH_VOTE_MS,
  generateBoard,
  now
} from "./utils.js";

export function createRoom(code, hostPlayer) {
  return {
    code,
    createdAt: now(),
    sequence: 0,
    status: "configuring",
    hostPlayerId: hostPlayer.id,
    config: {
      configured: false,
      maxPlayersConfigured: null,
      boardSize: null,
      locked: false
    },
    players: [hostPlayer],
    eventLog: [],
    rematchVote: null,
    lastResult: null,
    nextStartingPlayerId: hostPlayer.id,
    round: createEmptyRound()
  };
}

export function createPlayer({ id, name, seat, socketId }) {
  return {
    id,
    name,
    seat,
    joinedAt: now(),
    socketId,
    connected: true,
    left: false,
    ready: false,
    score: 0,
    disconnectDeadline: null
  };
}

export function createEmptyRound(number = 0) {
  return {
    number,
    startingPlayerId: null,
    currentTurnPlayerId: null,
    pausedOnPlayerId: null,
    activePlayerIds: [],
    forfeitedPlayerIds: [],
    boardsByPlayerId: {},
    calledNumbers: [],
    completedLinesByPlayerId: {},
    lineCountsByPlayerId: {}
  };
}

function nextId(room, prefix) {
  room.sequence += 1;
  return `${prefix}-${room.sequence}`;
}

export function appendEventLog(room, entry) {
  room.eventLog.push({
    id: nextId(room, "evt"),
    ts: now(),
    ...entry
  });
}

export function appendRematchLog(room, entry) {
  if (!room.rematchVote) return;
  room.rematchVote.log.push({
    id: nextId(room, "rv"),
    ts: now(),
    ...entry
  });
}

export function getRoomPlayers(room) {
  return room.players.slice().sort((a, b) => a.seat - b.seat);
}

export function getNonLeftPlayers(room) {
  return getRoomPlayers(room).filter((player) => !player.left);
}

export function getConnectedNonLeftPlayers(room) {
  return getNonLeftPlayers(room).filter((player) => player.connected);
}

export function getPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId) ?? null;
}

export function getCurrentRoundPlayers(room) {
  const active = new Set(room.round.activePlayerIds);
  return getRoomPlayers(room).filter((player) => active.has(player.id));
}

export function getOrderedRoundPlayerIds(room) {
  return getCurrentRoundPlayers(room).map((player) => player.id);
}

export function getForfeitedPlayerIds(room) {
  return room.round.forfeitedPlayerIds.slice();
}

export function getReadyToStartPlayers(room) {
  return getConnectedNonLeftPlayers(room);
}

export function configureRoom(room, { maxPlayers, boardSize }) {
  room.config = {
    configured: true,
    maxPlayersConfigured: maxPlayers,
    boardSize,
    locked: false
  };
  room.status = "lobby";
}

export function canHostStart(room, playerId) {
  return (
    room.status === "lobby" &&
    !room.config.locked &&
    room.hostPlayerId === playerId &&
    room.config.configured &&
    getReadyToStartPlayers(room).length >= 2
  );
}

export function renamePlayer(room, playerId, name) {
  const player = getPlayer(room, playerId);
  if (!player || player.left) {
    return { ok: false, error: "Only room participants can change their name." };
  }
  if (room.config.locked || (room.status !== "configuring" && room.status !== "lobby")) {
    return { ok: false, error: "Names can only be changed before the first match starts." };
  }

  player.name = name;
  return { ok: true };
}

export function startFirstMatch(room) {
  const starters = getReadyToStartPlayers(room);
  if (starters.length < 2) {
    return { ok: false, error: "At least two connected players are required." };
  }

  const starterIds = new Set(starters.map((player) => player.id));
  room.players.forEach((player) => {
    if (!starterIds.has(player.id)) {
      player.left = true;
      player.connected = false;
      player.socketId = null;
      player.disconnectDeadline = null;
      player.ready = false;
    }
  });

  room.config.maxPlayersConfigured = starters.length;
  room.config.locked = true;
  room.hostPlayerId = null;

  startRound(room);
  return { ok: true };
}

export function startRound(room) {
  const boardSize = room.config.boardSize;
  const roundPlayers = getNonLeftPlayers(room);
  const roundIds = roundPlayers.map((player) => player.id);

  if (roundIds.length < 2) {
    return false;
  }

  const startingPlayerId = resolveStartingPlayer(room, roundIds);

  room.round = {
    number: room.round.number + 1,
    startingPlayerId,
    currentTurnPlayerId: startingPlayerId,
    pausedOnPlayerId: null,
    activePlayerIds: roundIds,
    forfeitedPlayerIds: [],
    boardsByPlayerId: Object.fromEntries(
      roundIds.map((playerId) => [playerId, generateBoard(boardSize)])
    ),
    calledNumbers: [],
    completedLinesByPlayerId: Object.fromEntries(roundIds.map((playerId) => [playerId, []])),
    lineCountsByPlayerId: Object.fromEntries(roundIds.map((playerId) => [playerId, 0]))
  };

  room.status = "in_match";
  room.eventLog = [];
  room.rematchVote = null;
  room.lastResult = null;

  roundPlayers.forEach((player) => {
    player.ready = false;
  });

  room.nextStartingPlayerId = getNextPlayerId(room, startingPlayerId, roundIds);

  const starter = getPlayer(room, startingPlayerId);
  if (starter && !starter.connected) {
    room.round.pausedOnPlayerId = startingPlayerId;
  }

  return true;
}

export function setPlayerReady(room, playerId, ready) {
  const player = getPlayer(room, playerId);
  if (!player || player.left) return false;
  player.ready = Boolean(ready);
  return true;
}

export function canStartReadyRound(room) {
  if (room.status !== "ended") return false;
  const players = getNonLeftPlayers(room);
  if (players.length < 2) return false;
  if (players.some((player) => !player.connected)) return false;
  return players.every((player) => player.ready);
}

export function startNextRound(room) {
  return startRound(room);
}

export function applyCall(room, playerId, number) {
  if (room.status !== "in_match") {
    return { ok: false, error: "Round is not active." };
  }

  if (!Number.isInteger(number) || number < 1 || number > room.config.boardSize ** 2) {
    return { ok: false, error: "Invalid number." };
  }

  if (room.round.currentTurnPlayerId !== playerId) {
    return { ok: false, error: "Not your turn." };
  }

  if (room.round.pausedOnPlayerId) {
    return { ok: false, error: "Round is waiting for a disconnected player." };
  }

  if (!room.round.activePlayerIds.includes(playerId)) {
    return { ok: false, error: "You are not active in this round." };
  }

  if (room.round.calledNumbers.includes(number)) {
    return { ok: false, error: "Number already called." };
  }

  room.round.calledNumbers.push(number);
  appendEventLog(room, { type: "call", playerId, number });

  const calledSet = new Set(room.round.calledNumbers);
  room.round.activePlayerIds.forEach((activePlayerId) => {
    const board = room.round.boardsByPlayerId[activePlayerId];
    const completedLines = getCompletedLines(board, calledSet, room.config.boardSize);
    room.round.completedLinesByPlayerId[activePlayerId] = completedLines;
    room.round.lineCountsByPlayerId[activePlayerId] = completedLines.length;
  });

  const winners = room.round.activePlayerIds.filter(
    (activePlayerId) => room.round.lineCountsByPlayerId[activePlayerId] >= room.config.boardSize
  );

  if (winners.length > 0) {
    endRound(room, {
      trigger: "lines",
      winnerIds: winners,
      awardedPointIds: winners,
      activePlayerIds: room.round.activePlayerIds.slice()
    });
    return { ok: true, result: "ended" };
  }

  const advanced = advanceTurn(room, playerId);
  if (!advanced.ok) {
    return { ok: false, error: advanced.error };
  }

  return { ok: true, result: room.round.pausedOnPlayerId ? "paused" : "continue" };
}

export function forfeitRound(room, playerId) {
  if (room.status !== "in_match") {
    return { ok: false, error: "Round is not active." };
  }
  if (!room.round.activePlayerIds.includes(playerId)) {
    return { ok: false, error: "You are not active in this round." };
  }

  const needsTurnAdvance =
    room.round.currentTurnPlayerId === playerId || room.round.pausedOnPlayerId === playerId;

  room.round.activePlayerIds = room.round.activePlayerIds.filter((id) => id !== playerId);
  if (!room.round.forfeitedPlayerIds.includes(playerId)) {
    room.round.forfeitedPlayerIds.push(playerId);
  }
  appendEventLog(room, { type: "forfeit", playerId });

  return resolveAfterParticipantRemoval(room, playerId, needsTurnAdvance);
}

export function removePlayerFromRound(room, playerId) {
  room.round.activePlayerIds = room.round.activePlayerIds.filter((id) => id !== playerId);
  if (room.round.currentTurnPlayerId === playerId) {
    room.round.currentTurnPlayerId = null;
  }
  if (room.round.pausedOnPlayerId === playerId) {
    room.round.pausedOnPlayerId = null;
  }
}

export function resolveAfterParticipantRemoval(room, playerId, needsTurnAdvance = false) {
  const remainingIds = room.round.activePlayerIds.slice();

  if (remainingIds.length === 1) {
    const winnerId = remainingIds[0];
    endRound(room, {
      trigger: "last-player",
      winnerIds: [winnerId],
      awardedPointIds: [winnerId],
      activePlayerIds: remainingIds
    });
    return { ok: true, ended: true };
  }

  if (remainingIds.length === 0) {
    room.status = "ended";
    room.lastResult = {
      trigger: "empty",
      winnerIds: [],
      awardedPointIds: [],
      activePlayerIds: [],
      endedAt: now()
    };
    clearReady(room);
    room.rematchVote = null;
    return { ok: true, ended: true };
  }

  if (!needsTurnAdvance) {
    return { ok: true, ended: false, paused: Boolean(room.round.pausedOnPlayerId) };
  }

  const advanced = advanceTurn(room, playerId);
  return { ok: true, ended: false, paused: Boolean(room.round.pausedOnPlayerId), advanced };
}

export function endRound(room, result) {
  room.status = "ended";
  room.round.pausedOnPlayerId = null;
  room.lastResult = {
    ...result,
    endedAt: now()
  };
  room.rematchVote = null;
  clearReady(room);

  const awarded = new Set(result.awardedPointIds);
  room.players.forEach((player) => {
    if (awarded.has(player.id)) {
      player.score += 1;
    }
  });
}

export function clearReady(room) {
  room.players.forEach((player) => {
    if (!player.left) {
      player.ready = false;
    }
  });
}

export function markPlayerDisconnected(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player || player.left) return false;
  player.connected = false;
  player.socketId = null;
  player.disconnectDeadline = now() + DISCONNECT_GRACE_MS;

  if (room.status === "in_match" && room.round.currentTurnPlayerId === playerId) {
    room.round.pausedOnPlayerId = playerId;
  }

  return true;
}

export function reconnectPlayer(room, playerId, socketId) {
  const player = getPlayer(room, playerId);
  if (!player || player.left) {
    return { ok: false, error: "Player cannot rejoin this room." };
  }

  player.connected = true;
  player.socketId = socketId;
  player.disconnectDeadline = null;

  if (room.status === "in_match" && room.round.pausedOnPlayerId === playerId) {
    room.round.pausedOnPlayerId = null;
  }

  return { ok: true };
}

export function timeoutPlayer(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player || player.left) return { ok: false };

  player.left = true;
  player.connected = false;
  player.socketId = null;
  player.disconnectDeadline = null;
  player.ready = false;

  if (!room.config.locked) {
    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = getOldestRemainingPlayerId(room);
    }
    if (getNonLeftPlayers(room).length === 0) {
      return { ok: true, removedFromRoom: true };
    }
    return { ok: true, removedFromRoom: false };
  }

  if (room.status === "in_match") {
    const needsTurnAdvance =
      room.round.currentTurnPlayerId === playerId || room.round.pausedOnPlayerId === playerId;
    removePlayerFromRound(room, playerId);
    const outcome = resolveAfterParticipantRemoval(room, playerId, needsTurnAdvance);
    return { ok: true, removedFromRoom: false, roundOutcome: outcome };
  }

  if (room.status === "ended" && canStartReadyRound(room)) {
    startNextRound(room);
  }

  return { ok: true, removedFromRoom: false };
}

export function leaveRoom(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player || player.left) return { ok: false, error: "Player already left." };

  player.left = true;
  player.connected = false;
  player.socketId = null;
  player.disconnectDeadline = null;
  player.ready = false;

  if (!room.config.locked) {
    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = getOldestRemainingPlayerId(room);
    }
    return { ok: true, roomEmpty: getNonLeftPlayers(room).length === 0 };
  }

  if (room.status === "in_match") {
    const needsTurnAdvance =
      room.round.currentTurnPlayerId === playerId || room.round.pausedOnPlayerId === playerId;
    removePlayerFromRound(room, playerId);
    const outcome = resolveAfterParticipantRemoval(room, playerId, needsTurnAdvance);
    return { ok: true, roomEmpty: getNonLeftPlayers(room).length === 0, roundOutcome: outcome };
  }

  if (room.status === "ended" && canStartReadyRound(room)) {
    startNextRound(room);
  }

  return { ok: true, roomEmpty: getNonLeftPlayers(room).length === 0 };
}

export function createRematchVote(room, playerId) {
  if (room.status !== "in_match") {
    return { ok: false, error: "Round must be active for rematch voting." };
  }
  if (room.rematchVote) {
    return { ok: false, error: "A rematch vote is already active." };
  }
  const player = getPlayer(room, playerId);
  if (!player || player.left) {
    return { ok: false, error: "Only room participants can request a rematch." };
  }
  if (!room.round.activePlayerIds.includes(playerId)) {
    return { ok: false, error: "Only active round participants can request a rematch." };
  }
  if (room.round.forfeitedPlayerIds.includes(playerId)) {
    return { ok: false, error: "Players who already forfeited this round cannot request a rematch." };
  }

  const forfeitedIds = new Set(room.round.forfeitedPlayerIds);
  const activeIds = new Set(room.round.activePlayerIds);
  const voterIds = getNonLeftPlayers(room)
    .filter((roomPlayer) => activeIds.has(roomPlayer.id) && !forfeitedIds.has(roomPlayer.id))
    .map((roomPlayer) => roomPlayer.id);
  room.rematchVote = {
    requesterId: playerId,
    startedAt: now(),
    expiresAt: now() + REMATCH_VOTE_MS,
    voterIds,
    votes: {
      [playerId]: "accept"
    },
    log: [
      {
        id: nextId(room, "rv"),
        ts: now(),
        type: "request",
        playerId
      }
    ]
  };

  return { ok: true };
}

export function castRematchVote(room, playerId, vote) {
  if (!room.rematchVote) {
    return { ok: false, error: "No active rematch vote." };
  }
  if (!room.rematchVote.voterIds.includes(playerId)) {
    return { ok: false, error: "You are not eligible to vote." };
  }
  if (room.rematchVote.votes[playerId]) {
    return { ok: false, error: "Your vote is already recorded." };
  }
  if (vote !== "accept" && vote !== "decline") {
    return { ok: false, error: "Invalid vote." };
  }

  room.rematchVote.votes[playerId] = vote;
  appendRematchLog(room, {
    type: vote,
    playerId
  });

  const everyoneAccepted = room.rematchVote.voterIds.every(
    (voterId) => room.rematchVote?.votes[voterId] === "accept"
  );

  if (everyoneAccepted) {
    room.rematchVote = null;
    startRound(room);
    return { ok: true, restarted: true };
  }

  return { ok: true, restarted: false };
}

export function expireRematchVote(room) {
  if (!room.rematchVote) return false;
  room.rematchVote = null;
  return true;
}

export function getCompletedLines(board, calledSet, boardSize) {
  const completed = [];

  for (let r = 0; r < boardSize; r += 1) {
    const cells = [];
    let complete = true;
    for (let c = 0; c < boardSize; c += 1) {
      const cellIndex = r * boardSize + c;
      cells.push(cellIndex);
      if (!calledSet.has(board[cellIndex])) {
        complete = false;
      }
    }
    if (complete) {
      completed.push({
        id: `row-${r}`,
        type: "row",
        index: r,
        cells
      });
    }
  }

  for (let c = 0; c < boardSize; c += 1) {
    const cells = [];
    let complete = true;
    for (let r = 0; r < boardSize; r += 1) {
      const cellIndex = r * boardSize + c;
      cells.push(cellIndex);
      if (!calledSet.has(board[cellIndex])) {
        complete = false;
      }
    }
    if (complete) {
      completed.push({
        id: `col-${c}`,
        type: "col",
        index: c,
        cells
      });
    }
  }

  const leading = Array.from({ length: boardSize }, (_, index) => index * (boardSize + 1));
  if (leading.every((cellIndex) => calledSet.has(board[cellIndex]))) {
    completed.push({
      id: "diag-0",
      type: "diag",
      index: 0,
      cells: leading
    });
  }

  const trailing = Array.from(
    { length: boardSize },
    (_, index) => (index + 1) * (boardSize - 1)
  );
  if (trailing.every((cellIndex) => calledSet.has(board[cellIndex]))) {
    completed.push({
      id: "diag-1",
      type: "diag",
      index: 1,
      cells: trailing
    });
  }

  return completed;
}

function resolveStartingPlayer(room, eligibleIds) {
  const orderedIds = sortIdsBySeat(room, eligibleIds);
  if (room.nextStartingPlayerId && orderedIds.includes(room.nextStartingPlayerId)) {
    return room.nextStartingPlayerId;
  }
  if (room.round.startingPlayerId) {
    return getNextPlayerId(room, room.round.startingPlayerId, orderedIds);
  }
  return orderedIds[0];
}

export function getNextPlayerId(room, fromPlayerId, eligibleIds) {
  const orderedIds = sortIdsBySeat(room, eligibleIds);
  if (orderedIds.length === 0) return null;

  const currentIndex = orderedIds.indexOf(fromPlayerId);
  if (currentIndex >= 0) {
    return orderedIds[(currentIndex + 1) % orderedIds.length];
  }

  const fromSeat = getPlayer(room, fromPlayerId)?.seat ?? -Infinity;
  const nextBySeat = orderedIds.find((playerId) => (getPlayer(room, playerId)?.seat ?? 0) > fromSeat);
  return nextBySeat ?? orderedIds[0];
}

export function advanceTurn(room, fromPlayerId) {
  const orderedActiveIds = sortIdsBySeat(room, room.round.activePlayerIds);
  if (orderedActiveIds.length === 0) {
    return { ok: false, error: "No active players remain." };
  }

  const nextPlayerId = getNextPlayerId(room, fromPlayerId, orderedActiveIds);
  if (!nextPlayerId) {
    return { ok: false, error: "Unable to resolve next turn." };
  }

  room.round.currentTurnPlayerId = nextPlayerId;
  const nextPlayer = getPlayer(room, nextPlayerId);
  if (nextPlayer && !nextPlayer.connected) {
    room.round.pausedOnPlayerId = nextPlayerId;
  } else {
    room.round.pausedOnPlayerId = null;
  }

  return { ok: true };
}

export function getOldestRemainingPlayerId(room) {
  return getNonLeftPlayers(room)[0]?.id ?? null;
}

function sortIdsBySeat(room, ids) {
  return ids
    .slice()
    .sort((leftId, rightId) => (getPlayer(room, leftId)?.seat ?? 0) - (getPlayer(room, rightId)?.seat ?? 0));
}
