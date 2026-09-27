ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS fee_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS net_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_key ON public.push_subscriptions(user_id, endpoint);

DROP FUNCTION IF EXISTS public.request_withdrawal(bigint, wallet_method, text);
CREATE FUNCTION public.request_withdrawal(_amount_cents bigint, _method wallet_method, _destination text)
RETURNS TABLE(payout_id uuid, gross_cents bigint, fee_cents bigint, net_cents bigint, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare uid uuid := auth.uid(); s public.platform_settings; w public.wallets;
        withdrawable bigint; fee bigint; net bigint; req_id uuid; blocked boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select is_blocked into blocked from public.profiles where id = uid;
  if coalesce(blocked,false) then raise exception 'account_blocked'; end if;
  select * into s from public.platform_settings where id = 1;
  if _amount_cents < s.min_withdrawal_cents then raise exception 'below_min_withdrawal'; end if;
  if coalesce(nullif(trim(_destination),''), '') = '' then raise exception 'destination_required'; end if;
  perform public.ensure_wallet(uid);
  select * into w from public.wallets where user_id = uid for update;
  if w.balance_cents - w.locked_cents < _amount_cents then raise exception 'insufficient_funds'; end if;
  withdrawable := greatest(0, w.balance_cents - w.locked_cents
                  - (case when s.rollover_enabled then w.rollover_required_cents else 0 end));
  if withdrawable < _amount_cents then raise exception 'rollover_pending'; end if;
  fee := floor(_amount_cents * s.withdrawal_fee_percent / 100.0)::bigint + s.withdrawal_fee_fixed_cents;
  net := _amount_cents - fee;
  if net <= 0 then raise exception 'amount_too_small_for_fee'; end if;
  update public.wallets set balance_cents = balance_cents - _amount_cents, updated_at = now() where user_id = uid;
  insert into public.payout_requests (user_id, amount_cents, fee_cents, net_cents, method, destination)
  values (uid, _amount_cents, fee, net, _method, _destination) returning id into req_id;
  insert into public.transactions (user_id, kind, amount_cents, status, method, idempotency_key, description, metadata)
  values (uid, 'withdrawal', -_amount_cents, 'pending', _method, 'wd_' || replace(req_id::text,'-',''),
          'Levantamento para ' || _destination, jsonb_build_object('fee_cents', fee, 'net_cents', net, 'payout_id', req_id));
  payout_id := req_id; gross_cents := _amount_cents; fee_cents := fee; net_cents := net; status := 'pending';
  return next;
end $$;

CREATE OR REPLACE FUNCTION public.admin_update_settings(_house_fee_percent numeric, _withdrawal_fee_percent numeric, _withdrawal_fee_fixed_cents bigint, _min_deposit_cents bigint, _min_bet_cents bigint, _min_withdrawal_cents bigint, _rollover_enabled boolean, _rollover_multiplier numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  perform public.admin_update_settings(_house_fee_percent, _withdrawal_fee_percent, _withdrawal_fee_fixed_cents, _min_deposit_cents, _min_withdrawal_cents, _rollover_enabled, _rollover_multiplier);
  update public.platform_settings set min_bet_cents = greatest(_min_bet_cents, 0) where id = 1;
end $$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select u.id, coalesce(p.display_name, split_part(u.email,'@',1)) as display_name, p.phone, u.email::text as email,
           coalesce(p.is_blocked,false) as is_blocked, u.created_at, p.last_seen_at,
           coalesce(w.balance_cents,0) as balance_cents
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.wallets w on w.user_id = u.id
      limit 1000) x), '[]'::jsonb);
end $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(_user_id uuid, _blocked boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  insert into public.profiles (id) values (_user_id) on conflict (id) do nothing;
  perform public.admin_set_blocked(_user_id, _blocked);
  return jsonb_build_object('ok', true, 'user_id', _user_id, 'is_blocked', _blocked);
end $$;

CREATE OR REPLACE FUNCTION public.admin_claim_payout(_payout_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare r public.payout_requests;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  select * into r from public.payout_requests where id = _payout_id for update;
  if r.id is null then raise exception 'unknown_payout'; end if;
  if r.status <> 'pending' then raise exception 'already_processed'; end if;
  if r.provider_status = 'processing' and r.provider_ref is not null then raise exception 'already_processing'; end if;
  update public.payout_requests set provider_status = 'processing' where id = r.id;
  return jsonb_build_object('payout_id', r.id, 'amount_cents', case when r.net_cents > 0 then r.net_cents else r.amount_cents end,
    'method', r.method, 'destination', r.destination, 'status', 'processing', 'provider_ref', r.provider_ref);
end $$;

CREATE OR REPLACE FUNCTION public.admin_record_payout_provider(_payout_id uuid, _provider_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  update public.payout_requests set provider_ref = nullif(_provider_ref,''), provider_status = 'processing' where id = _payout_id;
end $$;

CREATE OR REPLACE FUNCTION public.refund_failed_payout(_payout_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  perform public.admin_settle_payout(_payout_id, 'failed', null, _reason);
end $$;

CREATE OR REPLACE FUNCTION public.admin_reject_payout(_payout_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  perform public.admin_settle_payout(_payout_id, 'failed', null, _reason);
end $$;

CREATE OR REPLACE FUNCTION public.process_netshop_payout_webhook(_token text, _payout_id text, _status text, _provider_ref text, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare r public.payout_requests; ok boolean;
begin
  if not public.internal_secret_matches('wallet_rpc_token', _token) then raise exception 'unauthorized'; end if;
  select * into r from public.payout_requests where id::text = _payout_id or provider_ref = _payout_id for update;
  if r.id is null then raise exception 'unknown_payout'; end if;
  if r.status <> 'pending' then return 'already_settled'; end if;
  ok := lower(_status) in ('success','completed','paid','succeeded');
  update public.payout_requests set status = case when ok then 'completed'::tx_status else 'failed'::tx_status end,
    provider_ref = coalesce(nullif(_provider_ref,''), provider_ref), provider_status = lower(_status),
    error = case when ok then null else _reason end, processed_at = now() where id = r.id;
  if ok then
    update public.transactions set status = 'completed' where user_id = r.user_id and kind = 'withdrawal' and status = 'pending' and amount_cents = -r.amount_cents;
  else
    update public.wallets set balance_cents = balance_cents + r.amount_cents, updated_at = now() where user_id = r.user_id;
    update public.transactions set status = 'failed' where user_id = r.user_id and kind = 'withdrawal' and status = 'pending' and amount_cents = -r.amount_cents;
  end if;
  return 'settled';
end $$;

CREATE OR REPLACE FUNCTION public.cancel_failed_deposit(_idempotency_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  delete from public.transactions where idempotency_key = _idempotency_key and user_id = auth.uid() and kind = 'deposit' and status = 'pending';
$$;

CREATE OR REPLACE FUNCTION public.forfeit_room_match(_room_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare uid uuid := auth.uid(); e public.room_escrows; opp uuid; res jsonb;
begin
  select * into e from public.room_escrows where room_code = _room_code;
  if e.room_code is null or uid not in (e.player_one, e.player_two) then raise exception 'not_participant'; end if;
  if e.status = 'ready' then return public.cancel_room_escrow(_room_code); end if;
  opp := case when uid = e.player_one then e.player_two else e.player_one end;
  res := public.settle_room_result(_room_code, opp);
  return res || jsonb_build_object('payout_cents', res->'payout', 'rake_cents', res->'rake', 'status', 'finished');
end $$;

CREATE OR REPLACE FUNCTION public.send_test_notification()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.notify_user(auth.uid(), 'MozaPlay', 'As notificações estão a funcionar!', 'system', '/notifications');
end $$;

REVOKE ALL ON FUNCTION public.request_withdrawal(bigint, wallet_method, text), public.admin_update_settings(numeric,numeric,bigint,bigint,bigint,bigint,boolean,numeric), public.admin_list_users(), public.admin_set_user_blocked(uuid,boolean), public.admin_claim_payout(uuid), public.admin_record_payout_provider(uuid,text), public.refund_failed_payout(uuid,text), public.admin_reject_payout(uuid,text), public.cancel_failed_deposit(text), public.forfeit_room_match(text), public.send_test_notification() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(bigint, wallet_method, text), public.admin_update_settings(numeric,numeric,bigint,bigint,bigint,bigint,boolean,numeric), public.admin_list_users(), public.admin_set_user_blocked(uuid,boolean), public.admin_claim_payout(uuid), public.admin_record_payout_provider(uuid,text), public.refund_failed_payout(uuid,text), public.admin_reject_payout(uuid,text), public.cancel_failed_deposit(text), public.forfeit_room_match(text), public.send_test_notification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_netshop_payout_webhook(text,text,text,text,text), public.settle_deposit(text,tx_status,text,text), public.claim_push_batch(text), public.drop_push_subscription(text,text) TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;