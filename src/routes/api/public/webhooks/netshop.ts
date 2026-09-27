import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifyWebhookSignature } from "@/lib/payments/netshop.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/webhooks/netshop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["WALLET_RPC_TOKEN"];
        if (!process.env["NETSHOP_WEBHOOK_SECRET"] || !token) return json({ error: "webhook_not_configured" }, 503);
        const raw = await request.text();
        if (!verifyWebhookSignature(raw, request.headers.get("x-netshop-signature"))) {
          return json({ error: "invalid_signature" }, 401);
        }
        let p: Record<string, unknown>;
        try {
          p = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const reference = String(p["reference"] ?? p["idempotency_key"] ?? "").trim();
        const status = String(p["status"] ?? "").toLowerCase();
        const providerRef = String(p["transaction_id"] ?? p["provider_ref"] ?? p["transactionID"] ?? p["id"] ?? "").trim();
        const type = String(p["type"] ?? p["event_type"] ?? "").toLowerCase();
        if (!reference) return json({ error: "missing_reference" }, 400);

        const ok = ["success", "completed", "paid", "succeeded"].includes(status);
        const failed = ["failed", "cancelled", "canceled", "rejected", "error"].includes(status);
        if (!ok && !failed) return json({ received: true });

        const isPayout =
          type === "disbursement" ||
          type === "payout" ||
          p["is_payout"] === true ||
          p["object"] === "disbursement";

        if (isPayout) {
          const { error } = await supabase.rpc("process_netshop_payout_webhook", {
            _token: token,
            _payout_id: reference,
            _status: status,
            _provider_ref: providerRef,
            _reason: String(p["reason"] ?? p["message"] ?? "provider_rejected"),
          });
          if (error) return json({ error: "payout_settlement_failed" }, 500);
          return json({ received: true, type: "payout" });
        }

        const { error } = await supabase.rpc("settle_deposit", {
          _idempotency_key: reference,
          _status: ok ? "completed" : "failed",
          _provider_ref: providerRef,
          _token: token,
        });
        if (error) return json({ error: "settle_failed" }, 500);
        return json({ received: true, type: "deposit" });
      },
    },
  },
});
