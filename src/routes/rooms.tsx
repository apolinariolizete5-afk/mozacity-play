import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Globe, Plus, Share2, Users2 } from "lucide-react";
import { Button, Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { createRoom, joinRoom, useRealtimeLobby } from "@/lib/realtime";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Salas públicas e privadas — MozaPlay" },
      { name: "description", content: "Cria uma sala real e joga com outros jogadores humanos através do Realtime." },
    ],
  }),
  component: Rooms,
});

function Rooms() {
  const app = useApp();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [game, setGame] = useState<GameId>("ludo");
  const [isPrivate, setIsPrivate] = useState(false);
  const [bet, setBet] = useState(20);
  const [capacity, setCapacity] = useState(2);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const invitedCode = new URLSearchParams(window.location.search).get("code");
    if (invitedCode) setCode(invitedCode.toUpperCase().slice(0, 6));
  }, []);

  const { remoteRooms } = useRealtimeLobby(
    { playerId: app.profile.id, name: app.profile.name },
    true,
  );

  const goToRoom = (room: { game: GameId; code: string; bet?: number }) => {
    const wager = Math.max(20, Math.round(Number(room.bet ?? bet) || 20));
    if (room.game === "ludo") {
      void navigate({ to: "/games/ludo", search: { bet: wager, timer: 15, players: room.game === "ludo" ? Math.min(4, Math.max(2, room.capacity ?? 2)) : 2, room: room.code } });
    } else if (room.game === "checkers") {
      void navigate({ to: "/games/checkers", search: { bet: wager, timer: 15, room: room.code } });
    } else {
      void navigate({ to: "/games/chess", search: { bet: wager, timer: 15, room: room.code } });
    }
  };

  const submitCreate = async () => {
    if (!app.profile.id) { await navigate({ to: "/auth" }); return; }
    try {
      const wager = Math.max(20, Math.round(bet));
      if (wager < 20) { setMessage("A aposta mínima é 20 MT."); return; }
      const room = await createRoom({
        game,
        isPrivate,
        capacity: game === "ludo" ? capacity : 2,
        bet: wager,
        player: { playerId: app.profile.id, name: app.profile.name },
      });
      setCreating(false);
      setMessage(`Sala ${room.code} criada com aposta de ${room.bet} MT. A aguardar ${room.capacity} jogadores. Partilha o código para eles entrarem.`);
      goToRoom(room);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a sala.");
    }
  };

  const join = async (roomCode: string) => {
    if (!app.profile.id) { await navigate({ to: "/auth" }); return; }
    try {
      const room = await joinRoom(roomCode, { playerId: app.profile.id, name: app.profile.name });
      setMessage(`Entraste na sala ${room.code}.`);
      goToRoom(room);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar na sala.");
    }
  };

  const shareRoom = async (room: { game: GameId; code: string; bet?: number; capacity?: number }) => {
    const path = `/rooms?code=${room.code}`;
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) await navigator.share({ title: "MozaPlay", text: `Entra na minha sala no MozaPlay. Código: ${room.code}`, url });
      else await navigator.clipboard.writeText(url);
      setMessage("Convite pronto para partilhar.");
    } catch {
      setMessage(url);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-28 pt-5 sm:px-6">
      <PageHeader
        title="Salas"
        subtitle="Partidas reais com jogadores humanos"
        right={<Button size="sm" onClick={() => setCreating((value) => !value)}><Plus className="h-4 w-4" /> Criar</Button>}
      />

      <Card className="flex gap-2 rounded-3xl p-3">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Código de 6 caracteres"
          maxLength={6}
          className="h-12 flex-1 rounded-2xl bg-secondary px-4 text-sm font-bold uppercase tracking-widest outline-none"
        />
        <Button disabled={code.length !== 6} onClick={() => void join(code)}>Entrar</Button>
      </Card>

      {message ? <p className="px-1 text-xs font-semibold text-primary">{message}</p> : null}

      {creating ? (
        <Card className="space-y-4">
          <p className="font-display font-bold">Nova sala</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(GAME_META) as GameId[]).map((id) => (
              <button
                key={id}
                onClick={() => setGame(id)}
                className={`rounded-2xl py-3 text-xs font-bold ${game === id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              >
                {GAME_META[id].name}
              </button>
            ))}
          </div>
          <label className="block rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold">
            <span>Valor da aposta</span>
            <div className="mt-2 flex items-center gap-2">
              <input type="number" min={20} step={1} value={bet} onChange={(event) => setBet(Math.max(20, Number(event.target.value) || 20))} className="h-12 flex-1 rounded-xl bg-background px-4 text-base font-extrabold outline-none" />
              <span className="font-extrabold">MT</span>
            </div>
            <span className="mt-1 block text-[11px] text-muted-foreground">Mínimo: 20 MT por jogador.</span>
          </label>
          <label className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold">
            {game === "ludo" ? <div className="rounded-2xl bg-secondary px-4 py-3">
              <span className="text-sm font-semibold">Máximo de jogadores</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[2, 3, 4].map((count) => <button key={count} type="button" onClick={() => setCapacity(count)} className={`rounded-xl py-3 text-xs font-extrabold ${capacity === count ? "bg-primary text-primary-foreground" : "bg-background"}`}>{count} jogadores</button>)}
              </div>
              <span className="mt-1 block text-[11px] text-muted-foreground">O jogo só começa quando a sala atingir este número.</span>
            </div> : null}
          <label className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold">
            Sala privada
            <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="h-5 w-5" />
          </label>
          <Button size="lg" className="w-full" onClick={() => void submitCreate()}>Criar sala real</Button>
        </Card>
      ) : null}

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Lobby Realtime</p>
          <h2 className="text-lg font-bold">Salas públicas</h2>
        </div>
        <Pill tone="muted">{remoteRooms.length} disponíveis</Pill>
      </div>

      {remoteRooms.length === 0 ? (
        <Card className="py-10 text-center">
          <Users2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-bold">Nenhuma sala pública neste momento</p>
          <p className="mt-1 text-sm text-muted-foreground">Cria uma sala ou usa Partida rápida para encontrar outro jogador online.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {remoteRooms.map((room) => (
            <Card key={room.code} className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display font-bold">{GAME_META[room.game].name}</p>
                    {room.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                  </div>
                  <p className="mt-1 font-mono text-xs tracking-widest text-primary">{room.code}</p>
                </div>
                <div className="flex gap-1"><Pill tone="primary">{room.bet} MT</Pill><Pill tone="muted">{room.players.length}/{room.capacity}</Pill></div>
              </div>
              <div className="flex flex-wrap gap-1">
                {room.players.map((player) => <Pill key={player.id} tone="primary">{player.name}</Pill>)}
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={room.players.length >= room.capacity} onClick={() => void join(room.code)}>Entrar</Button>
                <Button variant="outline" onClick={() => void shareRoom(room)}><Share2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
