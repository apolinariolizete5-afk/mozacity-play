import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Crown, Gamepad2, Trophy, Users, WalletCards, Zap } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { useApp, winRate } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MozaPlay — Centro de jogos" },
      { name: "description", content: "O teu centro de jogos para Ludo, Damas e Xadrez." },
    ],
  }),
  component: Home,
});

const ICONS: Record<GameId, typeof Gamepad2> = {
  ludo: Gamepad2,
  checkers: Crown,
  chess: Trophy,
};

function Home() {
  const app = useApp();
  const unread = app.notifications.filter((n) => !n.read).length;
  const recent = app.matches.slice(0, 3);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between py-2">
        <Link to="/" className="flex items-center gap-3">
          <Logo size={44} />
          <div className="leading-none">
            <p className="font-display text-xl font-extrabold tracking-tight">MOZA<span className="text-primary">PLAY</span></p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Gaming hub</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/wallet" className="hidden items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs font-bold sm:flex">
            <WalletCards className="h-4 w-4 text-primary" /> Carteira
          </Link>
          <Link to="/notifications" aria-label="Notificações" className="relative grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-primary-foreground">{unread}</span>}
          </Link>
        </div>
      </header>

      <section className="mt-5 grid overflow-hidden rounded-[2rem] border border-border bg-card lg:grid-cols-[1.25fr_.75fr]">
        <div className="relative flex min-h-[330px] flex-col justify-between overflow-hidden p-6 sm:p-9">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative">
            <Pill tone="accent"><Zap className="h-3 w-3" /> Arena aberta</Pill>
            <h1 className="mt-5 max-w-2xl font-display text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
              O teu jogo.<br /><span className="text-primary">A tua partida.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Entra numa partida, escolhe o teu desafio e acompanha o teu progresso num único lugar.
            </p>
          </div>
          <div className="relative mt-7 flex flex-wrap gap-3">
            <Link to="/play" search={{ game: "ludo" }} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/15">
              <Gamepad2 className="h-5 w-5" /> Começar a jogar
            </Link>
            <Link to="/rooms" className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background/60 px-5 py-3.5 text-sm font-extrabold">
              <Users className="h-5 w-5" /> Explorar salas
            </Link>
          </div>
        </div>
        <div className="hidden min-h-[330px] bg-background/60 p-5 lg:block">
          <div className="grid h-full grid-rows-[1fr_auto] gap-4">
            <div className="relative overflow-hidden rounded-[1.5rem]">
              <img src={GAME_META.ludo.cover} alt="Ludo" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className="absolute bottom-5 left-5">
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">Destaque</p>
                <p className="mt-1 font-display text-2xl font-black text-white">Ludo Clássico</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(GAME_META) as GameId[]).map((id) => (
                <Link key={id} to="/play" search={{ game: id }} className="rounded-2xl border border-border bg-card p-3">
                  <p className="text-xs font-extrabold">{GAME_META[id].name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{GAME_META[id].players}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <Link to="/profile" className="rounded-3xl border border-border bg-card p-5 transition-transform active:scale-[.99]">
          <div className="flex items-center justify-between"><Trophy className="h-5 w-5 text-primary" /><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>
          <p className="mt-5 text-2xl font-black">{winRate(app.stats.total)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Taxa de vitórias</p>
        </Link>
        <Link to="/history" className="rounded-3xl border border-border bg-card p-5 transition-transform active:scale-[.99]">
          <div className="flex items-center justify-between"><Gamepad2 className="h-5 w-5 text-accent" /><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>
          <p className="mt-5 text-2xl font-black">{app.stats.total.wins + app.stats.total.losses}</p>
          <p className="mt-1 text-xs text-muted-foreground">Partidas concluídas</p>
        </Link>
        <Link to="/rooms" className="rounded-3xl border border-border bg-card p-5 transition-transform active:scale-[.99]">
          <div className="flex items-center justify-between"><Users className="h-5 w-5 text-success" /><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>
          <p className="mt-5 text-2xl font-black">Salas</p>
          <p className="mt-1 text-xs text-muted-foreground">Encontra outros jogadores</p>
        </Link>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-primary">Escolhe o desafio</p><h2 className="mt-1 font-display text-2xl font-black">Todos os jogos</h2></div>
          <Link to="/play" search={{ game: "ludo" }} className="text-xs font-extrabold text-primary">Ver todos</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(GAME_META) as GameId[]).map((id) => {
            const meta = GAME_META[id];
            const Icon = ICONS[id];
            return (
              <Link key={id} to="/play" search={{ game: id }} className="group relative overflow-hidden rounded-[1.75rem] border border-border bg-card">
                <div className="relative aspect-[1.25] overflow-hidden">
                  <img src={meta.cover} alt={meta.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
                  <div className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-2xl bg-black/35 text-white backdrop-blur"><Icon className="h-5 w-5" /></div>
                  <div className="absolute inset-x-4 bottom-4 text-white">
                    <p className="font-display text-2xl font-black">{meta.name}</p>
                    <p className="mt-1 text-xs text-white/70">{meta.tagline}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs font-bold text-muted-foreground">{meta.players}</span>
                  <span className="text-xs font-extrabold text-primary">Jogar <ChevronRight className="inline h-3 w-3" /></span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-muted-foreground">Atividade</p><h2 className="mt-1 font-display text-2xl font-black">Últimas partidas</h2></div><Link to="/history" className="text-xs font-extrabold text-primary">Histórico</Link></div>
        {recent.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">Ainda não tens partidas. O próximo resultado começa aqui.</div>
        ) : (
          <div className="grid gap-2">
            {recent.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                <div><p className="text-sm font-extrabold">{GAME_META[m.game].name}</p><p className="text-xs text-muted-foreground">vs {m.opponents.join(", ") || "adversário"}</p></div>
                <Pill tone={m.result === "win" ? "success" : m.result === "draw" ? "muted" : "danger"}>{m.result === "win" ? "Vitória" : m.result === "draw" ? "Empate" : "Derrota"}</Pill>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
