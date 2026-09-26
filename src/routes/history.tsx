import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { supabase } from "@/integrations/supabase/client";

type MatchRow = {
  id: string;
  game_type: GameId;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  status: string;
  created_at: string;
  ended_at: string | null;
};

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "Histórico de partidas — MozaPlay" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        if (active) setLoading(false);
        return;
      }

      setCurrentUserId(user.user.id);\n\n      const { data, error } = await supabase
        .from("matches")
        .select("id, game_type, player1_id, player2_id, winner_id, status, created_at, ended_at")
        .or(`player1_id.eq.${user.user.id},player2_id.eq.${user.user.id}`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) console.error("[History]", error.message);
      if (active) {
        setRows((data as MatchRow[] | null) ?? []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <main className="mx-auto w-full max-w-md space-y-3 px-4 pb-28">
      <PageHeader title="Histórico" subtitle={`${rows.length} partidas reais registadas`} />
      {loading ? <Card className="text-sm text-muted-foreground">A carregar...</Card> : null}
      {!loading && rows.length === 0 ? <Card className="text-sm text-muted-foreground">Ainda não tens partidas registadas.</Card> : null}
      {rows.map((match) => {
        const result = match.winner_id === null ? "draw" : match.winner_id === currentUserId ? "win" : "loss";
        return (
          <Card key={match.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-bold">{GAME_META[match.game_type]?.name ?? match.game_type}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(match.created_at).toLocaleString("pt-PT")}
              </p>
            </div>
            <Pill tone={result === "win" ? "success" : result === "draw" ? "muted" : "danger"}>
              {result === "win" ? "Vitória" : result === "draw" ? "Empate" : "Derrota"}
            </Pill>
          </Card>
        );
      })}
    </main>
  );
}
