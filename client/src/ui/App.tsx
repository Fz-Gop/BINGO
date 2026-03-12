import { useEffect, useMemo, useRef, useState } from "react";
import { useGameState } from "../state/useGameState";
import type {
  CompletedLine,
  MatchResult,
  Role,
  RoomView
} from "../state/types";
import { useResultSound } from "./useResultSound";

const LINE_ANIMATION_MS = 520;

export function App() {
  const { status, view, error, actions, savedName } = useGameState();

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Bingo (2 Player)</h1>
          {view?.code ? <div className="room-code">Room: {view.code}</div> : null}
        </div>
        <div className={`pill pill--${status}`}>
          {status === "connected"
            ? "Connected"
            : status === "error"
            ? "Error"
            : "Connecting"}
        </div>
      </header>

      {error ? <div className="banner banner--error">{error}</div> : null}

      {!view ? (
        <Welcome onCreate={actions.createRoom} onJoin={actions.joinRoom} savedName={savedName} />
      ) : (
        <GameScreen view={view} actions={actions} />
      )}
    </div>
  );
}

function Welcome({
  onCreate,
  onJoin,
  savedName
}: {
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  savedName: string;
}) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState("");

  return (
    <main className="card">
      <h2 className="section-title">Start Or Join</h2>
      <div className="form">
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Player name"
          />
        </label>

        <div className="row">
          <button className="btn primary" onClick={() => onCreate(name)}>
            Create Room
          </button>
        </div>

        <label className="field">
          <span>Room Code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABCD"
            maxLength={4}
          />
        </label>
        <div className="row">
          <button className="btn" onClick={() => onJoin(code, name)}>
            Join Room
          </button>
        </div>
      </div>
    </main>
  );
}

function GameScreen({
  view,
  actions
}: {
  view: RoomView;
  actions: {
    setReady: (ready: boolean) => void;
    confirmCall: (number: number) => void;
    requestRematch: () => void;
    respondRematch: (accept: boolean) => void;
    forceRematch: () => void;
    endTieDueDisconnect: () => void;
  };
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [animatedLineIds, setAnimatedLineIds] = useState<string[]>([]);
  const previousLineIdsRef = useRef<string[] | null>(null);
  const previousStatusRef = useRef<RoomView["status"] | null>(null);
  const playResultSound = useResultSound();

  const isYourTurn = view.currentTurn === view.you?.role;
  const inMatch = view.status === "in_match";
  const canPlay = inMatch && !view.paused && isYourTurn;
  const calledSet = useMemo(() => new Set(view.calledNumbers), [view.calledNumbers]);

  useEffect(() => {
    setSelected(null);
    if (view.completedLines.length === 0) {
      setAnimatedLineIds([]);
    }
  }, [view.board, view.code, view.status, view.completedLines.length]);

  useEffect(() => {
    const currentIds = view.completedLines.map((line) => line.id);
    const previousIds = previousLineIdsRef.current;

    if (previousIds) {
      const freshIds = currentIds.filter((id) => !previousIds.includes(id));
      if (freshIds.length > 0) {
        setAnimatedLineIds(freshIds);
        const timeout = window.setTimeout(() => {
          setAnimatedLineIds((activeIds) =>
            activeIds.filter((id) => !freshIds.includes(id))
          );
        }, LINE_ANIMATION_MS);

        previousLineIdsRef.current = currentIds;
        return () => window.clearTimeout(timeout);
      }
    } else {
      setAnimatedLineIds([]);
    }

    previousLineIdsRef.current = currentIds;
    return undefined;
  }, [view.completedLines]);

  useEffect(() => {
    if (
      previousStatusRef.current &&
      previousStatusRef.current !== "ended" &&
      view.status === "ended"
    ) {
      playResultSound(view.lastResult, view.you?.role);
    }
    previousStatusRef.current = view.status;
  }, [playResultSound, view.lastResult, view.status, view.you?.role]);

  const resultText = useMemo(
    () => getResultPresentation(view.lastResult, view.you?.role),
    [view.lastResult, view.you?.role]
  );

  const rematchFromYou = view.rematch && view.rematch.from === view.you?.role;
  const rematchFromOpponent = view.rematch && view.rematch.from !== view.you?.role;

  const completedCellSet = useMemo(
    () => new Set(view.completedLines.flatMap((line) => line.cells)),
    [view.completedLines]
  );

  const animatedCellSet = useMemo(
    () =>
      new Set(
        view.completedLines
          .filter((line) => animatedLineIds.includes(line.id))
          .flatMap((line) => line.cells)
      ),
    [animatedLineIds, view.completedLines]
  );

  return (
    <>
      <main className="grid-layout">
        <section className="card">
          <div className="section-title">Players</div>
          <div className="players">
            <div className="player">
              <div className="player-name">You: {view.you?.name}</div>
              <div className="player-meta">Role {view.you?.role} · Wins {view.scores.you}</div>
              <div className={`badge ${view.you?.ready ? "badge--on" : ""}`}>
                {view.you?.ready ? "Ready" : "Not Ready"}
              </div>
            </div>
            <div className="player">
              <div className="player-name">Opponent: {view.opponent?.name ?? "Waiting..."}</div>
              <div className="player-meta">
                {view.opponent ? `Role ${view.opponent.role} · Wins ${view.scores.opponent}` : "-"}
              </div>
              <div className={`badge ${view.opponent?.ready ? "badge--on" : ""}`}>
                {view.opponent?.ready ? "Ready" : "Not Ready"}
              </div>
            </div>
          </div>

          {view.status !== "in_match" ? (
            <div className="row">
              <button className="btn primary" onClick={() => actions.setReady(true)}>
                Ready
              </button>
            </div>
          ) : (
            <div className="turn-indicator">
              {view.paused ? (
                <span className="danger">Opponent disconnected. Waiting...</span>
              ) : isYourTurn ? (
                <span className="accent">Your turn</span>
              ) : (
                <span>Opponent&apos;s turn</span>
              )}
            </div>
          )}

          {view.paused && view.disconnect.opponent ? (
            <div className="row">
              <button className="btn" onClick={actions.endTieDueDisconnect}>
                End Match As Tie
              </button>
            </div>
          ) : null}
        </section>

        <section className="card board-card">
          <div className="board-header">
            <div className="section-title">Your Board</div>
            <div className="lines">Lines: {view.lines}/5</div>
          </div>
          <Board
            board={view.board}
            calledSet={calledSet}
            selected={selected}
            completedLines={view.completedLines}
            animatedLineIds={animatedLineIds}
            completedCellSet={completedCellSet}
            animatedCellSet={animatedCellSet}
            onSelect={(num) => {
              if (!canPlay || calledSet.has(num)) return;
              setSelected(num);
            }}
          />
          <BingoLetters lines={view.lines} />
          <div className="row">
            <button
              className="btn primary"
              disabled={!canPlay || selected === null}
              onClick={() => {
                if (selected === null) return;
                actions.confirmCall(selected);
                setSelected(null);
              }}
            >
              Confirm
            </button>
          </div>
        </section>

        <section className="card">
          <div className="section-title">Call Log</div>
          <ul className="log">
            {view.log.length === 0 ? <li className="muted">No calls yet.</li> : null}
            {view.log.map((entry) => (
              <li key={`${entry.ts}-${entry.number}`}>
                {entry.by === view.you?.role ? "You" : "Opponent"} called{" "}
                <strong>{entry.number}</strong>
              </li>
            ))}
          </ul>

          {view.status === "in_match" ? (
            <div className="rematch">
              {!view.rematch ? (
                <button className="btn" onClick={actions.requestRematch}>
                  Request Rematch
                </button>
              ) : rematchFromYou && view.rematch.status === "pending" ? (
                <div className="muted">Rematch request sent...</div>
              ) : rematchFromYou && view.rematch.status === "declined" ? (
                <div>
                  <div className="muted">Rematch declined.</div>
                  <button className="btn danger" onClick={actions.forceRematch}>
                    Force Rematch (You Forfeit)
                  </button>
                </div>
              ) : rematchFromOpponent && view.rematch.status === "pending" ? (
                <div className="row">
                  <button className="btn primary" onClick={() => actions.respondRematch(true)}>
                    Accept Rematch
                  </button>
                  <button className="btn" onClick={() => actions.respondRematch(false)}>
                    Decline
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>

      {view.status === "ended" ? (
        <ResultModal
          presentation={resultText}
          onReady={() => actions.setReady(true)}
          ready={view.you?.ready ?? false}
        />
      ) : null}
    </>
  );
}

function Board({
  board,
  calledSet,
  selected,
  completedLines,
  animatedLineIds,
  completedCellSet,
  animatedCellSet,
  onSelect
}: {
  board: number[];
  calledSet: Set<number>;
  selected: number | null;
  completedLines: CompletedLine[];
  animatedLineIds: string[];
  completedCellSet: Set<number>;
  animatedCellSet: Set<number>;
  onSelect: (num: number) => void;
}) {
  return (
    <div className="board-shell">
      <div className="board">
        {board.map((num, index) => {
          const called = calledSet.has(num);
          const isSelected = selected === num;
          const inCompletedLine = completedCellSet.has(index);
          const inFreshLine = animatedCellSet.has(index);

          return (
            <button
              key={num}
              className={[
                "cell",
                called ? "cell--called" : "",
                isSelected ? "cell--selected" : "",
                inCompletedLine ? "cell--line-member" : "",
                inFreshLine ? "cell--line-fresh" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect(num)}
              disabled={called}
            >
              <span className="cell__value">{num}</span>
            </button>
          );
        })}
      </div>
      <BoardLineOverlays completedLines={completedLines} animatedLineIds={animatedLineIds} />
    </div>
  );
}

function BoardLineOverlays({
  completedLines,
  animatedLineIds
}: {
  completedLines: CompletedLine[];
  animatedLineIds: string[];
}) {
  return (
    <div className="board-overlays" aria-hidden="true">
      {completedLines.map((line) => (
        <div
          key={line.id}
          className={[
            "line-overlay",
            `line-overlay--${line.type}`,
            animatedLineIds.includes(line.id) ? "line-overlay--fresh" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          style={getLineStyle(line)}
        />
      ))}
    </div>
  );
}

function ResultModal({
  presentation,
  onReady,
  ready
}: {
  presentation: ReturnType<typeof getResultPresentation>;
  onReady: () => void;
  ready: boolean;
}) {
  return (
    <div className="result-backdrop">
      <div className={`result-modal result-modal--${presentation.theme}`}>
        <div className="result-orb result-orb--one" />
        <div className="result-orb result-orb--two" />
        <div className="result-kicker">{presentation.kicker}</div>
        <div className="result-title">{presentation.title}</div>
        <p className="result-copy">{presentation.copy}</p>
        <div className="row">
          <button className="btn primary" onClick={onReady}>
            {ready ? "Waiting For Opponent" : "Ready For Next Match"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BingoLetters({ lines }: { lines: number }) {
  const letters = ["B", "I", "N", "G", "O"];

  return (
    <div className="bingo">
      {letters.map((letter, idx) => (
        <div key={letter} className={`bingo-letter ${lines > idx ? "on" : ""}`}>
          <span className="bingo-letter__glow" />
          <span className="bingo-letter__text">{letter}</span>
        </div>
      ))}
    </div>
  );
}

function getLineStyle(line: CompletedLine) {
  if (line.type === "row") {
    return {
      top: `calc(${(line.index + 0.5) * 20}% - 3px)`,
      left: "2%",
      width: "96%",
      height: "6px"
    };
  }

  if (line.type === "col") {
    return {
      top: "2%",
      left: `calc(${(line.index + 0.5) * 20}% - 3px)`,
      width: "6px",
      height: "96%"
    };
  }

  return {
    top: "50%",
    left: "50%",
    width: "136%",
    height: "6px",
    transform:
      line.index === 0
        ? "translate(-50%, -50%) rotate(45deg)"
        : "translate(-50%, -50%) rotate(-45deg)"
  };
}

function getResultPresentation(result: MatchResult, yourRole: Role | undefined) {
  if (!result) {
    return {
      kicker: "Match Over",
      title: "Round complete",
      copy: "Get ready for the next match.",
      theme: "tie" as const
    };
  }

  if (result.type === "tie") {
    return {
      kicker: "Tie Game",
      title: "Dead even",
      copy: "Both boards hit the finish together. Reset when both players are ready.",
      theme: "tie" as const
    };
  }

  const youWon = result.winnerRole === yourRole;
  if (result.type === "forfeit") {
    return youWon
      ? {
          kicker: "Forfeit Win",
          title: "You take the point",
          copy: "The match ended early in your favor. Ready up when you want the next board.",
          theme: "win" as const
        }
      : {
          kicker: "Forfeit Loss",
          title: "Point conceded",
          copy: "This round counts for your opponent. Ready up for the next board.",
          theme: "loss" as const
        };
  }

  return youWon
    ? {
        kicker: "Victory",
        title: "You win",
        copy: "Five lines locked in. The next round is ready when both players are.",
        theme: "win" as const
      }
    : {
        kicker: "Defeat",
        title: "You lost",
        copy: "Your opponent reached five lines first. Ready up to start a fresh board.",
        theme: "loss" as const
      };
}
