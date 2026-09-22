import { Link } from "@tanstack/react-router";
import { ArrowLeft, Wifi, Timer as TimerIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, Button, Card, Pill } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export interface Seat {
  name: string;
  avatar: string;
  bot: boolean;
  active: boolean;
  label?: string;
}

export function MatchShell({
  title,
  seats,
  seconds,
  limit,
  statusText,
  children,
  footer,
}: {
  title: string;
  seats: Seat[];
  seconds: number;
  limit: number;
  statusText: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, (seconds / limit) * 100));
  const low = seconds <= 3;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-3 px-3 pb-6 pt-3">
      <div className="flex items-center justify-between">
        <Link
          to="/play"
          search={{ game: "ludo" }}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary"
          aria-label="Sair da partida"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="font-display text-sm font-bold uppercase tracking-[0.16em]">{title}</p>
        <Pill tone="success">
          <Wifi className="h-3 w-3" /> Online
        </Pill>
      </div>

      <Card className="flex items-center justify-between gap-2 p-3">
        {seats.map((s, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-1 flex-col items-center rounded-2xl p-1 transition-colors",
              s.active && "bg-primary/12 ring-1 ring-primary/40",
            )}
          >
            <Avatar emoji={s.avatar} name={s.name} size={40} />
            <span className="text-[10px] uppercase text-muted-foreground">
              {s.label ?? (s.bot ? "Bot" : "Tu")}
            </span>
          </div>
        ))}
      </Card>

      <div className="rounded-2xl bg-card p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 font-semibold text-muted-foreground">
            <TimerIcon className="h-4 w-4" /> Tempo do turno
          </span>
          <span
            className={cn(
              "font-display text-2xl font-extrabold tabular-nums",
              low ? "text-destructive" : "text-primary",
            )}
          >
            {seconds}s
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn("h-full rounded-full transition-all duration-500", low ? "bg-destructive" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-center text-sm font-semibold">{statusText}</p>
      </div>

      {children}
      {footer}
    </div>
  );
}

export function ResultOverlay({
  result,
  coins,
  onRematch,
}: {
  result: "win" | "loss" | "draw";
  coins: number;
  onRematch: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/80 px-4 pb-8 backdrop-blur-sm">
      <Card className="w-full text-center">
        <p className="text-5xl">{result === "win" ? "🏆" : result === "draw" ? "🤝" : "💪"}</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold">
          {result === "win" ? "Venceste!" : result === "draw" ? "Empate" : "Derrota"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {coins > 0 ? `+${coins} moedas na tua carteira` : "Nenhuma moeda ganha nesta partida"}
        </p>
        <div className="mt-4 flex gap-2">
          <Button size="lg" className="flex-1" onClick={onRematch}>
            Revanche
          </Button>
          <Link to="/play" search={{ game: "ludo" }} className="flex-1">
            <Button size="lg" variant="ghost" className="w-full">
              Sair
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
