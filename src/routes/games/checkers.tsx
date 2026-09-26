import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { CheckersBoard } from "@/components/boards/CheckersBoard";
import { Card, Pill } from "@/components/ui/primitives";
import {
  checkersEngine,
  legalMoves,
  type CheckersMove,
} from "@/lib/games/checkers";
import { recordMatch, useApp } from "@/lib/store";
import { useRealtimeRoom } from "@/lib/realtime";

export const Route = createFileRoute("/games/checkers")({
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: Number(search["timer"] ?? 10) || 10,
    room: String(search["room"] ?? ""),
  }),
  head: () => ({
    meta: [
      { title: "Damas online — MozaPlay" },
      {
        name: "description",
        content: "Damas 8x8 com capturas obrigatórias, coroação e timer por turno.",
      },
      { property: "og:title", content: "Damas online — MozaPlay" },
      { property: "og:description", content: "Damas competitivas no telemóvel, capturas obrigatórias." },
    ],
  }),
  component: CheckersMatch,
});

function CheckersMatch() {
  const { bet, timer, room } = Route.useSearch();
  const app = useApp();
  const [state, setState] = useState(() => checkersEngine.createGame());
  const [seconds, setSeconds] = useState(timer);
  const [opponent, setOpponent] = useState("A aguardar adversário...");
  const settled = useRef(false);
  const [moveCount, setMoveCount] = useState(0);
  const realtime = useRealtimeRoom<any>(room || undefined, "checkers", { playerId: app.profile.id, name: app.profile.name }, Boolean(room));

  useEffect(() => {
    setSeconds(timer);
    if (state.over) return;
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [state.turn, state.over, timer, moveCount]);



  useEffect(() => {
    const other = realtime.players.find((p) => p.playerId !== app.profile.id);
    if (other) setOpponent(other.name);
  }, [app.profile.id, realtime.players]);

  useEffect(() => {
    if (!state.over || settled.current) return;
    settled.current = true;
    recordMatch({
      game: "checkers",
      result: state.winner === realtime.playerIndex ? "win" : "loss",
      opponents: [opponent],
      bet,
    });
  }, [state, bet, opponent]);

  function play(move: CheckersMove) {
    if (!room || realtime.players.length < 2) return;
    setState((s) => {
      const next = checkersEngine.applyMove(s, move);
      if (room) realtime.broadcastState(next);
      return next;
    });
    setMoveCount((c) => c + 1);
  }

  useEffect(() => {
    if (!room || !realtime.remoteState) return;
    const remote = realtime.remoteState as any;
    if (remote?.type === "state" && remote.state) setState(remote.state);
  }, [room, realtime.remoteState]);

  const result = state.over ? (state.winner === realtime.playerIndex ? "win" : "loss") : null;
  const ready = Boolean(room && realtime.players.length >= 2);
  const mine = state.board.filter((p) => p && p.p === 0).length;
  const theirs = state.board.filter((p) => p && p.p === 1).length;

  return (
    <>
      <MatchShell
        title="Damas"
        seconds={seconds}
        limit={timer}
        seats={[
          {
            name: app.profile.name,
            avatar: app.profile.avatar,
            active: state.turn === realtime.playerIndex,
            label: `Claras (${mine})`,
          },
          { name: opponent, avatar: "🙂", active: state.turn === 1, label: `Escuras (${theirs})` },
        ]}
        statusText={
          state.over
            ? "Partida terminada"
            : !ready
              ? "A aguardar outro jogador..." 
              : state.turn === realtime.playerIndex
              ? state.chain !== null
                ? "Continua a captura!"
                : "A tua vez"
              : "O adversário joga..."
        }
        footer={
          <Card className="flex items-center justify-between p-3 text-xs">
            <Pill tone="primary">Damas · {moveCount} lances</Pill>
            <span className="text-muted-foreground">Capturas obrigatórias</span>
          </Card>
        }
      >
        {ready ? <CheckersBoard state={state} disabled={state.turn !== realtime.playerIndex || state.over} onMove={play} /> : <Card className="p-8 text-center"><p className="font-bold">Sala online</p><p className="mt-2 text-sm text-muted-foreground">Código: {room || "—"}. A aguardar um jogador real para começar.</p><Link to="/rooms" className="mt-4 inline-block rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Voltar às salas</Link></Card>}
      </MatchShell>
      {result ? (
        <ResultOverlay
          result={result}
          coins={result === "win" ? bet * 2 : 0}
          onRematch={() => {
            settled.current = false;
            
            setState(checkersEngine.createGame());
            setSeconds(timer);
          }}
        />
      ) : null}
    </>
  );
}
