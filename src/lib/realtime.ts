import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { GameId } from "@/lib/games/types";

export const TURN_SECONDS = 15;
export const DISCONNECT_GRACE_SECONDS = 30;

export type RoomPresence = {
  playerId: string;
  name: string;
  roomCode?: string;
  game?: GameId;
  isPrivate?: boolean;
  capacity?: number;
  hostId?: string;
  createdAt?: string;
};

export type LobbyRoom = {
  id: string;
  code: string;
  game: GameId;
  isPrivate: boolean;
  bet: number;
  timer: number;
  capacity: number;
  status: "WAITING" | "READY" | "PLAYING";
  players: Array<{ id: string; name: string }>;
  hostId: string;
  createdAt: string;
};

type RoomEvent<T = unknown> =
  | { kind: "state"; state: T; actorId: string; sequence: number; sentAt: number }
  | { kind: "request_state"; actorId: string; sentAt: number }
  | { kind: "forfeit"; winnerId: string; actorId: string; sentAt: number };

type RoomChannel = RealtimeChannel;

const lobbyChannels = new Map<string, RoomChannel>();

function getLobbyChannel() {
  const existing = lobbyChannels.get("lobby");
  if (existing) return existing;
  const channel = supabase.channel("mozaplay:lobby", {
    config: {
      presence: { key: "mozaplay-lobby" },
      broadcast: { self: false, ack: true },
    },
  });
  lobbyChannels.set("lobby", channel);
  return channel;
}

async function ensureSubscribed(channel: RoomChannel) {
  if (channel.state === "joined") return;
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error("realtime_unavailable"));
    });
  });
}

function presenceToRooms(state: Record<string, unknown[]>) {
  const grouped = new Map<string, LobbyRoom>();
  for (const entries of Object.values(state)) {
    for (const entry of entries as RoomPresence[]) {
      if (!entry.roomCode || !entry.game) continue;
      const existing = grouped.get(entry.roomCode);
      if (existing) {
        if (!existing.players.some((p) => p.id === entry.playerId)) {
          existing.players.push({ id: entry.playerId, name: entry.name });
        }
        existing.status = existing.players.length >= existing.capacity ? "READY" : "WAITING";
        continue;
      }
      grouped.set(entry.roomCode, {
        id: entry.roomCode,
        code: entry.roomCode,
        game: entry.game,
        isPrivate: Boolean(entry.isPrivate),
        bet: 0,
        timer: TURN_SECONDS,
        capacity: Math.min(entry.game === "ludo" ? 4 : 2, Math.max(2, entry.capacity ?? 2)),
        status: "WAITING",
        players: [{ id: entry.playerId, name: entry.name }],
        hostId: entry.hostId ?? entry.playerId,
        createdAt: entry.createdAt ?? new Date().toISOString(),
      });
    }
  }
  for (const room of grouped.values()) {
    room.status = room.players.length >= room.capacity ? "READY" : "WAITING";
  }
  return [...grouped.values()];
}

export async function createRoom(input: {
  game: GameId;
  player: RoomPresence;
  isPrivate?: boolean;
  capacity?: number;
}) {
  const channel = getLobbyChannel();
  await ensureSubscribed(channel);
  const code = makeRoomCode();
  const room: LobbyRoom = {
    id: code,
    code,
    game: input.game,
    isPrivate: Boolean(input.isPrivate),
    bet: 0,
    timer: TURN_SECONDS,
    capacity: Math.min(input.game === "ludo" ? 4 : 2, Math.max(2, input.capacity ?? 2)),
    status: "WAITING",
    players: [{ id: input.player.playerId, name: input.player.name }],
    hostId: input.player.playerId,
    createdAt: new Date().toISOString(),
  };
  await channel.track({
    ...input.player,
    roomCode: code,
    game: input.game,
    isPrivate: room.isPrivate,
    capacity: room.capacity,
    hostId: room.hostId,
    createdAt: room.createdAt,
  });
  return room;
}

export async function joinRoom(code: string, player: RoomPresence) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error("Código inválido.");
  const channel = getLobbyChannel();
  await ensureSubscribed(channel);
  const rooms = presenceToRooms(channel.presenceState() as Record<string, unknown[]>);
  const room = rooms.find((item) => item.code === normalized);
  if (!room) throw new Error("Sala não encontrada ou já encerrada.");
  if (room.players.some((item) => item.id === player.playerId)) return room;
  if (room.players.length >= room.capacity) throw new Error("Sala cheia.");
  await channel.track({
    ...player,
    roomCode: normalized,
    game: room.game,
    isPrivate: room.isPrivate,
    capacity: room.capacity,
    hostId: room.hostId,
    createdAt: room.createdAt,
  });
  return { ...room, players: [...room.players, { id: player.playerId, name: player.name }] };
}

export async function quickMatch(input: {
  game: GameId;
  player: RoomPresence;
}) {
  const channel = getLobbyChannel();
  await ensureSubscribed(channel);
  const rooms = presenceToRooms(channel.presenceState() as Record<string, unknown[]>);
  const room = rooms.find(
    (item) =>
      item.game === input.game &&
      !item.isPrivate &&
      item.players.length < item.capacity &&
      !item.players.some((itemPlayer) => itemPlayer.id === input.player.playerId),
  );
  if (room) {
    await channel.track({
      ...input.player,
      roomCode: room.code,
      game: room.game,
      isPrivate: room.isPrivate,
      capacity: room.capacity,
      hostId: room.hostId,
      createdAt: room.createdAt,
    });
    return { ...room, players: [...room.players, { id: input.player.playerId, name: input.player.name }] };
  }
  return createRoom({ game: input.game, player: input.player, isPrivate: false, capacity: 2 });
}

export function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  do {
    value = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (value.length !== 6);
  return value;
}

function flattenPresence(state: Record<string, unknown[]>) {
  return Object.values(state).flatMap((items) => items as RoomPresence[]);
}

export function useRealtimeLobby(player?: RoomPresence, enabled = true) {
  const [remoteRooms, setRemoteRooms] = useState<LobbyRoom[]>([]);
  const playerId = player?.playerId ?? "";

  useEffect(() => {
    if (!enabled || !playerId) return;
    const channel = getLobbyChannel();
    let active = true;

    const sync = () => {
      if (!active) return;
      const rooms = presenceToRooms(channel.presenceState() as Record<string, unknown[]>)
        .filter((room) => !room.isPrivate)
        .filter((room) => room.status !== "READY");
      setRemoteRooms(rooms);
    };

    const start = async () => {
      try {
        await ensureSubscribed(channel);
        if (!active) return;
        sync();
      } catch {
        if (active) setRemoteRooms([]);
      }
    };

    channel.on("presence", { event: "sync" }, sync);
    channel.on("presence", { event: "join" }, sync);
    channel.on("presence", { event: "leave" }, sync);
    void start();

    return () => {
      active = false;
      channel.off("presence", { event: "sync" }, sync);
      channel.off("presence", { event: "join" }, sync);
      channel.off("presence", { event: "leave" }, sync);
    };
  }, [enabled, playerId]);

  const rooms = useMemo(() => remoteRooms.filter((room) => !room.players.some((p) => p.id === playerId)), [remoteRooms, playerId]);
  return { remoteRooms: rooms };
}

export function useRealtimeRoom<T>(
  roomCode: string | undefined,
  game: GameId | string,
  player: RoomPresence,
  enabled = true,
) {
  const [remoteState, setRemoteState] = useState<T | null>(null);
  const [players, setPlayers] = useState<RoomPresence[]>([]);
  const [connected, setConnected] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [forfeitWinner, setForfeitWinner] = useState<number | null>(null);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const channelRef = useRef<RoomChannel | null>(null);
  const sequenceRef = useRef(0);
  const lastPresenceRef = useRef<string[]>([]);
  const disconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !roomCode || !player.playerId) return;
    let active = true;
    const channel = supabase.channel(`mozaplay:room:${roomCode.toUpperCase()}`, {
      config: {
        presence: { key: player.playerId },
        broadcast: { self: false, ack: true },
      },
    });
    channelRef.current = channel;

    const syncPresence = () => {
      if (!active) return;
      const presence = flattenPresence(channel.presenceState() as Record<string, unknown[]>)
        .filter((entry) => entry.playerId);
      const unique = new Map<string, RoomPresence>();
      for (const entry of presence) unique.set(entry.playerId, entry);
      const nextPlayers = [...unique.values()];
      nextPlayers.sort((a, b) => a.playerId.localeCompare(b.playerId));
      setPlayers(nextPlayers);
      const index = nextPlayers.findIndex((entry) => entry.playerId === player.playerId);
      setPlayerIndex(index >= 0 ? index : 0);

      const opponentOnline = nextPlayers.some((entry) => entry.playerId !== player.playerId);
      setOpponentDisconnected(!opponentOnline && nextPlayers.length > 0);

      if (opponentOnline) {
        if (disconnectTimerRef.current) window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      } else if (nextPlayers.length > 0 && !disconnectTimerRef.current) {
        disconnectTimerRef.current = window.setTimeout(() => {
          if (active) setForfeitWinner(0);
        }, DISCONNECT_GRACE_SECONDS * 1000);
      }
      lastPresenceRef.current = nextPlayers.map((entry) => entry.playerId);
    };

    const onState = (payload: { payload?: RoomEvent<T> }) => {
      const event = payload.payload;
      if (!event || event.kind !== "state" || event.actorId === player.playerId) return;
      if (event.sequence <= sequenceRef.current) return;
      sequenceRef.current = event.sequence;
      setRemoteState(event.state);
      const state = event.state as T & { turnDeadlineAt?: number };
      if (typeof state?.turnDeadlineAt === "number") setTurnDeadlineAt(state.turnDeadlineAt);
    };

    const onRequestState = (payload: { payload?: RoomEvent<T> }) => {
      const event = payload.payload;
      if (!event || event.kind !== "request_state" || event.actorId === player.playerId) return;
      void channel.send({
        type: "broadcast",
        event: "state",
        payload: {
          kind: "state",
          actorId: player.playerId,
          sequence: sequenceRef.current,
          sentAt: Date.now(),
          state: remoteState,
        } satisfies RoomEvent<T>,
      });
    };

    const onForfeit = (payload: { payload?: RoomEvent<T> }) => {
      const event = payload.payload;
      if (!event || event.kind !== "forfeit" || event.actorId === player.playerId) return;
      const winnerIndex = players.findIndex((entry) => entry.playerId === event.winnerId);
      if (winnerIndex >= 0) setForfeitWinner(winnerIndex);
    };

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.on("presence", { event: "join" }, syncPresence);
    channel.on("presence", { event: "leave" }, syncPresence);
    channel.on("broadcast", { event: "state" }, onState);
    channel.on("broadcast", { event: "request_state" }, onRequestState);
    channel.on("broadcast", { event: "forfeit" }, onForfeit);

    const start = async () => {
      try {
        await ensureSubscribed(channel);
        if (!active) return;
        setConnected(true);
        await channel.track({ ...player, roomCode: roomCode.toUpperCase(), game });
        syncPresence();
        await channel.send({
          type: "broadcast",
          event: "request_state",
          payload: { kind: "request_state", actorId: player.playerId, sentAt: Date.now() } satisfies RoomEvent<T>,
        });
      } catch {
        if (active) setConnected(false);
      }
    };

    void start();

    return () => {
      active = false;
      if (disconnectTimerRef.current) window.clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [enabled, roomCode, game, player.playerId, player.name]);

  const broadcastState = useCallback(
    async (state: T & { turnDeadlineAt?: number }) => {
      const channel = channelRef.current;
      if (!channel || !connected || !roomCode) return false;
      sequenceRef.current += 1;
      const deadline = Date.now() + TURN_SECONDS * 1000;
      setTurnDeadlineAt(deadline);
      const payload: RoomEvent<T> = {
        kind: "state",
        actorId: player.playerId,
        sequence: sequenceRef.current,
        sentAt: Date.now(),
        state: { ...state, turnDeadlineAt: deadline },
      };
      const result = await channel.send({ type: "broadcast", event: "state", payload });
      return result !== "error";
    },
    [connected, player.playerId, roomCode],
  );

  const requestState = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "request_state",
      payload: { kind: "request_state", actorId: player.playerId, sentAt: Date.now() } satisfies RoomEvent<T>,
    });
  }, [player.playerId]);

  const forfeit = useCallback(async (winnerId: string) => {
    const channel = channelRef.current;
    if (!channel) return;
    setForfeitWinner(winnerId === player.playerId ? playerIndex : -1);
    await channel.send({
      type: "broadcast",
      event: "forfeit",
      payload: { kind: "forfeit", winnerId, actorId: player.playerId, sentAt: Date.now() } satisfies RoomEvent<T>,
    });
  }, [player.playerId, playerIndex]);

  useEffect(() => {
    if (!turnDeadlineAt || !connected || !roomCode) return;
    const remaining = turnDeadlineAt - Date.now();
    const timer = window.setTimeout(() => {
      if (Date.now() >= turnDeadlineAt) {
        setTurnDeadlineAt(null);
        void channelRef.current?.send({
          type: "broadcast",
          event: "turn_timeout",
          payload: { actorId: player.playerId, sentAt: Date.now() },
        });
      }
    }, Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [turnDeadlineAt, connected, roomCode, player.playerId]);

  return {
    connected,
    players,
    playerIndex,
    broadcastState,
    requestState,
    forfeit,
    remoteState,
    opponentDisconnected,
    forfeitWinner,
    turnDeadlineAt,
  };
}
