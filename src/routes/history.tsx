import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { formatMzn } from "@/lib/money";
import { supabase } from "@/integrations/supabase/client";

type MatchResultRow = {
  id: string;
  game: string;
  result: string;
  bet_cents: number;
  payout_cents: number;
  opponents: unknown;
  created_at: string;
};

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "Histórico de partidas — MozaPlay" }] }),
  component: HistoryPage,
});

function opponentNames(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) return String((item as { name?: unknown }).name ?? "");
      return "";
    })
    .filter(Boolean)
    .join(", ");
}

function HistoryPage() {
  const [rows, setRows] = useState<MatchResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        if (active) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("match_results")
        .select("id, game, result, bet_cents, payout_cents, opponents, created_at")
        .eq("user_id", user.user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) console.error("[History]", error.message);
      if (active) {
        setRows((data as MatchResultRow[] | null) ?? []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <main className="mx-auto w-full max-w-md space-y-3 px-4 pb-28">
      <PageHeader title="Histórico" subtitle={`${rows.length} resultados reais registados`} />
      {loading ? <Card className="text-sm text-muted-foreground">A carregar...</Card> : null}
      {!loading && rows.length === 0 ? <Card className="text-sm text-muted-foreground">Ainda não tens partidas registadas.</Card> : null}
      {rows.map((match) => {
        const result = match.result.toLowerCase();
        const resultLabel = result === "win" ? "Vitória" : result === "draw" ? "Empate" : "Derrota";
        const tone = result === "win" ? "success" : result === "draw" ? "muted" : "danger";
        const game = match.game as GameId;
        return (
          <Card key={match.id} className="space-y-2 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">{GAME_META[game]?.name ?? match.game}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(match.created_at).toLocaleString("pt-PT")}
                </p>
              </div>
              <Pill tone={tone as "success" | "muted" | "danger"}>{resultLabel}</Pill>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Aposta: {formatMzn(Number(match.bet_cents ?? 0))}</span>
              <span>Prémio: {formatMzn(Number(match.payout_cents ?? 0))}</span>
            </div>
            {opponentNames(match.opponents) ? (
              <p className="text-[11px] text-muted-foreground">Adversário: {opponentNames(match.opponents)}</p>
            ) : null}
          </Card>
        );
      })}
    </main>
  );
}
