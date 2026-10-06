import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Clock3, Gamepad2, Users2, Dice5, CircleDot, Crown, AlertCircle } from "lucide-react";
import { GAME_META, type GameId } from "@/lib/games/types";
import { quickMatch, TURN_SECONDS } from "@/lib/realtime";
import { useApp } from "@/lib/store";
import { getPublicPlatformSettings } from "@/lib/platform.functions";
import { getWalletSummary } from "@/lib/wallet.functions";
import { MatchmakingOverlay, type OpponentInfo } from "@/components/MatchmakingOverlay";
import { BOT_DIFFICULTIES, type BotDifficulty } from "@/lib/games/bot";

const LUDO_TEST_MODE = import.meta.env.VITE_LUDO_TEST_MODE !== "false";
const CHECKERS_TEST_MODE = import.meta.env.VITE_CHECKERS_TEST_MODE !== "false";

const GAME_ICONS: Record<GameId, typeof Gamepad2> = {
  ludo: Dice5,
  checkers: CircleDot,
  chess: Crown,
};

export const Route = createFileRoute("/play")({
  validateSearch: (search: Record<string, unknown>) => ({
    game: (["ludo", "checkers", "chess"].includes(String(search["game"]))
      ? String(search["game"])
      : "ludo") as GameId,
  }),
  head: () => ({
    meta: [
      { title: "Jogar — MozaPlay" },
      { name: "description", content: "Partida rápida ao vivo com jogadores reais em Moçambique." },
    ],
  }),
  component: Play,
});

function Play() {
  const { game } = Route.useSearch();
  const navigate = useNavigate();
  const app = useApp();

  const [selected, setSelected] = useState<GameId>(game);
  const [bet, setBet] = useState((game === "ludo" && LUDO_TEST_MODE) || (game === "checkers" && CHECKERS_TEST_MODE) ? 0 : 20);
  const [betInput, setBetInput] = useState((game === "ludo" && LUDO_TEST_MODE) || (game === "checkers" && CHECKERS_TEST_MODE) ? "0" : "20");
  const betInputEditingRef = useRef(false);
  const [minBetMzn, setMinBetMzn] = useState<number | null>(null);
  const getSettings = useServerFn(getPublicPlatformSettings);
  const getWallet = useServerFn(getWalletSummary);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useEffect(() => {
    getWallet()
      .then((w: any) => setWalletBalance(Number(w?.balance_cents ?? 0) / 100))
      .catch(() => setWalletBalance(null));
  }, [getWallet]);
  const [players, setPlayers] = useState(2);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("normal");

  const [opponent, setOpponent] = useState<OpponentInfo | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => setSelected(game), [game]);

  useEffect(() => {
    if ((selected === "ludo" && LUDO_TEST_MODE) || (selected === "checkers" && CHECKERS_TEST_MODE)) {
      setBet(0);
      setBetInput("0");
      return;
    }
    if (selected === "ludo" && players > 2) {
      setBet(0);
      setBetInput("0");
    }
  }, [players, selected]);

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        if (!active) return;
        const minimum = Math.max(0, Math.ceil(settings.min_bet_cents / 100));
        setMinBetMzn(minimum);
        setBet((current) => Math.max(current, minimum));
        if (!betInputEditingRef.current) {
          setBetInput((current) => {
            const value = Number(current);
            return !current || !Number.isFinite(value) || value < minimum ? String(minimum) : current;
          });
        }
      } catch {
        // Fallback gracioso
      }
    };
    void loadSettings();
    const timerId = window.setInterval(() => void loadSettings(), 10000);
    return () => {
      active = false;
      window.clearInterval(timerId);
    };
  }, []);

  const startBotMatch = async () => {
    if (!app.profile.id) {
      await navigate({ to: "/auth" });
      return;
    }
    const base = { bet: 0, timer: TURN_SECONDS, bot: botDifficulty };
    await navigate(
      selected === "ludo"
        ? { to: "/games/ludo", search: { ...base, players: 2 } }
        : selected === "checkers"
          ? { to: "/games/checkers", search: base }
          : { to: "/games/chess", search: base },
    );
  };

  const cancelSearch = () => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearching(false);
    setOpponent(null);
    setCountdown(null);
    setError("");
  };

  const startQuickMatch = async () => {
    if (!app.profile.id) {
      await navigate({ to: "/auth" });
      return;
    }

    const entered = Number(betInput);
    const minimum = minBetMzn ?? 0;
    if (!((selected === "ludo" && LUDO_TEST_MODE) || (selected === "checkers" && CHECKERS_TEST_MODE)) && (!Number.isFinite(entered) || entered < minimum)) {
      setError(`O valor mínimo da aposta é ${minimum} MT.`);
      setBetInput(String(minimum));
      setBet(minimum);
      return;
    }

    const wager = ((selected === "ludo" && LUDO_TEST_MODE) || (selected === "checkers" && CHECKERS_TEST_MODE)) ? 0 : Math.round(entered);

    const userBalance = walletBalance ?? Number.POSITIVE_INFINITY;
    if (!((selected === "ludo" && LUDO_TEST_MODE) || (selected === "checkers" && CHECKERS_TEST_MODE)) && wager > 0 && userBalance < wager) {
      setError(`Saldo insuficiente (${userBalance.toFixed(2)} MT). Faça um depósito mínimo de ${wager} MT para jogar.`);
      return;
    }

    setBet(wager);
    setBetInput(String(wager));
    setSearching(true);
    setError("");
    setOpponent(null);
    setCountdown(null);

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    try {
      const room = await quickMatch({
        game: selected,
        player: { playerId: app.profile.id, name: app.profile.name || "Jogador" },
        bet: wager,
        players: selected === "ludo" ? players : 2,
        signal: controller.signal,
        onMatchFound: (assignedRoom) => {
          const opp = assignedRoom.players.find((p) => p.id !== app.profile.id);
          setOpponent(opp ? { id: opp.id, name: opp.name } : { id: "opp", name: "Oponente" });

          let count = 3;
          setCountdown(count);
          const interval = setInterval(() => {
            count -= 1;
            if (count <= 0) {
              clearInterval(interval);
            } else {
              setCountdown(count);
            }
          }, 1000);
        },
      });

      await new Promise((r) => setTimeout(r, 3000));

      await navigate(
        selected === "ludo"
          ? { to: "/games/ludo", search: { bet: wager, timer: TURN_SECONDS, players, room: room.code } }
          : selected === "checkers"
            ? { to: "/games/checkers", search: { bet: wager, timer: TURN_SECONDS, room: room.code } }
            : { to: "/games/chess", search: { bet: wager, timer: TURN_SECONDS, room: room.code } },
      );
    } catch (err) {
      if (err instanceof Error && err.message === "matchmaking_cancelled") {
        return;
      }
      setSearching(false);
      setOpponent(null);
      setCountdown(null);
      setError(err instanceof Error ? err.message : "Não foi possível encontrar uma partida no momento.");
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
      <MatchmakingOverlay
        isOpen={searching}
        gameId={selected}
        bet={bet}
        playersCount={players}
        playerName={app.profile.name || "Você"}
        opponent={opponent}
        countdown={countdown}
        onCancel={cancelSearch}
      />

      <header className="mb-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-primary">Game lobby</p>
        <h1 className="mt-2 font-display text-4xl font-black tracking-tight sm:text-5xl">Escolhe como jogar.</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Joga contra outros jogadores ou treina contra um bot. Escolhe a dificuldade e começa imediatamente.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr] lg:items-start">
        <section className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(GAME_META) as GameId[]).map((id) => {
            const active = selected === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                className={`flex min-h-28 items-center gap-4 rounded-[1.5rem] border bg-card p-4 text-left transition-all ${active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"}`}
              >
                {(() => {
                  const Icon = GAME_ICONS[id];
                  return (
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                      <Icon className="h-6 w-6" />
                    </span>
                  );
                })()}
                <span className="min-w-0">
                  <span className="block font-display text-xl font-black">{GAME_META[id].name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{GAME_META[id].tagline}</span>
                  <span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{GAME_META[id].players}</span>
                </span>
              </button>
            );
          })}
        </section>

        <aside className="rounded-[1.8rem] border border-border bg-card p-5 lg:sticky lg:top-5">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Gamepad2 className="h-5 w-5" /></div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Selecionado</p>
              <p className="font-display text-xl font-black">{GAME_META[selected].name}</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-extrabold"><Clock3 className="h-4 w-4 text-primary" /> Tempo por turno</div>
            <div className="mt-2 rounded-xl bg-primary/10 px-3 py-3 text-center text-sm font-extrabold text-primary">15 segundos</div>
            <p className="mt-1 text-[11px] text-muted-foreground">O relógio é sincronizado pelo Realtime da partida.</p>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-extrabold">💰 Valor da aposta</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={minBetMzn ?? undefined}
                step={1}
                value={betInput}
                disabled={(selected === "ludo" && (LUDO_TEST_MODE || players > 2)) || (selected === "checkers" && CHECKERS_TEST_MODE)}
                onFocus={() => { betInputEditingRef.current = true; }}
                onChange={(event) => setBetInput(event.target.value)}
                onBlur={() => {
                  betInputEditingRef.current = false;
                  const value = Number(betInput);
                  if (!Number.isFinite(value) || value < (minBetMzn ?? 0)) {
                    setBetInput(String(minBetMzn ?? 0));
                    setBet(minBetMzn ?? 0);
                  } else {
                    const normalized = String(Math.round(value));
                    setBetInput(normalized);
                    setBet(Number(normalized));
                  }
                }}
                className="h-12 flex-1 rounded-xl bg-secondary px-4 text-base font-extrabold outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="font-extrabold">MT</span>
            </div>
            <p className="mt-1 text-[11px] font-bold text-primary">
              {selected === "ludo" && LUDO_TEST_MODE ? "MODO TESTE — Ludo sem dinheiro, sem saldo e sem cobrança." : selected === "checkers" && CHECKERS_TEST_MODE ? "MODO TESTE — Damas sem dinheiro, sem saldo e sem cobrança." : selected === "ludo" && players > 2 ? "Ludo com 3 ou 4 jogadores: partida sem aposta." : `Valor mínimo: ${minBetMzn ?? "…"} MT.`}
            </p>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-xs font-extrabold"><Users2 className="h-4 w-4 text-primary" /> Jogadores</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(selected === "ludo" ? [2, 3, 4] : [2]).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setPlayers(count)}
                  className={`rounded-xl py-3 text-xs font-extrabold transition ${players === count ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
                >
                  {count} jogadores
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Só encontrarás jogadores que escolheram a mesma quantidade e a mesma aposta.</p>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={() => void startQuickMatch()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/15 transition hover:opacity-95"
          >
            <Users2 className="h-4 w-4" /> Partida rápida <ArrowRight className="h-4 w-4" />
          </button>

          <div className="mt-5 border-t border-border pt-5">
            <div className="flex items-center gap-2 text-xs font-extrabold">🤖 Jogar contra Bot</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {BOT_DIFFICULTIES.map((level) => (
                <button key={level.id} type="button" onClick={() => setBotDifficulty(level.id)}
                  className={`rounded-xl px-2 py-3 text-xs font-extrabold ${botDifficulty === level.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                  {level.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{BOT_DIFFICULTIES.find((level) => level.id === botDifficulty)?.description}</p>
            <button type="button" onClick={() => void startBotMatch()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 py-3.5 text-sm font-extrabold text-primary">
              🤖 Começar contra Bot
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
