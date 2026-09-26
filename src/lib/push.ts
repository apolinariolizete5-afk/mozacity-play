import { supabase } from "@/integrations/supabase/client";
import { getVapidPublicKey } from "@/lib/push.functions";

export type PushState = "on" | "off" | "blocked" | "unsupported";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await registration.update().catch(() => undefined);
  return registration;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return registerPushServiceWorker();
}

function toApplicationServerKey(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(normalized + pad);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function saveSubscription(userId: string, subscription: PushSubscription) {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("push_invalid_subscription");
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) throw new Error(error.message);
}

export async function getPushState(userId?: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";

  const registration = await getPushRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) return "off";

  if (userId) {
    const endpoint = subscription.endpoint;
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint")
      .eq("user_id", userId)
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (error) {
      console.warn("[Push] Could not verify stored subscription:", error.message);
      return "on";
    }

    if (!data) {
      try {
        await saveSubscription(userId, subscription);
      } catch (error) {
        console.warn("[Push] Could not repair stored subscription:", error);
      }
    }
  }

  return "on";
}

export async function enablePushNotifications(userId: string) {
  if (!userId) throw new Error("auth_required");
  if (!pushSupported()) throw new Error("push_unsupported");
  if (Notification.permission === "denied") throw new Error("push_permission_denied");

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") throw new Error("push_permission_denied");

  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) throw new Error("push_not_configured");

  const registration = await getPushRegistration();
  if (!registration) throw new Error("push_unsupported");

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toApplicationServerKey(publicKey),
    }));

  await saveSubscription(userId, subscription);
  return subscription;
}

export async function disablePushNotifications(_userId: string) {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) throw new Error(error.message);

  const unsubscribed = await subscription.unsubscribe();
  if (!unsubscribed) throw new Error("push_unsubscribe_failed");
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
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onNotification?.(payload.new as { id: string; title: string; body: string }),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
