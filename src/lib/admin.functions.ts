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

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
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

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        house_fee_percent: z.number().min(5).max(15),
        withdrawal_fee_percent: z.number().min(0).max(15),
        withdrawal_fee_fixed_cents: z.number().int().min(0),
        min_deposit_cents: z.number().int().min(0),
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
      _min_withdrawal_cents: data.min_withdrawal_cents,
      _rollover_enabled: data.rollover_enabled,
      _rollover_multiplier: data.rollover_multiplier,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const settlePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        payout_id: z.string().uuid(),
        status: z.enum(["completed", "failed"]),
        provider_ref: z.string().trim().max(120).optional(),
        error: z.string().trim().max(240).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_settle_payout", {
      _payout_id: data.payout_id,
      _status: data.status,
      _provider_ref: data.provider_ref ?? null,
      _error: data.error ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTestMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_test_mode", { _enabled: data.enabled });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
