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

/** Inicia um depósito real através do gateway NetShop. */
export const startDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
      provider_ref: result.providerRef ?? null,
      error: result.error ?? null,
    };
  });

export const quoteWithdrawal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
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
  .validator((input: unknown) =>
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

/** Trava a caução para uma partida multiplayer antes do início. */
export const lockRoomWager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        room_code: z.string().trim().min(4).max(12),
        bet_cents: z.number().int().min(0).max(50_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("lock_room_wager", {
      _room_code: data.room_code,
      _user_id: context.user.id,
      _amount_cents: data.bet_cents,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; locked: number };
  });

/** Liquida a partida multiplayer com a taxa da casa aplicada no pote. */
export const settleRoomMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        room_code: z.string().trim().min(4).max(12),
        winner_id: z.string().uuid(),
        loser_id: z.string().uuid(),
        bet_cents: z.number().int().min(0).max(50_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.winner_id === data.loser_id) {
      throw new Error("invalid_match_participants");
    }

    // The database function also verifies auth.uid() and idempotency.
    const { data: result, error } = await context.supabase.rpc("settle_room_match", {
      _room_code: data.room_code,
      _winner_id: data.winner_id,
      _loser_id: data.loser_id,
      _bet_cents: data.bet_cents,
    });
    if (error) throw new Error(error.message);
    return result as {
      ok: boolean;
      already?: boolean;
      payout: number;
      rake: number;
    };
  });
