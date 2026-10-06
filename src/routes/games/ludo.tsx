import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Flame, Trophy } from "lucide-react";
import { ResultOverlay } from "@/components/MatchShell";
import { VoiceChat } from "@/components/VoiceChat";
import { LudoBoard } from "@/components/boards/LudoBoard";
import { Card, Pill } from "@/components/ui/primitives";
import { eliminateLudoPlayer, ludoEngine, ludoTimeout, type LudoMove, type LudoState } from "@/lib/games/ludo";
import { recordMatch, useApp } from "@/lib/store";
import { lockRoomWager, registerRoomMatchMulti, settleRoomMatchMulti } from "@/lib/wallet.functions";
import { cn } from "@/lib/utils";
import { useRealtimeRoom } from "@/lib/realtime";
import "@/styles/ludo-motion.css";
import { chooseLudoBotMove, isBotDifficulty, botLabel, type BotDifficulty } from "@/lib/games/bot";

const TURN_SECONDS = 15;
// Teste temporário do Ludo: por padrão fica ativo durante a fase de testes.
// Para reativar o fluxo financeiro, defina VITE_LUDO_TEST_MODE=false.
const LUDO_TEST_MODE = import.meta.env.VITE_LUDO_TEST_MODE !== "false";

const PLAYER_COLORS = [
  { border: "border-emerald-500", bg: "bg-emerald-950/70", ring: "ring-emerald-400", text: "text-emerald-400" },
  { border: "border-amber-400", bg: "bg-amber-950/70", ring: "ring-amber-300", text: "text-amber-300" },
  { border: "border-sky-500", bg: "bg-sky-950/70", ring: "ring-sky-400", text: "text-sky-400" },
  { border: "border-rose-500", bg: "bg-rose-950/70", ring: "ring-rose-400", text: "text-rose-400" },
];

const PIP_POSITIONS: Record<number, string[]> = {
  1: ["center"],
  2: ["top-left", "bottom-right"],
  3: ["top-left", "center", "bottom-right"],
  4: ["top-left", "top-right", "bottom-left", "bottom-right"],
  5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
  6: ["top-left", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-right"],
};

function DiceFace({ value, rolling }: { value: number; rolling?: boolean }) {
  const safeValue = Math.max(1, Math.min(6, value));
  return (
    <div
      className={cn("ludo-dice-face", rolling && "ludo-dice-rolling")}
      aria-label={`Dado ${safeValue}`}
    >
      {(PIP_POSITIONS[safeValue] ?? PIP_POSITIONS[1]).map((position, index) => (
        <span key={`${position}-${index}`} className={cn("ludo-dice-pip", `pip-${position}`)} />
      ))}
    </div>
  );
}

export const Route = createFileRoute("/games/ludo")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Math.max(0, Number(search["bet"] ?? 0) || 0),
    timer: TURN_SECONDS,
    players: Math.min(4, Math.max(2, Number(search["players"] ?? 2) || 2)),
    room: String(search["room"] ?? ""),
    bot: isBotDifficulty(search["bot"]) ? search["bot"] : null,
  }),
  head: () => ({
    meta: [
      { title: "Ludo Clássico — MozaPlay" },
      { name: "description", content: "Ludo clássico com regras de seis, captura, casas seguras e chegada ao centro." },
    ],
  }),
  component: LudoMatch,
});

function playUiTone(kind: "dice" | "move" | "finish") {
  if (typeof window === "undefined") return;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const settings = kind === "dice"
      ? { start: 160, end: 480, duration: 0.16, volume: 0.07, type: "square" as OscillatorType }
      : kind === "finish"
        ? { start: 420, end: 760, duration: 0.28, volume: 0.08, type: "sine" as OscillatorType }
        : { start: 210, end: 150, duration: 0.075, volume: 0.045, type: "triangle" as OscillatorType };
    oscillator.type = settings.type;
    oscillator.frequency.setValueAtTime(settings.start, context.currentTime);
    oscillator.frequency.linearRampToValueAtTime(settings.end, context.currentTime + settings.duration);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(settings.volume, context.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + settings.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + settings.duration + 0.01);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // O jogo continua sem áudio se o navegador bloquear Web Audio.
  }
}

function playAudio(url?: string) {
  if (typeof window === "undefined" || !url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.6;
    void audio.play().catch(() => undefined);
  } catch {
    // Som opcional. O jogo continua mesmo sem áudio.
  }
}

function LudoMatch() {
  const navigate = useNavigate();
  const { bet: routeBet, room, players, bot } = Route.useSearch();
  const botMode = Boolean(bot && !room);
  const botDifficulty = (bot ?? "normal") as BotDifficulty;
  const bet = LUDO_TEST_MODE ? 0 : routeBet;
  const app = useApp();
  const [state, setState] = useState(() => ludoEngine.createGame({ players }));
  const stateRef = useRef(state);
  const timeoutKeyRef = useRef<string | null>(null);
  const [seconds, setSeconds] = useState(TURN_SECONDS);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);
  const pendingRemoteState = useRef<LudoState | null>(null);
  const [pendingMoveToken, setPendingMoveToken] = useState<number | null>(null);
  const [dicePreview, setDicePreview] = useState(1);
  const [turnSequence, setTurnSequence] = useState(0);
  const [opponents, setOpponents] = useState<string[]>(["A aguardar adversário..."]);
  const realtime = useRealtimeRoom<any>(room || undefined, "ludo", { playerId: app.profile.id, name: app.profile.name }, Boolean(room));
  const settled = useRef(false);
  const rollTimer = useRef<number | null>(null);
  const botTimer = useRef<number | null>(null);
  const botBusyRef = useRef(false);

  const playersReady = botMode || Boolean(room && realtime.players.length >= players);
  const [escrowReady, setEscrowReady] = useState(bet <= 0);
  const ready = playersReady && escrowReady;
  const humanTurn = botMode ? state.turn === 0 : state.turn === realtime.playerIndex;
  useEffect(() => {
    if (!ready || state.over) return;
    const deadline = realtime.turnDeadlineAt ?? Date.now() + TURN_SECONDS * 1000;
    const tick = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [ready, realtime.turnDeadlineAt, state.turn, state.over, turnSequence]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (botMode || !ready || state.over || seconds > 0 || state.turn !== realtime.playerIndex) return;
    const current = stateRef.current;
    const deadlineKey = realtime.turnDeadlineAt ?? "local";
    const timeoutKey = `${deadlineKey}:${current.turn}:${current.dice ?? "none"}:${current.sixStreak}`;
    if (timeoutKeyRef.current === timeoutKey) return;
    timeoutKeyRef.current = timeoutKey;

    const next = ludoTimeout(current);
    stateRef.current = next;
    setState(next);
    void realtime.broadcastState(next);
  }, [ready, seconds, state.over, state.turn, realtime.playerIndex, realtime.turnDeadlineAt, realtime.broadcastState]);

  useEffect(() => {
    if (!botMode || !ready || state.over || state.turn === 0 || botBusyRef.current) return;

    const botIndex = state.turn;
    const thinkMs = botDifficulty === "hard" ? 1100 : botDifficulty === "normal" ? 750 : 450;
    let cancelled = false;
    botBusyRef.current = true;

    const schedule = (delay: number) => {
      if (cancelled) return;
      botTimer.current = window.setTimeout(() => {
        if (cancelled) return;

        const current = stateRef.current;
        if (current.over || current.turn !== botIndex) {
          botBusyRef.current = false;
          return;
        }

        if (current.dice == null) {
          const roll = chooseLudoBotMove(current, botDifficulty);
          const value = roll.type === "roll" ? 1 + Math.floor(Math.random() * 6) : 1;
          const rolled = ludoEngine.applyMove(current, { type: "roll", value });
          stateRef.current = rolled;
          setState(rolled);

          if (rolled.over || rolled.turn !== botIndex || rolled.dice == null) {
            botBusyRef.current = false;
            return;
          }
          schedule(450);
          return;
        }

        const move = chooseLudoBotMove(current, botDifficulty);
        const next = move.type === "move" ? ludoEngine.applyMove(current, move) : current;
        stateRef.current = next;
        setState(next);

        if (next.over || next.turn !== botIndex) {
          botBusyRef.current = false;
          return;
        }

        schedule(thinkMs);
      }, delay);
    };

    schedule(thinkMs);

    return () => {
      cancelled = true;
      if (botTimer.current !== null) window.clearTimeout(botTimer.current);
      botTimer.current = null;
      botBusyRef.current = false;
    };
  }, [botDifficulty, botMode, ready, state.turn, state.over]);


  useEffect(() => () => {
    if (rollTimer.current) window.clearTimeout(rollTimer.current);
  }, []);

  useEffect(() => () => {
    if (rollTimer.current) window.clearTimeout(rollTimer.current);
  }, []);

  const roomRegistered = useRef(false);
  const wagerLocked = useRef(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);
  const disconnectedPlayerRef = useRef<string | null>(null);

useEffect(() => {
    if (LUDO_TEST_MODE) {
      setEscrowReady(true);
      return;
    }
    if (!playersReady || !room || realtime.players.length < players || roomRegistered.current) return;

    const playerIds = realtime.players.map((p) => p.playerId);
    if (playerIds.length < players) return;

    roomRegistered.current = true;

    void registerRoomMatchMulti({
      data: {
        room_code: room,
        game: "ludo",
        player_ids: playerIds,
        bet_cents: Math.round(bet * 100),
      },
    })
      .then(async () => {
        if (bet > 0 && !wagerLocked.current) {
          const result = await lockRoomWager({
            data: { room_code: room, bet_cents: Math.round(bet * 100) },
          });
          wagerLocked.current = true;
          setEscrowReady(result.status === "playing");
        } else {
          setEscrowReady(true);
        }
      })
      .catch((error) => {
        roomRegistered.current = false;
        wagerLocked.current = false;
        setEscrowReady(false);
        console.error("[MozaPlay] Falha ao registar aposta Ludo:", error);
      });
  }, [bet, players, playersReady, room, realtime.players]);

  useEffect(() => {
    if (!ready || state.over || realtime.eliminatedPlayerIds.length === 0) return;
    const eliminatedIndexes = realtime.eliminatedPlayerIds
      .map((id) => realtime.players.findIndex((p) => p.playerId === id))
      .filter((index) => index >= 0 && index < players);
    if (!eliminatedIndexes.length) return;
    setState((current) => {
      let next = current;
      for (const index of eliminatedIndexes) next = eliminateLudoPlayer(next, index);
      if (next !== current && room) void realtime.broadcastState(next);
      return next;
    });
  }, [ready, state.over, realtime.eliminatedPlayerIds, realtime.players, players, room, realtime.broadcastState]);

  useEffect(() => {
    const hasDisconnected = realtime.players.some((p) => p.playerId !== app.profile.id && p.online === false);
    if (hasDisconnected && disconnectCountdown === null) setDisconnectCountdown(20);
    if (!hasDisconnected && disconnectCountdown !== null) setDisconnectCountdown(null);
  }, [realtime.players, app.profile.id, disconnectCountdown]);

  useEffect(() => {
    if (disconnectCountdown === null || disconnectCountdown <= 0) return;

    const timer = window.setInterval(() => {
      setDisconnectCountdown((prev) => {
        if (prev === null || prev <= 1) {
          window.clearInterval(timer);
          if (!LUDO_TEST_MODE && players === 2 && !settled.current && room) {
            settled.current = true;
            const myId = app.profile.id;
            void settleRoomMatchMulti({
              data: { room_code: room, winner_id: myId },
            }).catch((error) => console.error("[MozaPlay] Falha na liquidação por desconexão:", error));
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [disconnectCountdown, room, app.profile.id, players]);

  useEffect(() => {
    if (botMode) return;
    if ((!state.over && realtime.forfeitWinner === null) || settled.current) return;
    settled.current = true;

    const winnerIndex = realtime.forfeitWinner !== null ? realtime.forfeitWinner : state.winner ?? null;
    const winnerId = winnerIndex === null ? null : realtime.players[winnerIndex]?.playerId ?? null;

    if (!LUDO_TEST_MODE && room && bet > 0 && winnerId) {
      void settleRoomMatchMulti({
        data: {
          room_code: room,
          winner_id: winnerId,
        },
      }).catch((error) => console.error("[MozaPlay] Falha na liquidação do prêmio:", error));
    }

    void recordMatch({
      game: "ludo",
      result: winnerId === app.profile.id ? "win" : "loss",
      opponents,
      opponentIds: realtime.players.filter((p) => p.playerId !== app.profile.id).map((p) => p.playerId),
      playerIds: realtime.players.map((p) => p.playerId),
      winnerId,
      bet,
      persistMatch: realtime.playerIndex === 0,
    });
  }, [bet, botMode, opponents, players, state.over, state.winner, realtime.forfeitWinner, realtime.players, room, app.profile.id]);

  const handleAnimatingChange = useCallback((animating: boolean) => {
    setMoving(animating);
  }, []);

  const applyMove = useCallback((move: LudoMove) => {
    setState((current) => ludoEngine.applyMove(current, move));
    if (move.type === "move") setTurnSequence((value) => value + 1);
  }, []);

  const play = useCallback(
    (move: LudoMove) => {
      if (!ready || (!botMode && seconds <= 0) || !humanTurn) return;
      if (move.type === "move") {
        if (moving) return;
        setMoving(true);
        setPendingMoveToken(move.token);
        return;
      }
      if (rolling) return;

      setRolling(true);
      playUiTone("dice");
      let frame = 0;
      const animation = window.setInterval(() => {
        frame += 1;
        setDicePreview(1 + Math.floor(Math.random() * 6));
        if (frame >= 8) window.clearInterval(animation);
      }, 65);

      rollTimer.current = window.setTimeout(() => {
        window.clearInterval(animation);
        const current = stateRef.current;
        if (current.over || !humanTurn || current.dice != null) {
          setRolling(false);
          return;
        }
        const value = move.value ?? 1 + Math.floor(Math.random() * 6);
        setDicePreview(value);
        setRolling(false);
        const next = ludoEngine.applyMove(current, { type: "roll", value });
        stateRef.current = next;
        setState(next);
        if (room) void realtime.broadcastState(next);
      }, 560);
    },
    [applyMove, botMode, humanTurn, moving, rolling, room, realtime, ready, seconds],
  );


  useEffect(() => {
    if (!room) return;
    const remoteNames = realtime.players.filter((p) => p.playerId !== app.profile.id).map((p) => p.name);
    if (remoteNames.length) setOpponents(remoteNames);
  }, [app.profile.id, realtime.players, room]);

  useEffect(() => {
    if (!room || !realtime.remoteState) return;
    stateRef.current = realtime.remoteState;
    setState(realtime.remoteState);
  }, [realtime.remoteState, room]);

  const activeDiceValue = rolling ? dicePreview : state.dice ?? dicePreview;
  const canRoll = ready && humanTurn && state.dice == null && !state.over && !rolling;
  const result = botMode ? (state.over ? (state.winner === 0 ? "win" : "loss") : null) : realtime.forfeitWinner !== null ? (realtime.forfeitWinner === realtime.playerIndex ? "win" : "loss") : state.over ? (state.winner === realtime.playerIndex ? "win" : "loss") : null;

  useEffect(() => {
    if (botMode || !ready || realtime.playerIndex !== 0 || realtime.remoteState || state.over) return;
    void realtime.broadcastState(state);
  }, [ready, realtime.playerIndex, realtime.remoteState, state]);

  // The board player index comes from the same stable UUID-sorted Presence
  // list on every device. Do not use "me = player 0": that caused names/colors
  // to change places between phones.
  const playersList = Array.from({ length: players }, (_, index) => {
    const remotePlayer = realtime.players[index];
    const isUser = botMode ? index === 0 : index === realtime.playerIndex;
    return {
      index,
      id: remotePlayer?.playerId ?? `waiting-${index}`,
      name: botMode && index === 1 ? botLabel("ludo", botDifficulty) : remotePlayer?.name ?? (isUser ? app.profile.name : "A aguardar adversário..."),
      avatar: botMode && index === 1 ? "🤖" : isUser ? app.profile.avatar : "🙂",
      label: isUser ? "Tu" : "Adversário",
      active: state.turn === index,
      color: PLAYER_COLORS[index] ?? PLAYER_COLORS[0],
    };
  });

  const renderPlayerCorner = (playerIdx: number) => {
    const player = playersList[playerIdx];
    if (!player) return null;
    const isCurrent = player.active;
    const isUser = botMode ? playerIdx === 0 : playerIdx === realtime.playerIndex;

    return (
      <div
        className={cn(
          "ludo-player-card flex items-center gap-2 p-2 rounded-2xl border transition-all duration-200",
          player.color.bg,
          isCurrent
            ? `${player.color.border} shadow-lg ring-2 ${player.color.ring}`
            : "border-white/10 opacity-80",
        )}
      >
        <div className="ludo-player-avatar" aria-hidden="true">{player.avatar}</div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-extrabold truncate", player.color.text)}>{player.name}</p>
          <span className="text-[10px] text-muted-foreground block">{player.label}</span>
        </div>

        {isCurrent && (
          <div className="relative shrink-0">
            {canRoll && isUser && (
              <ArrowDown className="ludo-dice-arrow absolute -top-7 left-1/2 h-5 w-5 text-primary" />
            )}
            <button
              type="button"
              disabled={!isUser || !canRoll}
              onClick={() => play({ type: "roll" })}
              className={cn(
                "ludo-dice-button",
                isUser && canRoll && "cursor-pointer active:scale-95",
              )}
            >
              <DiceFace value={activeDiceValue} rolling={rolling} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ludo-page min-h-dvh bg-background p-2 sm:p-4">
    <div className="mx-auto mb-3 flex max-w-lg items-center gap-3 rounded-3xl border border-border bg-card/95 p-2.5 shadow-sm">
      <img src="/covers/ludo.svg" alt="Ludo" className="h-12 w-20 rounded-2xl object-cover" />
      <div className="min-w-0">
        <p className="text-sm font-bold">Ludo</p>
        <p className="text-xs text-muted-foreground">Corrida de dados · 2–4 jogadores</p>
      </div>
      <div className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">{botMode ? "VS BOT" : "Online"}</div>
    </div>
      <div className="ludo-match-shell max-w-lg mx-auto">
        <div className="flex items-center justify-between py-1 px-2">
          <Pill tone="primary" className="text-xs">
            <Trophy className="h-3.5 w-3.5" /> {LUDO_TEST_MODE ? "MODO TESTE · SEM DINHEIRO" : `${bet} MT`}
          </Pill>
          <div className="flex items-center gap-2">
            {state.bonusRoll && (
              <Pill tone="accent" className="text-xs"><Flame className="h-3 w-3" /> Extra</Pill>
            )}
            <span className="text-xs font-mono font-bold text-primary">{botMode ? "🤖 Sem limite" : `⏱ ${seconds}s`}</span>
          </div>
        </div>

        {disconnectCountdown !== null && disconnectCountdown > 0 && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl bg-destructive px-5 py-3 text-white shadow-xl animate-pulse">
            <AlertCircle className="h-5 w-5" />
            <span className="text-xs font-bold">
              {players > 2 ? "Jogador desconectado. Aguardando reconexão" : "Adversário desconectado. Aguardando reconexão"}: {disconnectCountdown}s
            </span>
          </div>
        )}

        {room && ready ? <VoiceChat roomId={room} userId={app.profile.id} userName={app.profile.name} /> : null}

        <div className="grid grid-cols-2 gap-2 my-2">
          {playersList.map((_, index) => <div key={index}>{renderPlayerCorner(index)}</div>)}
        </div>

        <div className="my-1 py-1">
          <LudoBoard
            state={state}
            disabled={!humanTurn || state.over || rolling || moving}
            onMove={(token) => {
              const current = stateRef.current;
              const next = ludoEngine.applyMove(current, { type: "move", token });
              stateRef.current = next;
              setState(next);
              if (next !== current && room) void realtime.broadcastState(next);
              setPendingMoveToken(null);
              setMoving(false);
            }}
            onAnimatingChange={handleAnimatingChange}
            requestedToken={pendingMoveToken}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 my-2">
          <div></div>
          <div></div>
        </div>

        <Card className="p-2 text-center text-xs text-muted-foreground mt-1">
          {!ready
            ? `A aguardar ${Math.max(0, players - realtime.players.length)} jogador(es) para completar a sala...` 
            : state.over
            ? "Partida terminada!"
            : humanTurn
              ? state.dice == null
                ? "👉 É a tua vez! Toca no teu dado para rolar."
                : "👉 Escolhe o teu peão disponível para mover."
              : `${playersList[state.turn]?.name ?? "Bot"} está a jogar...`}
        </Card>

        {result && (
          <ResultOverlay
            result={result}
            coins={0}
            onRematch={() => {
              settled.current = false;
              setState(ludoEngine.createGame({ players }));
              setSeconds(TURN_SECONDS);
              setTurnSequence((value) => value + 1);
            }}
          />
        )}
      </div>
    </div>
  );
}
