import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Coins, History, Bell, Phone, Save, ShieldCheck } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { setProfile, setTimerPreference, useApp, winRate } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Perfil e estatísticas — MozaPlay" },
      {
        name: "description",
        content: "Estatísticas por jogo, taxa de vitória, timer preferido e carteira de moedas.",
      },
      { property: "og:title", content: "Perfil e estatísticas — MozaPlay" },
      { property: "og:description", content: "Acompanha vitórias, derrotas e taxa de vitória." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const app = useApp();
  const [name, setName] = useState(app.profile.name);
  const [phone, setPhone] = useState(app.profile.phone);
  const [saved, setSaved] = useState(false);
  const avatars = ["🦁", "🐆", "🦅", "🐘", "🦈", "🐊", "🦒", "🐅"];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-6 pt-5 sm:px-6">
      <PageHeader title="Perfil" subtitle="O teu desempenho na MozaPlay" />

      <Card className="border-border bg-card/95 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary text-3xl">
            {app.profile.avatar}
          </div>
          <div className="flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setProfile(name || "Jogador", app.profile.avatar, phone)}
              className="w-full rounded-2xl bg-secondary px-4 py-2 font-display text-lg font-bold outline-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Membro desde {new Date(app.profile.joinedAt).toLocaleDateString("pt-PT")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {avatars.map((a) => (
            <button
              key={a}
              onClick={() => setProfile(name || "Jogador", a, phone)}
              className={`h-10 w-10 rounded-2xl text-xl ${
                app.profile.avatar === a ? "bg-primary/25 ring-1 ring-primary" : "bg-secondary"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <div><p className="font-display font-bold">Contacto</p><p className="text-xs text-muted-foreground">Usado para identificação e contacto da conta.</p></div>
        </div>
        <input
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
          placeholder="+258 84 000 0000"
          className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary"
        />
        <Button size="sm" className="w-full" onClick={() => { setProfile(name || "Jogador", app.profile.avatar, phone.trim()); setSaved(true); }}>
          {saved ? <ShieldCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Contacto guardado" : "Guardar alterações"}
        </Button>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center">
          <p className="font-display text-2xl font-extrabold">{app.stats.total.wins}</p>
          <p className="text-[11px] text-muted-foreground">Vitórias</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-2xl font-extrabold">{app.stats.total.losses}</p>
          <p className="text-[11px] text-muted-foreground">Derrotas</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-2xl font-extrabold">{winRate(app.stats.total)}%</p>
          <p className="text-[11px] text-muted-foreground">Taxa</p>
        </Card>
      </div>

      <Card className="border-border bg-card/95 p-5 shadow-sm space-y-3">
        <p className="font-display font-bold">Por jogo</p>
        {(Object.keys(GAME_META) as GameId[]).map((id) => (
          <div key={id} className="flex items-center justify-between text-sm">
            <span>{GAME_META[id].name}</span>
            <span className="text-muted-foreground">
              {app.stats[id].wins}V · {app.stats[id].losses}D · {winRate(app.stats[id])}%
            </span>
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <p className="font-display font-bold">Timer preferido</p>
        <div className="flex gap-2">
          {[5, 10, 15, 30].map((t) => (
            <button
              key={t}
              onClick={() => setTimerPreference(t)}
              className={`h-11 flex-1 rounded-2xl text-sm font-bold ${
                app.timer === t ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              {t}s
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Link to="/wallet">
          <Button variant="ghost" className="w-full flex-col gap-1 py-2 text-xs" size="lg">
            <Coins className="h-5 w-5" /> Carteira
          </Button>
        </Link>
        <Link to="/history">
          <Button variant="ghost" className="w-full flex-col gap-1 py-2 text-xs" size="lg">
            <History className="h-5 w-5" /> Histórico
          </Button>
        </Link>
        <Link to="/notifications">
          <Button variant="ghost" className="w-full flex-col gap-1 py-2 text-xs" size="lg">
            <Bell className="h-5 w-5" /> Avisos
          </Button>
        </Link>
      </div>

    </main>
  );
}
