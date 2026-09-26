import { supabase } from "@/integrations/supabase/client";
import { getVapidPublicKey } from "@/lib/push.functions";

export async function registerPushServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

function toKey(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePushNotifications(userId: string) {
  if (!userId) throw new Error("auth_required");
  if (!("Notification" in window) || !("PushManager" in window)) throw new Error("push_unsupported");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("push_permission_denied");
  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) throw new Error("push_not_configured");
  const reg = (await registerPushServiceWorker()) ?? (await navigator.serviceWorker.ready);
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}

export async function disablePushNotifications(_userId: string) {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

export function subscribeToRealtimeNotifications(
  userId: string,
  onNotification?: (n: { id: string; title: string; body: string }) => void,
) {
  if (!userId) return () => {};
  const channel = supabase
    .channel(`user-notifications-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => onNotification?.(payload.new as { id: string; title: string; body: string }),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
