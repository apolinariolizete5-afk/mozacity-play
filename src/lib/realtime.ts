import { useCallback, useEffect, useRef, useState } from "react";
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
  searching?: boolean;
  bet?: number;
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
      presence: {},
      broadcast: { self: false, ack: true },
    },
  });
  lobbyChannels.set("lobby", channel);
  return channel;
}

async function ensureSubscribed(channel: RoomChannel) {
  if (channel.state === "joined") return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 3500);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

function flattenPresence(state: Record<string, unknown[]>): RoomPresence[] {
  const out: RoomPresence[] = [];
  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      if (entry && typeof entry === "object" && "playerId" in entry) {
        out.push(entry as RoomPresence);
      }
    }
  }
  return out;
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
        bet: Math.max(0, Number(entry.bet ?? 0)),
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

export function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createRoom(input: {
  game: GameId;
  player: RoomPresence;
  isPrivate?: boolean;
  capacity?: number;
  bet?: number;
}) {
  const channel = getLobbyChannel();
  await ensureSubscribed(channel);
  const code = makeRoomCode();
  const bet = Math.max(0, Math.round(Number(input.bet ?? 0)));
  const room: LobbyRoom = {
    id: code,
    code,
    game: input.game,
    isPrivate: Boolean(input.isPrivate),
    bet,
    timer: TURN_SECONDS,
    capacity: input.game === "ludo" ? Math.min(4, Math.max(2, input.capacity ?? 2)) : 2,
    status: "WAITING",
    players: [{ id: input.player.playerId, name: input.player.name }],
    hostId: input.player.playerId,
    createdAt: new Date().toISOString(),
  };

  await channel.track({
    ...input.player,
    roomCode: code,
    game: input.game,
    isPrivate: Boolean(input.isPrivate),
    capacity: room.capacity,
    hostId: input.player.playerId,
    bet,
    createdAt: room.createdAt,
  });

  return room;
}

export async function joinRoom(roomCode: string, player: RoomPresence) {
  const channel = getLobbyChannel();
  await ensureSubscribed(channel);
  const code = roomCode.toUpperCase().trim();
  const currentRooms = presenceToRooms(channel.presenceState() as Record<string, unknown[]>);
  const existing = currentRooms.find((r) => r.code === code);

  await channel.track({
    ...player,
    roomCode: code,
    game: existing?.game ?? "ludo",
    isPrivate: existing?.isPrivate ?? false,
    capacity: existing?.capacity ?? 2,
    bet: existing?.bet ?? 0,
    hostId: existing?.hostId ?? player.playerId,
  });

  return {
    code,
    game: existing?.game ?? "ludo",
    bet: existing?.bet ?? 20,
    capacity: existing?.capacity ?? 2,
  };
}

export function useRealtimeLobby(player: RoomPresence, enabled = true) {
  const [remoteRooms, setRemoteRooms] = useState<LobbyRoom[]>([]);
  const channelRef = useRef<RoomChannel | null>(null);

  useEffect(() => {
    if (!enabled || !player.playerId) return;
    const channel = getLobbyChannel();
    channelRef.current = channel;

    const sync = () => {
      setRemoteRooms(presenceToRooms(channel.presenceState() as Record<string, unknown[]>));
    };

    channel.on("presence", { event: "sync" }, sync);
    channel.on("presence", { event: "join" }, sync);
    channel.on("presence", { event: "leave" }, sync);

    void ensureSubscribed(channel).then(() => {
      sync();
    });

    return () => {};
  }, [enabled, player.playerId]);

  return { remoteRooms };
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
  const latestStateRef = useRef<T | null>(null);
  const playerIndexRef = useRef(0);
  const hadOpponentRef = useRef(false);
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
      const resolvedIndex = index >= 0 ? index : 0;
      playerIndexRef.current = resolvedIndex;
      setPlayerIndex(resolvedIndex);

      const opponentOnline = nextPlayers.some((entry) => entry.playerId !== player.playerId);
      setOpponentDisconnected(!opponentOnline && nextPlayers.length > 0);

      if (opponentOnline) {
        hadOpponentRef.current = true;
        if (disconnectTimerRef.current) window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      } else if (hadOpponentRef.current && nextPlayers.length > 0 && !disconnectTimerRef.current) {
        disconnectTimerRef.current = window.setTimeout(() => {
          if (active) setForfeitWinner(playerIndexRef.current);
        }, DISCONNECT_GRACE_SECONDS * 1000);
      }
    };

    const onState = (payload: { payload?: RoomEvent<T> }) => {
      const event = payload.payload;
      if (!event || event.kind !== "state" || event.actorId === player.playerId) return;
      if (event.sequence < sequenceRef.current) return;
      sequenceRef.current = Math.max(sequenceRef.current, event.sequence);
      setRemoteState(event.state);
      latestStateRef.current = event.state;
      const stateObj = event.state as Record<string, unknown>;
      if (typeof stateObj?.turnDeadlineAt === "number") {
        setTurnDeadlineAt(stateObj.turnDeadlineAt);
      }
    };

    const onRequestState = (payload: { payload?: RoomEvent<T> }) => {
      const event = payload.payload;
      if (!event || event.kind !== "request_state" || event.actorId === player.playerId || latestStateRef.current === null) return;
      void channel.send({
        type: "broadcast",
        event: "state",
        payload: {
          kind: "state",
          state: latestStateRef.current,
          actorId: player.playerId,
          sequence: sequenceRef.current,
          sentAt: Date.now(),
        },
      });
    };

    const onForfeit = (payload: { payload?: RoomEvent<T> }) => {
      const event = payload.payload;
      if (!event || event.kind !== "forfeit") return;
      const index = players.findIndex((p) => p.playerId === event.winnerId);
      if (index >= 0) setForfeitWinner(index);
    };

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.on("presence", { event: "join" }, syncPresence);
    channel.on("presence", { event: "leave" }, syncPresence);
    (channel as any).on("broadcast", { event: "state" }, onState);
    (channel as any).on("broadcast", { event: "request_state" }, onRequestState);
    (channel as any).on("broadcast", { event: "forfeit" }, onForfeit);

    channel.subscribe((status) => {
      if (!active) return;
      if (status === "SUBSCRIBED") {
        setConnected(true);
        void channel.track({
          ...player,
          roomCode: roomCode.toUpperCase(),
          game,
        });
        void channel.send({
          type: "broadcast",
          event: "request_state",
          payload: { kind: "request_state", actorId: player.playerId, sentAt: Date.now() },
        });
      }
    });

    return () => {
      active = false;
      if (disconnectTimerRef.current) window.clearTimeout(disconnectTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [enabled, game, player.playerId, player.name, roomCode]);

  const broadcastState = useCallback(
    async (nextState: T) => {
      const channel = channelRef.current;
      if (!channel) return;
      sequenceRef.current += 1;
      latestStateRef.current = nextState;
      const deadline = Date.now() + TURN_SECONDS * 1000;
      setTurnDeadlineAt(deadline);

      const stateWithDeadline =
        typeof nextState === "object" && nextState !== null
          ? { ...nextState, turnDeadlineAt: deadline }
          : nextState;

      await channel.send({
        type: "broadcast",
        event: "state",
        payload: {
          kind: "state",
          state: stateWithDeadline,
          actorId: player.playerId,
          sequence: sequenceRef.current,
          sentAt: Date.now(),
        },
      });
    },
    [player.playerId],
  );

  const broadcastForfeit = useCallback(
    async (winnerId: string) => {
      const channel = channelRef.current;
      if (!channel) return;
      await channel.send({
        type: "broadcast",
        event: "forfeit",
        payload: { kind: "forfeit", winnerId, actorId: player.playerId, sentAt: Date.now() },
      });
    },
    [player.playerId],
  );

  return {
    remoteState,
    players,
    connected,
    playerIndex,
    opponentDisconnected,
    forfeitWinner,
    turnDeadlineAt,
    broadcastState,
    broadcastForfeit,
  };
}

export async function quickMatch(input: {
  game: GameId;
  player: RoomPresence;
  bet?: number;
  players?: number;
  signal?: AbortSignal;
}) {
  const queue = supabase.channel(`mozaplay:matchmaking:${input.game}`, {
    config: {
      presence: { key: input.player.playerId },
      broadcast: { self: false, ack: true },
    },
  });

  const throwIfAborted = () => {
    if (input.signal?.aborted) throw new Error("matchmaking_cancelled");
  };

  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (input.signal?.aborted) {
        reject(new Error("matchmaking_cancelled"));
        return;
      }
      const timer = window.setTimeout(() => {
        input.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        window.clearTimeout(timer);
        input.signal?.removeEventListener("abort", onAbort);
        reject(new Error("matchmaking_cancelled"));
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });
    });

  const desiredPlayers = input.game === "ludo" ? Math.min(4, Math.max(2, Math.round(Number(input.players ?? 2)))) : 2;

  const searchingPlayer: RoomPresence = {
    ...input.player,
    game: input.game,
    searching: true,
    bet: Math.max(0, Math.round(Number(input.bet ?? 0))),
    capacity: desiredPlayers,
    createdAt: new Date().toISOString(),
  };

  let assignedRoom: LobbyRoom | null = null;
  let assignmentResolve: ((room: LobbyRoom) => void) | null = null;
  const assignment = new Promise<LobbyRoom>((resolve) => {
    assignmentResolve = resolve;
  });

  const onAssigned = (payload: { payload?: { pair?: string[]; room?: LobbyRoom } }) => {
    const event = payload.payload;
    if (!event?.pair || !event.room) return;
    if (!event.pair.includes(input.player.playerId)) return;
    assignedRoom = event.room;
    assignmentResolve?.(event.room);
  };

  (queue as any).on("broadcast", { event: "match_assigned" }, onAssigned);
  await ensureSubscribed(queue);
  throwIfAborted();
  await queue.track(searchingPlayer);

  const buildRoom = (pair: RoomPresence[]): LobbyRoom => {
    const ids = pair.map((entry) => entry.playerId).sort();
    const seed = ids.join(":");
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    const code = `Q${hash.toString(36).toUpperCase().padStart(5, "0").slice(-5)}`;
    return {
      id: code,
      code,
      game: input.game,
      isPrivate: false,
      bet: searchingPlayer.bet ?? 0,
      timer: TURN_SECONDS,
      capacity: desiredPlayers,
      status: pair.length >= desiredPlayers ? "READY" : "WAITING",
      players: pair.map((entry) => ({ id: entry.playerId, name: entry.name })),
      hostId: ids[0],
      createdAt: pair[0]?.createdAt ?? new Date().toISOString(),
    };
  };

  try {
    for (;;) {
      throwIfAborted();
      if (assignedRoom) return assignedRoom;

      const entries = flattenPresence(queue.presenceState() as Record<string, unknown[]>)
        .filter((entry) =>
          entry.game === input.game &&
          entry.searching === true &&
          Number(entry.bet ?? 0) === searchingPlayer.bet &&
          Number(entry.capacity ?? 2) === desiredPlayers &&
          Boolean(entry.playerId),
        );

      const unique = new Map<string, RoomPresence>();
      for (const entry of entries) unique.set(entry.playerId, entry);

      const searchers = [...unique.values()].sort((a, b) => {
        const created = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        return created || a.playerId.localeCompare(b.playerId);
      });

      if (searchers.length >= desiredPlayers) {
        // Only the oldest active searcher acts as coordinator. This prevents
        // A+B and B+C from being assigned simultaneously when 3+ players
        // enter the queue together.
        const pair = searchers.slice(0, desiredPlayers);
        const coordinatorId = pair[0].playerId;

        if (input.player.playerId === coordinatorId) {
          const room = buildRoom(pair);
          const pairIds = pair.map((entry) => entry.playerId);

          await queue.send({
            type: "broadcast",
            event: "match_assigned",
            payload: { pair: pairIds, room },
          });

          assignedRoom = room;
          (assignmentResolve as ((r: typeof room) => void) | null)?.(room);

          // Repeat briefly so a slow second subscriber still receives the
          // assignment before the coordinator leaves the queue.
          await wait(180);
          await queue.send({
            type: "broadcast",
            event: "match_assigned",
            payload: { pair: pairIds, room },
          });
          await wait(180);
          return room;
        }
      }

      const received = await Promise.race([
        assignment.then((room) => room),
        wait(500).then(() => null),
      ]);
      if (received) return received;
    }
  } finally {
    try { await queue.untrack(); } catch { /* channel may already be closing */ }
    await supabase.removeChannel(queue);
  }
}
export async function leaveLobbyRoom() {
  const channel = lobbyChannels.get("lobby");
  if (!channel || channel.state !== "joined") return;
  await channel.untrack();
}
