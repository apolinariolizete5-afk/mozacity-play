import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type RoomPresence = { playerId: string; name: string };

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

  const channelName = useMemo(
    () => (roomCode ? `mozaplay:room:${roomCode.toUpperCase()}` : ""),
    [roomCode],
  );

  useEffect(() => {
    if (!enabled || !channelName) return;
    let active = true;
    const channel: RealtimeChannel = supabase.channel(channelName, {
      config: { presence: { key: player.playerId } },
    });

    const refreshPresence = () => {
      const state = channel.presenceState<RoomPresence>();
      const list = Object.values(state)
        .flat()
        .filter((p) => p?.playerId)
        .slice(0, 4);
      if (active) setPlayers(list);
    };

    channel
      .on("presence", { event: "sync" }, refreshPresence)
      .on("presence", { event: "join" }, refreshPresence)
      .on("presence", { event: "leave" }, refreshPresence)
      .on("broadcast", { event: "game-state" }, ({ payload }) => {
        if (payload?.game === game && payload?.sender !== player.playerId) {
          setRemoteState(payload.state as T);
        }
      })
      .on("broadcast", { event: "game-event" }, ({ payload }) => {
        if (payload?.game === game && payload?.sender !== player.playerId) {
          setRemoteState(payload.state as T);
        }
      })
      .subscribe(async (status) => {
        if (!active) return;
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          await channel.track(player);
          refreshPresence();
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [channelName, enabled, game, player.playerId, player.name]);

  return {
    connected,
    players,
    broadcastState: (state: T) => {
      if (!channelName) return;
      const channel = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
      if (!channel) return;
      void channel.send({
        type: "broadcast",
        event: "game-state",
        payload: { game, sender: player.playerId, state },
      });
    },
    remoteState,
  };
}


import type { Room } from "@/lib/store";

export type LobbyRoom = Pick<
  Room,
  "id" | "code" | "game" | "isPrivate" | "bet" | "timer" | "capacity" | "status" | "players" | "hostId" | "createdAt"
>;

export function useRealtimeLobby(localRooms: LobbyRoom[], enabled = true) {
  const [remoteRooms, setRemoteRooms] = useState<LobbyRoom[]>([]);

  const roomsKey = useMemo(
    () => JSON.stringify(localRooms.filter((room) => room.status !== "CANCELLED")),
    [localRooms],
  );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const channel = supabase.channel("mozaplay:lobby");

    const publish = (rooms: LobbyRoom[]) => {
      if (!active) return;
      for (const room of rooms) {
        void channel.send({
          type: "broadcast",
          event: "room-announcement",
          payload: { room },
        });
      }
    };

    channel
      .on("broadcast", { event: "room-announcement" }, ({ payload }) => {
        const room = payload?.room as LobbyRoom | undefined;
        if (!room?.code || room.status === "CANCELLED") return;
        setRemoteRooms((current) => {
          const next = current.filter((item) => item.code !== room.code);
          return [...next, room].slice(-50);
        });
      })
      .on("broadcast", { event: "room-query" }, () => {
        publish(JSON.parse(roomsKey) as LobbyRoom[]);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        publish(JSON.parse(roomsKey) as LobbyRoom[]);
        await channel.send({
          type: "broadcast",
          event: "room-query",
          payload: {},
        });
      });

    const timer = window.setInterval(() => {
      publish(JSON.parse(roomsKey) as LobbyRoom[]);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, roomsKey]);

  const visibleRemoteRooms = remoteRooms.filter(
    (remote) => !localRooms.some((local) => local.code === remote.code),
  );

  return { remoteRooms: visibleRemoteRooms };
}
