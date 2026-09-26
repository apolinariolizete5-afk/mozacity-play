import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Globe, Plus, Play, Share2 } from "lucide-react";
import { Button, Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { useRealtimeLobby } from "@/lib/realtime";
import { notify, useApp, type Room, type RoomStatus } from "@/lib/store";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Salas públicas e privadas — MozaPlay" },
      {
        name: "description",
        content: "Cria salas gratuitas com código curto e joga com outras pessoas em tempo real.",
      },
      { property: "og:title", content: "Salas públicas e privadas — MozaPlay" },
      { property: "og:description", content: "Salas MozaPlay com código curto tipo MP7K92." },
    ],
  }),
  component: Rooms,
});

const STATUS_TONE: Record<RoomStatus, "muted" | "primary" | "accent" | "success" | "danger"> = {
  WAITING: "muted",
  READY: "accent",
  STARTING: "primary",
  PLAYING: "success",
  FINISHED: "muted",
  CANCELLED: "danger",
};

function Rooms() {
  const app = useApp();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [game, setGame] = useState<GameId>("ludo");
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const { remoteRooms } = useRealtimeLobby([]);

  const enter = (room: Room) => {
    if (room.game === "ludo")
      navigate({
        to: "/games/ludo",
        search: { bet: 0, timer: room.timer, players: Math.min(2, room.capacity), room: room.code },
      });
    else if (room.game === "checkers")
      navigate({ to: "/games/checkers", search: { bet: 0, timer: room.timer, room: room.code } });
    else navigate({ to: "/games/chess", search: { bet: 0, timer: room.timer, room: room.code } });
  };

  const submitCreate = async () => {
    try {
      const response = await fetch("/api/multiplayer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          game,
          isPrivate,
          timer: app.timer,
          capacity: 2,
          player: { id: app.profile.id, name: app.profile.name },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.room) throw new Error(data.error || "Não foi possível criar a sala.");
      setCreating(false);
      notify({
        title: "Sala criada",
        body: `Partilha o código ${data.room.code} para convidar amigos.`,
        kind: "invite",
      });
      setMessage(`Sala ${data.room.code} criada. A aguardar outro jogador.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a sala.");
    }
  };

  const shareRoom = async (room: Room) => {
    const path = room.game === "ludo" ? `/games/ludo?room=${room.code}&players=2&bet=0` : room.game === "checkers" ? `/games/checkers?room=${room.code}&bet=0` : `/games/chess?room=${room.code}&bet=0`;
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try { await navigator.clipboard.writeText(url); setMessage("Link da sala copiado."); } catch { setMessage(url); }
  };

  const joinByCode = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    try {
      const response = await fetch("/api/multiplayer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          code: normalized,
          player: { id: app.profile.id, name: app.profile.name },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.room) throw new Error(data.error || "Código não encontrado.");
      setCode("");
      setMessage(`Entraste na sala ${data.room.code}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar na sala.");
    }
  };

  const visible = remoteRooms.filter((r) => r.status !== "FINISHED");

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-6 pt-5 sm:px-6">
      <PageHeader
        title="Salas"
        subtitle="Públicas, privadas e por código"
        right={
          <Button size="sm" onClick={() => setCreating((c) => !c)}>
            <Plus className="h-4 w-4" /> Criar
          </Button>
        }
      />

      <Card className="flex gap-2 rounded-3xl border border-border bg-card/95 p-3 shadow-sm">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código da sala (ex: MP7K92)"
          maxLength={6}
          className="h-12 flex-1 rounded-2xl bg-secondary px-4 text-sm font-bold uppercase tracking-widest outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-muted-foreground"
        />
        <Button onClick={joinByCode} disabled={code.length < 4}>
          Entrar
        </Button>
      </Card>

      {message ? <p className="px-1 text-xs text-accent">{message}</p> : null}

      {creating ? (
        <Card className="space-y-3">
          <p className="font-display font-bold">Nova sala</p>
          <div className="flex gap-2">
            {(Object.keys(GAME_META) as GameId[]).map((id) => (
              <button
                key={id}
                onClick={() => setGame(id)}
                className={`h-11 flex-1 rounded-2xl text-xs font-bold ${
                  game === id ? "bg-primary text-primary-foreground" : "bg-secondary"
                }`}
              >
                {GAME_META[id].name}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold">
            Sala privada
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-5 w-5 accent-[oklch(0.79_0.17_78)]"
            />
          </label>
          <Button size="lg" className="w-full" onClick={submitCreate}>
            Criar sala
          </Button>
        </Card>
      ) : null}

      <div className="flex items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Partidas</p>
          <h2 className="text-lg font-bold">Salas disponíveis</h2>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{visible.length} salas</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
      {visible.map((room) => {
        const full = room.players.length >= room.capacity;
                const joined = room.players.some((p) => p.id === app.profile.id);
        return (
          <Card key={room.id} className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-bold">{GAME_META[room.game].name}</p>
                  {room.isPrivate ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-1 font-mono text-xs tracking-widest text-primary">{room.code}</p>
              </div>
              <div className="text-right">
                <Pill tone={STATUS_TONE[room.status]}>{room.status}</Pill>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {room.players.length}/{room.capacity} · grátis
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {room.players.map((p) => <Pill key={p.id} tone="primary">{p.name}</Pill>)}
            </div>

            <div className="flex gap-2">
              {!joined ? (
                <Button variant="ghost" className="flex-1" onClick={async () => {
                    try {
                      const response = await fetch("/api/multiplayer", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "join",
                          code: room.code,
                          player: { id: app.profile.id, name: app.profile.name },
                        }),
                      });
                      const data = await response.json();
                      if (!response.ok || !data.room) throw new Error(data.error || "Não foi possível entrar na sala.");
                      setMessage(`Entraste na sala ${data.room.code}.`);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Não foi possível entrar na sala.");
                    }
                  }} disabled={full}>
                  {full ? "Cheia" : "Entrar"}
                </Button>
              ) : null}
              {!full ? <Button variant="outline" className="flex-1" onClick={() => shareRoom(room)}><Share2 className="h-4 w-4" /> Partilhar</Button> : null}
              <Button className="flex-1" onClick={() => enter(room)}>
                <Play className="h-4 w-4" /> Jogar
              </Button>
            </div>
          </Card>
        );
      })}
      </div>
    </main>
  );
}
