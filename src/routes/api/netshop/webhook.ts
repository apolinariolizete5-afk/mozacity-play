import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookSignature } from "@/lib/payments/netshop.server";

type JsonRecord = Record<string, unknown>;

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function findValue(
  payload: JsonRecord,
  key: string,
): unknown {
  const data = payload.data;
  const transaction = payload.transaction;
  const charge = payload.charge;

  if (typeof payload[key] !== "undefined") {
    return payload[key];
  }

  for (const candidate of [
    data,
    transaction,
    charge,
  ]) {
    if (
      candidate &&
      typeof candidate === "object" &&
      key in candidate
    ) {
      return (candidate as JsonRecord)[key];
    }
  }

  return undefined;
}

function normalizeStatus(
  value: unknown,
): "completed" | "failed" | "pending" {
  const status = String(
    value ?? "pending",
  ).toLowerCase();

  if (
    [
      "success",
      "succeeded",
      "completed",
      "paid",
    ].includes(status)
  ) {
    return "completed";
  }

  if (
    [
      "failed",
      "error",
      "cancelled",
      "canceled",
      "declined",
      "rejected",
    ].includes(status)
  ) {
    return "failed";
  }

  return "pending";
}

export const Route = createFileRoute(
  "/api/netshop/webhook",
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const signature =
          request.headers.get(
            "x-netshop-signature",
          ) ??
          request.headers.get(
            "x-webhook-signature",
          ) ??
          request.headers.get("x-signature");

        if (
          !verifyWebhookSignature(
            rawBody,
            signature,
          )
        ) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "invalid_signature",
            }),
            {
              status: 401,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        }

        let payload: JsonRecord;

        try {
          const parsed = JSON.parse(rawBody);

          if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
          ) {
            throw new Error("invalid_payload");
          }

          payload = parsed as JsonRecord;
        } catch {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "invalid_json",
            }),
            {
              status: 400,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        }

        const idempotencyKey = firstString(
          findValue(
            payload,
            "idempotency_key",
          ),
          findValue(
            payload,
            "reference",
          ),
        );

        const providerRef = firstString(
          findValue(
            payload,
            "transaction_id",
          ),
          findValue(payload, "id"),
        );

        const status = normalizeStatus(
          findValue(payload, "status"),
        );

        if (!idempotencyKey) {
          return new Response(
            JSON.stringify({
              ok: false,
              error:
                "transaction_reference_missing",
            }),
            {
              status: 400,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        }

        const rpcToken =
          process.env.WALLET_RPC_TOKEN;

        if (!rpcToken) {
          console.error(
            "[NetShop webhook] WALLET_RPC_TOKEN is not configured",
          );

          return new Response(
            JSON.stringify({
              ok: false,
              error: "server_not_configured",
            }),
            {
              status: 503,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        }

        try {
          const {
            supabaseAdmin,
          } = await import(
            "@/integrations/supabase/client.server"
          );

          const {
            data,
            error,
          } =
            await supabaseAdmin.rpc(
              "settle_deposit",
              {
                _idempotency_key:
                  idempotencyKey,
                _status: status,
                _provider_ref:
                  providerRef ?? null,
                _token: rpcToken,
              },
            );

          if (error) {
            console.error(
              "[NetShop webhook] settlement failed:",
              error.message,
            );

            return new Response(
              JSON.stringify({
                ok: false,
                error: "settlement_failed",
              }),
              {
                status: 500,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            );
          }

          return new Response(
            JSON.stringify({
              ok: true,
              result: data ?? null,
            }),
            {
              status: 200,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        } catch (error) {
          console.error(
            "[NetShop webhook] internal error:",
            error instanceof Error
              ? error.message
              : error,
          );

          return new Response(
            JSON.stringify({
              ok: false,
              error: "internal_error",
            }),
            {
              status: 500,
              headers: {
                "content-type":
                  "application/json",
              },
            },
          );
        }
      },
    },
  },
});
