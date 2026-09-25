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
          findValue(payload, "provider_ref"),
          findValue(payload, "provider_id"),
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

        try {
          const { paymentDatabase } = await import("@/lib/payments/database.server");
          const sql = paymentDatabase();

          const result = await sql.begin(async (tx) => {
            const rows = await tx`
              select id, user_id, amount_cents, status
              from public.transactions
              where idempotency_key = ${idempotencyKey}
              for update
            `;
            const transaction = rows[0] as {
              id: string;
              user_id: string;
              amount_cents: number;
              status: string;
            } | undefined;

            if (!transaction) throw new Error("unknown_transaction");
            if (transaction.status !== "pending") return "already_settled";

            await tx`
              update public.transactions
              set status = ${status}::public.tx_status,
                  provider_ref = coalesce(${providerRef ?? null}, provider_ref)
              where id = ${transaction.id}
            `;

            if (status === "completed") {
              await tx`
                insert into public.wallets (user_id)
                values (${transaction.user_id})
                on conflict (user_id) do nothing
              `;
              await tx`
                update public.wallets
                set balance_cents = balance_cents + ${transaction.amount_cents},
                    updated_at = now()
                where user_id = ${transaction.user_id}
              `;
            }
            return "settled";
          });

          return new Response(JSON.stringify({ ok: true, result }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
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
