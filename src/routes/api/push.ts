import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";

type Subscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

const subscriptions = new Map<string, Subscription>();

function configured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function setup() {
  if (!configured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/push")({
  server: {
    handlers: {
      GET: async () => json({
        configured: configured(),
        publicKey: process.env.VAPID_PUBLIC_KEY || "",
      }),

      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const action = String(body?.action ?? "");

        if (action === "subscribe") {
          if (!configured()) return json({ error: "push_not_configured" }, 503);
          const playerId = String(body?.playerId ?? "").trim();
          const subscription = body?.subscription as Subscription | undefined;
          if (!playerId || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            return json({ error: "invalid_subscription" }, 400);
          }
          subscriptions.set(playerId, subscription);
          return json({ ok: true });
        }

        if (action === "unsubscribe") {
          const playerId = String(body?.playerId ?? "").trim();
          if (playerId) subscriptions.delete(playerId);
          return json({ ok: true });
        }

        if (action === "send") {
          if (!setup()) return json({ error: "push_not_configured" }, 503);
          const playerId = String(body?.playerId ?? "").trim();
          const subscription = subscriptions.get(playerId);
          if (!subscription) return json({ sent: false, reason: "not_subscribed" });
          const payload = JSON.stringify({
            title: String(body?.title || "MozaPlay"),
            body: String(body?.message || "Tens uma nova notificação."),
            url: String(body?.url || "/"),
          });
          try {
            await webpush.sendNotification(subscription, payload);
            return json({ sent: true });
          } catch (error: any) {
            const status = Number(error?.statusCode);
            if (status === 404 || status === 410) subscriptions.delete(playerId);
            return json({ sent: false, reason: "delivery_failed" }, status === 404 || status === 410 ? 410 : 502);
          }
        }

        return json({ error: "invalid_action" }, 400);
      },
    },
  },
});
