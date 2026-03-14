import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGameState } from "../state/useGameState";
import type {
  CompletedLine,
  MatchLogEntry,
  MatchResult,
  Role,
  RoomView
} from "../state/types";
import { useResultSound } from "./useResultSound";

const LINE_ANIMATION_MS = 520;
const LOG_HIGHLIGHT_MS = 1800;
const LOG_BOTTOM_THRESHOLD = 36;

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
        <Welcome
          onCreate={actions.createRoom}
          onJoin={actions.joinRoom}
          savedName={savedName}
          error={error}
        />
      ) : (
        <GameScreen view={view} actions={actions} />
      )}
    </div>
  );
}

function Welcome({
  onCreate,
  onJoin,
  savedName,
  error
}: {
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  savedName: string;
  error: string | null;
}) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  function handleCreate() {
    if (!name.trim()) {
      setCreateError("Enter your name before creating a room.");
      return;
    }
    setCreateError(null);
    onCreate(name);
  }

  function handleJoin() {
    if (!name.trim()) {
      setJoinError("Enter your name before joining a room.");
      return;
    }
    if (!code.trim()) {
      setJoinError("Enter the 4-letter room code.");
      return;
    }
    setJoinError(null);
    onJoin(code, name);
  }

  return (
    <main className="welcome">
      <section className="card welcome-hero">
        <div className="welcome-eyebrow">Play together from one link</div>
        <h2 className="section-title welcome-title">Create or join a Bingo room</h2>
        <p className="welcome-copy">
          Start a new room and share the code, or join instantly with the 4-letter code
          from your opponent.
        </p>

        <label className="field">
          <span>Your Name</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setCreateError(null);
              setJoinError(null);
            }}
            placeholder="How should the room know you?"
          />
        </label>
      </section>

      <section className="welcome-grid">
        <article className="card welcome-option">
          <div className="welcome-option__kicker">Host</div>
          <h3 className="welcome-option__title">Create Room</h3>
          <p className="welcome-option__copy">
            Start a fresh room here, then send the generated code to the other player.
          </p>
          <div className="welcome-option__footer">
            <button className="btn primary" onClick={handleCreate}>
              Create Room
            </button>
            <div className="welcome-option__hint">You will become Player A automatically.</div>
            {createError ? <div className="inline-error">{createError}</div> : null}
          </div>
        </article>

        <article className="card welcome-option">
          <div className="welcome-option__kicker">Guest</div>
          <h3 className="welcome-option__title">Join Room</h3>
          <p className="welcome-option__copy">
            Enter the 4-letter code shared by the host to join the exact room.
          </p>
          <label className="field">
            <span>Room Code</span>
            <input
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setJoinError(null);
              }}
              placeholder="ABCD"
              maxLength={4}
            />
          </label>
          <div className="welcome-option__footer">
            <button className="btn" onClick={handleJoin}>
              Join Room
            </button>
            <div className="welcome-option__hint">Room codes are 4 letters and case-insensitive.</div>
            {joinError ? <div className="inline-error">{joinError}</div> : null}
            {!joinError && error ? <div className="inline-error">{error}</div> : null}
          </div>
        </article>
      </section>
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
    leaveRoom: (forfeit?: boolean) => void;
    confirmCall: (number: number) => void;
    requestRematch: () => void;
    respondRematch: (accept: boolean) => void;
    dismissRematchPrompt: () => void;
    continueRematch: () => void;
    forfeitRematch: () => void;
    endTieDueDisconnect: () => void;
  };
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [animatedLineIds, setAnimatedLineIds] = useState<string[]>([]);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [isIncomingRematchModalOpen, setIsIncomingRematchModalOpen] = useState(false);
  const [isForfeitConfirmOpen, setIsForfeitConfirmOpen] = useState(false);
  const [isLeaveRoomModalOpen, setIsLeaveRoomModalOpen] = useState(false);
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const [hasUnreadLogs, setHasUnreadLogs] = useState(false);

  const previousLineIdsRef = useRef<string[] | null>(null);
  const previousStatusRef = useRef<RoomView["status"] | null>(null);
  const previousLogIdsRef = useRef<string[]>([]);
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);
  const playResultSound = useResultSound();

  const yourRole = view.you?.role;
  const isYourTurn = view.currentTurn === yourRole;
  const inMatch = view.status === "in_match";
  const opponentConnected = Boolean(view.opponent?.connected && !view.opponent?.left);
  const canPlay = inMatch && !view.paused && !view.rematch && isYourTurn;
  const isBoardHot = canPlay;
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
    if (view.status !== "ended") {
      setIsResultModalOpen(false);
    }
  }, [view.status]);

  useEffect(() => {
    if (
      previousStatusRef.current &&
      previousStatusRef.current !== "ended" &&
      view.status === "ended"
    ) {
      playResultSound(view.lastResult, yourRole);
      setIsResultModalOpen(true);
    }
    if (!previousStatusRef.current && view.status === "ended") {
      setIsResultModalOpen(true);
    }
    previousStatusRef.current = view.status;
  }, [playResultSound, view.lastResult, view.status, yourRole]);

  useEffect(() => {
    const isResponderPending =
      view.rematch?.phase === "pending-response" &&
      view.rematch.responder === yourRole &&
      view.rematch.responderPrompt === "open";

    setIsIncomingRematchModalOpen(Boolean(isResponderPending));

    if (view.rematch?.phase !== "decision-pending") {
      setIsForfeitConfirmOpen(false);
    }
  }, [view.rematch, yourRole]);

  useEffect(() => {
    const container = logScrollRef.current;
    const currentIds = view.log.map((entry) => entry.id);
    const previousIds = previousLogIdsRef.current;
    const wasNearBottom = wasNearBottomRef.current;

    if (currentIds.length === 0) {
      previousLogIdsRef.current = [];
      setHasUnreadLogs(false);
      wasNearBottomRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !previousIds.includes(id));
    if (newIds.length === 0) {
      previousLogIdsRef.current = currentIds;
      return;
    }

    const newestId = newIds[newIds.length - 1];

    if (!container || wasNearBottom) {
      requestAnimationFrame(() => {
        container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      });
      setHasUnreadLogs(false);
      wasNearBottomRef.current = true;
      setHighlightedLogId(newestId);
      const timeout = window.setTimeout(() => {
        setHighlightedLogId((current) => (current === newestId ? null : current));
      }, LOG_HIGHLIGHT_MS);

      previousLogIdsRef.current = currentIds;
      return () => window.clearTimeout(timeout);
    }

    setHasUnreadLogs(true);
    wasNearBottomRef.current = false;
    previousLogIdsRef.current = currentIds;
    return undefined;
  }, [view.log]);

  const resultText = useMemo(
    () => getResultPresentation(view.lastResult, yourRole),
    [view.lastResult, yourRole]
  );

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

  const rematchUI = getRematchUI(view, yourRole);
  const shouldConfirmLeave = inMatch && opponentConnected && !view.paused;
  const nextMatchBlocked = Boolean(view.opponent?.left);
  const { yourTurnCount, opponentTurnCount } = useMemo(() => {
    let yours = 0;
    let opponents = 0;

    view.log.forEach((entry) => {
      if (entry.type !== "call") return;
      if (entry.by === yourRole) {
        yours += 1;
      } else {
        opponents += 1;
      }
    });

    return { yourTurnCount: yours, opponentTurnCount: opponents };
  }, [view.log, yourRole]);

  function handleLeaveRequest() {
    if (shouldConfirmLeave) {
      setIsLeaveRoomModalOpen(true);
      return;
    }
    actions.leaveRoom(false);
  }

  return (
    <>
      <main className="grid-layout">
        <section className="card">
          <div className="section-heading">
            <div className="section-title">Players</div>
            <button className="btn btn--quiet" onClick={handleLeaveRequest}>
              Leave Room
            </button>
          </div>
          <div className="players">
            <div className={`player ${inMatch ? "player--active-match" : ""}`}>
              <div className="player-name">You: {view.you?.name}</div>
              <div className="player-role">Role {yourRole}</div>
              <div className="player-score">
                <div className="player-metric">
                  <span className="player-score__label">Wins</span>
                  <span className="player-score__value">{view.scores.you}</span>
                </div>
                <div className="player-metric player-metric--secondary">
                  <span className="player-score__label">Turns</span>
                  <span className="player-turns__value">{yourTurnCount}</span>
                </div>
              </div>
              {!inMatch ? (
                <div className={`badge ${view.you?.ready ? "badge--on" : ""}`}>
                  {view.you?.ready ? "Ready" : "Not Ready"}
                </div>
              ) : (
                <div className="player-status">{getPlayerStatusLabel(view, "you")}</div>
              )}
            </div>
            <div className={`player ${inMatch ? "player--active-match" : ""}`}>
              <div className="player-name">Opponent: {view.opponent?.name ?? "Waiting..."}</div>
              <div className="player-role">{view.opponent ? `Role ${view.opponent.role}` : "-"}</div>
              <div className="player-score">
                <div className="player-metric">
                  <span className="player-score__label">Wins</span>
                  <span className="player-score__value">{view.scores.opponent}</span>
                </div>
                <div className="player-metric player-metric--secondary">
                  <span className="player-score__label">Turns</span>
                  <span className="player-turns__value">{opponentTurnCount}</span>
                </div>
              </div>
              {!inMatch ? (
                <div className={`badge ${view.opponent?.ready ? "badge--on" : ""}`}>
                  {view.opponent?.ready ? "Ready" : "Not Ready"}
                </div>
              ) : (
                <div className="player-status">{getPlayerStatusLabel(view, "opponent")}</div>
              )}
            </div>
          </div>

          {view.status !== "in_match" ? (
            <div className="row">
              <button
                className="btn primary"
                onClick={() => actions.setReady(true)}
                disabled={!view.opponent || Boolean(view.opponent.left) || (view.you?.ready ?? false)}
              >
                {!view.opponent || view.opponent.left
                  ? "Waiting For Opponent"
                  : view.you?.ready
                  ? "Waiting For Opponent"
                  : "Ready"}
              </button>
            </div>
          ) : (
            <div className="turn-indicator">
              {view.paused ? (
                <span className="danger">Opponent disconnected. Waiting...</span>
              ) : view.rematch ? (
                <span className="muted">{rematchUI.statusCopy}</span>
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
            isActiveTurn={isBoardHot}
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

        <section className="card timeline-panel">
          <div className="timeline-header">
            <div className="section-title">Match Log</div>
          </div>

          <div className="timeline-stream">
            <div
              ref={logScrollRef}
              className="timeline-scroll"
              onScroll={() => {
                const container = logScrollRef.current;
                if (container && isNearBottom(container)) {
                  setHasUnreadLogs(false);
                }
                wasNearBottomRef.current = !container || isNearBottom(container);
              }}
            >
              {view.log.length === 0 ? (
                <div className="timeline-empty">No calls yet.</div>
              ) : (
                view.log.map((entry) => (
                  <LogCard
                    key={entry.id}
                    entry={entry}
                    yourRole={yourRole}
                    highlighted={highlightedLogId === entry.id}
                  />
                ))
              )}
            </div>

            {hasUnreadLogs ? (
              <button
                className="timeline-jump-chip"
                onClick={() => {
                  wasNearBottomRef.current = true;
                  logScrollRef.current?.scrollTo({
                    top: logScrollRef.current.scrollHeight,
                    behavior: "smooth"
                  });
                  setHasUnreadLogs(false);
                }}
              >
                <span className="timeline-jump-chip__dot" />
                <span className="timeline-jump-chip__label">New activity</span>
                <span className="timeline-jump-chip__arrow">↓</span>
              </button>
            ) : null}
          </div>

          <div className="timeline-footer">
            {view.status === "in_match" ? (
              <RematchFooter
                view={view}
                yourRole={yourRole}
                rematchUI={rematchUI}
                actions={actions}
              />
            ) : null}

            {view.status === "ended" && !isResultModalOpen ? (
              <div className="post-match-panel">
                <div className="section-title">Match Result</div>
                <div className="post-match-title">{resultText.title}</div>
                <p className="post-match-copy">{resultText.copy}</p>
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={() =>
                      nextMatchBlocked ? actions.leaveRoom(false) : actions.setReady(true)
                    }
                    disabled={nextMatchBlocked ? false : view.you?.ready ?? false}
                  >
                    {nextMatchBlocked
                      ? "Leave Room"
                      : view.you?.ready
                      ? "Waiting For Opponent"
                      : "Ready For Next Match"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      {view.status === "ended" && isResultModalOpen ? (
        <ResultModal
          presentation={resultText}
          onPrimaryAction={() =>
            nextMatchBlocked ? actions.leaveRoom(false) : actions.setReady(true)
          }
          primaryLabel={
            nextMatchBlocked
              ? "Leave Room"
              : view.you?.ready
              ? "Waiting For Opponent"
              : "Ready For Next Match"
          }
          primaryDisabled={nextMatchBlocked ? false : view.you?.ready ?? false}
          onDismiss={() => setIsResultModalOpen(false)}
        />
      ) : null}

      {view.status === "in_match" && isIncomingRematchModalOpen ? (
        <ActionModal
          title="Opponent wants a rematch"
          body="If you accept, the current match ends as a tie and no one gets a point."
          dismissible
          onDismiss={() => {
            setIsIncomingRematchModalOpen(false);
            actions.dismissRematchPrompt();
          }}
          actions={
            <>
              <button className="btn primary" onClick={() => actions.respondRematch(true)}>
                Accept
              </button>
              <button className="btn" onClick={() => actions.respondRematch(false)}>
                Decline
              </button>
            </>
          }
        />
      ) : null}

      {view.status === "in_match" &&
      view.rematch?.phase === "decision-pending" &&
      view.rematch.requester === yourRole ? (
        <ActionModal
          title="Rematch declined"
          body="Your opponent declined the rematch. Continue playing, or forfeit now and give them the point."
          dismissible={false}
          actions={
            <>
              <button className="btn" onClick={actions.continueRematch}>
                Continue Match
              </button>
              <button className="btn danger" onClick={() => setIsForfeitConfirmOpen(true)}>
                Forfeit Match
              </button>
            </>
          }
        />
      ) : null}

      {isForfeitConfirmOpen ? (
        <ActionModal
          title="Confirm forfeit"
          body="If you forfeit now, the current point is awarded to your opponent."
          dismissible
          onDismiss={() => setIsForfeitConfirmOpen(false)}
          actions={
            <>
              <button className="btn" onClick={() => setIsForfeitConfirmOpen(false)}>
                Go Back
              </button>
              <button className="btn danger" onClick={actions.forfeitRematch}>
                Confirm Forfeit
              </button>
            </>
          }
        />
      ) : null}

      {isLeaveRoomModalOpen ? (
        <ActionModal
          title="Leave room?"
          body="If you leave now, the current match is forfeited and the point goes to your opponent."
          dismissible={false}
          actions={
            <>
              <button className="btn" onClick={() => setIsLeaveRoomModalOpen(false)}>
                Continue
              </button>
              <button className="btn danger" onClick={() => actions.leaveRoom(true)}>
                Forfeit Match And Leave
              </button>
            </>
          }
        />
      ) : null}
    </>
  );
}

function RematchFooter({
  view,
  yourRole,
  rematchUI,
  actions
}: {
  view: RoomView;
  yourRole: Role | undefined;
  rematchUI: ReturnType<typeof getRematchUI>;
  actions: {
    requestRematch: () => void;
    respondRematch: (accept: boolean) => void;
  };
}) {
  if (view.paused && view.disconnect.opponent) {
    return <div className="timeline-status danger">Waiting for reconnect or match resolution.</div>;
  }

  if (!view.rematch) {
    return (
      <div className="timeline-actions">
        <button className="btn" onClick={actions.requestRematch}>
          Request Rematch
        </button>
      </div>
    );
  }

  if (view.rematch.phase === "pending-response" && view.rematch.responder === yourRole) {
    return (
      <div className="timeline-actions">
        <button className="btn primary" onClick={() => actions.respondRematch(true)}>
          Accept
        </button>
        <button className="btn" onClick={() => actions.respondRematch(false)}>
          Decline
        </button>
      </div>
    );
  }

  return <div className="timeline-status">{rematchUI.footerCopy}</div>;
}

function Board({
  board,
  calledSet,
  selected,
  completedLines,
  animatedLineIds,
  completedCellSet,
  animatedCellSet,
  isActiveTurn,
  onSelect
}: {
  board: number[];
  calledSet: Set<number>;
  selected: number | null;
  completedLines: CompletedLine[];
  animatedLineIds: string[];
  completedCellSet: Set<number>;
  animatedCellSet: Set<number>;
  isActiveTurn: boolean;
  onSelect: (num: number) => void;
}) {
  return (
    <div className={`board-shell ${isActiveTurn ? "board-shell--active" : "board-shell--idle"}`}>
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

function LogCard({
  entry,
  yourRole,
  highlighted
}: {
  entry: MatchLogEntry;
  yourRole: Role | undefined;
  highlighted: boolean;
}) {
  const isYou = entry.by === yourRole;
  const copy = getLogCopy(entry, isYou);

  return (
    <article
      className={[
        "timeline-entry",
        `timeline-entry--${entry.type}`,
        isYou ? "timeline-entry--you" : "timeline-entry--opponent",
        highlighted ? "timeline-entry--fresh" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="timeline-entry__badge">{isYou ? "You" : "Opponent"}</div>
      <div className="timeline-entry__copy">{copy}</div>
    </article>
  );
}

function ResultModal({
  presentation,
  onPrimaryAction,
  primaryLabel,
  primaryDisabled,
  onDismiss
}: {
  presentation: ReturnType<typeof getResultPresentation>;
  onPrimaryAction: () => void;
  primaryLabel: string;
  primaryDisabled: boolean;
  onDismiss: () => void;
}) {
  return (
    <div className="result-backdrop" onClick={onDismiss}>
      <div
        className={`result-modal result-modal--${presentation.theme}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="result-close"
          onClick={onDismiss}
          aria-label="Close result popup"
        >
          ×
        </button>
        <div className="result-orb result-orb--one" />
        <div className="result-orb result-orb--two" />
        <div className="result-kicker">{presentation.kicker}</div>
        <div className="result-title">{presentation.title}</div>
        <p className="result-copy">{presentation.copy}</p>
        <div className="row">
          <button className="btn primary" onClick={onPrimaryAction} disabled={primaryDisabled}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionModal({
  title,
  body,
  actions,
  dismissible,
  onDismiss
}: {
  title: string;
  body: string;
  actions: ReactNode;
  dismissible: boolean;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="dialog-backdrop"
      onClick={dismissible ? onDismiss : undefined}
      aria-hidden={dismissible ? undefined : true}
    >
      <div className="dialog-modal" onClick={(event) => event.stopPropagation()}>
        {dismissible ? (
          <button
            type="button"
            className="result-close"
            onClick={onDismiss}
            aria-label="Close dialog"
          >
            ×
          </button>
        ) : null}
        <div className="dialog-title">{title}</div>
        <p className="dialog-copy">{body}</p>
        <div className="row">{actions}</div>
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

function getRematchUI(view: RoomView, yourRole: Role | undefined) {
  if (!view.rematch || !yourRole) {
    return {
      statusCopy: "",
      footerCopy: ""
    };
  }

  if (view.rematch.phase === "pending-response") {
    if (view.rematch.requester === yourRole) {
      return {
        statusCopy: "Waiting for opponent to respond to your rematch request.",
        footerCopy: "Waiting for opponent to respond."
      };
    }
    return {
      statusCopy: "Opponent requested a rematch.",
      footerCopy: "Choose whether to accept a tie or keep the current match alive."
    };
  }

  if (view.rematch.requester === yourRole) {
    return {
      statusCopy: "Your rematch was declined. Choose continue or forfeit.",
      footerCopy: "Decision required in the popup."
    };
  }

  return {
    statusCopy: "Waiting for opponent to decide whether to continue or forfeit.",
    footerCopy: "Waiting for opponent's response."
  };
}

function getLogCopy(entry: MatchLogEntry, isYou: boolean) {
  switch (entry.type) {
    case "call":
      return `${isYou ? "called" : "called"} ${entry.number}`;
    case "rematch-requested":
      return `${isYou ? "requested a rematch" : "requested a rematch"}`;
    case "rematch-accepted":
      return `${isYou ? "accepted the rematch" : "accepted the rematch"}`;
    case "rematch-declined":
      return `${isYou ? "declined the rematch" : "declined the rematch"}`;
    case "rematch-continued":
      return `${isYou ? "continued the match" : "continued the match"}`;
    case "rematch-forfeited":
      return `${isYou ? "forfeited the match" : "forfeited the match"}`;
    case "left-room":
      return `${isYou ? "left the room" : "left the room"}`;
    case "disconnect":
      return `${isYou ? "went offline" : "went offline"}`;
    case "reconnect":
      return `${isYou ? "reconnected" : "reconnected"}`;
    default:
      return "updated the match";
  }
}

function isNearBottom(container: HTMLDivElement) {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <
    LOG_BOTTOM_THRESHOLD
  );
}

function getPlayerStatusLabel(view: RoomView, side: "you" | "opponent") {
  if (view.status !== "in_match") {
    return side === "you"
      ? view.you?.ready
        ? "Ready"
        : "Not Ready"
      : view.opponent?.ready
      ? "Ready"
      : "Not Ready";
  }

  if (side === "opponent" && view.opponent?.left) {
    return "Left room";
  }

  if (view.paused) {
    return side === "you" ? "Waiting on reconnect" : "Disconnected";
  }

  if (view.rematch) {
    return side === "you" ? "Match decision pending" : "Match decision pending";
  }

  return side === "you" ? "Playing" : "Playing";
}
