import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { supabase } from "@/integrations/supabase/client";
import { verifyPaycoWebhookSignature } from "@/lib/payments/payco.server";

export const APIRoute = createAPIFileRoute("/api/webhooks/payco")({
  POST: async ({ request }) => {
    try {
      const rawBody = await request.text();

      if (!process.env.PAYCO_WEBHOOK_SECRET) {
        console.error("[PAY.CO.MZ Webhook] PAYCO_WEBHOOK_SECRET não configurado.");
        return json({ error: "webhook_not_configured" }, { status: 503 });
      }

      const signature = request.headers.get("x-pay-signature");
      if (!verifyPaycoWebhookSignature(rawBody, signature)) {
        return json({ error: "invalid_signature" }, { status: 401 });
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return json({ error: "invalid_json" }, { status: 400 });
      }

      const event = String(
        payload.event ?? request.headers.get("x-pay-event") ?? "",
      ).trim().toLowerCase();

      const data =
        payload.data && typeof payload.data === "object"
          ? (payload.data as Record<string, unknown>)
          : {};

      const reference = String(
        data.reference ??
          data.transaction_reference ??
          payload.reference ??
          data.id ??
          "",
      ).trim();

      if (!reference) {
        return json({ error: "reference_missing" }, { status: 400 });
      }

      const providerRef = String(
        data.provider_transaction_id ??
          data.transaction_reference ??
          data.id ??
          "",
      ).trim();

      if (event === "payment.succeeded") {
        if (!providerRef) return json({ error: "provider_reference_missing" }, { status: 400 });
        const { error } = await supabase.rpc("complete_deposit", {
          _idempotency_key: reference,
          _provider_ref: providerRef,
        });
        if (error) {
          console.error("[PAY.CO.MZ Webhook] Erro ao completar depósito:", error.message);
          return json({ error: "deposit_completion_failed" }, { status: 500 });
        }
      } else if (event === "payment.failed") {
        const { error } = await supabase.rpc("cancel_failed_deposit", {
          _idempotency_key: reference,
        });
        if (error) {
          console.error("[PAY.CO.MZ Webhook] Erro ao cancelar depósito:", error.message);
          return json({ error: "deposit_cancellation_failed" }, { status: 500 });
        }
      } else if (event === "payout.paid" || event === "payout.failed") {
        const payoutStatus = event === "payout.paid" ? "paid" : "failed";
        const { error } = await supabase.rpc("process_payco_payout_webhook", {
          _reference: reference,
          _status: payoutStatus,
          _provider_ref: providerRef || reference,
          _reason: typeof data.error === "string" ? data.error : typeof data.reason === "string" ? data.reason : null,
        });
        if (error) {
          console.error("[PAY.CO.MZ Webhook] Erro ao liquidar levantamento:", error.message);
          return json({ error: "payout_processing_failed" }, { status: 500 });
        }
      }

      return json({ received: true });
    } catch (error) {
      console.error("[PAY.CO.MZ Webhook] Falha interna:", error);
      return json({ error: "internal_error" }, { status: 500 });
    }
  },
});
