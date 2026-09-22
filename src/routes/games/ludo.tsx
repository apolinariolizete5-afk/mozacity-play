import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { LudoBoard } from "@/components/boards/LudoBoard";
import { Button, Card, Pill } from "@/components/ui/primitives";
import {
  LUDO_NAMES,
  ludoBotMove,
  ludoEngine,
  movableTokens,
  type LudoMove,
} from "@/lib/games/ludo";
import { botName, placeBet, recordMatch, useApp } from "@/lib/store";

export const Route = createFileRoute("/games/ludo")({
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: Number(search["timer"] ?? 10) || 10,
    players: Math.min(4, Math.max(2, Number(search["players"] ?? 4) || 4)),
  }),
  head: () => ({
    meta: [
      { title: "Ludo online 2-4 jogadores — MozaPlay" },
      {
        name: "description",
        content: "Ludo para 2 a 4 jogadores com dados validados, capturas e corrida ao centro.",
      },
      { property: "og:title", content: "Ludo online 2-4 jogadores — MozaPlay" },
      { property: "og:description", content: "Lança os dados e corre até ao centro no Ludo da MozaPlay." },
    ],
  }),
  component: LudoMatch,
});

function LudoMatch() {
  const { bet, timer, players } = Route.useSearch();
  const app = useApp();
  const [state, setState] = useState(() => ludoEngine.createGame({ players }));
  const [seconds, setSeconds] = useState(timer);
  const [bots] = useState(() => Array.from({ length: 3 }, () => botName()));
  const settled = useRef(false);
  const staked = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!staked.current) {
      staked.current = true;
      placeBet(bet, "ludo");
    }
  }, [bet]);

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

  // timeout: auto-play for the human seat
  useEffect(() => {
    if (seconds > 0 || state.over || state.turn !== 0) return;
    const auto = ludoBotMove(state);
    if (auto) play(auto);
  }, [seconds, state]);

  // bot seats
  useEffect(() => {
    if (state.over || state.turn === 0) return;
    const id = setTimeout(() => {
      const move = ludoBotMove(state);
      if (move) play(move);
    }, 650);
    return () => clearTimeout(id);
  }, [state]);

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
        title="Ludo"
        seconds={seconds}
        limit={timer}
        seats={Array.from({ length: players }, (_, i) => ({
          name: i === 0 ? app.profile.name : bots[i - 1]!,
          avatar: i === 0 ? app.profile.avatar : "🤖",
          bot: i !== 0,
          active: state.turn === i,
          label: LUDO_NAMES[i] ?? "",
        }))}
        statusText={
          state.over
            ? "Partida terminada"
            : myTurn
              ? canRoll
                ? "Lança o dado"
                : pickable.length
                  ? "Escolhe a peça a mover"
                  : "Sem jogadas"
              : `Vez de ${bots[state.turn - 1] ?? "adversário"}`
        }
        footer={
          <div className="space-y-3">
            <Card className="flex items-center gap-3 p-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary font-display text-3xl font-extrabold">
                {state.dice ?? "–"}
              </div>
              <Button
                size="lg"
                className="flex-1"
                disabled={!canRoll}
                onClick={() => play({ type: "roll" })}
              >
                Lançar dado
              </Button>
            </Card>
            <Card className="p-3 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <Pill tone="primary">Aposta {bet} moedas</Pill>
                <span className="text-muted-foreground">{players} jogadores</span>
              </div>
              <ul className="space-y-1 text-muted-foreground">
                {state.log.slice(0, 3).map((line, i) => (
                  <li key={i}>• {line}</li>
                ))}
              </ul>
            </Card>
          </div>
        }
      >
        <LudoBoard
          state={state}
          disabled={!myTurn || state.dice == null}
          onPick={(token) => play({ type: "move", token })}
        />
      </MatchShell>
      {result ? (
        <ResultOverlay
          result={result}
          coins={result === "win" ? bet * 2 : 0}
          onRematch={() => {
            settled.current = false;
            placeBet(bet, "ludo");
            setState(ludoEngine.createGame({ players }));
            setSeconds(timer);
          }}
        />
      ) : null}
    </>
  );
}
