import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Check, CheckCircle2, Settings2 } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { markNotificationsRead, useApp } from "@/lib/store";
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

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-MZ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function NotificationsPage() {
  const app = useApp();
  const [pushState, setPushState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [testBusy, setTestBusy] = useState(false);

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

  const unread = useMemo(
    () => app.notifications.filter((notification) => !notification.read).length,
    [app.notifications],
  );

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
        setMessage("Notificações ativadas neste dispositivo.");
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "push_error";

      if (code === "push_permission_denied") {
        setPushState("blocked");
        setMessage("A permissão foi recusada. Ativa as notificações do MozaPlay nas definições do navegador/Android.");
      } else if (code === "notification_unavailable") {
        setMessage("As notificações não estão disponíveis neste navegador.");
      } else if (code === "push_not_configured") {
        setMessage("As notificações Push ainda não estão configuradas no servidor.");
      } else if (code === "push_subscription_save_failed") {
        setMessage("Não foi possível guardar a subscrição Push.");
      } else {
        setMessage("Não foi possível atualizar as notificações. Tenta novamente.");
        console.error("[Push]", error);
      }
      await refreshState();
    } finally {
      setBusy(false);
    }
  };

  const sendTestNotification = async () => {
    if (!app.profile.id) {
      setMessage("Entra na tua conta para testar as notificações.");
      return;
    }

    setTestBusy(true);
    setMessage("");

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.rpc("send_test_notification");
      if (error) throw error;
      setMessage("Aviso de teste criado. Ele aparece na lista abaixo e, com Push ativo, também no dispositivo.");
    } catch (error) {
      console.error("[Notifications] Teste:", error);
      setMessage("Não foi possível criar o aviso de teste.");
    } finally {
      setTestBusy(false);
    }
  };

  const title = pushState === "on" ? "Notificações ativadas" : "Notificações desativadas";
  const description =
    pushState === "on"
      ? "Os avisos reais da tua conta aparecem aqui e podem também chegar como Push."
      : "Ativa o Push para receber avisos mesmo fora da página.";

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-28 pt-5">
      <PageHeader
        title="Notificações"
        subtitle={unread > 0 ? `${unread} aviso(s) por ler` : "Todos os avisos estão lidos"}
      />

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
              Abre as definições do site no navegador, permite notificações e volta aqui.
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

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display font-extrabold">Avisos da conta</p>
            <p className="mt-1 text-xs text-muted-foreground">Notificações reais guardadas na tua conta.</p>
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void markNotificationsRead()}
              className="inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] font-extrabold text-primary"
            >
              <Check className="h-3.5 w-3.5" /> Marcar lidas
            </button>
          ) : null}
        </div>

        {app.notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
            <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-bold">Ainda não tens notificações</p>
            <p className="mt-1 text-xs text-muted-foreground">Quando houver um aviso real, ele aparecerá aqui.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {app.notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (!notification.read) void markNotificationsRead([notification.id]);
                }}
                className={`w-full rounded-2xl border p-3 text-left transition ${notification.read ? "border-border bg-background" : "border-primary/30 bg-primary/5"}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${notification.read ? "bg-secondary text-muted-foreground" : "bg-primary/15 text-primary"}`}>
                    <Bell className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-extrabold text-foreground">{notification.title}</span>
                      {!notification.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{notification.body}</span>
                    <span className="mt-2 block text-[10px] font-semibold text-muted-foreground">
                      {formatNotificationDate(notification.createdAt)}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3 border-primary/20">
        <div>
          <p className="font-display font-extrabold">Teste de notificações</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Cria um aviso real para a tua própria conta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sendTestNotification()}
          disabled={testBusy || !app.profile.id}
          className="w-full rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-extrabold text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testBusy ? "A enviar..." : "Enviar aviso de teste"}
        </button>
      </Card>
    </main>
  );
}
