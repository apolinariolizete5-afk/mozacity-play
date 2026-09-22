import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META } from "@/lib/games/types";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Histórico de partidas — MozaPlay" },
      { name: "description", content: "Detalhe de todas as partidas jogadas, resultados e moedas." },
      { property: "og:title", content: "Histórico de partidas — MozaPlay" },
      { property: "og:description", content: "Revê os teus resultados partida a partida." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const app = useApp();
  return (
    <main className="mx-auto w-full max-w-md space-y-3 px-4 pb-4">
      <PageHeader title="Histórico" subtitle={`${app.matches.length} partidas registadas`} />
      {app.matches.length === 0 ? (
        <Card className="text-sm text-muted-foreground">Ainda não jogaste nenhuma partida.</Card>
      ) : (
        app.matches.map((m) => (
          <Card key={m.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-bold">{GAME_META[m.game].name}</p>
              <p className="text-[11px] text-muted-foreground">
                vs {m.opponents.join(", ") || "bot"} · aposta {m.bet} · {" "}
                {new Date(m.createdAt).toLocaleString("pt-PT")}
              </p>
            </div>
            <div className="text-right">
              <Pill tone={m.result === "win" ? "success" : m.result === "draw" ? "muted" : "danger"}>
                {m.result === "win" ? "Vitória" : m.result === "draw" ? "Empate" : "Derrota"}
              </Pill>
              <p className="mt-1 text-[11px] text-muted-foreground">+{m.coins} moedas</p>
            </div>
          </Card>
        ))
      )}
    </main>
  );
}
