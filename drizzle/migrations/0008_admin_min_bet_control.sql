-- Real admin control for the minimum wager.
create or replace function public.admin_update_settings(
  _house_fee_percent numeric,
  _withdrawal_fee_percent numeric,
  _withdrawal_fee_fixed_cents bigint,
  _min_deposit_cents bigint,
  _min_withdrawal_cents bigint,
  _min_bet_cents bigint,
  _rollover_enabled boolean,
  _rollover_multiplier numeric
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from public.user_roles where user_id = uid and role = 'admin'
  ) then raise exception 'admin_required'; end if;
  if _house_fee_percent < 5 or _house_fee_percent > 15 then raise exception 'invalid_house_fee'; end if;
  if _withdrawal_fee_percent < 0 or _withdrawal_fee_percent > 15 then raise exception 'invalid_withdrawal_fee'; end if;
  if _withdrawal_fee_fixed_cents < 0 or _min_deposit_cents < 0
     or _min_withdrawal_cents < 0 or _min_bet_cents < 0 then raise exception 'invalid_amount'; end if;
  if _rollover_multiplier < 0 or _rollover_multiplier > 10 then raise exception 'invalid_rollover_multiplier'; end if;

  update public.platform_settings
     set house_fee_percent = _house_fee_percent,
         withdrawal_fee_percent = _withdrawal_fee_percent,
         withdrawal_fee_fixed_cents = _withdrawal_fee_fixed_cents,
         min_deposit_cents = _min_deposit_cents,
         min_withdrawal_cents = _min_withdrawal_cents,
         min_bet_cents = _min_bet_cents,
         rollover_enabled = _rollover_enabled,
         rollover_multiplier = _rollover_multiplier
   where id = 1;

  if not found then raise exception 'platform_settings_missing'; end if;
  return jsonb_build_object('ok', true, 'min_deposit_cents', _min_deposit_cents, 'min_bet_cents', _min_bet_cents);
end $$;
revoke all on function public.admin_update_settings(numeric,numeric,bigint,bigint,bigint,bigint,boolean,numeric) from public, anon;
grant execute on function public.admin_update_settings(numeric,numeric,bigint,bigint,bigint,bigint,boolean,numeric) to authenticated;
