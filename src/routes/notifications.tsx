import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Settings2 } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { useApp } from "@/lib/store";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushState,
  type PushState,
} from "@/lib/push";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notificações — MozaPlay" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const app = useApp();
  const [pushState, setPushState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshState = async () => {
    try {
      setPushState(await getPushState(app.profile.id || undefined));
    } catch {
      setPushState("off");
    }
  };

  useEffect(() => {
    void refreshState();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshState();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [app.profile.id]);

  const togglePush = async () => {
    if (!app.profile.id) {
      setMessage("Entra na tua conta para gerir as notificações.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (pushState === "on") {
        await disablePushNotifications(app.profile.id);
        setPushState("off");
        setMessage("Notificações desativadas neste dispositivo.");
      } else {
        await enablePushNotifications(app.profile.id);
        setPushState("on");
        setMessage("Notificações ativadas através do Lovable Cloud/Realtime.");
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "push_error";

      if (code === "push_permission_denied") {
        setPushState("blocked");
        setMessage("A permissão foi recusada. Ativa as notificações do MozaPlay nas definições do navegador/Android e tenta novamente.");
      } else if (code === "notification_unavailable") {
        setMessage("As notificações do Lovable Cloud ainda não estão disponíveis neste navegador.");
      } else if (code === "push_invalid_subscription") {
        setMessage("A subscrição do dispositivo ficou inválida. Tenta desativar e ativar novamente.");
      } else {
        setMessage("Não foi possível atualizar as notificações. Tenta novamente.");
        console.error("[Push]", error);
      }
      await refreshState();
    } finally {
      setBusy(false);
    }
  };

  const title =
    pushState === "on"
      ? "Notificações ativadas"
      : pushState === "blocked"
        ? "Notificações indisponíveis"
        : pushState === "unsupported"
          ? "Push indisponível"
          : "Notificações desativadas";

  const description =
    pushState === "on"
      ? "Os avisos reais da tua conta aparecem em tempo real através do Lovable Cloud."
      : pushState === "blocked"
        ? "A permissão foi bloqueada pelo navegador. Altera a permissão nas definições do site."
        : pushState === "unsupported"
          ? "As notificações do Lovable Cloud funcionam através do Realtime."
          : "Ativa para mostrar os avisos reais da tua conta dentro do MozaPlay.";

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-28 pt-5">
      <PageHeader title="Notificações" subtitle="Controla os avisos no teu dispositivo" />

      <Card className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            {pushState === "on" ? <Bell className="h-6 w-6" /> : <BellOff className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <p className="font-display font-extrabold">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void togglePush()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Aguarda..." : pushState === "on" ? "Desativar notificações" : "Ativar notificações"}
        </button>

        {pushState === "blocked" && (
          <div className="flex gap-3 rounded-2xl border border-border bg-secondary/60 p-3">
            <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-5 text-muted-foreground">
              Se recusaste a permissão, abre as definições do site no navegador, permite notificações e volta aqui.
            </p>
          </div>
        )}

        {message && (
          <p className="flex items-start gap-2 text-xs font-semibold text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{message}</span>
          </p>
        )}
      </Card>

      <Card className="space-y-2 text-xs text-muted-foreground">
        <p className="font-bold text-foreground">Como funciona</p>
        <p>• Ao ativar, o MozaPlay mostra eventos reais em tempo real.</p>
        <p>• Ao desativar, os avisos em tempo real ficam ocultos neste dispositivo.</p>
        <p>• Só serão enviados avisos quando existir um evento real da tua conta ou partida.</p>
      </Card>
    </main>
  );
}
