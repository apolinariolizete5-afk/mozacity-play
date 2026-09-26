import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { CheckersBoard } from "@/components/boards/CheckersBoard";
import { Card, Pill } from "@/components/ui/primitives";
import {
  checkersBotMove,
  checkersEngine,
  legalMoves,
  type CheckersMove,
} from "@/lib/games/checkers";
import { botName, placeBet, recordMatch, useApp } from "@/lib/store";
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
  const [opponent, setOpponent] = useState(() => botName());
  const settled = useRef(false);
  const staked = useRef(false);
  const [moveCount, setMoveCount] = useState(0);
  const realtime = useRealtimeRoom<any>(room || undefined, "checkers", { playerId: app.profile.id, name: app.profile.name }, Boolean(room));

  useEffect(() => {
    if (room) return;
    if (!staked.current) {
      staked.current = true;
      placeBet(bet, "checkers");
    }
  }, [bet]);

  useEffect(() => {
    setSeconds(timer);
    if (state.over) return;
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [state.turn, state.over, timer, moveCount]);

  useEffect(() => {
    if (room || seconds > 0 || state.over || state.turn !== realtime.playerIndex) return;
    const moves = legalMoves(state);
    if (moves.length) play(moves[0]!);
  }, [seconds, state]);

  useEffect(() => {
    if (room || state.over || state.turn !== (realtime.playerIndex === 0 ? 1 : 0)) return;
    const id = setTimeout(() => {
      const move = checkersBotMove(state);
      if (move) play(move);
    }, 650);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    const other = realtime.players.find((p) => p.playerId !== app.profile.id);
    if (other) setOpponent(other.name);
  }, [app.profile.id, realtime.players]);

  useEffect(() => {
    if (!state.over || settled.current) return;
    settled.current = true;
    recordMatch({
      game: "checkers",
      result: state.winner === 0 ? "win" : "loss",
      opponents: [opponent],
      bet,
    });
  }, [state, bet, opponent]);

  function play(move: CheckersMove) {
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

  const result = state.over ? (state.winner === 0 ? "win" : "loss") : null;
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
            bot: false,
            active: state.turn === realtime.playerIndex,
            label: `Claras (${mine})`,
          },
          { name: opponent, avatar: "🤖", bot: true, active: state.turn === 1, label: `Escuras (${theirs})` },
        ]}
        statusText={
          state.over
            ? "Partida terminada"
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
        <CheckersBoard state={state} disabled={state.turn !== realtime.playerIndex || state.over} onMove={play} />
      </MatchShell>
      {result ? (
        <ResultOverlay
          result={result}
          coins={result === "win" ? bet * 2 : 0}
          onRematch={() => {
            settled.current = false;
            if (!room) placeBet(bet, "checkers");
            setState(checkersEngine.createGame());
            setSeconds(timer);
          }}
        />
      ) : null}
    </>
  );
}
