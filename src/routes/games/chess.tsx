import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { ChessBoard } from "@/components/boards/ChessBoard";
import { Card, Pill } from "@/components/ui/primitives";
import { chessEngine, chessTimeout, inCheck, type ChessMove } from "@/lib/games/chess";
import { recordMatch, useApp } from "@/lib/store";
import { lockRoomWager, registerRoomMatch, settleRoomMatch } from "@/lib/wallet.functions";
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
  const roomRegistered = useRef(false);
  const wagerLocked = useRef(false);

  useEffect(() => {
    if (!ready || !room || realtime.players.length < 2 || roomRegistered.current) return;
    const playerIds = realtime.players.map((player) => player.playerId);
    if (playerIds.length < 2) return;
    roomRegistered.current = true;
    void registerRoomMatch({ data: {
      room_code: room,
      game: "chess",
      player_one_id: playerIds[0],
      player_two_id: playerIds[1],
      bet_cents: Math.max(0, Math.round(bet * 100)),
    }}).then(() => {
      if (bet > 0 && !wagerLocked.current) {
        wagerLocked.current = true;
        return lockRoomWager({ data: { room_code: room, bet_cents: Math.round(bet * 100) } });
      }
      return null;
    }).catch((error) => {
      roomRegistered.current = false;
      wagerLocked.current = false;
      console.error("[MozaPlay] Falha ao preparar aposta:", error);
    });
  }, [bet, ready, room, realtime.players]);


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
    if ((!state.over && realtime.forfeitWinner === null) || settled.current) return;
    settled.current = true;
    const winner = realtime.forfeitWinner !== null ? realtime.forfeitWinner : chessEngine.getWinner(state);
    const winnerIndex = realtime.forfeitWinner !== null ? realtime.forfeitWinner : (chessEngine.getWinner(state) ?? null);
    const winnerId = winnerIndex === null ? null : realtime.players[winnerIndex]?.playerId ?? null;
    const loserIndex = winnerIndex === null ? null : winnerIndex === 0 ? 1 : 0;
    const loserId = loserIndex === null ? null : realtime.players[loserIndex]?.playerId ?? null;
    if (room && bet > 0 && winnerId && loserId) {
      void settleRoomMatch({ data: {
        room_code: room,
        winner_id: winnerId,
        loser_id: loserId,
        bet_cents: Math.round(bet * 100),
      }}).catch((error) => console.error("[MozaPlay] Falha na liquidação:", error));
    }
    void recordMatch({
      game: "chess",
      result: realtime.forfeitWinner !== null ? (realtime.forfeitWinner === realtime.playerIndex ? "win" : "loss") : state.draw ? "draw" : winner === realtime.playerIndex ? "win" : "loss",
      opponents: [opponent],
      opponentIds: realtime.players.filter((p) => p.playerId !== app.profile.id).map((p) => p.playerId),
      playerIds: realtime.players.map((p) => p.playerId),
      winnerId: realtime.forfeitWinner !== null ? realtime.players[realtime.forfeitWinner]?.playerId ?? null : winner === null ? null : realtime.players[winner]?.playerId ?? null,
      bet,
      persistMatch: realtime.forfeitWinner !== null ? realtime.forfeitWinner === realtime.playerIndex : realtime.playerIndex === 0,
    });
  }, [state, bet, opponent, realtime.forfeitWinner, realtime.players]);

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
          coins={0}
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
