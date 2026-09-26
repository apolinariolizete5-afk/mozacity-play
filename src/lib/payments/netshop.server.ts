/**
 * Integração NetShop (server-only).
 *
 * A chave nunca deve chegar ao browser. A cobrança é criada no servidor e a
 * confirmação do saldo deve acontecer através de webhook assinado.
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
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function apiUrl(): string {
  return env("NETSHOP_API_URL") ?? "https://www.netshop.co.mz/api/v1";
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
  return {
    configured: Boolean(env("NETSHOP_API_KEY")),
    methods: {
      mpesa: Boolean(walletIdFor("mpesa")),
      mola: Boolean(walletIdFor("mola")),
      mcash: Boolean(walletIdFor("mcash")),
      bank: Boolean(walletIdFor("bank")),
    },
  };
}

async function callCharge(input: {
  method: Method;
  msisdn: string;
  amountCents: number;
  reference: string;
}): Promise<NetshopResult> {
  const key = env("NETSHOP_API_KEY");
  const walletId = providerWalletEnv ? env(providerWalletEnv) : walletIdFor(input.method);

  if (!key) {
    return {
      ok: false,
      status: "failed",
      error: "provider_not_configured",
    };
  }

  if (!walletId) {
    return {
      ok: false,
      status: "failed",
      error: "wallet_not_configured",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(
        `${apiUrl().replace(/\/$/, "")}/charges`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "X-Wallet-ID": walletId,
            "Idempotency-Key": input.reference,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            amount: input.amountCents / 100,
            currency: "MZN",
            method: input.method,
            msisdn: input.msisdn,
            reference: input.reference,
          }),
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();

    let payload: Record<string, unknown> = {};

    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = { raw };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        error: String(
          payload.message ??
            payload.error ??
            payload.code ??
            `HTTP ${response.status}`,
        ),
      };
    }

    const providerRef = String(
      payload.transactionID ??
        (payload.provider as Record<string, unknown> | undefined)?.transactionID ??
        payload.transaction_id ??
        payload.id ??
        payload.reference ??
        "",
    );

    const remoteStatus = String(
      payload.status ?? "pending",
    ).toLowerCase();

    const status: NetshopResult["status"] =
      ["success", "succeeded", "completed", "paid"].includes(remoteStatus)
        ? "completed"
        : [
              "failed",
              "error",
              "cancelled",
              "canceled",
              "declined",
            ].includes(remoteStatus)
          ? "failed"
          : "pending";

    return {
      ok: status !== "failed",
      status,
      ...(providerRef ? { providerRef } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      error:
        error instanceof Error
          ? error.message
          : "provider_request_failed",
    };
  }
}

/**
 * Cria uma cobrança C2B NetShop para um depósito.
 */
export function requestDeposit(input: {
  method: Method;
  msisdn: string;
  amountCents: number;
  reference: string;
}) {
  const providerMethod: Method = input.method === "mola" ? "emola" : input.method === "mcash" ? "mkesh" : input.method;
  const providerWalletEnv = input.method === "mola" ? "NETSHOP_WALLET_ID_EMOLA" : input.method === "mcash" ? "NETSHOP_WALLET_ID_MKESH" : undefined;
const raw = input.msisdn.trim().replace(/[\\s()-]/g, "");
  const msisdn =
    raw.startsWith("+258")
      ? raw
      : raw.startsWith("258")
        ? `+${raw}`
        : /^8\\d{8}$/.test(raw)
          ? `+258${raw}`
          : raw;

  return callCharge({
    ...input,
    method: providerMethod,
    msisdn,
  });
}

/**
 * Não inventamos um endpoint B2C de payout.
 * O levantamento continua pendente até ligarmos o fluxo B2C
 * confirmado pela NetShop para esta conta.
 */
export async function requestPayout(): Promise<NetshopResult> {
  return {
    ok: false,
    status: "failed",
    error: "payout_endpoint_not_configured",
  };
}

/**
 * Verifica a assinatura HMAC-SHA256 do webhook.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = env("NETSHOP_WEBHOOK_SECRET");

  if (!secret || !signature) {
    return false;
  }

  const supplied = signature
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );

}
