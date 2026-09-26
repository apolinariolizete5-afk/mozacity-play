import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { supabase } from "@/integrations/supabase/client";
import { verifyWebhookSignature } from "@/lib/payments/netshop.server";

export const APIRoute = createAPIFileRoute("/api/webhooks/netshop")({
  POST: async ({ request }) => {
    try {
      const signature = request.headers.get("x-netshop-signature");
      const rawBody = await request.text();

      // A webhook that can credit real money must fail closed if its signing
      // secret is not configured. Never accept an unsigned production webhook.
      if (!process.env.NETSHOP_WEBHOOK_SECRET) {
        console.error("[NetShop Webhook] NETSHOP_WEBHOOK_SECRET não configurado.");
        return json(
          { error: "webhook_not_configured" },
          { status: 503 },
        );
      }

      if (!verifyWebhookSignature(rawBody, signature)) {
        return json({ error: "Assinatura inválida" }, { status: 401 });
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return json({ error: "JSON inválido" }, { status: 400 });
      }

      const reference = String(
        payload.reference ??
          payload.idempotency_key ??
          "",
      ).trim();

      const status = String(payload.status ?? "").trim().toLowerCase();

      if (!reference) {
        return json({ error: "Referência ausente" }, { status: 400 });
      }

      if (["success", "completed", "paid", "succeeded"].includes(status)) {
        const providerRef = String(
          payload.transaction_id ??
            payload.provider_ref ??
            payload.id ??
            "",
        ).trim();

        if (!providerRef) {
          return json(
            { error: "Referência do provedor ausente" },
            { status: 400 },
          );
        }

        const { error } = await supabase.rpc("complete_deposit", {
          _idempotency_key: reference,
          _provider_ref: providerRef,
        });

        if (error) {
          console.error(
            "[NetShop Webhook] Erro ao completar depósito:",
            error.message,
          );
          return json(
            { error: "deposit_completion_failed" },
            { status: 500 },
          );
        }
      }

      // Non-success events are acknowledged after signature validation. The
      // database remains the authority for the final wallet state.
      return json({ received: true });
    } catch (error) {
      console.error("[NetShop Webhook] Falha interna:", error);
      return json({ error: "Erro interno no processamento" }, { status: 500 });
    }
  },
});
