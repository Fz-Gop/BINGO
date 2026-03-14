export type RoomStatus = "configuring" | "lobby" | "in_match" | "ended";

export type CompletedLine = {
  id: string;
  type: "row" | "col" | "diag";
  index: number;
  cells: number[];
};

export type EventLogEntry =
  | {
      id: string;
      type: "call";
      playerId: string;
      number: number;
      ts: number;
    }
  | {
      id: string;
      type: "disconnect" | "reconnect" | "left-room" | "timeout-left" | "forfeit";
      playerId: string;
      ts: number;
    };

export type RematchLogEntry = {
  id: string;
  type: "request" | "accept" | "decline";
  playerId: string;
  ts: number;
};

export type MatchResult =
  | {
      trigger: "lines" | "last-player" | "empty";
      winnerIds: string[];
      awardedPointIds: string[];
      activePlayerIds: string[];
      endedAt: number;
    }
  | null;

export type RematchVote =
  | {
      requesterId: string;
      startedAt: number;
      expiresAt: number;
      voterIds: string[];
      votes: Record<string, "accept" | "decline">;
      log: RematchLogEntry[];
    }
  | null;

export type PlayerView = {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  left: boolean;
  ready: boolean;
  score: number;
  disconnectDeadline: number | null;
  isHost: boolean;
  currentRound: {
    active: boolean;
    forfeited: boolean;
  };
};

export type RoomView = {
  code: string;
  status: RoomStatus;
  selfPlayerId: string;
  hostPlayerId: string | null;
  config: {
    configured: boolean;
    locked: boolean;
    maxPlayersConfigured: number | null;
    boardSize: number | null;
    playablePlayerCounts: number[];
    comingSoonPlayerCounts: number[];
    playableBoardSizes: number[];
    comingSoonBoardSizes: number[];
  };
  players: PlayerView[];
  roundNumber: number;
  currentTurnPlayerId: string | null;
  pausedOnPlayerId: string | null;
  lineTarget: number;
  boardSize: number;
  board: number[];
  calledNumbers: number[];
  lines: number;
  completedLines: CompletedLine[];
  eventLog: EventLogEntry[];
  rematchVote: RematchVote;
  lastResult: MatchResult;
  canHostConfigure: boolean;
  canHostStart: boolean;
  joinedPlayerCount: number;
  connectedPlayerCount: number;
};
