import { supabase } from "@/integrations/supabase/client";

export type PushState = "on" | "off" | "unsupported" | "blocked";
const PREF_KEY = "mozaplay:notifications-enabled:v2";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window;
}

export async function getPushState(_userId?: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const pref = localStorage.getItem(PREF_KEY) === "1";
  return pref && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePushNotifications(userId: string) {
  if (!userId) throw new Error("auth_required");
  if (!pushSupported()) throw new Error("notification_unavailable");

  const permission = await Notification.requestPermission();
  if (permission === "denied") throw new Error("push_permission_denied");
  if (permission !== "granted") throw new Error("push_permission_dismissed");

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    localStorage.setItem(PREF_KEY, "1");
    return { enabled: true, registration: reg };
  } catch (err) {
    console.warn("[Push] Registo de Service Worker falhou, fallback activo:", err);
    localStorage.setItem(PREF_KEY, "1");
    return { enabled: true };
  }
}

export async function disablePushNotifications(_userId: string) {
  if (typeof window !== "undefined") {
    localStorage.removeItem(PREF_KEY);
  }
}

export function notificationsEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(PREF_KEY) === "1";
}

export function subscribeToRealtimeNotifications(
  userId: string,
  onNotification?: (n: { id: string; title: string; body: string; url?: string }) => void,
) {
  if (!userId) return () => {};
  const channel = supabase
    .channel("user-notifications-" + userId, { config: { broadcast: { self: false } } })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: "user_id=eq." + userId,
      },
      (payload) => {
        const notification = payload.new as { id: string; title: string; body: string; url?: string };
        onNotification?.(notification);

        if (notificationsEnabled() && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(notification.title, {
              body: notification.body,
              icon: "/apple-touch-icon.png",
            });
          } catch (e) {
            console.debug("[Notification] Visualização nativa indisponível:", e);
          }
        }
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[Notifications] Realtime status:", status);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}