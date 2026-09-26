import { supabase } from "@/integrations/supabase/client";

export type PushState = "on" | "off" | "unsupported" | "blocked";
const PREF_KEY = "mozaplay:notifications-enabled:v3";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
export const SERVICE_WORKER_PATH = "/sw.js";
export const NOTIFICATION_ICON_PATH = "/icons/notification-badge.svg";

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: "/" });
  } catch (error) {
    console.warn("[PWA] Não foi possível registar o service worker:", error);
    return null;
  }
}

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "Notification" in window
    && "PushManager" in window;
}

export async function getPushState(userId?: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (!userId) return "off";

  const pref = localStorage.getItem(PREF_KEY) === "1";
  if (!pref || Notification.permission !== "granted") return "off";

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? "on" : "off";
  } catch {
    return "off";
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function enablePushNotifications(userId: string) {
  if (!userId) throw new Error("auth_required");
  if (!pushSupported()) throw new Error("notification_unavailable");
  if (!VAPID_PUBLIC_KEY) throw new Error("push_not_configured");

  const permission = await Notification.requestPermission();
  if (permission === "denied") throw new Error("push_permission_denied");
  if (permission !== "granted") throw new Error("push_permission_dismissed");

  const reg = await registerAppServiceWorker();
  const ready = await navigator.serviceWorker.ready;

  let subscription = await ready.pushManager.getSubscription();
  if (!subscription) {
    subscription = await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("push_subscription_invalid");
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) {
    console.error("[Push] Não foi possível guardar a subscrição:", error);
    throw new Error("push_subscription_save_failed");
  }

  localStorage.setItem(PREF_KEY, "1");
  return { enabled: true, registration: reg, subscription };
}

export async function disablePushNotifications(userId: string) {
  if (!userId) throw new Error("auth_required");

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", endpoint);
      await subscription.unsubscribe();
    }
  } finally {
    if (typeof window !== "undefined") localStorage.removeItem(PREF_KEY);
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
              icon: NOTIFICATION_ICON_PATH,
              badge: NOTIFICATION_ICON_PATH,
              tag: "mozaplay-" + notification.id,
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
