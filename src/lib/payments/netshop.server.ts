/**
 * Integração Netshop (server-only).
 *
 * A API real da Netshop é configurada por variáveis de ambiente. Enquanto as
 * credenciais não existirem, o serviço reporta `configured: false` e a app
 * mantém-se em modo de teste (nenhum dinheiro real é movido).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type Method = "mpesa" | "mola" | "mcash" | "bank";

export interface NetshopResult {
  ok: boolean;
  providerRef?: string;
  status: "pending" | "completed" | "failed";
  error?: string;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function walletIdFor(method: Method): string | undefined {
  const map: Record<Method, string> = {
    mpesa: "NETSHOP_WALLET_ID_MPESA",
    mola: "NETSHOP_WALLET_ID_MOLA",
    mcash: "NETSHOP_WALLET_ID_MCASH",
    bank: "NETSHOP_WALLET_ID_BANK",
  };
  return env(map[method]);
}

export function netshopStatus() {
  const configured = Boolean(env("NETSHOP_API_URL") && env("NETSHOP_API_KEY"));
  return {
    configured,
    methods: {
      mpesa: Boolean(walletIdFor("mpesa")),
      mola: Boolean(walletIdFor("mola")),
      mcash: Boolean(walletIdFor("mcash")),
      bank: Boolean(walletIdFor("bank")),
    },
  };
}

async function call(path: string, body: unknown): Promise<NetshopResult> {
  const base = env("NETSHOP_API_URL");
  const key = env("NETSHOP_API_KEY");
  if (!base || !key) {
    return { ok: false, status: "failed", error: "provider_not_configured" };
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "x-api-key": key,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: "failed",
        error: String(payload["message"] ?? payload["error"] ?? `HTTP ${res.status}`),
      };
    }
    const providerRef = String(
      payload["transaction_id"] ?? payload["reference"] ?? payload["id"] ?? "",
    );
    const remote = String(payload["status"] ?? "pending").toLowerCase();
    const status: NetshopResult["status"] =
      remote === "success" || remote === "completed" || remote === "paid"
        ? "completed"
        : remote === "failed" || remote === "error"
          ? "failed"
          : "pending";
    return providerRef
      ? { ok: status !== "failed", providerRef, status }
      : { ok: status !== "failed", status };
  } catch (error) {
    return { ok: false, status: "failed", error: (error as Error).message };
  }
}

/** Cobrança (depósito): pede o dinheiro na carteira do jogador. */
export function requestDeposit(input: {
  method: Method;
  msisdn: string;
  amountCents: number;
  reference: string;
}) {
  return call("/payments/collect", {
    wallet_id: walletIdFor(input.method),
    method: input.method,
    msisdn: input.msisdn,
    amount: (input.amountCents / 100).toFixed(2),
    currency: "MZN",
    reference: input.reference,
  });
}

/** Pagamento (retirada): envia o dinheiro para a carteira do jogador. */
export function requestPayout(input: {
  method: Method;
  msisdn: string;
  amountCents: number;
  reference: string;
}) {
  return call("/payments/payout", {
    wallet_id: walletIdFor(input.method),
    method: input.method,
    msisdn: input.msisdn,
    amount: (input.amountCents / 100).toFixed(2),
    currency: "MZN",
    reference: input.reference,
  });
}

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env("NETSHOP_WEBHOOK_SECRET");
  if (!secret) return false;
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature.replace(/^sha256=/, ""), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
