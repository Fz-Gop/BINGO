import { otherRole } from "./utils.js";

export function toPlayerView(room, role) {
  const you = room.players[role];
  const oppRole = otherRole(role);
  const opponent = room.players[oppRole];

  return {
    code: room.code,
    status: room.status,
    paused: room.paused,
    you: you
      ? {
          id: you.id,
          name: you.name,
          role: you.role,
          ready: room.ready[role],
          connected: you.connected
        }
      : null,
    opponent: opponent
      ? {
          name: opponent.name,
          role: opponent.role,
          ready: room.ready[oppRole],
          connected: opponent.connected
        }
      : null,
    startingPlayer: room.startingPlayer,
    currentTurn: room.currentTurn,
    board: room.boards[role],
    calledNumbers: Array.from(room.calledNumbers),
    lines: room.lines[role],
    completedLines: room.completedLines[role],
    scores: {
      you: room.scores[role],
      opponent: room.scores[oppRole]
    },
    log: room.log,
    lastResult: room.lastResult,
    rematch: room.rematch,
    disconnect: {
      you: room.disconnect[role],
      opponent: room.disconnect[oppRole]
    }
  };
}
