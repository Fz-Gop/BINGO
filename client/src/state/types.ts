export type Role = "A" | "B";
export type RoomStatus = "lobby" | "in_match" | "ended";
export type CompletedLine = {
  id: string;
  type: "row" | "col" | "diag";
  index: number;
  cells: number[];
};
export type MatchLogEntry =
  | {
      id: string;
      type: "call";
      by: Role;
      number: number;
      ts: number;
    }
  | {
      id: string;
      type:
        | "rematch-requested"
        | "rematch-accepted"
        | "rematch-declined"
        | "rematch-continued"
        | "rematch-forfeited"
        | "left-room"
        | "disconnect"
        | "reconnect";
      by: Role;
      ts: number;
    };

export type MatchResult =
  | { type: "win"; winnerRole: Role }
  | { type: "tie" }
  | { type: "forfeit"; winnerRole: Role }
  | null;

export type RematchState =
  | {
      phase: "pending-response";
      requester: Role;
      responder: Role;
      responderPrompt: "open" | "dismissed";
    }
  | {
      phase: "decision-pending";
      requester: Role;
      responder: Role;
    }
  | null;

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
    left?: boolean;
  } | null;
  opponent: {
    name: string;
    role: Role;
    ready: boolean;
    connected: boolean;
    left?: boolean;
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
  log: MatchLogEntry[];
  lastResult: MatchResult;
  rematch: RematchState;
  disconnect: {
    you: boolean;
    opponent: boolean;
  };
};
