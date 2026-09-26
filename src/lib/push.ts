import {
  getPushConfig,
  removePushSubscription,
  savePushSubscription,
} from "./push.functions";

export async function registerPushServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function enablePushNotifications() {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    throw new Error("push_not_supported");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("push_permission_denied");
  }

  const config = await getPushConfig();
  if (!config.publicKey) {
    throw new Error("push_not_configured");
  }

  const registration =
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await registerPushServiceWorker());

  if (!registration) throw new Error("service_worker_not_ready");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
  }

  await savePushSubscription({
    data: { subscription: subscription.toJSON() },
  });

  return subscription;
}

export async function disablePushNotifications() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await removePushSubscription({
    data: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
