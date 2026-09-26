import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Clock3, Gamepad2, Loader2, Users2, Dice5, CircleDot, Crown } from "lucide-react";
import { GAME_META, type GameId } from "@/lib/games/types";
import { setTimerPreference, useApp } from "@/lib/store";

const TIMERS = [5, 10, 15, 30];
const GAME_ICONS: Record<GameId, typeof Gamepad2> = { ludo: Dice5, checkers: CircleDot, chess: Crown };

export const Route = createFileRoute("/play")({
  validateSearch: (search: Record<string, unknown>) => ({
    game: (["ludo", "checkers", "chess"].includes(String(search["game"])) ? String(search["game"]) : "ludo") as GameId,
  }),
  head: () => ({ meta: [{ title: "Jogar — MozaPlay" }, { name: "description", content: "Escolhe um jogo e configura a tua partida." }] }),
  component: Play,
});

function Play() {
  const { game } = Route.useSearch();
  const navigate = useNavigate();
  const app = useApp();
  const [selected, setSelected] = useState<GameId>(game);
  const [timer, setTimer] = useState(app.timer);
  const [players, setPlayers] = useState(4);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  const matchCodeRef = useRef<string | null>(null);

  useEffect(() => setSelected(game), [game]);
  const maxPlayers = selected === "ludo" ? 4 : 2;
  const seats = selected === "ludo" ? players : 2;

  const quickMatch = async () => {
    setSearching(true);
    setFound([]);
    try {
      const response = await fetch("/api/multiplayer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quick",
          game: selected,
          timer,
          capacity: 2,
          player: { id: app.profile.id, name: app.profile.name },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.room) throw new Error(data.error || "Não foi possível procurar uma partida.");
      const room = data.room;
      matchCodeRef.current = room.code;

      const refresh = async () => {
        const current = await fetch(`/api/multiplayer?room=${encodeURIComponent(room.code)}`, { cache: "no-store" });
        if (!current.ok) throw new Error("A sala deixou de estar disponível.");
        return (await current.json()) as { room: { players: Array<{ id: string; name: string }>; code: string } };
      };

      const applyMatch = (current: { room: { players: Array<{ id: string; name: string }>; code: string } }) => {
        const others = current.room.players.filter((p) => p.id !== app.profile.id);
        setFound(others.map((p) => p.name));
        if (current.room.players.length >= 2) {
          const roomCode = current.room.code;
          navigate(
            selected === "ludo"
              ? { to: "/games/ludo", search: { bet: 0, timer, players: 2, room: roomCode } }
              : selected === "checkers"
                ? { to: "/games/checkers", search: { bet: 0, timer, room: roomCode } }
                : { to: "/games/chess", search: { bet: 0, timer, room: roomCode } },
          );
          return true;
        }
        return false;
      };

      if (applyMatch({ room: { players: room.players, code: room.code } })) return;

      const deadline = Date.now() + 120000;
      while (Date.now() < deadline && matchCodeRef.current === room.code) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const current = await refresh();
        if (applyMatch(current)) return;
      }
      setSearching(false);
      setFound([]);
    } catch (error) {
      setSearching(false);
      setFound([]);
      console.error("[QuickMatch]", error);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-primary">Game lobby</p>
        <h1 className="mt-2 font-display text-4xl font-black tracking-tight sm:text-5xl">Escolhe como jogar.</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">Primeiro escolhe o jogo. Depois define o ritmo e entra diretamente na partida.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr] lg:items-start">
        <section className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(GAME_META) as GameId[]).map((id) => {
            const active = selected === id;
            return (
              <button key={id} type="button" onClick={() => setSelected(id)} className={`flex min-h-28 items-center gap-4 rounded-[1.5rem] border bg-card p-4 text-left transition-all ${active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"}`}>
                {(() => { const Icon = GAME_ICONS[id]; return (
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                    <Icon className="h-6 w-6" />
                  </span>
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
            <div className="mt-2 grid grid-cols-4 gap-2">
              {TIMERS.map((t) => <button key={t} onClick={() => setTimer(t)} className={`rounded-xl py-3 text-xs font-extrabold ${timer === t ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{t}s</button>)}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-extrabold"><Users2 className="h-4 w-4 text-primary" /> Jogadores</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[2,3,4].map((p) => <button key={p} disabled={p > maxPlayers} onClick={() => setPlayers(p)} className={`rounded-xl py-3 text-xs font-extrabold disabled:opacity-30 ${players === p || (maxPlayers === 2 && p === 2) ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{p}</button>)}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            <span className="font-bold text-foreground">Modo:</span> partida livre
          </div>

          {searching ? (
            <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="mt-2 text-sm font-extrabold">A preparar a partida...</p>
              <p className="mt-1 text-xs text-muted-foreground">{found.length + 1}/{seats} jogadores prontos</p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">{found.map((n, i) => <span key={i} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold">{n}</span>)}</div>
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              <button onClick={quickMatch} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/15"><Users2 className="h-4 w-4" /> Partida rápida <ArrowRight className="h-4 w-4" /></button>

            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
