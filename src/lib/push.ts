import { supabase } from "@/integrations/supabase/client";

export async function registerPushServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function enablePushNotifications(playerId?: string) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) throw new Error("push_not_supported");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("push_permission_denied");

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("push_not_configured");

  const registration =
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await registerPushServiceWorker());
  if (!registration) throw new Error("service_worker_not_ready");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const userId = playerId || (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("auth_required");

  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      expiration_time: json.expirationTime ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);

  return subscription;
}

export async function disablePushNotifications(playerId?: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const userId = playerId || (await supabase.auth.getUser()).data.user?.id;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  if (userId && subscription?.endpoint) {
    await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", subscription.endpoint);
  }

  if (subscription) await subscription.unsubscribe();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
