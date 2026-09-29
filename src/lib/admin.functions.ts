import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminOverview {
  players: number;
  balance_cents: number;
  deposits_cents: number;
  withdrawals_cents: number;
  withdrawal_fees_cents: number;
  rake_cents: number;
  bet_volume_cents: number;
  pending_payouts: number;
  pending_payouts_cents: number;
}

export interface AdminUser {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  is_blocked: boolean;
  created_at: string;
  last_seen_at: string | null;
  balance_cents: number;
}

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ code: z.string().trim().min(10).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.rpc("bootstrap_me", {});
    const { error } = await context.supabase.rpc("claim_admin", { _code: data.code });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_overview");
    if (error) throw new Error(error.message);
    return data as unknown as AdminOverview;
  });

export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AdminUser[];
  });

export const setAdminUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ user_id: z.string().uuid(), blocked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_set_user_blocked", {
      _user_id: data.user_id,
      _blocked: data.blocked,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; user_id: string; is_blocked: boolean };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        house_fee_percent: z.number().min(5).max(15),
        withdrawal_fee_percent: z.number().min(0).max(15),
        withdrawal_fee_fixed_cents: z.number().int().min(0),
        min_deposit_cents: z.number().int().min(0),
        min_bet_cents: z.number().int().min(0),
        min_withdrawal_cents: z.number().int().min(0),
        rollover_enabled: z.boolean(),
        rollover_multiplier: z.number().min(0).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_update_settings", {
      _house_fee_percent: data.house_fee_percent,
      _withdrawal_fee_percent: data.withdrawal_fee_percent,
      _withdrawal_fee_fixed_cents: data.withdrawal_fee_fixed_cents,
      _min_deposit_cents: data.min_deposit_cents,
      _min_bet_cents: data.min_bet_cents,
      _min_withdrawal_cents: data.min_withdrawal_cents,
      _rollover_enabled: data.rollover_enabled,
      _rollover_multiplier: data.rollover_multiplier,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approvePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ payout_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: claimed, error: claimError } = await context.supabase.rpc("admin_claim_payout", {
      _payout_id: data.payout_id,
    });
    if (claimError) throw new Error(claimError.message);

    const payout = (Array.isArray(claimed) ? claimed[0] : claimed) as {
      payout_id: string;
      amount_cents: number;
      method: "mpesa" | "mola" | "mcash" | "bank";
      destination: string;
      status: string;
      provider_ref?: string | null;
    };

    if (!payout?.payout_id) throw new Error("payout_not_created");

    // A provider request is idempotent on payout_id. A retry after a timeout
    // therefore reuses the same provider operation instead of creating a new one.
    const { requestDisbursement } = await import("@/lib/payments/netshop.server");
    const result = await requestDisbursement({
      payoutId: payout.payout_id,
      method: payout.method,
      destination: payout.destination,
      amountCents: payout.amount_cents,
    });

    if (!result.ok) {
      const { error: refundError } = await context.supabase.rpc("refund_failed_payout", {
        _payout_id: payout.payout_id,
        _reason: result.error ?? "provider_rejected",
      });
      if (refundError) throw new Error(refundError.message);
      throw new Error(result.error ?? "payout_failed");
    }

    const { error: recordError } = await context.supabase.rpc("admin_record_payout_provider", {
      _payout_id: payout.payout_id,
      _provider_ref: result.providerRef ?? "",
    });
    if (recordError) throw new Error(recordError.message);

    return {
      ok: true,
      status: "processing" as const,
      payout_id: payout.payout_id,
      provider_ref: result.providerRef ?? null,
    };
  });


export const rejectPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      payout_id: z.string().uuid(),
      reason: z.string().trim().max(240).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_reject_payout", {
      _payout_id: data.payout_id,
      _reason: data.reason ?? "admin_rejected",
    });
    if (error) throw new Error(error.message);
    return { ok: true, status: "failed" as const };
  });


export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const adminCheck = await context.supabase.rpc("is_admin", {});
    if (adminCheck.error || !adminCheck.data) {
      throw new Error("unauthorized");
    }

    const { data, error } = await context.supabase
      .from("platform_settings")
      .select(
        "house_fee_percent, withdrawal_fee_percent, withdrawal_fee_fixed_cents, min_deposit_cents, min_withdrawal_cents, min_bet_cents, rollover_enabled, rollover_multiplier"
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return {
        house_fee_percent: 10,
        withdrawal_fee_percent: 3.5,
        withdrawal_fee_fixed_cents: 0,
        min_deposit_cents: 0,
        min_withdrawal_cents: 0,
        min_bet_cents: 0,
        rollover_enabled: false,
        rollover_multiplier: 1,
      };
    }
    return data;
  });
