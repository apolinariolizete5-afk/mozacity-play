import { supabase } from "@/integrations/supabase/client";

export type PushState = "on" | "off" | "blocked" | "unsupported";

const PREF_KEY = "mozaplay:notifications-enabled:v1";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function getPushState(_userId?: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return localStorage.getItem(PREF_KEY) === "1" && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePushNotifications(userId: string) {
  if (!userId) throw new Error("auth_required");
  if (!pushSupported()) throw new Error("push_unsupported");
  if (Notification.permission === "denied") throw new Error("push_permission_denied");

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  if (permission !== "granted") throw new Error("push_permission_denied");

  localStorage.setItem(PREF_KEY, "1");
  return { enabled: true };
}

export async function disablePushNotifications(_userId: string) {
  if (typeof window !== "undefined") localStorage.removeItem(PREF_KEY);
}

export function notificationsEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(PREF_KEY) === "1";
}

/** Lovable Cloud/Supabase Realtime notification stream. */
export function subscribeToRealtimeNotifications(
  userId: string,
  onNotification?: (n: { id: string; title: string; body: string; url?: string }) => void,
) {
  if (!userId) return () => {};

  const channel = supabase
    .channel(`user-notifications-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const notification = payload.new as {
          id: string;
          title: string;
          body: string;
          url?: string;
        };

        if (notificationsEnabled() && pushSupported() && Notification.permission === "granted") {
          try {
            new Notification(notification.title, {
              body: notification.body,
              icon: "/icons/icon-192.png",
              tag: notification.id,
            });
          } catch {
            // The Realtime event remains available even when browser notifications are unavailable.
          }
        }

        onNotification?.(notification);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
