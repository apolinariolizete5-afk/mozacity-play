import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { useApp } from "@/lib/store";
import { enablePushNotifications, disablePushNotifications } from "@/lib/push";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notificações — MozaPlay" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const app = useApp();
  const [pushState, setPushState] = useState<"checking" | "off" | "on" | "unsupported">("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      setPushState(subscription ? "on" : "off");
    }).catch(() => setPushState("off"));
  }, []);

  const togglePush = async () => {
    if (!app.profile.id) {
      setMessage("Entra na tua conta para ativar notificações.");
      return;
    }
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
          ? "Permissão de notificações recusada."
          : code === "push_not_configured"
            ? "Push ainda não foi configurado no backend."
            : "Não foi possível ativar as notificações push.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-3 px-4 pb-28">
      <PageHeader title="Notificações" subtitle="Avisos reais da plataforma" />
      <Card className="space-y-4">
        <div>
          <p className="text-sm font-bold">Notificações push</p>
          <p className="mt-1 text-xs text-muted-foreground">O Service Worker está preparado para receber notificações enviadas pelo backend.</p>
        </div>
        <button
          onClick={() => void togglePush()}
          disabled={busy || pushState === "unsupported"}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Aguarda..." : pushState === "on" ? "Desativar push" : "Ativar push"}
        </button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </Card>
      <Card className="text-sm text-muted-foreground">
        As notificações desta área aparecem apenas quando forem geradas por eventos reais da tua conta ou partida. Não são criados avisos fictícios.
      </Card>
    </main>
  );
}
