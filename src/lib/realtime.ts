import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RoomPresence = { playerId: string; name: string };

export type LobbyRoom = {
  id: string;
  code: string;
  game: "ludo" | "checkers" | "chess";
  isPrivate: boolean;
  bet: number;
  timer: number;
  capacity: number;
  status: string;
  players: Array<{ id: string; name: string }>;
  hostId: string;
  createdAt: string;
};

async function getRoom(code: string) {
  const response = await fetch(`/api/multiplayer?room=${encodeURIComponent(code)}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as {
    room: LobbyRoom;
    state: unknown;
    stateUpdatedAt: number;
  };
}

export function makeRoomCode(seed = "") {
  const raw = seed.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return raw.slice(0, 6) || Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function useRealtimeRoom<T>(
  roomCode: string | undefined,
  game: string,
  player: RoomPresence,
  enabled = true,
) {
  const [remoteState, setRemoteState] = useState<T | null>(null);
  const [players, setPlayers] = useState<RoomPresence[]>([]);
  const [connected, setConnected] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const lastStateVersion = useRef(0);

  const poll = useCallback(async () => {
    if (!roomCode) return;
    const result = await getRoom(roomCode.toUpperCase());
    if (!result) {
      setConnected(false);
      return;
    }
    const list = result.room.players.map((p) => ({ playerId: p.id, name: p.name }));
    const index = result.room.players.findIndex((p) => p.id === player.playerId);
    setPlayers(list);
    setPlayerIndex(index >= 0 ? index : 0);
    setConnected(true);

    if (result.state && result.stateUpdatedAt > lastStateVersion.current) {
      lastStateVersion.current = result.stateUpdatedAt;
      setRemoteState(result.state as T);
    }
  }, [roomCode, player.playerId]);

  useEffect(() => {
    if (!enabled || !roomCode) return;
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => window.clearInterval(timer);
  }, [enabled, roomCode, poll]);

  const broadcastState = useCallback(
    (state: T) => {
      if (!roomCode || !connected) return;
      void fetch("/api/multiplayer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "state",
          code: roomCode,
          game,
          player: { id: player.playerId, name: player.name },
          state: { type: "state", state },
        }),
      });
    },
    [roomCode, connected, game, player.playerId, player.name],
  );

  return { connected, players, playerIndex, broadcastState, remoteState };
}

export function useRealtimeLobby(localRooms: LobbyRoom[], enabled = true) {
  const [remoteRooms, setRemoteRooms] = useState<LobbyRoom[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch("/api/multiplayer", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { rooms?: LobbyRoom[] };
        if (active) setRemoteRooms(data.rooms ?? []);
      } catch {
        // The local lobby remains usable if the network is temporarily unavailable.
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, JSON.stringify(localRooms.map((r) => r.code))]);

  const visibleRemoteRooms = remoteRooms.filter(
    (remote) => !localRooms.some((local) => local.code === remote.code),
  );

  return { remoteRooms: visibleRemoteRooms };
}
