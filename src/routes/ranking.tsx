import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { supabase } from "@/integrations/supabase/client";

type Scope = "global" | GameId;
type Row = { id: string; name: string; avatar: string; wins: number; losses: number; draws: number; points: number };

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
      const { data: stats, error } = await supabase
        .from("stats")
        .select("user_id, wins, losses, draws")
        .order("wins", { ascending: false })
        .limit(100);

      if (error) {
        console.error("[Ranking]", error.message);
        if (active) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const ids = (stats ?? []).map((item) => item.user_id);
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
      const next = (stats ?? []).map((item) => {
        const profile = profileMap.get(item.user_id);
        const wins = Number(item.wins ?? 0);
        const losses = Number(item.losses ?? 0);
        const draws = Number(item.draws ?? 0);
        return {
          id: item.user_id,
          name: profile?.display_name || "Jogador",
          avatar: profile?.avatar || "🙂",
          wins,
          losses,
          draws,
          points: wins * 100 + draws * 30,
        };
      });

      if (active) {
        setRows(next);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const visible = [...rows].sort((a, b) => {
    if (scope === "global") return b.points - a.points;
    return b.wins - a.wins;
  });

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-28">
      <PageHeader title="Ranking" subtitle="Dados reais do Lovable Cloud" />
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
