import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { RoomView } from "./types";

type ServerToClientEvents = {
  "room:state": (payload: { view: RoomView }) => void;
  "room:error": (payload: { message: string }) => void;
  "room:left": () => void;
};

type ClientToServerEvents = {
  "room:create": (payload: { playerId: string; name: string }) => void;
  "room:join": (payload: { code: string; playerId: string; name: string }) => void;
  "room:rejoin": (payload: { code: string; playerId: string }) => void;
  "room:ready": (payload: { ready: boolean }) => void;
  "room:leave": (payload?: { forfeit?: boolean }) => void;
  "game:call": (payload: { number: number }) => void;
  "game:rematch:request": () => void;
  "game:rematch:respond": (payload: { accept: boolean }) => void;
  "game:rematch:dismiss": () => void;
  "game:rematch:continue": () => void;
  "game:rematch:forfeit": () => void;
  "game:tie:disconnect": () => void;
};

type ConnectionStatus = "connecting" | "connected" | "error";

const PLAYER_ID_KEY = "bingo.playerId";
const ROOM_CODE_KEY = "bingo.roomCode";
const PLAYER_NAME_KEY = "bingo.playerName";

function getOrCreatePlayerId() {
  const existing = localStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `p_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
  localStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

function getSocketBaseUrl() {
  if (window.location.port === "5173") {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return window.location.origin;
}

export function useGameState() {
  const playerId = useMemo(getOrCreatePlayerId, []);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = useMemo(
    () => io(getSocketBaseUrl(), { transports: ["websocket"] }),
    []
  );

  useEffect(() => {
    function onConnect() {
      setStatus("connected");
      const code = localStorage.getItem(ROOM_CODE_KEY);
      if (code) {
        socket.emit("room:rejoin", { code, playerId });
      }
    }

    function onDisconnect() {
      setStatus("connecting");
    }

    function onConnectError() {
      setStatus("error");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("room:state", ({ view: nextView }) => {
      setView(nextView);
      setError(null);
      if (nextView?.code) {
        localStorage.setItem(ROOM_CODE_KEY, nextView.code);
      }
      if (nextView?.you?.name) {
        localStorage.setItem(PLAYER_NAME_KEY, nextView.you.name);
      }
    });
    socket.on("room:error", ({ message }) => {
      setError(message);
    });
    socket.on("room:left", () => {
      setView(null);
      setError(null);
      localStorage.removeItem(ROOM_CODE_KEY);
    });

    return () => {
      socket.disconnect();
    };
  }, [playerId, socket]);

  function createRoom(name: string) {
    if (!name.trim()) return;
    socket.emit("room:create", { playerId, name: name.trim() });
  }

  function joinRoom(code: string, name: string) {
    if (!code.trim() || !name.trim()) return;
    socket.emit("room:join", {
      code: code.trim().toUpperCase(),
      playerId,
      name: name.trim()
    });
  }

  function setReady(ready: boolean) {
    socket.emit("room:ready", { ready });
  }

  function leaveRoom(forfeit = false) {
    socket.emit("room:leave", { forfeit });
  }

  function confirmCall(number: number) {
    socket.emit("game:call", { number });
  }

  function requestRematch() {
    socket.emit("game:rematch:request");
  }

  function respondRematch(accept: boolean) {
    socket.emit("game:rematch:respond", { accept });
  }

  function dismissRematchPrompt() {
    socket.emit("game:rematch:dismiss");
  }

  function continueRematch() {
    socket.emit("game:rematch:continue");
  }

  function forfeitRematch() {
    socket.emit("game:rematch:forfeit");
  }

  function endTieDueDisconnect() {
    socket.emit("game:tie:disconnect");
  }

  const savedName = localStorage.getItem(PLAYER_NAME_KEY) || "";

  return {
    status,
    view,
    error,
    actions: {
      createRoom,
      joinRoom,
      setReady,
      leaveRoom,
      confirmCall,
      requestRematch,
      respondRematch,
      dismissRematchPrompt,
      continueRematch,
      forfeitRematch,
      endTieDueDisconnect
    },
    savedName
  };
}
