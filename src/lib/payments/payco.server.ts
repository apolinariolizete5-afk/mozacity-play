/**
 * Integração PAY.CO.MZ (server-only).
 *
 * A chave e o segredo do webhook nunca chegam ao browser.
 * A confirmação financeira é feita pelo webhook assinado.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type PaycoMethod = "mpesa" | "mcash" | "emola";

export interface PaycoResult {
  ok: boolean;
  providerRef?: string;
  status: "pending" | "completed" | "failed";
  checkoutUrl?: string;
  error?: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function apiUrl(): string {
  return env("PAYCO_API_URL") ?? "https://pay.co.mz/api/public/v1";
}

function walletIdFor(method: PaycoMethod): string | undefined {
  const names: Record<PaycoMethod, string> = {
    mpesa: "PAYCO_WALLET_ID_MPESA",
    mcash: "PAYCO_WALLET_ID_MKESH",
    emola: "PAYCO_WALLET_ID_EMOLA",
  };
  return env(names[method]);
}

function providerMethod(method: PaycoMethod): PaycoMethod {
  return method;
}

export function paycoStatus() {
  return {
    configured: Boolean(env("PAYCO_API_KEY") && env("PAYCO_MERCHANT_ID")),
    methods: {
      mpesa: Boolean(walletIdFor("mpesa")),
      mcash: Boolean(walletIdFor("mcash")),
      emola: Boolean(walletIdFor("emola")),
    },
  };
}

function normalizeMsisdn(value: string): string {
  const raw = value.trim().replace(/[\s()-]/g, "");
  if (raw.startsWith("+258")) return raw.slice(1);
  if (raw.startsWith("258")) return raw;
  if (/^8\d{8}$/.test(raw)) return `258${raw}`;
  return raw;
}

export async function requestDeposit(input: {
  method: PaycoMethod;
  msisdn: string;
  amountCents: number;
  reference: string;
}): Promise<PaycoResult> {
  const key = env("PAYCO_API_KEY");
  const merchantId = env("PAYCO_MERCHANT_ID");
  const walletId = walletIdFor(input.method);

  if (!key || !merchantId) {
    return { ok: false, status: "failed", error: "provider_not_configured" };
  }
  if (!walletId) {
    return { ok: false, status: "failed", error: "wallet_not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${apiUrl().replace(/\/$/, "")}/charges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "X-Merchant-Id": merchantId,
        "X-Wallet-Id": walletId,
        "Idempotency-Key": input.reference,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        amount: input.amountCents / 100,
        method: providerMethod(input.method),
        customer_contact: normalizeMsisdn(input.msisdn),
        wallet_id: walletId,
      }),
      signal: controller.signal,
    });

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
        error: String(payload.error ?? payload.message ?? `HTTP ${response.status}`),
      };
    }

    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : payload;

    const providerRef = String(
      data.reference ?? data.transaction_reference ?? data.id ?? "",
    ).trim();

    const remoteStatus = String(data.state ?? data.status ?? "pending").toLowerCase();
    const status: PaycoResult["status"] =
      ["success", "succeeded", "successful", "completed", "paid"].includes(remoteStatus)
        ? "completed"
        : ["failed", "cancelled", "canceled", "expired", "reversed"].includes(remoteStatus)
          ? "failed"
          : "pending";

    return {
      ok: status !== "failed",
      status,
      ...(providerRef ? { providerRef } : {}),
      ...(typeof data.checkout_url === "string" ? { checkoutUrl: data.checkout_url } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      error: error instanceof Error ? error.message : "provider_request_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * PAY.CO.MZ assina "<timestamp>.<rawBody>" com HMAC-SHA256.
 * O timestamp deve estar a no máximo 5 minutos do relógio do servidor.
 */
export function verifyPaycoWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = env("PAYCO_WEBHOOK_SECRET");
  if (!secret || !signature) return false;

  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const supplied = Buffer.from(parts.v1 ?? "", "utf8");
  const calculated = Buffer.from(expected, "utf8");

  return (
    supplied.length === calculated.length &&
    timingSafeEqual(supplied, calculated)
  );
}
