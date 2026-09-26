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
  // Quick Match is a global queue for players who are explicitly searching.
  // It is deliberately separate from the room list: a player can be online
  // without searching, while Quick Match must pair only active searchers.
  const queue = supabase.channel(`mozaplay:matchmaking:${input.game}`, {
    config: {
      presence: { key: input.player.playerId },
    },
  });
  await ensureSubscribed(queue);

  const searchingPlayer = {
    ...input.player,
    game: input.game,
    searching: true,
    createdAt: new Date().toISOString(),
  };

  await queue.track(searchingPlayer);

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const entries = flattenPresence(queue.presenceState() as Record<string, unknown[]>)
        .filter((entry) =>
          entry.game === input.game &&
          entry.searching === true &&
          entry.playerId,
        )
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

      const unique = new Map<string, RoomPresence>();
      for (const entry of entries) unique.set(entry.playerId, entry);
      const searchers = [...unique.values()];

      if (searchers.length >= 2) {
        const pair = searchers.slice(0, 2);
        if (pair.some((entry) => entry.playerId === input.player.playerId)) {
          const ids = pair.map((entry) => entry.playerId).sort();
          const roomSeed = ids.join(":");\n          let roomHash = 0;\n          for (let index = 0; index < roomSeed.length; index += 1) roomHash = (roomHash * 31 + roomSeed.charCodeAt(index)) >>> 0;\n          const roomCode = `Q${roomHash.toString(36).toUpperCase().padStart(5, "0").slice(-5)}`;

          // Remove this player from the queue before entering the room.
          await queue.untrack();

          const lobby = getLobbyChannel();
          await ensureSubscribed(lobby);
          const room: LobbyRoom = {
            id: roomCode,
            code: roomCode,
            game: input.game,
            isPrivate: false,
            bet: 0,
            timer: TURN_SECONDS,
            capacity: 2,
            status: "READY",
            players: pair.map((entry) => ({ id: entry.playerId, name: entry.name })),
            hostId: ids[0],
            createdAt: pair[0]?.createdAt ?? new Date().toISOString(),
          };

          await lobby.track({
            ...input.player,
            roomCode,
            game: input.game,
            isPrivate: false,
            capacity: 2,
            hostId: ids[0],
            searching: false,
            createdAt: room.createdAt,
          });

          return room;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("matchmaking_timeout");
  } finally {
    // If a match was returned, untrack is harmless and ensures the queue
    // cannot keep showing this player as available.
    try { await queue.untrack(); } catch { /* channel may already be closed */ }
    await supabase.removeChannel(queue);
  }
}
