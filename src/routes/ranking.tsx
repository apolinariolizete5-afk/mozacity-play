import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { supabase } from "@/integrations/supabase/client";

type Scope = "global" | GameId;
type Row = { id: string; name: string; avatar: string; wins: number; losses: number; draws: number; points: number };

type ResultRow = {
  user_id: string;
  game: string;
  result: string;
};

export const Route = createFileRoute("/ranking")({
  head: () => ({ meta: [{ title: "Ranking global — MozaPlay" }] }),
  component: Ranking,
});

function Ranking() {
  const [scope, setScope] = useState<Scope>("global");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      let resultQuery = supabase
        .from("match_results")
        .select("user_id, game, result")
        .limit(5000);
      if (scope !== "global") {
        resultQuery = resultQuery.eq("game", scope);
      }
      const { data: results, error } = await resultQuery;

      if (error) {
        console.error("[Ranking]", error.message);
        if (active) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const aggregate = new Map<string, { wins: number; losses: number; draws: number }>();
      for (const item of (results ?? []) as ResultRow[]) {
        const current = aggregate.get(item.user_id) ?? { wins: 0, losses: 0, draws: 0 };
        const result = String(item.result).toLowerCase();
        if (result === "win") current.wins += 1;
        else if (result === "draw") current.draws += 1;
        else if (result === "loss") current.losses += 1;
        aggregate.set(item.user_id, current);
      }

      const ids = [...aggregate.keys()];
      let profiles: Array<{ id: string; display_name: string | null; avatar: string | null }> = [];
      if (ids.length) {
        const first = await supabase
          .from("user_profiles")
          .select("id, display_name, avatar")
          .in("id", ids);
        if (first.error) {
          const fallback = await supabase
            .from("profiles")
            .select("id, display_name, avatar")
            .in("id", ids);
          profiles = (fallback.data ?? []) as typeof profiles;
        } else {
          profiles = (first.data ?? []) as typeof profiles;
        }
      }

      const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
      const next = ids.map((id) => {
        const stats = aggregate.get(id) ?? { wins: 0, losses: 0, draws: 0 };
        const profile = profileMap.get(id);
        return {
          id,
          name: profile?.display_name || "Jogador",
          avatar: profile?.avatar || "🙂",
          ...stats,
          points: stats.wins * 100 + stats.draws * 30,
        };
      });

      if (active) {
        setRows(next);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [scope]);

  const visible = [...rows].sort((a, b) => {
    if (scope === "global") return b.points - a.points || b.wins - a.wins;
    return b.wins - a.wins || b.points - a.points;
  });

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-28">
      <PageHeader title="Ranking" subtitle="Resultados reais das partidas" />
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {(["global", "ludo", "checkers", "chess"] as Scope[]).map((item) => (
          <button key={item} onClick={() => setScope(item)} className={`h-10 shrink-0 rounded-2xl px-4 text-xs font-bold ${scope === item ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            {item === "global" ? "Global" : GAME_META[item].name}
          </button>
        ))}
      </div>

      <Card className="divide-y divide-border/70 p-0">
        {loading ? <p className="p-5 text-sm text-muted-foreground">A carregar ranking...</p> : null}
        {!loading && visible.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Ainda não existem resultados suficientes.</p> : null}
        {visible.map((row, index) => (
          <div key={row.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 font-display text-sm font-extrabold text-muted-foreground">{index + 1}</span>
            <span className="text-xl">{row.avatar}</span>
            <p className="flex-1 truncate text-sm font-semibold">{row.name}</p>
            <Pill tone={index === 0 ? "primary" : "muted"}>
              {scope === "global" ? `${row.points} pts` : `${row.wins}V`}
            </Pill>
          </div>
        ))}
      </Card>
    </main>
  );
}
