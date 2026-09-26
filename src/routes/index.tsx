import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Coins, Crown, Zap } from "lucide-react";
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
    <main className="mx-auto w-full max-w-5xl space-y-7 px-4 pb-6 pt-5 sm:px-6">
      <header className="flex items-center justify-between">
        <Wordmark size={42} />
        <Link
          to="/notifications"
          className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card/80"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold">{unread}</span>}
        </Link>
      </header>

      <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-5 sm:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_15%_90%,rgba(139,92,246,.16),transparent_30%)]" />
        <div className="relative grid gap-6 md:grid-cols-[1.15fr_.85fr] md:items-center">
          <div>
            <Pill tone="accent"><Zap className="h-3 w-3" /> Partida rápida</Pill>
            <h1 className="mt-4 max-w-xl font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
              Escolhe o teu jogo.<br /><span className="text-primary">Entra na partida.</span>
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
              Ludo, Damas e Xadrez numa experiência simples, rápida e feita para telemóvel.
            </p>
            <Link to="/play" search={{ game: "ludo" }} className="mt-5 inline-block">
              <Button size="lg"><Zap className="h-5 w-5" /> Jogar agora</Button>
            </Link>
          </div>
          <div className="hidden md:block">
            <img src={GAME_META.ludo.cover} alt="Capa do Ludo" className="w-full rounded-3xl border border-white/10 object-cover shadow-xl" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between px-1">
          <div><h2 className="font-display text-xl font-extrabold">Jogos</h2><p className="text-xs text-muted-foreground">Escolhe uma capa para começar</p></div>
          <Link to="/play" search={{ game: "ludo" }} className="text-xs font-bold text-primary">Ver todos</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(GAME_META) as GameId[]).map((id) => {
            const meta = GAME_META[id];
            return (
              <Link key={id} to="/play" search={{ game: id }} className="group">
                <article className="overflow-hidden rounded-3xl border border-border bg-card transition-transform active:scale-[.99] sm:hover:-translate-y-1">
                  <div className="relative aspect-[1.7] overflow-hidden">
                    <img src={meta.cover} alt={`Capa de ${meta.name}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10">
                      <span className="text-xs font-semibold text-white">{meta.players}</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-lg font-extrabold">{meta.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{meta.tagline}</p>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link to="/wallet"><Card className="h-full border-border bg-card p-5"><Coins className="h-5 w-5 text-primary" /><p className="mt-3 font-display text-xl font-extrabold">Carteira</p><p className="mt-1 text-xs text-muted-foreground">Saldo e movimentos da conta</p></Card></Link>
        <Link to="/profile"><Card className="h-full border-border bg-card p-5"><Crown className="h-5 w-5 text-accent" /><p className="mt-3 font-display text-xl font-extrabold">{winRate(app.stats.total)}% de vitórias</p><p className="mt-1 text-xs text-muted-foreground">{app.stats.total.wins} vitórias · {app.stats.total.losses} derrotas</p></Card></Link>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1"><h2 className="font-display text-xl font-extrabold">Últimas partidas</h2><Link to="/history" className="text-xs font-bold text-primary">Ver tudo</Link></div>
        {app.matches.length === 0 ? <Card className="border-border bg-card text-sm text-muted-foreground">Ainda sem partidas. Escolhe um jogo acima para começar.</Card> : app.matches.slice(0, 3).map((m) => (
          <Card key={m.id} className="flex items-center justify-between border-border bg-card py-3">
            <div><p className="text-sm font-semibold">{GAME_META[m.game].name}</p><p className="text-xs text-muted-foreground">vs {m.opponents.join(", ") || "adversário"}</p></div>
            <Pill tone={m.result === "win" ? "success" : m.result === "draw" ? "muted" : "danger"}>{m.result === "win" ? "Vitória" : m.result === "draw" ? "Empate" : "Derrota"}</Pill>
          </Card>
        ))}
      </section>
    </main>
  );
}
