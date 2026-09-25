import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Flame, Trophy } from "lucide-react";
import dice1 from "@/assets/ludo/1.png.asset.json";
import dice2 from "@/assets/ludo/2.png.asset.json";
import dice3 from "@/assets/ludo/3.png.asset.json";
import dice4 from "@/assets/ludo/4.png.asset.json";
import dice5 from "@/assets/ludo/5.png.asset.json";
import dice6 from "@/assets/ludo/6.png.asset.json";
import moveSound from "@/assets/ludo/move.wav.asset.json";
import rollSound from "@/assets/ludo/roll_the_dice.mp3.asset.json";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { LudoBoard } from "@/components/boards/LudoBoard";
import { Button, Card, Pill } from "@/components/ui/primitives";
import { LUDO_NAMES, ludoBotMove, ludoEngine, type LudoMove } from "@/lib/games/ludo";
import { botName, placeBet, recordMatch, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const TURN_SECONDS = 15;
const DICE_IMAGES = [dice1.url, dice2.url, dice3.url, dice4.url, dice5.url, dice6.url];

export const Route = createFileRoute("/games/ludo")({
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: TURN_SECONDS,
    players: Math.min(4, Math.max(2, Number(search["players"] ?? 4) || 4)),
  }),
  head: () => ({
    meta: [
      { title: "Ludo clássico — MozaPlay" },
      { name: "description", content: "Joga Ludo clássico com tabuleiro nítido, regras completas e partidas cronometradas." },
      { property: "og:title", content: "Ludo clássico — MozaPlay" },
      { property: "og:description", content: "Ludo competitivo com quatro cores, casas seguras e regras completas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LudoMatch,
});

function playAudio(url: string) {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.55;
    void audio.play().catch(() => undefined);
  } catch {
    // Browsers can block sound; the game must continue silently.
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
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const play = useCallback((move: LudoMove) => {
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
    }, 65);
    rollTimer.current = window.setTimeout(() => {
      window.clearInterval(animation);
      const value = move.value ?? 1 + Math.floor(Math.random() * 6);
      setDicePreview(value);
      setRolling(false);
      applyMove({ type: "roll", value });
    }, 520);
  }, [applyMove, rolling]);

  useEffect(() => {
    if (seconds > 0 || state.over || rolling) return;
    const move = state.turn === 0
      ? ludoEngine.legalMoves(state)[0]
      : ludoBotMove(state);
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

  const diceValue = rolling ? dicePreview : state.dice ?? dicePreview;
  const canRoll = state.turn === 0 && state.dice == null && !state.over && !rolling;
  const result = state.over ? (state.winner === 0 ? "win" : "loss") : null;
  const seats = Array.from({ length: players }, (_, index) => ({
    name: index === 0 ? app.profile.name : opponents[index - 1] ?? `Bot ${index}`,
    avatar: index === 0 ? app.profile.avatar : "🤖",
    bot: index !== 0,
    active: state.turn === index,
    label: LUDO_NAMES[index] ?? "Jogador",
  }));

  return (
    <>
      <MatchShell
        title="Ludo"
        seats={seats}
        seconds={seconds}
        limit={TURN_SECONDS}
        statusText={state.over ? "Partida terminada" : state.turn === 0 ? "A tua vez" : `${seats[state.turn]?.name ?? "Adversário"} joga...`}
        footer={
          <Card className="flex items-center justify-between p-3 text-xs">
            <Pill tone="primary"><Trophy className="h-3 w-3" /> Aposta {bet} moedas</Pill>
            <span className="max-w-48 truncate text-muted-foreground">{state.log[0]}</span>
          </Card>
        }
      >
        <div className="relative">
          <LudoBoard state={state} disabled={state.turn !== 0 || state.over || rolling} onMove={(token) => play({ type: "move", token })} />

          <div className="mt-3 flex items-center justify-center gap-4">
            <div className="relative">
              {canRoll ? <ArrowDown className="ludo-dice-arrow absolute -top-8 left-1/2 h-7 w-7 -translate-x-1/2 text-primary" aria-hidden="true" /> : null}
              <Button
                type="button"
                variant="ghost"
                aria-label="Lançar o dado"
                disabled={!canRoll}
                onClick={() => play({ type: "roll" })}
                className={cn("ludo-dice h-18 w-18 rounded-2xl p-2", rolling && "ludo-dice-rolling", canRoll && "ring-2 ring-primary")}
              >
                <img src={DICE_IMAGES[diceValue - 1]} alt={`Dado com ${diceValue}`} className="h-full w-full" draggable={false} />
              </Button>
            </div>
            <div className="min-w-32">
              <p className="font-display text-sm font-bold">{LUDO_NAMES[state.turn] ?? "Jogador"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {state.dice == null ? "Lança o dado" : state.turn === 0 ? "Escolhe um peão" : "A mover o peão"}
              </p>
              {state.bonusRoll ? <Pill tone="accent" className="mt-2"><Flame className="h-3 w-3" /> Jogada extra</Pill> : null}
            </div>
          </div>
        </div>
      </MatchShell>

      {result ? (
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
      ) : null}
    </>
  );
}