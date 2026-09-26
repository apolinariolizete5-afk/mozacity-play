import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, PageHeader, Pill } from "@/components/ui/primitives";
import { markNotificationsRead, useApp } from "@/lib/store";
import { enablePushNotifications, disablePushNotifications } from "@/lib/push";

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
  const [pushState, setPushState] = useState<"checking" | "off" | "on" | "unsupported">("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const id = setTimeout(markNotificationsRead, 1200);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let active = true;
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (active) setPushState(subscription ? "on" : "off");
    }).catch(() => {
      if (active) setPushState("off");
    });
    return () => { active = false; };
  }, []);

  const togglePush = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (pushState === "on") {
        await disablePushNotifications(app.profile.id);
        setPushState("off");
        setMessage("Notificações push desativadas.");
      } else {
        await enablePushNotifications(app.profile.id);
        setPushState("on");
        setMessage("Notificações push ativadas.");
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "push_error";
      setMessage(
        code === "push_permission_denied"
          ? "Permissão de notificações recusada no navegador."
          : code === "push_not_configured"
            ? "Push ainda não foi configurado no servidor."
            : "Não foi possível ativar as notificações push.",
      );
    } finally {
      setBusy(false);
    }
  };

  const sendTestPush = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          playerId: app.profile.id,
          title: "MozaPlay",
          message: "As notificações push estão a funcionar.",
          url: "/notifications",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "push_send_failed");
      setMessage(result.sent ? "Push de teste enviado." : "Este dispositivo ainda não está inscrito.");
    } catch (error) {
      setMessage(error instanceof Error && error.message === "push_not_configured"
        ? "Configure VAPID no Render para enviar push."
        : "Falha ao enviar o push de teste.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-3 px-4 pb-4">
      <PageHeader title="Notificações" subtitle="Convites, desafios e resultados" />
      <Card className="space-y-3">
        <div>
          <p className="text-sm font-bold">Notificações push</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Recebe avisos mesmo quando o MozaPlay estiver fechado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={togglePush}
            disabled={busy || pushState === "unsupported"}
            className="rounded-2xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Aguarda..." : pushState === "on" ? "Desativar push" : "Ativar push"}
          </button>
          {pushState === "on" && (
            <button
              onClick={sendTestPush}
              disabled={busy}
              className="rounded-2xl border border-border px-4 py-2.5 text-xs font-extrabold disabled:opacity-50"
            >
              Enviar teste
            </button>
          )}
        </div>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </Card>
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
