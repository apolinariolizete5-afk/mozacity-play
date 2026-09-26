import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Coins, Dice5, Crown, Swords, Zap } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { Button, Card, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { useApp, winRate } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MozaPlay — Joga. Desafia. Compete." },
      {
        name: "description",
        content:
          "MozaPlay é a plataforma mobile de jogos competitivos: Ludo, Damas e Xadrez com salas, ranking e carteira de moedas.",
      },
      { property: "og:title", content: "MozaPlay — Joga. Desafia. Compete." },
      {
        property: "og:description",
        content: "Salas públicas e privadas, partida rápida e ranking global em Ludo, Damas e Xadrez.",
      },
    ],
  }),
  component: Home,
});

const ICONS: Record<GameId, typeof Dice5> = { ludo: Dice5, checkers: Crown, chess: Swords };

function Home() {
  const app = useApp();
  const unread = app.notifications.filter((n) => !n.read).length;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link
          to="/notifications"
          className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          ) : null}
        </Link>
      </div>

      <Card className="relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-2xl" />
        <Pill tone="accent">
          <Zap className="h-3 w-3" /> Partida rápida
        </Pill>
        <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight">
          Desafia jogadores <br /> em segundos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Matchmaking automático com preenchimento por bots quando faltam jogadores.
        </p>
        <Link to="/play" search={{ game: "ludo" }} className="mt-4 block">
          <Button size="lg" className="w-full">
            Jogar agora
          </Button>
        </Link>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/wallet">
          <Card className="h-full">
            <Coins className="h-5 w-5 text-primary" />
            <p className="mt-2 font-display text-xl font-extrabold">Carteira</p>
            <p className="text-xs text-muted-foreground">Saldo e movimentos</p>
          </Card>
        </Link>
        <Link to="/profile">
          <Card className="h-full">
            <Crown className="h-5 w-5 text-accent" />
            <p className="mt-2 font-display text-2xl font-extrabold tabular-nums">
              {winRate(app.stats.total)}%
            </p>
            <p className="text-xs text-muted-foreground">
              Taxa de vitória · {app.stats.total.wins}V {app.stats.total.losses}D
            </p>
          </Card>
        </Link>
      </div>

      <section className="space-y-3">
        <div className="px-1"><h3 className="font-display text-lg font-bold">Escolhe um jogo</h3><p className="mt-1 text-xs text-muted-foreground">Cada jogo tem a sua própria área.</p></div>
        {(Object.keys(GAME_META) as GameId[]).map((id) => {
          const Icon = ICONS[id];
          const meta = GAME_META[id];
          return (
            <Link key={id} to="/play" search={{ game: id }}>
              <Card className="flex items-center gap-3 border-border/90 transition-transform active:scale-[0.99]">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <Icon className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <p className="font-display text-base font-bold">{meta.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {meta.tagline} · {meta.players}
                  </p>
                </div>
                <Pill tone="primary">{winRate(app.stats[id])}%</Pill>
              </Card>
            </Link>
          );
        })}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-display text-lg font-bold">Últimas partidas</h3>
          <Link to="/history" className="text-xs font-semibold text-primary">
            Ver tudo
          </Link>
        </div>
        {app.matches.length === 0 ? (
          <Card className="text-sm text-muted-foreground">
            Ainda sem partidas. Começa pela partida rápida.
          </Card>
        ) : (
          app.matches.slice(0, 3).map((m) => (
            <Card key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold">{GAME_META[m.game].name}</p>
                <p className="text-xs text-muted-foreground">vs {m.opponents.join(", ") || "bot"}</p>
              </div>
              <Pill tone={m.result === "win" ? "success" : m.result === "draw" ? "muted" : "danger"}>
                {m.result === "win" ? "Vitória" : m.result === "draw" ? "Empate" : "Derrota"}
              </Pill>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
