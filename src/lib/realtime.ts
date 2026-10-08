import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { GameId } from "@/lib/games/types";

export const TURN_SECONDS = 15;
export const DISCONNECT_GRACE_SECONDS = 20;

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
  online?: boolean;
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
  | { kind: "state"; state: T; actorId: string; sequence: number; logicalClock: number; sentAt: number }
  | { kind: "request_state"; actorId: string; sentAt: number }
  | { kind: "forfeit"; winnerId: string; actorId: string; sentAt: number }
  | { kind: "eliminate"; playerId: string; actorId: string; sentAt: number };

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
  const createdAt = new Date().toISOString();
  const capacity = input.game === "ludo" ? Math.min(4, Math.max(2, input.capacity ?? 2)) : 2;
  const room: LobbyRoom = {
    id: code,
    code,
    game: input.game,
    isPrivate: Boolean(input.isPrivate),
    bet: 0,
    timer: TURN_SECONDS,
    capacity,
    status: "WAITING",
    players: [{ id: input.player.playerId, name: input.player.name }],
    hostId: input.player.playerId,
    createdAt,
  };

  const { error: saveError } = await supabase.from("game_rooms").insert({
    code,
    game: input.game,
    is_private: room.isPrivate,
    bet_cents: 0,
    capacity,
    status: "WAITING",
    host_id: input.player.playerId,
    host_name: input.player.name || "Jogador",
    created_at: createdAt,
  });
  if (saveError) throw new Error(`Não foi possível guardar a sala: ${saveError.message}`);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mozaplay:rooms-refresh"));

  await channel.track({
    ...input.player,
    roomCode: code,
    game: input.game,
    isPrivate: room.isPrivate,
    capacity,
    hostId: input.player.playerId,
    bet: 0,
    createdAt,
  });

  return room;
}

export async function joinRoom(roomCode: string, player: RoomPresence) {
  const channel = getLobbyChannel();
  await ensureSubscribed(channel);
  const code = roomCode.toUpperCase().trim();
  const currentRooms = presenceToRooms(channel.presenceState() as Record<string, unknown[]>);
  const liveRoom = currentRooms.find((r) => r.code === code);
  const { data: savedRoom, error: lookupError } = await supabase.rpc("get_game_room_by_code", { _code: code });
  if (lookupError) throw new Error(`Não foi possível consultar a sala: ${lookupError.message}`);
  const saved = savedRoom as {
    code?: string; game?: GameId; is_private?: boolean; bet_cents?: number;
    capacity?: number; host_id?: string; created_at?: string;
  } | null;
  if (!saved && !liveRoom) throw new Error("Esta sala não existe ou já foi removida.");

  const game = (saved?.game ?? liveRoom?.game ?? "ludo") as GameId;
  const isPrivate = saved?.is_private ?? liveRoom?.isPrivate ?? false;
  const capacity = saved?.capacity ?? liveRoom?.capacity ?? 2;
  const hostId = saved?.host_id ?? liveRoom?.hostId ?? player.playerId;

  await channel.track({
    ...player,
    roomCode: code,
    game,
    isPrivate,
    capacity,
    bet: 0,
    hostId,
    createdAt: saved?.created_at ?? liveRoom?.createdAt,
  });

  return { code, game, bet: 0, capacity, hostId };
}

export function useRealtimeLobby(player: RoomPresence, enabled = true) {
  const [remoteRooms, setRemoteRooms] = useState<LobbyRoom[]>([]);

  useEffect(() => {
    if (!enabled || !player.playerId) return;

    // Keep realtime presence for online players, but load room records from
    // PostgreSQL so the room survives when its host closes the app.
    const channel = supabase.channel("mozaplay:lobby", {
      config: { presence: {}, broadcast: { self: false, ack: true } },
    });
    let active = true;
    let persistedRooms: LobbyRoom[] = [];

    const sync = () => {
      const liveRooms = presenceToRooms(channel.presenceState() as Record<string, unknown[]>);
      const liveByCode = new Map(liveRooms.map((room) => [room.code, room]));
      const merged = persistedRooms.map((room) => {
        const live = liveByCode.get(room.code);
        return {
          ...room,
          players: live?.players ?? [],
          status: live && live.players.length >= room.capacity ? "READY" as const : "WAITING" as const,
        };
      });
      const savedCodes = new Set(persistedRooms.map((room) => room.code));
      for (const room of liveRooms) if (!savedCodes.has(room.code)) merged.push(room);
      setRemoteRooms(merged);
    };

    const loadSavedRooms = async () => {
      const { data, error } = await supabase
        .from("game_rooms")
        .select("code,game,is_private,bet_cents,capacity,status,host_id,host_name,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!active) return;
      if (error) {
        console.warn("[MozaPlay] Não foi possível carregar salas guardadas:", error.message);
        sync();
        return;
      }
      persistedRooms = (data ?? []).map((row: any) => ({
        id: row.code,
        code: row.code,
        game: row.game as GameId,
        isPrivate: Boolean(row.is_private),
        bet: 0,
        timer: TURN_SECONDS,
        capacity: Math.min(row.game === "ludo" ? 4 : 2, Math.max(2, Number(row.capacity) || 2)),
        status: "WAITING" as const,
        players: [],
        hostId: row.host_id,
        createdAt: row.created_at,
      }));
      sync();
    };

    // Register all presence listeners before subscribe().
    channel.on("presence", { event: "sync" }, sync);
    channel.on("presence", { event: "join" }, sync);
    channel.on("presence", { event: "leave" }, sync);
    void ensureSubscribed(channel).then(() => { if (active) sync(); });
    void loadSavedRooms();
    const refreshId = window.setInterval(() => void loadSavedRooms(), 10000);
    const onVisible = () => { if (document.visibilityState === "visible") void loadSavedRooms(); };
    const onRoomsRefresh = () => void loadSavedRooms();
    window.addEventListener("mozaplay:rooms-refresh", onRoomsRefresh);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.clearInterval(refreshId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("mozaplay:rooms-refresh", onRoomsRefresh);
      void supabase.removeChannel(channel);
    };
  }, [enabled, player.playerId]);

  return { remoteRooms };
}

export async function removeRoom(roomCode: string, playerId: string) {
  const code = roomCode.toUpperCase().trim();
  const { data, error } = await supabase
    .from("game_rooms")
    .delete()
    .eq("code", code)
    .eq("host_id", playerId)
    .select("code");
  if (error) throw new Error(`Não foi possível remover a sala: ${error.message}`);
  if (!data?.length) throw new Error("Só o anfitrião pode remover esta sala, ou ela já foi removida.");
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mozaplay:rooms-refresh"));
}

export function useRealtimeRoom<T>(
  roomCode: string | undefined,
  game: GameId | string,
  player: RoomPresence,
  enabled = true,
) {
  const [remoteState, setRemoteState] = useState<T | null>(null);
  const [players, setPlayers] = useState<RoomPresence[]>([]);
  const knownPlayersRef = useRef<Map<string, RoomPresence>>(new Map());
  const [connected, setConnected] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [forfeitWinner, setForfeitWinner] = useState<number | null>(null);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [eliminatedPlayerIds, setEliminatedPlayerIds] = useState<string[]>([]);
  const channelRef = useRef<RoomChannel | null>(null);
  const sequenceRef = useRef(0);
  const logicalClockRef = useRef(0);
  const latestStateRef = useRef<T | null>(null);
  const latestStateOrderRef = useRef<{ logicalClock: number; actorId: string; sequence: number } | null>(null);
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
      const nextOnline = [...unique.values()];
      for (const entry of nextOnline) knownPlayersRef.current.set(entry.playerId, entry);
      const known = [...knownPlayersRef.current.values()].map((entry) => ({ ...entry, online: nextOnline.some((p) => p.playerId === entry.playerId) }));
      known.sort((a, b) => a.playerId.localeCompare(b.playerId));
      const nextPlayers = known;
      setPlayers(nextPlayers);

      const index = nextPlayers.findIndex((entry) => entry.playerId === player.playerId);
      const resolvedIndex = index >= 0 ? index : 0;
      playerIndexRef.current = resolvedIndex;
      setPlayerIndex(resolvedIndex);

      const opponentOnline = nextOnline.some((entry) => entry.playerId !== player.playerId);
      setOpponentDisconnected(!opponentOnline && nextPlayers.length > 0);

      const departed = [...knownPlayersRef.current.values()].find((entry) => entry.playerId !== player.playerId && !nextOnline.some((online) => online.playerId === entry.playerId));
      if (opponentOnline) hadOpponentRef.current = true;
      if (!departed) {
        if (disconnectTimerRef.current) window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      } else if (hadOpponentRef.current && !disconnectTimerRef.current) {
        disconnectTimerRef.current = window.setTimeout(() => {
          if (!active) return;
          if (nextOnline.length <= 1) {
            setForfeitWinner(playerIndexRef.current);
          } else {
            setEliminatedPlayerIds((current) => current.includes(departed.playerId) ? current : [...current, departed.playerId]);
            void channel.send({
              type: "broadcast",
              event: "eliminate",
              payload: { kind: "eliminate", playerId: departed.playerId, actorId: player.playerId, sentAt: Date.now() },
            });
          }
        }, DISCONNECT_GRACE_SECONDS * 1000);
      }
    };

    const onState = (payload: { payload?: RoomEvent<T> }) => {
      const event = payload.payload;
      if (!event || event.kind !== "state" || event.actorId === player.playerId) return;

      // Lamport clock + actorId gives every client the same deterministic
      // ordering, even when two devices broadcast at nearly the same time.
      logicalClockRef.current = Math.max(logicalClockRef.current, event.logicalClock);

      const incomingOrder = {
        logicalClock: event.logicalClock,
        actorId: event.actorId,
        sequence: event.sequence,
      };
      const currentOrder = latestStateOrderRef.current;
      const isNewer = !currentOrder
        || incomingOrder.logicalClock > currentOrder.logicalClock
        || (
          incomingOrder.logicalClock === currentOrder.logicalClock
          && (
            incomingOrder.actorId > currentOrder.actorId
            || (
              incomingOrder.actorId === currentOrder.actorId
              && incomingOrder.sequence > currentOrder.sequence
            )
          )
        );
      if (!isNewer) return;

      sequenceRef.current = Math.max(sequenceRef.current, event.sequence);
      latestStateOrderRef.current = incomingOrder;
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
          logicalClock: logicalClockRef.current,
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
    (channel as any).on("broadcast", { event: "eliminate" }, (payload: { payload?: RoomEvent<T> }) => {
      const event = payload.payload;
      if (!event || event.kind !== "eliminate") return;
      setEliminatedPlayerIds((current) => current.includes(event.playerId) ? current : [...current, event.playerId]);
      setPlayers((current) => current.map((p) => p.playerId === event.playerId ? { ...p, online: false } : p));
    });

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
      logicalClockRef.current += 1;
      latestStateRef.current = nextState;
      latestStateOrderRef.current = {
        logicalClock: logicalClockRef.current,
        actorId: player.playerId,
        sequence: sequenceRef.current,
      };
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
          logicalClock: logicalClockRef.current,
          sentAt: Date.now(),
        },
      });
    },
    [player.playerId],
  );

  const broadcastElimination = useCallback(
    async (playerId: string) => {
      const channel = channelRef.current;
      if (!channel) return;
      await channel.send({
        type: "broadcast",
        event: "eliminate",
        payload: { kind: "eliminate", playerId, actorId: player.playerId, sentAt: Date.now() },
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
    broadcastElimination,
    eliminatedPlayerIds,
  };
}

export async function quickMatch(input: {
  game: GameId;
  player: RoomPresence;
  bet?: number;
  players?: number;
  signal?: AbortSignal;
  onMatchFound?: (room: LobbyRoom) => void;
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
    input.onMatchFound?.(event.room);
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

  const cleanup = async () => {
    try {
      await queue.untrack();
      (queue as any).off("broadcast", { event: "match_assigned" });
      await queue.unsubscribe();
    } catch {
      // Ignore unsubscribe error on abort
    }
  };

  try {
    for (;;) {
      throwIfAborted();
      if (assignedRoom) {
        await cleanup();
        return assignedRoom;
      }

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
          input.onMatchFound?.(room);
          (assignmentResolve as ((room: LobbyRoom) => void) | null)?.(room);

          await new Promise((r) => setTimeout(r, 200));
          await queue.send({
            type: "broadcast",
            event: "match_assigned",
            payload: { pair: pairIds, room },
          });
          await new Promise((r) => setTimeout(r, 200));

          await cleanup();
          return room;
        }
      }

      await Promise.race([
        assignment,
        new Promise<void>((res, rej) => {
          const t = setTimeout(res, 400);
          if (input.signal) {
            input.signal.addEventListener("abort", () => {
              clearTimeout(t);
              rej(new Error("matchmaking_cancelled"));
            }, { once: true });
          }
        }),
      ]);
    }
  } catch (err) {
    await cleanup();
    throw err;
  }
}
export async function leaveLobbyRoom() {
  const channel = lobbyChannels.get("lobby");
  if (!channel || channel.state !== "joined") return;
  await channel.untrack();
}
