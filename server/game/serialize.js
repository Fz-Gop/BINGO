import {
  COMING_SOON_BOARD_SIZES,
  COMING_SOON_PLAYER_COUNTS,
  PLAYABLE_BOARD_SIZES,
  PLAYABLE_PLAYER_COUNTS
} from "./utils.js";
import { getNonLeftPlayers, getPlayer, getRoomPlayers } from "./logic.js";

export function toPlayerView(room, playerId) {
  const self = getPlayer(room, playerId);
  const boardSize = room.config.boardSize ?? PLAYABLE_BOARD_SIZES[0];
  const players = getRoomPlayers(room).map((player) => ({
    id: player.id,
    name: player.name,
    seat: player.seat,
    connected: player.connected,
    left: player.left,
    ready: player.ready,
    score: player.score,
    disconnectDeadline: player.disconnectDeadline,
    isHost: room.hostPlayerId === player.id,
    currentRound: {
      active: room.round.activePlayerIds.includes(player.id),
      forfeited: room.round.forfeitedPlayerIds.includes(player.id)
    }
  }));

  return {
    code: room.code,
    status: room.status,
    selfPlayerId: playerId,
    hostPlayerId: room.hostPlayerId,
    config: {
      configured: room.config.configured,
      locked: room.config.locked,
      maxPlayersConfigured: room.config.maxPlayersConfigured,
      boardSize: room.config.boardSize,
      playablePlayerCounts: PLAYABLE_PLAYER_COUNTS,
      comingSoonPlayerCounts: COMING_SOON_PLAYER_COUNTS,
      playableBoardSizes: PLAYABLE_BOARD_SIZES,
      comingSoonBoardSizes: COMING_SOON_BOARD_SIZES
    },
    players,
    roundNumber: room.round.number,
    currentTurnPlayerId: room.round.currentTurnPlayerId,
    pausedOnPlayerId: room.round.pausedOnPlayerId,
    lineTarget: boardSize,
    boardSize,
    board: room.round.boardsByPlayerId[playerId] ?? [],
    calledNumbers: room.round.calledNumbers,
    lines: room.round.lineCountsByPlayerId[playerId] ?? 0,
    completedLines: room.round.completedLinesByPlayerId[playerId] ?? [],
    eventLog: room.eventLog,
    rematchVote: room.rematchVote,
    lastResult: room.lastResult,
    canHostConfigure:
      room.status === "configuring" && room.hostPlayerId === playerId && !room.config.locked,
    canHostStart:
      room.status === "lobby" &&
      room.hostPlayerId === playerId &&
      !room.config.locked &&
      getNonLeftPlayers(room).filter((player) => player.connected).length >= 2,
    joinedPlayerCount: getNonLeftPlayers(room).length,
    connectedPlayerCount: getNonLeftPlayers(room).filter((player) => player.connected).length
  };
}
