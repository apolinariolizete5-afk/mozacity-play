import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { ChessBoard } from "@/components/boards/ChessBoard";
import { Card, Pill } from "@/components/ui/primitives";
import { chessBotMove, chessEngine, inCheck, legalMoves, type ChessMove } from "@/lib/games/chess";
import { botName, placeBet, recordMatch, useApp } from "@/lib/store";
import { useRealtimeRoom } from "@/lib/realtime";

export const Route = createFileRoute("/games/chess")({
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: Number(search["timer"] ?? 10) || 10,
    room: String(search["room"] ?? ""),
  }),
  head: () => ({
    meta: [
      { title: "Xadrez online — MozaPlay" },
      { name: "description", content: "Joga xadrez com regras completas: roque, promoção e xeque-mate." },
      { property: "og:title", content: "Xadrez online — MozaPlay" },
      { property: "og:description", content: "Xadrez competitivo mobile com timer por turno." },
    ],
  }),
  component: ChessMatch,
});

function ChessMatch() {
  const { bet, timer, room } = Route.useSearch();
  const app = useApp();
  const [state, setState] = useState(() => chessEngine.createGame());
  const [seconds, setSeconds] = useState(timer);
  const [opponent] = useState(() => botName());
  const realtime = useRealtimeRoom<any>(room || undefined, "chess", { playerId: app.profile.id, name: app.profile.name }, Boolean(room));
  const settled = useRef(false);
  const staked = useRef(false);

  useEffect(() => {
    if (room) return;
    if (!staked.current) {
      staked.current = true;
      placeBet(bet, "chess");
    }
  }, [bet]);

  // per-turn timer
  useEffect(() => {
    setSeconds(timer);
    if (state.over) return;
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [state.turn, state.over, timer, state.history.length]);

  // timeout → random legal move
  useEffect(() => {
    if (room || seconds > 0 || state.over || state.turn !== (realtime.playerIndex === 0 ? "w" : "b")) return;
    const moves = legalMoves(state);
    if (moves.length) setState((s) => chessEngine.applyMove(s, moves[0]!));
  }, [seconds, state]);

  // bot
  useEffect(() => {
    if (room || state.over || state.turn !== "b") return;
    const id = setTimeout(() => {
      const move = chessBotMove(state);
      if (move) setState((s) => chessEngine.applyMove(s, move));
    }, 700);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    if (!state.over || settled.current) return;
    settled.current = true;
    const winner = chessEngine.getWinner(state);
    recordMatch({
      game: "chess",
      result: state.draw ? "draw" : winner === 0 ? "win" : "loss",
      opponents: [opponent],
      bet,
    });
  }, [state, bet, opponent]);

  const result = state.over ? (state.draw ? "draw" : state.winner === 0 ? "win" : "loss") : null;

  return (
    <>
      <MatchShell
        title="Xadrez"
        seconds={seconds}
        limit={timer}
        seats={[
          { name: app.profile.name, avatar: app.profile.avatar, bot: false, active: state.turn === (realtime.playerIndex === 0 ? "w" : "b"), label: "Brancas" },
          { name: opponent, avatar: "🤖", bot: true, active: state.turn === "b", label: "Negras" },
        ]}
        statusText={
          state.over
            ? "Partida terminada"
            : state.turn === (realtime.playerIndex === 0 ? "w" : "b")
              ? inCheck(state, realtime.playerIndex === 0 ? "w" : "b")
                ? "Estás em xeque!"
                : "A tua vez"
              : "O adversário pensa..."
        }
        footer={
          <Card className="flex items-center justify-between p-3 text-xs">
            <Pill tone="primary">{room ? `Sala ${room}` : "Jogo livre"}</Pill>
            <span className="text-muted-foreground">Lances: {state.history.length}</span>
          </Card>
        }
      >
        <ChessBoard
          state={state}
          disabled={state.turn !== (realtime.playerIndex === 0 ? "w" : "b") || state.over}
          onMove={(m: ChessMove) => setState((s) => { const next = chessEngine.applyMove(s, m); if (room) realtime.broadcastState({ type: "state", state: next }); return next; })}
        />
      </MatchShell>
      {result ? (
        <ResultOverlay
          result={result}
          coins={result === "win" ? bet * 2 : result === "draw" ? bet : 0}
          onRematch={() => {
            settled.current = false;
            staked.current = true;
            if (!room) placeBet(bet, "chess");
            setState(chessEngine.createGame());
            setSeconds(timer);
          }}
        />
      ) : null}
    </>
  );
}
