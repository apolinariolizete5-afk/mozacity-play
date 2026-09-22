import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Card, PageHeader, Pill } from "@/components/ui/primitives";
import { markNotificationsRead, useApp } from "@/lib/store";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notificações — MozaPlay" },
      { name: "description", content: "Convites de partida, desafios e resultados de jogo." },
      { property: "og:title", content: "Notificações — MozaPlay" },
      { property: "og:description", content: "Convites, desafios e fim de jogo num só lugar." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const app = useApp();
  useEffect(() => {
    const id = setTimeout(markNotificationsRead, 1200);
    return () => clearTimeout(id);
  }, []);

  return (
    <main className="mx-auto w-full max-w-md space-y-3 px-4 pb-4">
      <PageHeader title="Notificações" subtitle="Convites, desafios e resultados" />
      {app.notifications.map((n) => (
        <Card key={n.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">{n.title}</p>
            <Pill tone={n.read ? "muted" : "primary"}>{n.kind}</Pill>
          </div>
          <p className="text-xs text-muted-foreground">{n.body}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(n.createdAt).toLocaleString("pt-PT")}
          </p>
        </Card>
      ))}
    </main>
  );
}
