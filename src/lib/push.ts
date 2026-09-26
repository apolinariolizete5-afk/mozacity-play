import { supabase } from "@/integrations/supabase/client";

export function subscribeToRealtimeNotifications(
  userId: string,
  onNotification?: (notification: { id: string; title: string; body: string }) => void,
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
        const row = payload.new as { id: string; title: string; body: string };
        onNotification?.(row);

        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(row.title, {
            body: row.body,
            icon: "/icons/icon-192.png",
          });
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function requestBrowserNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return (await Notification.requestPermission()) === "granted";
}
