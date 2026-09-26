import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { ChessBoard } from "@/components/boards/ChessBoard";
import { Card, Pill } from "@/components/ui/primitives";
import { chessEngine, chessTimeout, inCheck, type ChessMove } from "@/lib/games/chess";
import { recordMatch, useApp } from "@/lib/store";
import { useRealtimeRoom } from "@/lib/realtime";

export const Route = createFileRoute("/games/chess")({
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: 15,
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
  const [seconds, setSeconds] = useState(15);
  const [opponent, setOpponent] = useState("A aguardar adversário...");
  const realtime = useRealtimeRoom<any>(room || undefined, "chess", { playerId: app.profile.id, name: app.profile.name }, Boolean(room));
  const settled = useRef(false);

  useEffect(() => {
    const other = realtime.players.find((p) => p.playerId !== app.profile.id);
    if (other) setOpponent(other.name);
  }, [app.profile.id, realtime.players]);

  useEffect(() => {
    if (!room || !realtime.remoteState) return;
    setState(realtime.remoteState);
  }, [room, realtime.remoteState]);

  const ready = Boolean(room && realtime.players.length >= 2);

  useEffect(() => {
    if (!ready || state.over) return;
    const deadline = realtime.turnDeadlineAt ?? Date.now() + 15000;
    const tick = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [ready, realtime.turnDeadlineAt, state.turn, state.over]);

  useEffect(() => {
    if (!ready || state.over || seconds > 0 || state.turn !== (realtime.playerIndex === 0 ? "w" : "b")) return;
    const next = chessTimeout(state);
    setState(next);
    void realtime.broadcastState(next);
  }, [ready, seconds, state, realtime.playerIndex]);

  useEffect(() => {
    if (!ready || realtime.playerIndex !== 0 || realtime.remoteState || state.over) return;
    void realtime.broadcastState(state);
  }, [ready, realtime.playerIndex, realtime.remoteState, state]);

  useEffect(() => {
    if (!state.over || settled.current) return;
    settled.current = true;
    const winner = chessEngine.getWinner(state);
    recordMatch({
      game: "chess",
      result: state.draw ? "draw" : winner === realtime.playerIndex ? "win" : "loss",
      opponents: [opponent],
      opponentIds: realtime.players.filter((p) => p.playerId !== app.profile.id).map((p) => p.playerId),
      playerIds: realtime.players.map((p) => p.playerId),
      winnerId: winner === null ? null : realtime.players[winner]?.playerId ?? null,
      bet,
    });
  }, [state, bet, opponent]);

  const result = realtime.forfeitWinner !== null ? (realtime.forfeitWinner === realtime.playerIndex ? "win" : "loss") : state.over ? (state.draw ? "draw" : state.winner === realtime.playerIndex ? "win" : "loss") : null;

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
          onMove={(m: ChessMove) => setState((s) => { const next = chessEngine.applyMove(s, m); if (room) void realtime.broadcastState(next); return next; })}
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
