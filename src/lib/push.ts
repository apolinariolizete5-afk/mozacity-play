import { supabase } from "@/integrations/supabase/client";

export type PushState = "on" | "off";
const PREF_KEY = "mozaplay:notifications-enabled:v2";

export function pushSupported(): boolean { return typeof window !== "undefined"; }

export async function getPushState(_userId?: string): Promise<PushState> {
  return typeof window !== "undefined" && localStorage.getItem(PREF_KEY) === "1" ? "on" : "off";
}

export async function enablePushNotifications(userId: string) {
  if (!userId) throw new Error("auth_required");
  localStorage.setItem(PREF_KEY, "1");
  return { enabled: true };
}

export async function disablePushNotifications(_userId: string) {
  if (typeof window !== "undefined") localStorage.removeItem(PREF_KEY);
}

export function notificationsEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(PREF_KEY) === "1";
}

/** Notificações em tempo real do Lovable Cloud/Supabase Realtime. */
export function subscribeToRealtimeNotifications(
  userId: string,
  onNotification?: (n: { id: string; title: string; body: string; url?: string }) => void,
) {
  if (!userId) return () => {};
  const channel = supabase
    .channel("user-notifications-" + userId, { config: { broadcast: { self: false } } })
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + userId,
    }, (payload) => {
      const notification = payload.new as { id: string; title: string; body: string; url?: string };
      onNotification?.(notification);
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[Notifications] Realtime unavailable:", status);
    });
  return () => { void supabase.removeChannel(channel); };
}