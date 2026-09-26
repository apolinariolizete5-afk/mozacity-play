import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { supabase } from "@/integrations/supabase/client";
import { verifyWebhookSignature } from "@/lib/payments/netshop.server";

export const APIRoute = createAPIFileRoute("/api/webhooks/netshop")({
  POST: async ({ request }) => {
    try {
      const signature = request.headers.get("x-netshop-signature") ?? "";
      const rawBody = await request.text();

      const secret = process.env.NETSHOP_WEBHOOK_SECRET;
      if (secret && !verifyWebhookSignature(rawBody, signature)) {
        return json({ error: "Assinatura inválida" }, { status: 401 });
      }

      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      const reference = String(payload.reference ?? payload.idempotency_key ?? "");
      const status = String(payload.status ?? "").toLowerCase();

      if (!reference) {
        return json({ error: "Referência ausente" }, { status: 400 });
      }

      if (["success", "completed", "paid"].includes(status)) {
        const { error } = await supabase.rpc("complete_deposit", {
          _idempotency_key: reference,
          _provider_ref: String(payload.transaction_id ?? payload.id ?? ""),
        });

        if (error) {
          console.error("[NetShop Webhook] Erro ao creditar:", error.message);
          return json({ error: error.message }, { status: 500 });
        }
      }

      return json({ received: true });
    } catch (error) {
      console.error("[NetShop Webhook] Falha interna:", error);
      return json({ error: "Erro interno no processamento" }, { status: 500 });
    }
  },
});
