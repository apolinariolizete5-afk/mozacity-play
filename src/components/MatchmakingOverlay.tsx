import { useEffect, useState } from "react";
import { Swords, X, CheckCircle2, ShieldCheck, User } from "lucide-react";
import type { GameId } from "@/lib/games/types";
import { GAME_META } from "@/lib/games/types";

export interface OpponentInfo {
  id: string;
  name: string;
}

interface MatchmakingOverlayProps {
  isOpen: boolean;
  gameId: GameId;
  bet: number;
  playersCount: number;
  playerName: string;
  opponent: OpponentInfo | null;
  countdown: number | null;
  onCancel: () => void;
}

export function MatchmakingOverlay({
  isOpen,
  gameId,
  bet,
  playersCount,
  playerName,
  opponent,
  countdown,
  onCancel,
}: MatchmakingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isOpen || opponent) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isOpen, opponent]);

  if (!isOpen) return null;

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const gameInfo = GAME_META[gameId];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-md transition-all">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {opponent ? "Partida Confirmada" : "Procurando Adversário"}
            </span>
          </div>
          {!opponent && (
            <button onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!opponent ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="relative mb-6 flex h-32 w-32 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/20 duration-1000" />
              <div className="absolute inset-3 animate-pulse rounded-full bg-primary/10" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                <Swords className="h-9 w-9 animate-bounce" />
              </div>
            </div>
            <h3 className="font-display text-2xl font-black text-foreground">{gameInfo.name} Live</h3>
            <p className="mt-1 text-sm text-muted-foreground">Conectando com outro jogador real em Moçambique...</p>
            <div className="mt-6 flex w-full items-center justify-around rounded-2xl bg-secondary/50 p-3 text-xs font-semibold">
              <div><span className="block text-[10px] uppercase text-muted-foreground">Aposta</span><span className="text-sm font-extrabold text-primary">{bet > 0 ? `${bet} MT` : "Amistoso"}</span></div>
              <div className="h-7 w-px bg-border" />
              <div><span className="block text-[10px] uppercase text-muted-foreground">Modo</span><span className="text-sm font-extrabold text-foreground">{playersCount} Jogadores</span></div>
              <div className="h-7 w-px bg-border" />
              <div><span className="block text-[10px] uppercase text-muted-foreground">Tempo</span><span className="font-mono text-sm font-extrabold text-foreground">{formatSeconds(elapsed)}</span></div>
            </div>
            <button onClick={onCancel} className="mt-6 w-full rounded-2xl border border-border bg-secondary py-3 text-sm font-bold text-foreground transition hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive">Cancelar Procura</button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" /> Oponente Encontrado!
            </div>
            <div className="flex w-full items-center justify-between gap-3 px-2">
              <div className="flex flex-1 flex-col items-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md"><User className="h-8 w-8" /></div>
                <span className="mt-2 max-w-[100px] truncate text-xs font-bold text-foreground">{playerName}</span>
                <span className="text-[10px] font-semibold text-primary">Você</span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <div className="font-display text-2xl font-black italic tracking-wider text-muted-foreground">VS</div>
                {countdown !== null && <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-lg font-black text-primary-foreground shadow-lg animate-pulse">{countdown}</div>}
              </div>
              <div className="flex flex-1 flex-col items-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-foreground shadow-md"><User className="h-8 w-8" /></div>
                <span className="mt-2 max-w-[100px] truncate text-xs font-bold text-foreground">{opponent.name || "Adversário"}</span>
                <span className="text-[10px] font-semibold text-emerald-500">Pronto</span>
              </div>
            </div>
            <div className="mt-6 w-full rounded-2xl border border-primary/20 bg-primary/5 p-3 text-center">
              <p className="text-[11px] font-semibold text-muted-foreground">Prêmio em disputa:</p>
              <p className="text-xl font-black text-primary">{bet > 0 ? `${bet * playersCount} MT` : "Partida sem aposta"}</p>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Partida sincronizada e protegida</p>
          </div>
        )}
      </div>
    </div>
  );
}
