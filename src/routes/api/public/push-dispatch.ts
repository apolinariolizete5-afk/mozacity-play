import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/** Scheduled endpoint: sends pending notifications + inactivity/idle-balance reminders as web push. */
export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["WALLET_RPC_TOKEN"];
        const cron = process.env["LOVABLE_CRON_SECRET"];
        const auth = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token || !auth || (auth !== token && auth !== cron)) return new Response("Unauthorized", { status: 401 });
        const pub = process.env["VAPID_PUBLIC_KEY"];
        const priv = process.env["VAPID_PRIVATE_KEY"];
        if (!pub || !priv) return new Response("push_not_configured", { status: 503 });
        const webpush = (await import("web-push")).default;
        webpush.setVapidDetails(process.env["VAPID_SUBJECT"] ?? "mailto:suporte@mozaplay.co.mz", pub, priv);
        const { data, error } = await supabase.rpc("claim_push_batch", { _token: token });
        if (error) return new Response(error.message, { status: 500 });
        let sent = 0;
        for (const row of data ?? []) {
          try {
            await webpush.sendNotification(
              { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
              JSON.stringify({ title: row.title, body: row.body, url: row.url, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" }),
            );
            sent++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) {
              await supabase.rpc("drop_push_subscription", { _token: token, _endpoint: row.endpoint });
            }
          }
        }
        return Response.json({ sent });
      },
    },
  },
});
