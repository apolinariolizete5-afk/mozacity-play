import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { LEADERBOARD_SEED, useApp } from "@/lib/store";

export const Route = createFileRoute("/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking global — MozaPlay" },
      {
        name: "description",
        content: "Leaderboard global e por jogo: Ludo, Damas e Xadrez.",
      },
      { property: "og:title", content: "Ranking global — MozaPlay" },
      { property: "og:description", content: "Vê a tua posição no ranking da MozaPlay." },
    ],
  }),
  component: Ranking,
});

type Scope = "global" | GameId;

function Ranking() {
  const app = useApp();
  const [scope, setScope] = useState<Scope>("global");

  const myPoints =
    scope === "global"
      ? app.stats.total.wins * 100 + app.stats.total.draws * 30
      : app.stats[scope].wins * 100 + app.stats[scope].draws * 30;

  const rows = [
    ...LEADERBOARD_SEED.map((p) => ({
      name: p.name,
      avatar: p.avatar,
      points:
        scope === "global" ? p.points.ludo + p.points.checkers + p.points.chess : p.points[scope],
      me: false,
    })),
    { name: app.profile.name, avatar: app.profile.avatar, points: myPoints, me: true },
  ].sort((a, b) => b.points - a.points);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-4">
      <PageHeader title="Ranking" subtitle="Global e por jogo" />

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {(["global", "ludo", "checkers", "chess"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`h-10 shrink-0 rounded-2xl px-4 text-xs font-bold ${
              scope === s ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}
          >
            {s === "global" ? "Global" : GAME_META[s].name}
          </button>
        ))}
      </div>

      <Card className="divide-y divide-border/70 p-0">
        {rows.map((r, i) => (
          <div
            key={`${r.name}-${i}`}
            className={`flex items-center gap-3 px-4 py-3 ${r.me ? "bg-primary/10" : ""}`}
          >
            <span className="w-6 font-display text-sm font-extrabold text-muted-foreground">
              {i + 1}
            </span>
            <span className="text-xl">{r.avatar}</span>
            <p className="flex-1 truncate text-sm font-semibold">
              {r.name} {r.me ? <span className="text-primary">(tu)</span> : null}
            </p>
            <Pill tone={i === 0 ? "primary" : "muted"}>{r.points} pts</Pill>
          </div>
        ))}
      </Card>
    </main>
  );
}
