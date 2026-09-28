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
        amount_cents: z.number().int().min(0).max(50_000_000),
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
      await context.supabase.rpc("cancel_failed_deposit", {
        _idempotency_key: key,
      });
      throw new Error("payment_provider_not_configured");
    }

    const result = await requestDeposit({
      method: data.method,
      msisdn: data.msisdn,
      amountCents: data.amount_cents,
      reference: key,
    });

    // Failed/rejected provider requests must not remain in financial history.
    // Pending rows are kept only when the provider accepted the charge and
    // may still complete it asynchronously.
    if (!result.ok || result.status === "failed") {
      await context.supabase.rpc("cancel_failed_deposit", {
        _idempotency_key: key,
      });
      throw new Error(result.error ?? "deposit_failed");
    }

    return {
      mode: "live" as "live" | "test",
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
        amount_cents: z.number().int().min(0),
        method: z.enum(METHODS),
        destination: z.string().trim().min(6).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("request_withdrawal", {
      _amount_cents: data.amount_cents,
      _method: data.method,
      _destination: data.destination,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    const payoutId = (row as { payout_id?: string } | null)?.payout_id;
    if (!payoutId) throw new Error("payout_not_created");
    return row as { payout_id: string; gross_cents: number; fee_cents: number; net_cents: number; status: string };
  });

/** Regista a partida multiplayer no banco antes de qualquer débito. */
export const registerRoomMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      room_code: z.string().trim().length(6),
      game: z.enum(["ludo", "checkers", "chess"]),
      player_one_id: z.string().uuid(),
      player_two_id: z.string().uuid(),
      bet_cents: z.number().int().min(0).max(50_000_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("register_room_match", {
      _room_code: data.room_code,
      _game: data.game,
      _player_one_id: data.player_one_id,
      _player_two_id: data.player_two_id,
      _bet_cents: data.bet_cents,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; match_id: string; bet_cents: number; status: string };
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
      _amount_cents: data.bet_cents,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; locked: number; already?: boolean; status: "ready" | "playing" | "finished" | "cancelled" };
  });

/** Reporta o resultado; o servidor liquida quando o perdedor confirma ou ambos concordam. */
export const settleRoomMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        room_code: z.string().trim().min(4).max(12),
        winner_id: z.string().uuid().nullable(),
        loser_id: z.string().uuid().optional(),
        bet_cents: z.number().int().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("settle_room_result", {
      _room_code: data.room_code,
      _winner_id: data.winner_id as string,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; already?: boolean; pending?: boolean; payout?: number; rake?: number };
  });

/** Finaliza uma partida de Damas por desistência e liquida o prémio no servidor. */
export const forfeitRoomMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      room_code: z.string().trim().min(4).max(12),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("forfeit_room_match", {
      _room_code: data.room_code,
    });
    if (error) throw new Error(error.message);
    return result as {
      ok: boolean;
      already?: boolean;
      status?: string;
      winner_id?: string | null;
      payout_cents?: number;
      rake_cents?: number;
      result_id?: string | null;
      payout?: number;
    };
  });

/** Regista partida multiplayer (2 a 4 jogadores) no banco antes do bloqueio da caução. */
export const registerRoomMatchMulti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      room_code: z.string().trim().min(4).max(12),
      game: z.enum(["ludo", "checkers", "chess"]),
      player_ids: z.array(z.string().uuid()).min(2).max(4),
      bet_cents: z.number().int().min(0).max(50_000_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("register_room_match_multi", {
      _room_code: data.room_code,
      _game: data.game,
      _player_ids: data.player_ids,
      _bet_cents: data.bet_cents,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; match_id: string; bet_cents: number; total_players: number; status: string };
  });

/** Liquida o pote da sala para o vencedor de 2, 3 ou 4 jogadores. */
export const settleRoomMatchMulti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      room_code: z.string().trim().min(4).max(12),
      winner_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("settle_room_result_multi", {
      _room_code: data.room_code,
      _winner_id: data.winner_id,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; winner_id: string; total_pot: number; payout_cents: number; rake_cents: number };
  });
