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
      presence: {},
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
  const queue = supabase.channel(`mozaplay:matchmaking:${input.game}`, {
    config: {
      presence: { key: input.player.playerId },
      broadcast: { self: false, ack: true },
    },
  });
  await ensureSubscribed(queue);

  const searchingPlayer: RoomPresence = {
    ...input.player,
    game: input.game,
    searching: true,
    createdAt: new Date().toISOString(),
  };

  await queue.track(searchingPlayer);

  let assignedRoom: LobbyRoom | null = null;
  let assignmentResolve: ((room: LobbyRoom) => void) | null = null;
  const assignment = new Promise<LobbyRoom>((resolve) => { assignmentResolve = resolve; });

  const buildRoom = (pair: RoomPresence[]) => {
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
      bet: 0,
      timer: TURN_SECONDS,
      capacity: 2,
      status: "READY" as const,
      players: pair.map((entry) => ({ id: entry.playerId, name: entry.name })),
      hostId: ids[0],
      createdAt: pair[0]?.createdAt ?? new Date().toISOString(),
    };
  };

  const onAssigned = (payload: { payload?: { pair?: string[]; room?: LobbyRoom } }) => {
    const event = payload.payload;
    if (!event?.pair || !event.room) return;
    if (!event.pair.includes(input.player.playerId)) return;
    assignedRoom = event.room;
    assignmentResolve?.(event.room);
  };

  (queue as any).on("broadcast", { event: "match_assigned" }, onAssigned);

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (assignedRoom) return assignedRoom;

      const entries = flattenPresence(queue.presenceState() as Record<string, unknown[]>)
        .filter((entry) =>
          entry.game === input.game &&
          entry.searching === true &&
          entry.playerId,
        );

      const unique = new Map<string, RoomPresence>();
      for (const entry of entries) unique.set(entry.playerId, entry);
      const searchers = [...unique.values()]
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

      if (searchers.length >= 2) {
        const pair = searchers.slice(0, 2);
        const pairIds = pair.map((entry) => entry.playerId).sort();
        const isInPair = pairIds.includes(input.player.playerId);
        const leaderId = pairIds[0];

        if (isInPair && input.player.playerId === leaderId) {
          const room = buildRoom(pair);

          // Announce the assignment before leaving the queue. The other
          // client can therefore enter the exact same room without guessing.
          await queue.send({
            type: "broadcast",
            event: "match_assigned",
            payload: { pair: pairIds, room },
          });

          assignedRoom = room;
          assignmentResolve?.(room);

          // Give the second client a small window to receive the assignment
          // before the leader disappears from Presence.
          await new Promise((resolve) => setTimeout(resolve, 350));
          return room;
        }
      }

      // If the other client already assigned us, return immediately.
      const quickResult = await Promise.race([
        assignment.then((room) => room),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
      ]);
      if (quickResult) return quickResult;
    }

    throw new Error("matchmaking_timeout");
  } finally {
    try { await queue.untrack(); } catch { /* channel may already be closing */ }
    await supabase.removeChannel(queue);
  }
}
