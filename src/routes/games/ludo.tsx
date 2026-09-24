import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { LudoBoard } from "@/components/boards/LudoBoard";
import { Button, Card, Pill } from "@/components/ui/primitives";
import {
  LUDO_COLORS,
  LUDO_NAMES,
  ludoBotMove,
  ludoEngine,
  movableTokens,
  type LudoMove,
} from "@/lib/games/ludo";
import { botName, placeBet, recordMatch, useApp } from "@/lib/store";
import { ArrowDown, Dice5, Flame } from "lucide-react";

export const Route = createFileRoute("/games/ludo")({
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: Number(search["timer"] ?? 15) || 15,
    players: Math.min(4, Math.max(2, Number(search["players"] ?? 4) || 4)),
  }),
  head: () => ({
    meta: [
      { title: "Ludo Profissional — MozaPlay" },
      {
        name: "description",
        content: "Ludo com dados validados, 4 cores oficiais, capturas, casas seguras e corrida ao centro.",
      },
      { property: "og:title", content: "Ludo Profissional — MozaPlay" },
      { property: "og:description", content: "Lança os dados e joga Ludo online na MozaPlay." },
    ],
  }),
  component: LudoMatch,
});

function LudoMatch() {
  const { bet, timer, players } = Route.useSearch();
  const app = useApp();
  const [state, setState] = useState(() => ludoEngine.createGame({ players }));
  const [seconds, setSeconds] = useState(timer);
  const [bots] = useState(() => ["Simba", "Nito", "Chivambo"]);
  const settled = useRef(false);
  const staked = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!staked.current && bet > 0) {
      staked.current = true;
      placeBet(bet, "ludo");
    }
  }, [bet]);

  // Temporizador de 15 segundos
  useEffect(() => {
    setSeconds(timer);
    if (state.over) return;
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [state.turn, state.over, timer, tick]);

  const play = (move: LudoMove) => {
    setState((s) => ludoEngine.applyMove(s, move));
    setTick((t) => t + 1);
  };

  // Jogada automática do jogador em caso de esgotar o tempo
  useEffect(() => {
    if (seconds > 0 || state.over || state.turn !== 0) return;
    const auto = ludoBotMove(state);
    if (auto) play(auto);
  }, [seconds, state]);

  // Jogadas automáticas dos adversários (bots)
  useEffect(() => {
    if (state.over || state.turn === 0) return;
    const id = setTimeout(() => {
      const move = ludoBotMove(state);
      if (move) play(move);
    }, 750);
    return () => clearTimeout(id);
  }, [state]);

  // Finalização e liquidação da partida
  useEffect(() => {
    if (!state.over || settled.current) return;
    settled.current = true;
    recordMatch({
      game: "ludo",
      result: state.winner === 0 ? "win" : "loss",
      opponents: bots.slice(0, players - 1),
      bet,
    });
  }, [state, bet, bots, players]);

  const myTurn = state.turn === 0 && !state.over;
  const canRoll = myTurn && state.dice == null;
  const pickable = myTurn && state.dice != null ? movableTokens(state) : [];
  const result = state.over ? (state.winner === 0 ? "win" : "loss") : null;

  return (
    <>
      <MatchShell
        title="Ludo MozaPlay"
        seconds={seconds}
        limit={timer}
        seats={Array.from({ length: players }, (_, i) => ({
          name: i === 0 ? (app.profile?.name ?? "Tu") : bots[i - 1]!,
          avatar: i === 0 ? (app.profile?.avatar ?? "👤") : "🤖",
          bot: i !== 0,
          active: state.turn === i,
          label: LUDO_NAMES[i] ?? "",
        }))}
        statusText={
          state.over
            ? "Partida terminada"
            : myTurn
              ? canRoll
                ? "Lança o dado!"
                : pickable.length
                  ? "Escolhe a peça que pisca para mover"
                  : "Sem jogadas disponíveis"
              : `A aguardar por ${bots[state.turn - 1] ?? "adversário"}...`
        }
        footer={
          <div className="space-y-3">
            <Card className="relative flex items-center justify-between gap-4 p-3 bg-card/90 backdrop-blur-md border-border/80 shadow-lg">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-white shadow-md text-sm"
                  style={{ backgroundColor: LUDO_COLORS[state.turn] }}
                >
                  {state.turn + 1}º
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    {state.turn === 0 ? "Tua vez" : bots[state.turn - 1]}
                  </div>
                  <div className="font-bold text-sm text-foreground">
                    {LUDO_NAMES[state.turn]}
                  </div>
                </div>
              </div>

              {canRoll && (
                <div className="absolute right-28 -top-8 animate-bounce flex flex-col items-center">
                  <span className="text-[10px] font-black uppercase text-amber-500 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-full shadow">
                    Lança Aqui!
                  </span>
                  <ArrowDown className="h-5 w-5 text-amber-500" />
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary border border-border/60 font-black text-2xl shadow-inner text-foreground">
                  {state.dice ? (
                    <span className="text-3xl text-primary animate-in zoom-in-50">{state.dice}</span>
                  ) : (
                    <Dice5 className="h-8 w-8 text-muted-foreground/60" />
                  )}
                  {state.sixStreak > 1 && (
                    <span className="absolute -top-2 -right-2 flex items-center gap-0.5 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      <Flame className="h-3 w-3" /> {state.sixStreak}x
                    </span>
                  )}
                </div>

                <Button
                  size="lg"
                  className="h-14 px-6 font-bold text-base shadow-md"
                  disabled={!canRoll}
                  onClick={() => play({ type: "roll" })}
                >
                  Lançar Dado
                </Button>
              </div>
            </Card>

            <div className="flex items-center justify-between text-xs px-2 text-muted-foreground">
              <span className="truncate max-w-[280px]">
                {state.log[0] ?? "Partida em andamento"}
              </span>
              {bet > 0 && (
                <Pill className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border-emerald-500/20">
                  Prémio: {Math.round(bet * players * 0.92)} MT
                </Pill>
              )}
            </div>
          </div>
        }
      >
        <div className="mx-auto max-w-md">
          <LudoBoard
            state={state}
            disabled={!myTurn || state.dice == null}
            onPick={(token) => play({ type: "move", token })}
          />
        </div>
      </MatchShell>

      {result && (
        <ResultOverlay
          result={result}
          prize={Math.round(bet * players * 0.92)}
          onLeave={() => window.history.back()}
          onPlayAgain={() => {
            settled.current = false;
            setState(ludoEngine.createGame({ players }));
            setTick((t) => t + 1);
          }}
        />
      )}
    </>
  );
    }
