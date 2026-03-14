import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { useGameState } from "../state/useGameState";
import type {
  CompletedLine,
  EventLogEntry,
  MatchResult,
  PlayerView,
  RematchLogEntry,
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
          <div className="eyebrow">Realtime multiplayer</div>
          <h1>Bingo Room</h1>
          {view ? (
            <div className="topbar-meta">
              Room {view.code}
              {view.roundNumber > 0 ? ` · Round ${view.roundNumber}` : ""}
            </div>
          ) : (
            <div className="topbar-meta">Create a room, share the code, and play live.</div>
          )}
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
          savedName={savedName}
          onCreate={actions.createRoom}
          onJoin={actions.joinRoom}
        />
      ) : view.status === "configuring" ? (
        <ConfiguringScreen view={view} actions={actions} />
      ) : view.status === "lobby" ? (
        <LobbyScreen view={view} actions={actions} />
      ) : (
        <RoundScreen view={view} actions={actions} />
      )}
    </div>
  );
}

type GameActions = ReturnType<typeof useGameState>["actions"];

function Welcome({
  savedName,
  onCreate,
  onJoin
}: {
  savedName: string;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
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
    <main className="welcome-shell">
      <section className="card hero-card">
        <div className="hero-kicker">Room-based play</div>
        <h2 className="hero-title">Create a room or join with a code</h2>
        <p className="hero-copy">
          The host sets the room up first. After that, everyone joins with the shared code and
          plays on the same live board state.
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
        <article className="card option-card">
          <div className="option-kicker">Host</div>
          <h3>Create Room</h3>
          <p>
            Get a room code immediately, then configure player count and grid size before the
            first round starts.
          </p>
          <button className="btn primary" onClick={handleCreate}>
            Create Room
          </button>
          {createError ? <div className="inline-error">{createError}</div> : null}
        </article>

        <article className="card option-card">
          <div className="option-kicker">Join</div>
          <h3>Join Room</h3>
          <p>Enter the host&apos;s room code. If the host is still configuring, you will wait there.</p>
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
          <button className="btn" onClick={handleJoin}>
            Join Room
          </button>
          {joinError ? <div className="inline-error">{joinError}</div> : null}
        </article>
      </section>
    </main>
  );
}

function ConfiguringScreen({ view, actions }: { view: RoomView; actions: GameActions }) {
  const self = getSelfPlayer(view);
  const [playerCount, setPlayerCount] = useState<number | null>(view.config.maxPlayersConfigured);
  const [boardSize, setBoardSize] = useState<number | null>(view.config.boardSize);

  useEffect(() => {
    setPlayerCount(view.config.maxPlayersConfigured);
    setBoardSize(view.config.boardSize);
  }, [view.config.boardSize, view.config.maxPlayersConfigured]);

  const minPlayers = view.joinedPlayerCount;
  const canSave = Boolean(playerCount && boardSize && playerCount >= minPlayers);

  return (
    <main className="setup-layout">
      <section className="card setup-main">
        <div className="section-heading">
          <div>
            <div className="section-title">Configure room</div>
            <div className="muted">Share the code now; players can join while you set it up.</div>
          </div>
          <div className="room-badge">Room {view.code}</div>
        </div>

        {self.isHost ? (
          <>
            <div className="setup-group">
              <div className="setup-label">How many players?</div>
              <div className="choice-row">
                {view.config.playablePlayerCounts.map((count) => {
                  const disabled = count < minPlayers;
                  return (
                    <button
                      key={count}
                      className={`choice-chip ${playerCount === count ? "choice-chip--selected" : ""}`}
                      onClick={() => setPlayerCount(count)}
                      disabled={disabled}
                    >
                      {count} players
                    </button>
                  );
                })}
                {view.config.comingSoonPlayerCounts.map((count) => (
                  <button key={count} className="choice-chip choice-chip--soon" disabled>
                    {count} players · Coming soon
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-group">
              <div className="setup-label">Grid size</div>
              <div className="choice-row">
                {view.config.playableBoardSizes.map((size) => (
                  <button
                    key={size}
                    className={`choice-chip ${boardSize === size ? "choice-chip--selected" : ""}`}
                    onClick={() => setBoardSize(size)}
                  >
                    {size} × {size}
                  </button>
                ))}
                {view.config.comingSoonBoardSizes.map((size) => (
                  <button key={size} className="choice-chip choice-chip--soon" disabled>
                    {size} × {size} · Coming soon
                  </button>
                ))}
              </div>
            </div>

            <div className="row">
              <button
                className="btn primary"
                onClick={() => {
                  if (playerCount && boardSize) {
                    actions.configureRoom(playerCount, boardSize);
                  }
                }}
                disabled={!canSave}
              >
                Save room settings
              </button>
              {minPlayers > 1 ? (
                <span className="muted">At least {minPlayers} joined players must fit the limit.</span>
              ) : null}
            </div>
          </>
        ) : (
          <div className="waiting-card">
            <div className="waiting-card__title">Room is being configured</div>
            <p>
              The host is choosing player count and grid size. You will move to the lobby as soon
              as those settings are locked in.
            </p>
          </div>
        )}
      </section>

      <section className="card roster-card">
        <div className="section-title">Joined players</div>
        <div className="player-list">
          {view.players.map((player) => (
            <PlayerListItem
              key={player.id}
              player={player}
              selfPlayerId={view.selfPlayerId}
              turnCount={0}
              nowMs={Date.now()}
              view={view}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function LobbyScreen({ view, actions }: { view: RoomView; actions: GameActions }) {
  const self = getSelfPlayer(view);
  const configured = `${view.config.maxPlayersConfigured} players · ${view.config.boardSize}×${view.config.boardSize}`;
  const joinedEnough = view.connectedPlayerCount >= 2;
  const startingWithFewer =
    view.config.maxPlayersConfigured !== null &&
    view.connectedPlayerCount < view.config.maxPlayersConfigured;

  return (
    <main className="setup-layout">
      <section className="card setup-main">
        <div className="section-heading">
          <div>
            <div className="section-title">Lobby</div>
            <div className="muted">{configured}</div>
          </div>
          <div className="room-badge">Room {view.code}</div>
        </div>

        {self.isHost ? (
          <div className="waiting-card">
            <div className="waiting-card__title">Host controls the first start</div>
            <p>
              Once the first round starts, the room locks and no new players can enter. Right now,
              {startingWithFewer
                ? ` you can start with the ${view.connectedPlayerCount} connected players already here.`
                : " you are ready to start as soon as everyone is here."}
            </p>
            <button className="btn primary" onClick={() => actions.startRoom()} disabled={!joinedEnough}>
              {startingWithFewer ? `Start with ${view.connectedPlayerCount} players` : "Start Round 1"}
            </button>
          </div>
        ) : (
          <div className="waiting-card">
            <div className="waiting-card__title">Waiting for host to start</div>
            <p>The host will begin the first round when they are ready.</p>
          </div>
        )}
      </section>

      <section className="card roster-card">
        <div className="section-title">Players in room</div>
        <div className="player-list">
          {view.players.map((player) => (
            <PlayerListItem
              key={player.id}
              player={player}
              selfPlayerId={view.selfPlayerId}
              turnCount={0}
              nowMs={Date.now()}
              view={view}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function RoundScreen({ view, actions }: { view: RoomView; actions: GameActions }) {
  const self = getSelfPlayer(view);
  const playersById = useMemo(
    () => Object.fromEntries(view.players.map((player) => [player.id, player])),
    [view.players]
  );
  const calledSet = useMemo(() => new Set(view.calledNumbers), [view.calledNumbers]);
  const activeRoundPlayers = view.players.filter((player) => player.currentRound.active);
  const currentTurnPlayer = view.currentTurnPlayerId ? playersById[view.currentTurnPlayerId] : null;
  const pausedPlayer = view.pausedOnPlayerId ? playersById[view.pausedOnPlayerId] : null;
  const nowMs = useNowTick();
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [animatedLineIds, setAnimatedLineIds] = useState<string[]>([]);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isForfeitModalOpen, setIsForfeitModalOpen] = useState(false);
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const [hasUnreadLogs, setHasUnreadLogs] = useState(false);
  const previousLineIdsRef = useRef<string[] | null>(null);
  const previousStatusRef = useRef<RoomView["status"] | null>(null);
  const previousLogIdsRef = useRef<string[]>([]);
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);
  const playResultSound = useResultSound();

  const isYourTurn =
    view.status === "in_match" &&
    view.currentTurnPlayerId === self.id &&
    !view.pausedOnPlayerId &&
    self.currentRound.active &&
    self.connected;
  const canConfirmCall = isYourTurn && selectedNumber !== null;
  const canForfeit = view.status === "in_match" && self.currentRound.active && !self.left;
  const rematchVote = view.rematchVote;
  const yourVote = rematchVote?.votes[self.id];
  const canVoteRematch =
    view.status === "in_match" &&
    Boolean(rematchVote && rematchVote.voterIds.includes(self.id) && !yourVote && !self.left);
  const canRequestRematch = view.status === "in_match" && !rematchVote && !self.left;
  const readyEligiblePlayers = view.players.filter((player) => !player.left);
  const canReadyForNextRound = view.status === "ended" && readyEligiblePlayers.length >= 2 && !self.left;
  const turnCounts = useMemo(() => getTurnCounts(view.eventLog), [view.eventLog]);
  const resultPresentation = useMemo(
    () => getResultPresentation(view.lastResult, self.id, playersById),
    [view.lastResult, self.id, playersById]
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

  useEffect(() => {
    setSelectedNumber(null);
    if (view.completedLines.length === 0) {
      setAnimatedLineIds([]);
    }
  }, [view.board, view.roundNumber, view.completedLines.length]);

  useEffect(() => {
    const currentIds = view.completedLines.map((line) => line.id);
    const previousIds = previousLineIdsRef.current;

    if (previousIds) {
      const freshIds = currentIds.filter((id) => !previousIds.includes(id));
      if (freshIds.length > 0) {
        setAnimatedLineIds(freshIds);
        const timeout = window.setTimeout(() => {
          setAnimatedLineIds((activeIds) => activeIds.filter((id) => !freshIds.includes(id)));
        }, LINE_ANIMATION_MS);
        previousLineIdsRef.current = currentIds;
        return () => window.clearTimeout(timeout);
      }
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
      playResultSound(view.lastResult, self.id);
      setIsResultModalOpen(true);
    }
    previousStatusRef.current = view.status;
  }, [playResultSound, self.id, view.lastResult, view.status]);

  useEffect(() => {
    const container = logScrollRef.current;
    const currentIds = view.eventLog.map((entry) => entry.id);
    const previousIds = previousLogIdsRef.current;
    const wasNearBottom = wasNearBottomRef.current;

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
    previousLogIdsRef.current = currentIds;
    return undefined;
  }, [view.eventLog]);

  const boardStyle = {
    "--board-size": String(view.boardSize)
  } as CSSProperties;

  return (
    <>
      <main className="game-layout">
        <section className="card side-card">
          <div className="section-heading">
            <div>
              <div className="section-title">Players</div>
              <div className="muted">Round {view.roundNumber}</div>
            </div>
            <button className="btn btn--quiet" onClick={() => setIsLeaveModalOpen(true)}>
              Leave Room
            </button>
          </div>
          <div className="player-list">
            {view.players.map((player) => (
              <PlayerListItem
                key={player.id}
                player={player}
                selfPlayerId={view.selfPlayerId}
                turnCount={turnCounts[player.id] ?? 0}
                nowMs={nowMs}
                view={view}
              />
            ))}
          </div>
          <div className="status-card">
            <div className="status-card__title">Round state</div>
            <div className="status-card__copy">
              {pausedPlayer
                ? `Waiting for ${pausedPlayer.name} to reconnect.`
                : currentTurnPlayer
                ? `${currentTurnPlayer.id === self.id ? "Your" : `${currentTurnPlayer.name}'s`} turn.`
                : "Round is settling."}
            </div>
            {pausedPlayer?.disconnectDeadline ? (
              <ProgressBar value={getRemainingRatio(pausedPlayer.disconnectDeadline, nowMs)} />
            ) : null}
          </div>
        </section>

        <section className="card board-card">
          <div className="section-heading">
            <div className="section-title">Your Board</div>
            <div className="board-meta">Lines: {view.lines}/{view.lineTarget}</div>
          </div>

          <div className={`board-shell ${isYourTurn ? "board-shell--hot" : ""}`}>
            <div className="board-grid" style={boardStyle}>
              {view.board.map((number, index) => {
                const called = calledSet.has(number);
                const completed = completedCellSet.has(index);
                const animated = animatedCellSet.has(index);
                return (
                  <div key={`${view.roundNumber}-${number}-${index}`} className="board-slot">
                    <button
                      className={`board-cell ${called ? "board-cell--called" : ""} ${
                        completed ? "board-cell--completed" : ""
                      } ${animated ? "board-cell--animated" : ""} ${
                        selectedNumber === number ? "board-cell--selected" : ""
                      }`}
                      onClick={() => {
                        if (!isYourTurn || called) return;
                        setSelectedNumber(number);
                      }}
                      disabled={!isYourTurn || called}
                    >
                      {number}
                    </button>
                  </div>
                );
              })}
              <div className="board-lines">
                {view.completedLines.map((line) => (
                  <BoardLine
                    key={line.id}
                    line={line}
                    boardSize={view.boardSize}
                    fresh={animatedLineIds.includes(line.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="progress-strip" style={boardStyle}>
            {Array.from({ length: view.lineTarget }, (_, index) => (
              <div
                key={`progress-${index + 1}`}
                className={`progress-pill ${index < view.lines ? "progress-pill--on" : ""}`}
              >
                {toRoman(index + 1)}
              </div>
            ))}
          </div>

          <div className="board-actions">
            <button
              className="btn primary"
              disabled={!canConfirmCall}
              onClick={() => {
                if (selectedNumber !== null) {
                  actions.confirmCall(selectedNumber);
                  setSelectedNumber(null);
                }
              }}
            >
              Confirm Call
            </button>
            <button className="btn danger" disabled={!canForfeit} onClick={() => setIsForfeitModalOpen(true)}>
              Forfeit Round
            </button>
          </div>
        </section>

        <section className="card timeline-card">
          {rematchVote ? (
            <div className="vote-card">
              <div className="timeline-header">
                <div>
                  <div className="section-title">Rematch Vote</div>
                  <div className="muted">
                    {playersById[rematchVote.requesterId]?.name ?? "A player"} requested a rematch.
                  </div>
                </div>
                <div className="vote-count">
                  {Object.values(rematchVote.votes).filter((vote) => vote === "accept").length}/
                  {rematchVote.voterIds.length} yes
                </div>
              </div>
              <ProgressBar value={getRemainingRatio(rematchVote.expiresAt, nowMs)} />
              <div className="timeline-actions">
                {canVoteRematch ? (
                  <>
                    <button className="btn primary" onClick={() => actions.voteRematch("accept")}>
                      Accept
                    </button>
                    <button className="btn" onClick={() => actions.voteRematch("decline")}>
                      Decline
                    </button>
                  </>
                ) : yourVote ? (
                  <span className="muted">Your vote: {yourVote}</span>
                ) : (
                  <span className="muted">Voting stays open until the timer ends or everyone accepts.</span>
                )}
              </div>
              <div className="vote-log">
                {rematchVote.log.map((entry) => (
                  <VoteLogEntry key={entry.id} entry={entry} playersById={playersById} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="timeline-header timeline-header--spaced">
            <div className="section-title">Event Log</div>
            {view.status === "in_match" && !rematchVote ? (
              <button className="btn btn--quiet" onClick={() => actions.requestRematch()} disabled={!canRequestRematch}>
                Request Rematch
              </button>
            ) : null}
          </div>

          <div className="timeline-stream">
            <div
              ref={logScrollRef}
              className="timeline-scroll"
              onScroll={(event) => {
                const container = event.currentTarget;
                const nearBottom = isNearBottom(container);
                wasNearBottomRef.current = nearBottom;
                if (nearBottom) {
                  setHasUnreadLogs(false);
                }
              }}
            >
              {view.eventLog.length === 0 ? (
                <div className="timeline-empty">No events yet.</div>
              ) : (
                view.eventLog.map((entry) => (
                  <TimelineEntry
                    key={entry.id}
                    entry={entry}
                    selfPlayerId={self.id}
                    playersById={playersById}
                    fresh={highlightedLogId === entry.id}
                  />
                ))
              )}
            </div>
            {hasUnreadLogs ? (
              <button
                className="timeline-jump-chip"
                onClick={() => {
                  logScrollRef.current?.scrollTo({
                    top: logScrollRef.current.scrollHeight,
                    behavior: "smooth"
                  });
                  wasNearBottomRef.current = true;
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
            {view.status === "ended" ? (
              <div className="result-footer-card">
                <div className="result-footer-card__title">Match Result</div>
                <div className="result-footer-card__copy">{resultPresentation.copy}</div>
                {canReadyForNextRound ? (
                  <button
                    className="btn primary"
                    onClick={() => actions.setReady(true)}
                    disabled={self.ready || !self.connected}
                  >
                    {self.ready ? "Ready" : "Ready For Next Match"}
                  </button>
                ) : (
                  <div className="muted">At least two connected players are required for the next round.</div>
                )}
              </div>
            ) : (
              <div className="muted">
                {pausedPlayer
                  ? `${pausedPlayer.name} has 1 minute to reconnect before being treated as having left the room.`
                  : activeRoundPlayers.length > 1
                  ? `${activeRoundPlayers.length} players are still active this round.`
                  : "Waiting for the round to resolve."}
              </div>
            )}
          </div>
        </section>
      </main>

      {view.status === "ended" && view.lastResult && isResultModalOpen ? (
        <Modal onClose={() => setIsResultModalOpen(false)}>
          <div className={`result-modal result-modal--${resultPresentation.kind}`}>
            <button className="modal-close" onClick={() => setIsResultModalOpen(false)}>
              ×
            </button>
            <div className="result-modal__eyebrow">Round {view.roundNumber} complete</div>
            <h2 className="result-modal__title">{resultPresentation.title}</h2>
            <p className="result-modal__copy">{resultPresentation.copy}</p>
            {canReadyForNextRound ? (
              <button
                className="btn primary"
                onClick={() => actions.setReady(true)}
                disabled={self.ready || !self.connected}
              >
                {self.ready ? "Ready" : "Ready For Next Match"}
              </button>
            ) : (
              <div className="muted">Not enough connected players remain to start another round.</div>
            )}
          </div>
        </Modal>
      ) : null}

      {isLeaveModalOpen ? (
        <BlockingModal
          title="Leave this room?"
          body={
            view.status === "in_match"
              ? "Leaving now permanently removes you from this room. You will be out of the current round and future rounds in this room."
              : "Leaving now removes you from this room and returns you to the start screen."
          }
          primaryLabel="Leave Room"
          onPrimary={() => {
            actions.leaveRoom();
            setIsLeaveModalOpen(false);
          }}
          secondaryLabel="Continue"
          onSecondary={() => setIsLeaveModalOpen(false)}
        />
      ) : null}

      {isForfeitModalOpen ? (
        <BlockingModal
          title="Forfeit this round?"
          body={
            activeRoundPlayers.length <= 2
              ? "If you forfeit now, the remaining active player gets the point and the round ends."
              : "If you forfeit now, you will be out of this round and cannot earn its point. The other active players continue."
          }
          primaryLabel="Forfeit Round"
          onPrimary={() => {
            actions.forfeitRound();
            setIsForfeitModalOpen(false);
          }}
          secondaryLabel="Continue"
          onSecondary={() => setIsForfeitModalOpen(false)}
        />
      ) : null}
    </>
  );
}

function PlayerListItem({
  player,
  selfPlayerId,
  turnCount,
  nowMs,
  view
}: {
  player: PlayerView;
  selfPlayerId: string;
  turnCount: number;
  nowMs: number;
  view: RoomView;
}) {
  const isSelf = player.id === selfPlayerId;
  const isCurrentTurn = view.currentTurnPlayerId === player.id && view.status === "in_match";
  const disconnected = Boolean(!player.connected && !player.left && player.disconnectDeadline);
  const disconnectedRatio = player.disconnectDeadline
    ? getRemainingRatio(player.disconnectDeadline, nowMs)
    : 0;
  const state = getPlayerStateLabel(player, view, isCurrentTurn);

  return (
    <article
      className={`player-tile ${player.left ? "player-tile--left" : ""} ${
        player.currentRound.forfeited ? "player-tile--forfeited" : ""
      } ${isCurrentTurn && !view.pausedOnPlayerId ? "player-tile--turn" : ""}`}
    >
      <div className="player-tile__header">
        <div>
          <div className="player-tile__name">{isSelf ? `You · ${player.name}` : player.name}</div>
          <div className="player-tile__meta">Player {player.seat}</div>
        </div>
        {player.isHost && view.status !== "in_match" && view.status !== "ended" ? (
          <div className="badge">Host</div>
        ) : null}
      </div>
      <div className="score-strip">
        <div className="score-strip__metric">
          <span className="score-strip__label">Wins</span>
          <span className="score-strip__value">{player.score}</span>
        </div>
        <div className="score-strip__metric score-strip__metric--secondary">
          <span className="score-strip__label">Turns</span>
          <span className="score-strip__value score-strip__value--secondary">{turnCount}</span>
        </div>
      </div>
      <div className="player-state">{state}</div>
      {disconnected ? <ProgressBar value={disconnectedRatio} /> : null}
    </article>
  );
}

function TimelineEntry({
  entry,
  selfPlayerId,
  playersById,
  fresh
}: {
  entry: EventLogEntry;
  selfPlayerId: string;
  playersById: Record<string, PlayerView>;
  fresh: boolean;
}) {
  const isSelf = entry.playerId === selfPlayerId;
  return (
    <article
      className={`timeline-entry ${isSelf ? "timeline-entry--self" : "timeline-entry--other"} ${
        fresh ? "timeline-entry--fresh" : ""
      }`}
    >
      <div className="timeline-entry__badge">{isSelf ? "You" : playersById[entry.playerId]?.name ?? "Player"}</div>
      <div className="timeline-entry__copy">{formatEventLog(entry, playersById)}</div>
    </article>
  );
}

function VoteLogEntry({
  entry,
  playersById
}: {
  entry: RematchLogEntry;
  playersById: Record<string, PlayerView>;
}) {
  const name = playersById[entry.playerId]?.name ?? "Player";
  const copy =
    entry.type === "request"
      ? `${name} requested a rematch.`
      : entry.type === "accept"
      ? `${name} accepted.`
      : `${name} declined.`;
  return <div className="vote-log__entry">{copy}</div>;
}

function BoardLine({
  line,
  boardSize,
  fresh
}: {
  line: CompletedLine;
  boardSize: number;
  fresh: boolean;
}) {
  const style = getLineStyle(line, boardSize);
  return <div className={`board-line ${fresh ? "board-line--fresh" : ""}`} style={style} />;
}

function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function BlockingModal({
  title,
  body,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary
}: {
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <div className="modal-backdrop modal-backdrop--blocking">
      <div className="modal-card modal-card--confirm">
        <h2 className="modal-title">{title}</h2>
        <p className="modal-copy">{body}</p>
        <div className="row">
          <button className="btn primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button className="btn" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-bar">
      <div className="progress-bar__fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function getSelfPlayer(view: RoomView) {
  return view.players.find((player) => player.id === view.selfPlayerId)!;
}

function useNowTick() {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  return tick;
}

function getTurnCounts(entries: EventLogEntry[]) {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    if (entry.type !== "call") return acc;
    acc[entry.playerId] = (acc[entry.playerId] ?? 0) + 1;
    return acc;
  }, {});
}

function getPlayerStateLabel(player: PlayerView, view: RoomView, isCurrentTurn: boolean) {
  if (player.left) return "Left room";
  if (!player.connected && player.disconnectDeadline) return "Disconnected · waiting";
  if (view.status === "in_match") {
    if (player.currentRound.forfeited) return "Forfeited this round";
    if (player.currentRound.active && isCurrentTurn && !view.pausedOnPlayerId) {
      return player.id === view.selfPlayerId ? "Your turn" : "Turn";
    }
    if (player.currentRound.active) return "Active";
    return "Waiting";
  }
  if (view.status === "ended") {
    return player.ready ? "Ready" : "Waiting";
  }
  return player.isHost ? "Host" : "Joined";
}

function getResultPresentation(
  result: MatchResult,
  selfPlayerId: string,
  playersById: Record<string, PlayerView>
) {
  if (!result) {
    return {
      kind: "neutral",
      title: "Round complete",
      copy: "Prepare for the next round."
    };
  }

  if (result.trigger === "empty") {
    return {
      kind: "neutral",
      title: "Round ended",
      copy: "No active players remained in the round."
    };
  }

  const awardedNames = result.awardedPointIds.map((playerId) => playersById[playerId]?.name ?? "Player");
  const youScored = result.awardedPointIds.includes(selfPlayerId);

  if (result.awardedPointIds.length > 1) {
    const everyoneTied =
      result.activePlayerIds.length > 0 &&
      result.awardedPointIds.length === result.activePlayerIds.length;
    return {
      kind: youScored ? "tie" : "loss",
      title: everyoneTied ? "Full tie" : "Shared win",
      copy: everyoneTied
        ? `${awardedNames.join(", ")} all reached the line target together.`
        : `${awardedNames.join(", ")} reached the target on the same call.`
    };
  }

  if (youScored) {
    return {
      kind: "win",
      title: "You win",
      copy:
        result.trigger === "last-player"
          ? "You were the last active player remaining in the round."
          : "You reached the target line count first."
    };
  }

  return {
    kind: "loss",
    title: `${awardedNames[0] ?? "A player"} wins`,
    copy:
      result.trigger === "last-player"
        ? `${awardedNames[0] ?? "A player"} was the last active player remaining.`
        : `${awardedNames[0] ?? "A player"} reached the target line count first.`
  };
}

function formatEventLog(entry: EventLogEntry, playersById: Record<string, PlayerView>) {
  const name = playersById[entry.playerId]?.name ?? "Player";

  switch (entry.type) {
    case "call":
      return `called ${entry.number}`;
    case "disconnect":
      return `${name} disconnected.`;
    case "reconnect":
      return `${name} reconnected.`;
    case "left-room":
      return `${name} left the room.`;
    case "timeout-left":
      return `${name} did not return in time and is now treated as having left the room.`;
    case "forfeit":
      return `${name} forfeited this round.`;
    default:
      return "Event";
  }
}

function getRemainingRatio(deadline: number, nowMs: number) {
  const totalWindow = 60_000;
  return Math.max(0, Math.min(1, (deadline - nowMs) / totalWindow));
}

function isNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= LOG_BOTTOM_THRESHOLD;
}

function toRoman(value: number) {
  const numerals = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ] as const;

  let remaining = value;
  let result = "";
  numerals.forEach(([amount, numeral]) => {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  });
  return result;
}

function getLineStyle(line: CompletedLine, boardSize: number): CSSProperties {
  const step = 100 / boardSize;
  const center = (index: number) => `${(index + 0.5) * step}%`;

  if (line.type === "row") {
    return {
      left: "0%",
      top: center(line.index),
      width: "100%",
      height: "6px",
      transform: "translateY(-50%)"
    };
  }

  if (line.type === "col") {
    return {
      left: center(line.index),
      top: "0%",
      width: "6px",
      height: "100%",
      transform: "translateX(-50%)"
    };
  }

  return {
    left: "50%",
    top: "50%",
    width: "141.5%",
    height: "6px",
    transform: `translate(-50%, -50%) rotate(${line.index === 0 ? 45 : -45}deg)`
  };
}
