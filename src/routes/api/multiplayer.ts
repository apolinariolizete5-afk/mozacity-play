import { createFileRoute } from "@tanstack/react-router";

type Player = { id: string; name: string };
type Room = {
  id: string;
  code: string;
  game: "ludo" | "checkers" | "chess";
  isPrivate: boolean;
  timer: number;
  capacity: number;
  status: "WAITING" | "READY" | "PLAYING" | "FINISHED";
  players: Player[];
  hostId: string;
  createdAt: string;
  state?: unknown;
  stateUpdatedAt?: number;
};

const rooms = new Map<string, Room>();

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "MP";
  do {
    value = "MP";
    for (let i = 0; i < 4; i++) value += chars[Math.floor(Math.random() * chars.length)];
  } while ([...rooms.values()].some((r) => r.code === value));
  return value;
}

function cleanRoom(room: Room) {
  const { state, stateUpdatedAt, ...publicRoom } = room;
  return publicRoom;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/multiplayer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const roomCode = (url.searchParams.get("room") ?? "").trim().toUpperCase();

        if (roomCode) {
          const room = [...rooms.values()].find((r) => r.code === roomCode);
          if (!room) return json({ room: null }, 404);
          return json({
            room: cleanRoom(room),
            state: room.state ?? null,
            stateUpdatedAt: room.stateUpdatedAt ?? 0,
          });
        }

        return json({
          rooms: [...rooms.values()]
            .filter((r) => r.status !== "FINISHED")
            .map(cleanRoom)
            .slice(-50)
            .reverse(),
        });
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const action = String(body?.action ?? "");
        const player = body?.player as { id?: string; name?: string } | undefined;
        const playerId = String(player?.id ?? "").trim();
        const playerName = String(player?.name ?? "Jogador").trim().slice(0, 24) || "Jogador";

        if (!playerId) return json({ error: "Jogador inválido." }, 400);

        if (action === "create") {
          const game = body?.game;
          if (!["ludo", "checkers", "chess"].includes(game)) return json({ error: "Jogo inválido." }, 400);
          const capacity = Math.min(game === "ludo" ? 4 : 2, Math.max(2, Number(body?.capacity) || 2));
          const room: Room = {
            id: crypto.randomUUID(),
            code: code(),
            game,
            isPrivate: Boolean(body?.isPrivate),
            timer: Math.max(5, Number(body?.timer) || 10),
            capacity,
            status: "WAITING",
            players: [{ id: playerId, name: playerName }],
            hostId: playerId,
            createdAt: new Date().toISOString(),
          };
          rooms.set(room.code, room);
          return json({ room: cleanRoom(room) }, 201);
        }

        if (action === "join") {
          const roomCode = String(body?.code ?? "").trim().toUpperCase();
          const room = rooms.get(roomCode);
          if (!room) return json({ error: "Sala não encontrada." }, 404);
          if (room.players.some((p) => p.id === playerId)) return json({ room: cleanRoom(room), state: room.state ?? null });
          if (room.players.length >= room.capacity) return json({ error: "Sala cheia." }, 409);
          room.players.push({ id: playerId, name: playerName });
          if (room.players.length >= room.capacity) room.status = "READY";
          return json({ room: cleanRoom(room), state: room.state ?? null });
        }

        if (action === "quick") {
          const game = body?.game;
          if (!["ludo", "checkers", "chess"].includes(game)) return json({ error: "Jogo inválido." }, 400);
          const capacity = Math.min(game === "ludo" ? 4 : 2, Math.max(2, Number(body?.capacity) || 2));
          const existing = [...rooms.values()].find(
            (r) =>
              r.game === game &&
              !r.isPrivate &&
              r.status === "WAITING" &&
              r.players.length < r.capacity &&
              !r.players.some((p) => p.id === playerId),
          );

          if (existing) {
            existing.players.push({ id: playerId, name: playerName });
            if (existing.players.length >= existing.capacity) existing.status = "READY";
            return json({ room: cleanRoom(existing), matched: true, state: existing.state ?? null });
          }

          const room: Room = {
            id: crypto.randomUUID(),
            code: code(),
            game,
            isPrivate: false,
            timer: Math.max(5, Number(body?.timer) || 10),
            capacity,
            status: "WAITING",
            players: [{ id: playerId, name: playerName }],
            hostId: playerId,
            createdAt: new Date().toISOString(),
          };
          rooms.set(room.code, room);
          return json({ room: cleanRoom(room), matched: false, state: null }, 201);
        }

        if (action === "state") {
          const roomCode = String(body?.code ?? "").trim().toUpperCase();
          const room = rooms.get(roomCode);
          if (!room) return json({ error: "Sala não encontrada." }, 404);
          if (!room.players.some((p) => p.id === playerId)) return json({ error: "Jogador não pertence à sala." }, 403);
          room.state = body?.state ?? null;
          room.stateUpdatedAt = Date.now();
          if (room.players.length >= room.capacity) room.status = "PLAYING";
          return json({ ok: true });
        }

        return json({ error: "Ação inválida." }, 400);
      },
    },
  },
});
