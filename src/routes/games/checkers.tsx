import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { CheckersBoard } from "@/components/boards/CheckersBoard";
import { Card, Pill } from "@/components/ui/primitives";
import {
  checkersEngine,
  checkersTimeout,
  type CheckersMove,
} from "@/lib/games/checkers";
import { recordMatch, useApp } from "@/lib/store";
import { forfeitRoomMatch, lockRoomWager, registerRoomMatch, settleRoomMatch } from "@/lib/wallet.functions";
import { useRealtimeRoom } from "@/lib/realtime";
import { chooseCheckersBotMove, isBotDifficulty, botLabel, type BotDifficulty } from "@/lib/games/bot";

const CHECKERS_TEST_MODE = import.meta.env.VITE_CHECKERS_TEST_MODE !== "false";

export const Route = createFileRoute("/games/checkers")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Math.max(0, Number(search["bet"] ?? 0) || 0),
    timer: 15,
    room: String(search["room"] ?? ""),
    bot: isBotDifficulty(search["bot"]) ? search["bot"] : null,
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
  const navigate = useNavigate();
  const { bet: routeBet, timer, room, bot } = Route.useSearch();
  const botMode = Boolean(bot && !room);
  const botDifficulty = (bot ?? "normal") as BotDifficulty;
  const bet = CHECKERS_TEST_MODE ? 0 : routeBet;
  const app = useApp();
  const [state, setState] = useState(() => checkersEngine.createGame());
  const [seconds, setSeconds] = useState(15);
  const [opponent, setOpponent] = useState("A aguardar adversário...");
  const settled = useRef(false);
  const [moveCount, setMoveCount] = useState(0);
  const [payoutCents, setPayoutCents] = useState(0);
  const realtime = useRealtimeRoom<any>(room || undefined, "checkers", { playerId: app.profile.id, name: app.profile.name }, Boolean(room));

  const playersReady = botMode || Boolean(room && realtime.players.length >= 2);
  const [escrowReady, setEscrowReady] = useState(bet <= 0);
  const ready = playersReady && escrowReady;
  const roomRegistered = useRef(false);
  const wagerLocked = useRef(false);

  useEffect(() => {
    if (CHECKERS_TEST_MODE) {
      setEscrowReady(true);
      return;
    }
    if (!playersReady || !room || realtime.players.length < 2 || roomRegistered.current) return;
    const playerIds = realtime.players.map((player) => player.playerId);
    if (playerIds.length < 2) return;
    roomRegistered.current = true;
    void registerRoomMatch({ data: {
      room_code: room,
      game: "checkers",
      player_one_id: playerIds[0],
      player_two_id: playerIds[1],
      bet_cents: Math.max(0, Math.round(bet * 100)),
    }}).then(() => {
      if (bet > 0 && !wagerLocked.current) {
        return lockRoomWager({ data: { room_code: room, bet_cents: Math.round(bet * 100) } }).then((result) => {
          wagerLocked.current = true;
          setEscrowReady(result.status === "playing");
        });
      }
      setEscrowReady(true);
      return null;
    }).catch((error) => {
      roomRegistered.current = false;
      wagerLocked.current = false;
      setEscrowReady(false);
      console.error("[MozaPlay] Falha ao preparar aposta:", error);
    });
  }, [bet, playersReady, room, realtime.players]);


  useEffect(() => {
    if (!ready || state.over) return;
    const deadline = realtime.turnDeadlineAt ?? Date.now() + 15000;
    const tick = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [ready, realtime.turnDeadlineAt, state.turn, state.over]);

  useEffect(() => {
    if (!ready || state.over || seconds > 0 || state.turn !== realtime.playerIndex) return;
    const next = checkersTimeout(state);
    setState(next);
    void realtime.broadcastState(next);
  }, [ready, seconds, state, realtime.playerIndex]);

  useEffect(() => {
    if (!ready || realtime.playerIndex !== 0 || realtime.remoteState || state.over) return;
    void realtime.broadcastState(state);
  }, [ready, realtime.playerIndex, realtime.remoteState, state]);


  useEffect(() => {
    const other = realtime.players.find((p) => p.playerId !== app.profile.id);
    if (other) setOpponent(other.name);
  }, [app.profile.id, realtime.players]);

  useEffect(() => {
    if ((!state.over && realtime.forfeitWinner === null) || settled.current) return;
    settled.current = true;
    const winnerIndex = realtime.forfeitWinner !== null ? realtime.forfeitWinner : state.winner ?? null;
    const winnerId = winnerIndex === null ? null : realtime.players[winnerIndex]?.playerId ?? null;
    const loserIndex = winnerIndex === null ? null : winnerIndex === 0 ? 1 : 0;
    const loserId = loserIndex === null ? null : realtime.players[loserIndex]?.playerId ?? null;
    if (!CHECKERS_TEST_MODE && room && bet > 0 && winnerId && loserId) {
      void settleRoomMatch({ data: {
        room_code: room,
        winner_id: winnerId,
        loser_id: loserId,
        bet_cents: Math.round(bet * 100),
      }}).then((settlement) => {
        if (winnerId === app.profile.id && typeof settlement.payout === "number") {
          setPayoutCents(settlement.payout);
        }
      }).catch((error) => console.error("[MozaPlay] Falha na liquidação:", error));
    }
    void recordMatch({
      game: "checkers",
      result: realtime.forfeitWinner !== null ? (realtime.forfeitWinner === realtime.playerIndex ? "win" : "loss") : state.winner === realtime.playerIndex ? "win" : "loss",
      opponents: [opponent],
      opponentIds: realtime.players.filter((p) => p.playerId !== app.profile.id).map((p) => p.playerId),
      playerIds: realtime.players.map((p) => p.playerId),
      winnerId: realtime.players[realtime.forfeitWinner ?? state.winner ?? 0]?.playerId ?? null,
      bet,
      persistMatch: realtime.forfeitWinner !== null ? realtime.forfeitWinner === realtime.playerIndex : realtime.playerIndex === 0,
    });
  }, [state, bet, opponent, realtime.forfeitWinner, realtime.players]);

  function play(move: CheckersMove) {
    if (!room || realtime.players.length < 2) return;
    setState((s) => {
      const next = checkersEngine.applyMove(s, move);
      if (room) void realtime.broadcastState(next);
      return next;
    });
    setMoveCount((c) => c + 1);
  }

  useEffect(() => {
    if (!room || !realtime.remoteState) return;
    setState(realtime.remoteState);
  }, [room, realtime.remoteState]);

  const result = botMode ? (state.over ? (state.winner === 0 ? "win" : "loss") : null) : realtime.forfeitWinner !== null ? (realtime.forfeitWinner === realtime.playerIndex ? "win" : "loss") : state.over ? (state.winner === realtime.playerIndex ? "win" : "loss") : null;
  const mine = state.board.filter((p) => p && p.p === 0).length;
  const theirs = state.board.filter((p) => p && p.p === 1).length;

  return (
    <>
      <MatchShell
        voiceRoomId={room || undefined}
        voiceUserId={app.profile.id}
        onExit={async () => {
          const opponent = realtime.players.find((p) => p.playerId !== app.profile.id);
          if (!botMode && !CHECKERS_TEST_MODE && room && opponent) {
            try {
              const settlement = await forfeitRoomMatch({ data: { room_code: room } });
              if (settlement.winner_id === app.profile.id && typeof settlement.payout === "number") {
                setPayoutCents(settlement.payout);
              }
            } catch (error) {
              console.error("[MozaPlay] Falha ao desistir:", error);
            }
            if (opponent) await realtime.broadcastForfeit(opponent.playerId);
          }
          await navigate({ to: "/play", search: { game: "checkers" } });
        }}
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
          { name: botMode ? botLabel("checkers", botDifficulty) : opponent, avatar: botMode ? "🤖" : "🙂", active: state.turn === 1, label: `Escuras (${theirs})` },
        ]}
        statusText={
          state.over
            ? "Partida terminada"
            : !ready
              ? "A aguardar outro jogador..." 
              : state.turn === 0
              ? state.chain !== null
                ? "Continua a captura!"
                : "A tua vez"
              : "O adversário joga..."
        }
        footer={
          <Card className="flex items-center justify-between p-3 text-xs">
            <Pill tone="primary">{CHECKERS_TEST_MODE ? "MODO TESTE · SEM DINHEIRO" : `Damas · ${moveCount} lances`}</Pill>
            <span className="text-muted-foreground">Capturas obrigatórias</span>
          </Card>
        }
      >
        {ready ? <CheckersBoard state={state} disabled={state.turn !== 0 || state.over} onMove={play} /> : <Card className="p-8 text-center"><p className="font-bold">{botMode ? "Partida contra Bot" : "Sala online"}</p><p className="mt-2 text-sm text-muted-foreground">{botMode ? `Dificuldade: ${botLabel("checkers", botDifficulty)}` : `Código: ${room || "—"}. A aguardar um jogador real para começar.`}</p><Link to="/rooms" className="mt-4 inline-block rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Voltar às salas</Link></Card>}
      </MatchShell>
      {result ? (
        <ResultOverlay
          result={result}
          coins={Math.round(payoutCents / 100)}
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
