import { generateBoard, otherRole, now } from "./utils.js";

export function createRoom(code) {
  return {
    code,
    players: { A: null, B: null },
    status: "lobby", // lobby | in_match | ended
    paused: false,
    disconnect: { A: false, B: false },
    ready: { A: false, B: false },
    scores: { A: 0, B: 0 },
    startingPlayer: "A",
    currentTurn: "A",
    boards: { A: [], B: [] },
    calledNumbers: new Set(),
    lines: { A: 0, B: 0 },
    completedLines: { A: [], B: [] },
    log: [],
    lastResult: null, // { type: 'win'|'tie'|'forfeit', winnerRole?: 'A'|'B' }
    rematch: null // { from: 'A'|'B', status: 'pending'|'declined' }
  };
}

export function createPlayer({ id, name, role, socketId }) {
  return {
    id,
    name,
    role,
    socketId,
    connected: true,
    left: false
  };
}

export function appendLog(room, entry) {
  room.log.push({
    id: `log-${room.log.length + 1}-${now()}`,
    ts: now(),
    ...entry
  });
}

export function getCompletedLines(board, calledSet) {
  const completed = [];

  for (let r = 0; r < 5; r += 1) {
    const cells = [];
    let complete = true;
    for (let c = 0; c < 5; c += 1) {
      const cellIndex = r * 5 + c;
      cells.push(cellIndex);
      if (!calledSet.has(board[cellIndex])) {
        complete = false;
        break;
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

  for (let c = 0; c < 5; c += 1) {
    const cells = [];
    let complete = true;
    for (let r = 0; r < 5; r += 1) {
      const cellIndex = r * 5 + c;
      cells.push(cellIndex);
      if (!calledSet.has(board[cellIndex])) {
        complete = false;
        break;
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

  const diagonals = [
    { id: "diag-0", index: 0, cells: [0, 6, 12, 18, 24] },
    { id: "diag-1", index: 1, cells: [4, 8, 12, 16, 20] }
  ];
  diagonals.forEach((diag) => {
    if (diag.cells.every((cellIndex) => calledSet.has(board[cellIndex]))) {
      completed.push({
        id: diag.id,
        type: "diag",
        index: diag.index,
        cells: diag.cells
      });
    }
  });

  return completed;
}

export function canStartMatch(room) {
  return (
    room.players.A &&
    room.players.B &&
    !room.players.A.left &&
    !room.players.B.left &&
    room.ready.A &&
    room.ready.B
  );
}

export function startMatch(room) {
  room.status = "in_match";
  room.paused = false;
  room.disconnect = { A: false, B: false };
  room.boards = { A: generateBoard(), B: generateBoard() };
  room.calledNumbers = new Set();
  room.lines = { A: 0, B: 0 };
  room.completedLines = { A: [], B: [] };
  room.log = [];
  room.lastResult = null;
  room.rematch = null;
  room.currentTurn = room.startingPlayer;
}

export function endMatch(room, result) {
  room.status = "ended";
  room.paused = false;
  room.ready = { A: false, B: false };
  room.lastResult = result;
  room.rematch = null;

  if (result?.type === "win" && result.winnerRole) {
    room.scores[result.winnerRole] += 1;
  }
  if (result?.type === "forfeit" && result.winnerRole) {
    room.scores[result.winnerRole] += 1;
  }

  // Alternate who starts next match regardless of outcome.
  room.startingPlayer = otherRole(room.startingPlayer);
}

export function applyCall(room, role, number) {
  if (room.status !== "in_match") {
    return { ok: false, error: "Match is not active." };
  }
  if (room.paused) {
    return { ok: false, error: "Match is paused (opponent disconnected)." };
  }
  if (room.rematch) {
    return { ok: false, error: "Resolve the rematch prompt before continuing." };
  }
  if (!Number.isInteger(number) || number < 1 || number > 25) {
    return { ok: false, error: "Invalid number." };
  }
  if (room.currentTurn !== role) {
    return { ok: false, error: "Not your turn." };
  }
  if (room.calledNumbers.has(number)) {
    return { ok: false, error: "Number already called." };
  }

  room.calledNumbers.add(number);
  appendLog(room, { type: "call", by: role, number });

  room.completedLines.A = getCompletedLines(room.boards.A, room.calledNumbers);
  room.completedLines.B = getCompletedLines(room.boards.B, room.calledNumbers);
  room.lines.A = room.completedLines.A.length;
  room.lines.B = room.completedLines.B.length;

  const aWin = room.lines.A >= 5;
  const bWin = room.lines.B >= 5;

  if (aWin && bWin) {
    endMatch(room, { type: "tie" });
    return { ok: true, result: "tie" };
  }
  if (aWin) {
    endMatch(room, { type: "win", winnerRole: "A" });
    return { ok: true, result: "win", winnerRole: "A" };
  }
  if (bWin) {
    endMatch(room, { type: "win", winnerRole: "B" });
    return { ok: true, result: "win", winnerRole: "B" };
  }

  room.currentTurn = otherRole(room.currentTurn);
  return { ok: true, result: "continue" };
}
