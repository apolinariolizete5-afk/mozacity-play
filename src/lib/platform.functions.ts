import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PublicPlatformSettings {
  min_bet_cents: number;
  min_deposit_cents: number;
  min_withdrawal_cents: number;
}

export const getPublicPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_settings")
      .select("min_bet_cents, min_deposit_cents, min_withdrawal_cents")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("platform_settings_missing");

    return data as PublicPlatformSettings;
  });
