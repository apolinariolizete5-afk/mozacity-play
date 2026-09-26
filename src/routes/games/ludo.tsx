import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Flame, Trophy } from "lucide-react";
import { ResultOverlay } from "@/components/MatchShell";
import { LudoBoard } from "@/components/boards/LudoBoard";
import { Card, Pill } from "@/components/ui/primitives";
import { LUDO_NAMES, ludoBotMove, ludoEngine, type LudoMove } from "@/lib/games/ludo";
import { botName, placeBet, recordMatch, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useRealtimeRoom } from "@/lib/realtime";
import "@/styles/ludo-motion.css";

const TURN_SECONDS = 15;

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
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: TURN_SECONDS,
    players: Math.min(4, Math.max(2, Number(search["players"] ?? 2) || 2)),
    room: String(search["room"] ?? ""),
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
  const { bet, players, room } = Route.useSearch();
  const app = useApp();
  const [state, setState] = useState(() => ludoEngine.createGame({ players }));
  const [seconds, setSeconds] = useState(TURN_SECONDS);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);
  const [pendingMoveToken, setPendingMoveToken] = useState<number | null>(null);
  const [dicePreview, setDicePreview] = useState(1);
  const [turnSequence, setTurnSequence] = useState(0);
  const [opponents] = useState(() => Array.from({ length: players - 1 }, () => botName()));
  const realtime = useRealtimeRoom<LudoMove | null>(room || undefined, "ludo", { playerId: app.profile.id, name: app.profile.name }, Boolean(room));
  const settled = useRef(false);
  const staked = useRef(false);
  const rollTimer = useRef<number | null>(null);

  useEffect(() => {
    if (room) return;
    if (!staked.current) {
      staked.current = true;
      placeBet(bet, "ludo");
    }
  }, [bet]);

  useEffect(() => {
    setSeconds(TURN_SECONDS);
    if (state.over) return;
    const interval = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [state.turn, state.over, turnSequence]);

  useEffect(() => () => {
    if (rollTimer.current) window.clearTimeout(rollTimer.current);
  }, []);

  const applyMove = useCallback((move: LudoMove) => {
    setState((current) => ludoEngine.applyMove(current, move));
    if (move.type === "move") setTurnSequence((value) => value + 1);
  }, []);

  const play = useCallback(
    (move: LudoMove) => {
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
        const value = move.value ?? 1 + Math.floor(Math.random() * 6);
        setDicePreview(value);
        setRolling(false);
        applyMove({ type: "roll", value });
      }, 560);
    },
    [applyMove, moving, rolling],
  );

  useEffect(() => {
    if (room || seconds > 0 || state.over || rolling || moving) return;
    const move = state.turn === realtime.playerIndex ? ludoEngine.legalMoves(state)[0] : ludoBotMove(state);
    if (move) play(move);
  }, [moving, play, rolling, seconds, state]);

  useEffect(() => {
    if (room || state.over || state.turn === 0 || rolling || moving) return;
    const timer = window.setTimeout(() => {
      const move = ludoBotMove(state);
      if (move) play(move);
    }, state.dice == null ? 700 : 850);
    return () => window.clearTimeout(timer);
  }, [moving, play, rolling, state]);

  useEffect(() => {
    if (!state.over || settled.current) return;
    settled.current = true;
    recordMatch({
      game: "ludo",
      result: state.winner === 0 ? "win" : "loss",
      opponents,
      bet,
    });
  }, [bet, opponents, state.over, state.winner]);

  useEffect(() => {\n    if (!room || !realtime.remoteState) return;\n    const remote = realtime.remoteState as any;\n    if (remote?.type === "state" && remote.state) setState(remote.state);\n  }, [realtime.remoteState, room]);\n\n  const activeDiceValue = rolling ? dicePreview : state.dice ?? dicePreview;
  const canRoll = state.turn === realtime.playerIndex && state.dice == null && !state.over && !rolling;
  const result = state.over ? (state.winner === 0 ? "win" : "loss") : null;

  const playersList = Array.from({ length: players }, (_, index) => ({
    index,
    name: index === 0 ? app.profile.name : opponents[index - 1] ?? `Bot ${index}`,
    avatar: index === 0 ? app.profile.avatar : "🤖",
    label: LUDO_NAMES[index] ?? `Jogador ${index + 1}`,
    active: state.turn === index,
    color: PLAYER_COLORS[index] ?? PLAYER_COLORS[0],
  }));

  const renderPlayerCorner = (playerIdx: number) => {
    const player = playersList[playerIdx];
    if (!player) return null;
    const isCurrent = player.active;
    const isUser = playerIdx === realtime.playerIndex;

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
      <div className="ludo-match-shell max-w-lg mx-auto">
        <div className="flex items-center justify-between py-1 px-2">
          <Pill tone="primary" className="text-xs">
            <Trophy className="h-3.5 w-3.5" /> {bet} MT
          </Pill>
          <div className="flex items-center gap-2">
            {state.bonusRoll && (
              <Pill tone="accent" className="text-xs"><Flame className="h-3 w-3" /> Extra</Pill>
            )}
            <span className="text-xs font-mono font-bold text-primary">⏱ {seconds}s</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 my-2">
          <div>{renderPlayerCorner(0)}</div>
          <div>{players >= 2 ? renderPlayerCorner(1) : null}</div>
        </div>

        <div className="my-1 py-1">
          <LudoBoard
            state={state}
            disabled={state.turn !== realtime.playerIndex || state.over || rolling || moving}
            onMove={(token) => {
              const next = ludoEngine.applyMove(state, { type: "move", token });\n              setState(next);\n              if (room) realtime.broadcastState({ type: "state", state: next } as any);
              setPendingMoveToken(null);
              setMoving(false);
            }}
            onAnimatingChange={setMoving}
            requestedToken={pendingMoveToken}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 my-2">
          <div>{players >= 4 ? renderPlayerCorner(3) : null}</div>
          <div>{players >= 3 ? renderPlayerCorner(2) : null}</div>
        </div>

        <Card className="p-2 text-center text-xs text-muted-foreground mt-1">
          {state.over
            ? "Partida terminada!"
            : state.turn === 0
              ? state.dice == null
                ? "👉 É a tua vez! Toca no teu dado para rolar."
                : "👉 Escolhe o teu peão disponível para mover."
              : `${playersList[state.turn]?.name ?? "Adversário"} está a jogar...`}
        </Card>

        {result && (
          <ResultOverlay
            result={result}
            coins={result === "win" ? bet * 2 : 0}
            onRematch={() => {
              settled.current = false;
              if (!room) placeBet(bet, "ludo");
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
