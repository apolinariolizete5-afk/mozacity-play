import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { ChessBoard } from "@/components/boards/ChessBoard";
import { Card, Pill } from "@/components/ui/primitives";
import { chessEngine, inCheck, type ChessMove } from "@/lib/games/chess";
import { recordMatch, useApp } from "@/lib/store";
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
  const [opponent, setOpponent] = useState("A aguardar adversário...");
  const realtime = useRealtimeRoom<any>(room || undefined, "chess", { playerId: app.profile.id, name: app.profile.name }, Boolean(room));
  const settled = useRef(false);

  useEffect(() => {
    const other = realtime.players.find((p) => p.playerId !== app.profile.id);
    if (other) setOpponent(other.name);
  }, [app.profile.id, realtime.players]);

  useEffect(() => {
    if (!room || !realtime.remoteState) return;
    const remote = realtime.remoteState as any;
    if (remote?.type === "state" && remote.state) setState(remote.state);
  }, [room, realtime.remoteState]);

  // per-turn timer
  useEffect(() => {
    setSeconds(timer);
    if (state.over) return;
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [state.turn, state.over, timer, state.history.length]);


  useEffect(() => {
    if (!state.over || settled.current) return;
    settled.current = true;
    const winner = chessEngine.getWinner(state);
    recordMatch({
      game: "chess",
      result: state.draw ? "draw" : winner === realtime.playerIndex ? "win" : "loss",
      opponents: [opponent],
      bet,
    });
  }, [state, bet, opponent]);

  const result = state.over ? (state.draw ? "draw" : state.winner === realtime.playerIndex ? "win" : "loss") : null;
  const ready = Boolean(room && realtime.players.length >= 2);

  return (
    <>
      <MatchShell
        title="Xadrez"
        seconds={seconds}
        limit={timer}
        seats={[
          { name: app.profile.name, avatar: app.profile.avatar, active: state.turn === (realtime.playerIndex === 0 ? "w" : "b"), label: "Brancas" },
          { name: opponent, avatar: "🙂", active: state.turn === "b", label: "Negras" },
        ]}
        statusText={
          state.over
            ? "Partida terminada"
            : !ready
              ? "A aguardar outro jogador..." 
              : state.turn === (realtime.playerIndex === 0 ? "w" : "b")
              ? inCheck(state, realtime.playerIndex === 0 ? "w" : "b")
                ? "Estás em xeque!"
                : "A tua vez"
              : "O adversário pensa..."
        }
        footer={
          <Card className="flex items-center justify-between p-3 text-xs">
            <Pill tone="primary">Xadrez · {room ? `Sala ${room}` : "Jogo livre"}</Pill>
            <span className="text-muted-foreground">{state.history.length} lances</span>
          </Card>
        }
      >
        {ready ? <ChessBoard
          state={state}
          disabled={state.turn !== (realtime.playerIndex === 0 ? "w" : "b") || state.over}
          onMove={(m: ChessMove) => setState((s) => { const next = chessEngine.applyMove(s, m); if (room) realtime.broadcastState({ type: "state", state: next }); return next; })}
        /> : <Card className="p-8 text-center"><p className="font-bold">Sala online</p><p className="mt-2 text-sm text-muted-foreground">Código: {room || "—"}. A aguardar um jogador real para começar.</p><Link to="/rooms" className="mt-4 inline-block rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Voltar às salas</Link></Card>}
      </MatchShell>
      {result ? (
        <ResultOverlay
          result={result}
          coins={result === "win" ? bet * 2 : result === "draw" ? bet : 0}
          onRematch={() => {
            settled.current = false;
            setState(chessEngine.createGame());
            setSeconds(timer);
          }}
        />
      ) : null}
    </>
  );
}
