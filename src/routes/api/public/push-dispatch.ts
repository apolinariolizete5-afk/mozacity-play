import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function run(request: Request) {
  const token = process.env["WALLET_RPC_TOKEN"];
  const pub = process.env["VAPID_PUBLIC_KEY"];
  const priv = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] || "mailto:suporte@mozaplay.co.mz";
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_ANON_KEY"];
  if (!token || !pub || !priv || !url || !key) return json({ error: "push_not_configured" }, 503);

  const auth = request.headers.get("authorization") ?? "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : new URL(request.url).searchParams.get("token");
  if (supplied !== token) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("claim_push_batch", { _token: token });
  if (error) return json({ error: error.message }, 500);

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(subject, pub, priv);

  let sent = 0;
  let dropped = 0;
  for (const row of (data ?? []) as Array<{ title: string; body: string; url: string; endpoint: string; p256dh: string; auth: string; notification_id: string }>) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: "mozaplay-" + row.notification_id }),
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await supabase.rpc("drop_push_subscription", { _token: token, _endpoint: row.endpoint });
        dropped++;
      }
    }
  }
  return json({ ok: true, sent, dropped });
}

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
