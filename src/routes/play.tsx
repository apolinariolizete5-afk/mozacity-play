import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Clock3, Gamepad2, Loader2, Users2, Dice5, CircleDot, Crown } from "lucide-react";
import { GAME_META, type GameId } from "@/lib/games/types";
import { leaveLobbyRoom, quickMatch, useRealtimeRoom, TURN_SECONDS } from "@/lib/realtime";
import { useApp } from "@/lib/store";

const TIMERS = [5, 10, 15, 30];
const GAME_ICONS: Record<GameId, typeof Gamepad2> = { ludo: Dice5, checkers: CircleDot, chess: Crown };

export const Route = createFileRoute("/play")({
  validateSearch: (search: Record<string, unknown>) => ({
    game: (["ludo", "checkers", "chess"].includes(String(search["game"])) ? String(search["game"]) : "ludo") as GameId,
  }),
  head: () => ({ meta: [{ title: "Jogar — MozaPlay" }, { name: "description", content: "Escolhe um jogo e encontra jogadores humanos através do Lovable Cloud Realtime." }] }),
  component: Play,
});

function Play() {
  const { game } = Route.useSearch();
  const navigate = useNavigate();
  const app = useApp();
  const [selected, setSelected] = useState<GameId>(game);
  const [timer, setTimer] = useState(TURN_SECONDS);
  const [bet, setBet] = useState(20);
  const [players, setPlayers] = useState(2);
  const [searching, setSearching] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const searchAbortRef = useRef<AbortController | null>(null);

  const realtime = useRealtimeRoom(
    roomCode || undefined,
    selected,
    { playerId: app.profile.id, name: app.profile.name },
    searching && Boolean(roomCode),
  );

  useEffect(() => setSelected(game), [game]);

  useEffect(() => {
    if (!searching || !roomCode || realtime.players.length < players) return;
    const code = roomCode;
    void navigate(
      selected === "ludo"
        ? { to: "/games/ludo", search: { bet, timer: TURN_SECONDS, players, room: code } }
        : selected === "checkers"
          ? { to: "/games/checkers", search: { bet, timer: TURN_SECONDS, room: code } }
          : { to: "/games/chess", search: { bet, timer: TURN_SECONDS, room: code } },
    );
  }, [realtime.players.length, searching, roomCode, selected, navigate]);

  // Quick Match stays active until a real opponent is found or the player
  // explicitly cancels. We must not report "no players online" after 30s
  // while another player may still be connecting or searching.
  const startQuickMatch = async () => {
    if (!app.profile.id) { await navigate({ to: "/auth" }); return; }
    setSearching(true);
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setError("");
    try {
      const room = await quickMatch({
        game: selected,
        player: { playerId: app.profile.id, name: app.profile.name },
        bet,
        players: selected === "ludo" ? players : 2,
        signal: controller.signal,
      });
      setRoomCode(room.code);
      if (room.players.length >= 2) {
        await navigate(
          selected === "ludo"
            ? { to: "/games/ludo", search: { bet, timer: TURN_SECONDS, players, room: room.code } }
            : selected === "checkers"
              ? { to: "/games/checkers", search: { bet, timer: TURN_SECONDS, room: room.code } }
              : { to: "/games/chess", search: { bet, timer: TURN_SECONDS, room: room.code } },
        );
      }
    } catch (err) {
      setSearching(false);
      setRoomCode("");
      if (err instanceof Error && err.message === "matchmaking_cancelled") return;
      setError(err instanceof Error ? err.message : "Não foi possível procurar uma partida.");
    }
  };

  const cancelSearch = () => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearching(false);
    setRoomCode("");
    setError("");
    void leaveLobbyRoom();
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-primary">Game lobby</p>
        <h1 className="mt-2 font-display text-4xl font-black tracking-tight sm:text-5xl">Escolhe como jogar.</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">Sem bots. Sem nomes fictícios. A partida só começa quando houver outro jogador humano.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr] lg:items-start">
        <section className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(GAME_META) as GameId[]).map((id) => {
            const active = selected === id;
            return (
              <button key={id} type="button" onClick={() => setSelected(id)} className={`flex min-h-28 items-center gap-4 rounded-[1.5rem] border bg-card p-4 text-left transition-all ${active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"}`}>
                {(() => { const Icon = GAME_ICONS[id]; return (
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}><Icon className="h-6 w-6" /></span>
                ); })()}
                <span className="min-w-0">
                  <span className="block font-display text-xl font-black">{GAME_META[id].name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{GAME_META[id].tagline}</span>
                  <span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{GAME_META[id].players}</span>
                </span>
              </button>
            );
          })}
        </section>

        <aside className="rounded-[1.8rem] border border-border bg-card p-5 lg:sticky lg:top-5">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Gamepad2 className="h-5 w-5" /></div>
            <div><p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Selecionado</p><p className="font-display text-xl font-black">{GAME_META[selected].name}</p></div>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-extrabold"><Clock3 className="h-4 w-4 text-primary" /> Tempo por turno</div>
            <div className="mt-2 rounded-xl bg-primary/10 px-3 py-3 text-center text-sm font-extrabold text-primary">15 segundos</div>
            <p className="mt-1 text-[11px] text-muted-foreground">O relógio é sincronizado pelo estado Realtime da partida.</p>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-extrabold">💰 Valor da aposta</div>
            <div className="mt-2 flex items-center gap-2">
              <input type="number" min={20} step={1} value={bet} onChange={(event) => setBet(Math.max(20, Number(event.target.value) || 20))} className="h-12 flex-1 rounded-xl bg-secondary px-4 text-base font-extrabold outline-none" />
              <span className="font-extrabold">MT</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Mínimo: 20 MT por jogador.</p>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-extrabold"><Users2 className="h-4 w-4 text-primary" /> Jogadores</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(selected === "ludo" ? [2, 3, 4] : [2]).map((count) => (
                <button key={count} type="button" onClick={() => setPlayers(count)} className={`rounded-xl py-3 text-xs font-extrabold ${players === count ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                  {count} jogadores
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Só encontrarás jogadores que escolheram a mesma quantidade e a mesma aposta.</p>
          </div>

          {error ? <p className="mt-4 text-xs font-semibold text-destructive">{error}</p> : null}

          {searching ? (
            <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="mt-2 text-sm font-extrabold">A procurar outro jogador...</p>
              <p className="mt-1 text-xs text-muted-foreground">{realtime.players.length}/{players} jogadores encontrados</p>
              {roomCode ? <p className="mt-2 font-mono text-xs font-bold tracking-widest text-primary">{roomCode}</p> : null}
              <button onClick={cancelSearch} className="mt-3 rounded-xl border border-border px-4 py-2 text-xs font-bold">Cancelar</button>
            </div>
          ) : (
            <button onClick={() => void startQuickMatch()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/15">
              <Users2 className="h-4 w-4" /> Partida rápida <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}
