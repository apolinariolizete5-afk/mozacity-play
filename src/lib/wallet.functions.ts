import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const METHODS = ["mpesa", "mola", "mcash", "bank"] as const;

export interface WalletSummary {
  balance_cents: number;
  withdrawable_cents: number;
  rollover_required_cents: number;
  wagered_cents: number;
  min_deposit_cents: number;
  min_withdrawal_cents: number;
  withdrawal_fee_percent: number;
  withdrawal_fee_fixed_cents: number;
  house_fee_percent: number;
  rollover_enabled: boolean;
}

export const getWalletSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.rpc("bootstrap_me", {});
    const { data, error } = await context.supabase.rpc("wallet_summary");
    if (error) throw new Error(error.message);
    return data as unknown as WalletSummary;
  });

/** Inicia um depósito real. O saldo só é creditado após confirmação assinada da gateway. */
export const startDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        amount_cents: z.number().int().min(5000).max(50_000_000),
        method: z.enum(METHODS),
        msisdn: z.string().trim().min(6).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: started, error } = await context.supabase.rpc("start_deposit", {
      _amount_cents: data.amount_cents,
      _method: data.method,
      _msisdn: data.msisdn,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(started) ? started[0] : started;
    const key = (row as { idempotency_key: string } | null)?.idempotency_key;
    if (!key) throw new Error("deposit_not_created");

    const { netshopStatus, requestDeposit } = await import("./payments/netshop.server");
    const status = netshopStatus();

    if (!status.configured) {
      throw new Error("payment_provider_not_configured");
    }

    const result = await requestDeposit({
      method: data.method,
      msisdn: data.msisdn,
      amountCents: data.amount_cents,
      reference: key,
    });

    return {
      mode: "live" as const,
      status: result.status,
      reference: key,
      error: result.error ?? null,
    };
  });

export const quoteWithdrawal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ amount_cents: z.number().int().min(0) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: quote, error } = await context.supabase.rpc("withdrawal_quote", {
      _amount_cents: data.amount_cents,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(quote) ? quote[0] : quote;
    return row as { amount_cents: number; fee_cents: number; net_cents: number };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        amount_cents: z.number().int().min(5000),
        method: z.enum(METHODS),
        destination: z.string().trim().min(6).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("request_withdrawal", {
      _amount_cents: data.amount_cents,
      _method: data.method,
      _destination: data.destination,
    });
    if (error) throw new Error(error.message);
    return { payout_id: id as string };
  });

/** Autoridade do servidor sobre a aposta: debita o saldo e abre a partida. */
export const startMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        game: z.enum(["ludo", "checkers", "chess"]),
        bet_cents: z.number().int().min(0).max(50_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("start_solo_match", {
      _game: data.game,
      _bet_cents: data.bet_cents,
    });
    if (error) throw new Error(error.message);
    return { match_id: id as string };
  });

/** Liquida a partida: a comissão da casa sai do pote antes de creditar o vencedor. */
export const finishMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        match_id: z.string().uuid(),
        result: z.enum(["win", "loss", "draw"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase.rpc("finish_solo_match", {
      _match_id: data.match_id,
      _result: data.result,
    });
    if (error) throw new Error(error.message);
    return out as unknown as { already: boolean; payout_cents: number; rake_cents: number };
  });
