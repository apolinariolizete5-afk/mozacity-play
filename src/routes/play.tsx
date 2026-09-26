import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Bot, Clock3, Gamepad2, Loader2, Users2 } from "lucide-react";
import { GAME_META, type GameId } from "@/lib/games/types";
import { botName, setTimerPreference, useApp } from "@/lib/store";

const TIMERS = [5, 10, 15, 30];
const BETS = [0, 25, 50, 100];

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
  const [bet, setBet] = useState(0);
  const [players, setPlayers] = useState(4);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<string[]>([]);

  useEffect(() => setSelected(game), [game]);
  const maxPlayers = selected === "ludo" ? 4 : 2;
  const seats = selected === "ludo" ? players : 2;

  const start = () => {
    setTimerPreference(timer);
    if (selected === "ludo") navigate({ to: "/games/ludo", search: { bet, timer, players: seats } });
    else if (selected === "checkers") navigate({ to: "/games/checkers", search: { bet, timer } });
    else navigate({ to: "/games/chess", search: { bet, timer } });
  };

  const quickMatch = () => {
    setSearching(true);
    setFound([]);
    const names = Array.from({ length: seats - 1 }, () => botName());
    names.forEach((n, i) => setTimeout(() => setFound((f) => [...f, n]), 500 * (i + 1)));
    setTimeout(start, 500 * seats + 400);
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
              <button key={id} type="button" onClick={() => setSelected(id)} className={`group relative overflow-hidden rounded-[1.8rem] border text-left transition-all ${active ? "border-primary ring-2 ring-primary/25" : "border-border bg-card"}`}>
                <div className="aspect-[.9] overflow-hidden sm:aspect-[.82]">
                  <img src={GAME_META[id].cover} alt={GAME_META[id].name} className={`h-full w-full object-cover transition duration-500 ${active ? "scale-105" : "group-hover:scale-105"}`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                  <div className="absolute inset-x-4 bottom-4 text-white">
                    <p className="font-display text-2xl font-black">{GAME_META[id].name}</p>
                    <p className="mt-1 text-xs text-white/70">{GAME_META[id].tagline}</p>
                  </div>
                </div>
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
              <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-secondary py-3.5 text-sm font-extrabold"><Bot className="h-4 w-4" /> Entrar sozinho</button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
