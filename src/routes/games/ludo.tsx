import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Flame, Trophy, Volume2 } from "lucide-react";
import dice1 from "@/assets/ludo/1.png.asset.json";
import dice2 from "@/assets/ludo/2.png.asset.json";
import dice3 from "@/assets/ludo/3.png.asset.json";
import dice4 from "@/assets/ludo/4.png.asset.json";
import dice5 from "@/assets/ludo/5.png.asset.json";
import dice6 from "@/assets/ludo/6.png.asset.json";
import moveSound from "@/assets/ludo/move.wav.asset.json";
import rollSound from "@/assets/ludo/roll_the_dice.mp3.asset.json";
import { ResultOverlay } from "@/components/MatchShell";
import { LudoBoard } from "@/components/boards/LudoBoard";
import { Button, Card, Pill } from "@/components/ui/primitives";
import { LUDO_NAMES, ludoBotMove, ludoEngine, type LudoMove } from "@/lib/games/ludo";
import { botName, placeBet, recordMatch, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const TURN_SECONDS = 15;
const DICE_IMAGES = [dice1.url, dice2.url, dice3.url, dice4.url, dice5.url, dice6.url];

const PLAYER_COLORS = [
  { border: "border-emerald-500", bg: "bg-emerald-950/70", ring: "ring-emerald-400", text: "text-emerald-400" }, // Verde
  { border: "border-amber-400", bg: "bg-amber-950/70", ring: "ring-amber-300", text: "text-amber-300" },          // Amarelo
  { border: "border-sky-500", bg: "bg-sky-950/70", ring: "ring-sky-400", text: "text-sky-400" },                // Azul
  { border: "border-rose-500", bg: "bg-rose-950/70", ring: "ring-rose-400", text: "text-rose-400" },             // Vermelho
];

export const Route = createFileRoute("/games/ludo")({
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: TURN_SECONDS,
    players: Math.min(4, Math.max(2, Number(search["players"] ?? 4) || 4)),
  }),
  head: () => ({
    meta: [
      { title: "Ludo Clássico — MozaPlay" },
      { name: "description", content: "Joga Ludo clássico em ecrã inteiro com tabuleiro nítido, regras completas e dados dedicados." },
    ],
  }),
  component: LudoMatch,
});

function playAudio(url: string) {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.6;
    void audio.play().catch(() => undefined);
  } catch {
    // Modo silencioso caso o navegador restrinja reprodução automática
  }
}

function LudoMatch() {
  const { bet, players } = Route.useSearch();
  const app = useApp();
  const [state, setState] = useState(() => ludoEngine.createGame({ players }));
  const [seconds, setSeconds] = useState(TURN_SECONDS);
  const [rolling, setRolling] = useState(false);
  const [dicePreview, setDicePreview] = useState(1);
  const [turnSequence, setTurnSequence] = useState(0);
  const [opponents] = useState(() => Array.from({ length: players - 1 }, () => botName()));
  const settled = useRef(false);
  const staked = useRef(false);
  const rollTimer = useRef<number | null>(null);

  useEffect(() => {
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
    if (move.type === "move") playAudio(moveSound.url);
    setState((current) => ludoEngine.applyMove(current, move));
    if (move.type === "move") setTurnSequence((value) => value + 1);
  }, []);

  const play = useCallback(
    (move: LudoMove) => {
      if (move.type === "move") {
        applyMove(move);
        return;
      }
      if (rolling) return;
      setRolling(true);
      playAudio(rollSound.url);
      let frame = 0;
      const animation = window.setInterval(() => {
        frame += 1;
        setDicePreview(1 + Math.floor(Math.random() * 6));
        if (frame >= 7) window.clearInterval(animation);
      }, 60);

      rollTimer.current = window.setTimeout(() => {
        window.clearInterval(animation);
        const value = move.value ?? 1 + Math.floor(Math.random() * 6);
        setDicePreview(value);
        setRolling(false);
        applyMove({ type: "roll", value });
      }, 500);
    },
    [applyMove, rolling],
  );

  useEffect(() => {
    if (seconds > 0 || state.over || rolling) return;
    const move = state.turn === 0 ? ludoEngine.legalMoves(state)[0] : ludoBotMove(state);
    if (move) play(move);
  }, [play, rolling, seconds, state]);

  useEffect(() => {
    if (state.over || state.turn === 0 || rolling) return;
    const timer = window.setTimeout(() => {
      const move = ludoBotMove(state);
      if (move) play(move);
    }, state.dice == null ? 700 : 850);
    return () => window.clearTimeout(timer);
  }, [play, rolling, state]);

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

  const activeDiceValue = rolling ? dicePreview : state.dice ?? dicePreview;
  const canRoll = state.turn === 0 && state.dice == null && !state.over && !rolling;
  const result = state.over ? (state.winner === 0 ? "win" : "loss") : null;

  const playersList = Array.from({ length: players }, (_, index) => ({
    index,
    name: index === 0 ? app.profile.name : opponents[index - 1] ?? `Bot ${index}`,
    avatar: index === 0 ? app.profile.avatar : "🤖",
    label: LUDO_NAMES[index] ?? `Jogador ${index + 1}`,
    active: state.turn === index,
    color: PLAYER_COLORS[index] ?? PLAYER_COLORS[0],
  }));

  // Render do widget de jogador com seu próprio dado
  const renderPlayerCorner = (playerIdx: number) => {
    const player = playersList[playerIdx];
    if (!player) return null;
    const isCurrent = player.active;
    const showDice = isCurrent || state.dice != null;
    const isUser = playerIdx === 0;

    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-xl border transition-all duration-200",
          player.color.bg,
          isCurrent ? `${player.color.border} shadow-lg ring-2 ${player.color.ring}` : "border-white/10 opacity-75",
        )}
      >
        <span className="text-xl select-none">{player.avatar}</span>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-bold truncate", player.color.text)}>
            {player.name}
          </p>
          <span className="text-[10px] text-muted-foreground block">
            {player.label}
          </span>
        </div>

        {/* Dado integrado ao lado do jogador */}
        <div className="relative">
          {isCurrent && canRoll && isUser && (
            <ArrowDown className="absolute -top-6 left-1/2 -translate-x-1/2 h-5 w-5 text-amber-400 animate-bounce" />
          )}
          <button
            type="button"
            disabled={!canRoll || !isUser}
            onClick={() => play({ type: "roll" })}
            className={cn(
              "h-10 w-10 p-1 rounded-lg border-2 transition-transform select-none",
              isCurrent ? `${player.color.border} bg-black/60` : "border-white/20 bg-black/40",
              isCurrent && rolling && "animate-spin",
              canRoll && isUser && "cursor-pointer hover:scale-105 active:scale-95",
            )}
          >
            <img
              src={DICE_IMAGES[Math.max(0, Math.min(5, (isCurrent ? activeDiceValue : 1) - 1))]}
              alt="Dado"
              className="h-full w-full object-contain"
              draggable={false}
            />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh flex flex-col justify-between bg-background p-2 sm:p-4 max-w-lg mx-auto">
      {/* Top Bar / Cabeçalho limpo */}
      <div className="flex items-center justify-between py-1 px-2">
        <div className="flex items-center gap-2">
          <Pill tone="primary" className="text-xs">
            <Trophy className="h-3.5 w-3.5" /> {bet} MT
          </Pill>
          {state.bonusRoll && (
            <Pill tone="accent" className="text-xs">
              <Flame className="h-3 w-3" /> Extra
            </Pill>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs font-mono font-bold text-primary">
            ⏱ {seconds}s
          </span>
        </div>
      </div>

      {/* Jogadores do Topo (Verde à esquerda, Amarelo à direita) */}
      <div className="grid grid-cols-2 gap-2 my-1">
        <div>{renderPlayerCorner(0)}</div>
        <div>{players >= 2 ? renderPlayerCorner(1) : null}</div>
      </div>

      {/* Tabuleiro no centro ocupando toda a largura */}
      <div className="my-auto py-1">
        <LudoBoard
          state={state}
          disabled={state.turn !== 0 || state.over || rolling}
          onMove={(token) => play({ type: "move", token })}
        />
      </div>

      {/* Jogadores da Base (Vermelho à esquerda, Azul à direita) */}
      <div className="grid grid-cols-2 gap-2 my-1">
        <div>{players >= 4 ? renderPlayerCorner(3) : null}</div>
        <div>{players >= 3 ? renderPlayerCorner(2) : null}</div>
      </div>

      {/* Rodapé com log e status */}
      <Card className="p-2 text-center text-xs text-muted-foreground mt-1">
        {state.over
          ? "Partida terminada!"
          : state.turn === 0
            ? state.dice == null
              ? "👉 É a tua vez! Clica no teu dado para rolar."
              : "👉 Escolhe um peão que está a balançar para mover."
            : `${playersList[state.turn]?.name ?? "Adversário"} está a jogar...`}
      </Card>

      {/* Tela de vitória ou derrota */}
      {result && (
        <ResultOverlay
          result={result}
          coins={result === "win" ? bet * 2 : 0}
          onRematch={() => {
            settled.current = false;
            placeBet(bet, "ludo");
            setState(ludoEngine.createGame({ players }));
            setSeconds(TURN_SECONDS);
            setTurnSequence((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
