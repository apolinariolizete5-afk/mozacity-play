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
  }, [channelName, enabled, game, player]);

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
