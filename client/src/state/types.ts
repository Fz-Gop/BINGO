export type Role = "A" | "B";
export type RoomStatus = "lobby" | "in_match" | "ended";
export type CompletedLine = {
  id: string;
  type: "row" | "col" | "diag";
  index: number;
  cells: number[];
};

export type MatchResult =
  | { type: "win"; winnerRole: Role }
  | { type: "tie" }
  | { type: "forfeit"; winnerRole: Role }
  | null;

export type RematchState = {
  from: Role;
  status: "pending" | "declined";
} | null;

export type RoomView = {
  code: string;
  status: RoomStatus;
  paused: boolean;
  you: {
    id: string;
    name: string;
    role: Role;
    ready: boolean;
    connected: boolean;
  } | null;
  opponent: {
    name: string;
    role: Role;
    ready: boolean;
    connected: boolean;
  } | null;
  startingPlayer: Role;
  currentTurn: Role;
  board: number[];
  calledNumbers: number[];
  lines: number;
  completedLines: CompletedLine[];
  scores: {
    you: number;
    opponent: number;
  };
  log: Array<{ by: Role; number: number; ts: number }>;
  lastResult: MatchResult;
  rematch: RematchState;
  disconnect: {
    you: boolean;
    opponent: boolean;
  };
};
