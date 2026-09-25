import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Loader2, Users2 } from "lucide-react";
import { Button, Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { botName, setTimerPreference, useApp } from "@/lib/store";

const TIMERS = [5, 10, 15, 30];
const BETS = [0, 25, 50, 100];

export const Route = createFileRoute("/play")({
  validateSearch: (search: Record<string, unknown>) => ({
    game: (["ludo", "checkers", "chess"].includes(String(search["game"]))
      ? String(search["game"])
      : "ludo") as GameId,
  }),
  head: () => ({
    meta: [
      { title: "Jogar — partida rápida na MozaPlay" },
      {
        name: "description",
        content: "Escolhe Ludo, Damas ou Xadrez, define o timer e a aposta e entra em partida.",
      },
      { property: "og:title", content: "Jogar — partida rápida na MozaPlay" },
      { property: "og:description", content: "Matchmaking rápido com timer configurável e bots." },
    ],
  }),
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
    if (selected === "ludo")
      navigate({ to: "/games/ludo", search: { bet, timer, players: seats } });
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
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-4">
      <PageHeader title="Jogar" subtitle="Escolhe o jogo e entra em partida" />

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(GAME_META) as GameId[]).map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className={`rounded-2xl border p-3 text-left transition-colors ${
              selected === id ? "border-primary bg-primary/12" : "border-border bg-card"
            }`}
          >
            <p className="font-display text-sm font-bold">{GAME_META[id].name}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{GAME_META[id].players}</p>
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Timer por turno
          </p>
          <div className="mt-2 flex gap-2">
            {TIMERS.map((t) => (
              <button
                key={t}
                onClick={() => setTimer(t)}
                className={`h-11 flex-1 rounded-2xl text-sm font-bold ${
                  timer === t ? "bg-primary text-primary-foreground" : "bg-secondary"
                }`}
              >
                {t}s
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Aposta
          </p>
          <div className="mt-2 flex gap-2">
            {BETS.map((b) => (
              <button
                key={b}
                disabled={b > app.coins}
                onClick={() => setBet(b)}
                className={`h-11 flex-1 rounded-2xl text-sm font-bold disabled:opacity-40 ${
                  bet === b ? "bg-accent text-accent-foreground" : "bg-secondary"
                }`}
              >
                {b === 0 ? "Grátis" : b}
              </button>
            ))}
          </div>
        </div>

        {maxPlayers > 2 ? (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Jogadores
            </p>
            <div className="mt-2 flex gap-2">
              {[2, 3, 4].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlayers(p)}
                  className={`h-11 flex-1 rounded-2xl text-sm font-bold ${
                    players === p ? "bg-primary text-primary-foreground" : "bg-secondary"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {searching ? (
        <Card className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 font-display font-bold">A procurar adversários...</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {found.length + 1}/{seats} jogadores prontos
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {found.map((n, i) => (
              <Pill key={i} tone="success">
                <Bot className="h-3 w-3" /> {n}
              </Pill>
            ))}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          <Button size="lg" className="w-full" onClick={quickMatch}>
            <Users2 className="h-5 w-5" /> Partida rápida
          </Button>
          <Button size="lg" variant="ghost" className="w-full" onClick={start}>
            <Bot className="h-5 w-5" /> Jogar
          </Button>
        </div>
      )}
    </main>
  );
}
