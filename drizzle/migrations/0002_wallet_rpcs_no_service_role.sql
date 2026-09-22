-- Internal secrets: no Data API grants at all, only security-definer functions read it.
create table if not exists public.internal_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
revoke all on public.internal_secrets from anon, authenticated;
alter table public.internal_secrets enable row level security;

create or replace function public.internal_secret_matches(_name text, _value text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.internal_secrets s where s.name = _name and s.value = _value and length(coalesce(_value,'')) > 20)
$$;
revoke all on function public.internal_secret_matches(text,text) from public, anon, authenticated;

-- ---------- settings helper ----------
create or replace function public.app_settings()
returns public.platform_settings language sql stable security definer set search_path = public as $$
  select * from public.platform_settings where id = 1
$$;
grant execute on function public.app_settings() to authenticated, anon;

-- ---------- profile + wallet bootstrap on first login ----------
create or replace function public.bootstrap_me(_display_name text default null, _phone text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  insert into public.profiles (id, display_name, phone)
  values (uid, coalesce(nullif(trim(_display_name), ''), 'Jogador'), _phone)
  on conflict (id) do update
    set display_name = coalesce(nullif(trim(_display_name), ''), public.profiles.display_name),
        phone = coalesce(_phone, public.profiles.phone),
        updated_at = now();
  insert into public.user_roles (user_id, role) values (uid, 'player') on conflict do nothing;
  perform public.ensure_wallet(uid);
end $$;
grant execute on function public.bootstrap_me(text,text) to authenticated;

-- ---------- deposits ----------
create or replace function public.start_deposit(_amount_cents bigint, _method public.wallet_method, _msisdn text)
returns table (transaction_id uuid, idempotency_key text) language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.platform_settings; k text; blocked boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select is_blocked into blocked from public.profiles where id = uid;
  if coalesce(blocked,false) then raise exception 'account_blocked'; end if;
  select * into s from public.platform_settings where id = 1;
  if _amount_cents < s.min_deposit_cents then raise exception 'below_min_deposit'; end if;
  if coalesce((s.methods_enabled->> _method::text)::boolean, false) is not true then raise exception 'method_disabled'; end if;
  perform public.ensure_wallet(uid);
  k := 'dep_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.transactions (user_id, kind, amount_cents, status, method, idempotency_key, description, metadata)
  values (uid, 'deposit', _amount_cents, 'pending', _method, k, 'Depósito via ' || _method::text,
          jsonb_build_object('msisdn', _msisdn))
  returning id, public.transactions.idempotency_key into transaction_id, idempotency_key;
  return next;
end $$;
grant execute on function public.start_deposit(bigint, public.wallet_method, text) to authenticated;

-- Settle a pending deposit. Callable by the webhook route with the shared token.
create or replace function public.settle_deposit(_idempotency_key text, _status public.tx_status, _provider_ref text, _token text)
returns text language plpgsql security definer set search_path = public as $$
declare t public.transactions;
begin
  if not public.internal_secret_matches('wallet_rpc_token', _token) then raise exception 'unauthorized'; end if;
  select * into t from public.transactions where idempotency_key = _idempotency_key for update;
  if t.id is null then raise exception 'unknown_transaction'; end if;
  if t.status <> 'pending' then return 'already_settled'; end if;
  update public.transactions set status = _status, provider_ref = coalesce(_provider_ref, provider_ref) where id = t.id;
  if _status = 'completed' then
    update public.wallets set balance_cents = balance_cents + t.amount_cents, updated_at = now() where user_id = t.user_id;
    insert into public.notifications (user_id, title, body, kind)
    values (t.user_id, 'Depósito confirmado', 'O teu saldo foi actualizado.', 'system');
  end if;
  return 'settled';
end $$;
revoke all on function public.settle_deposit(text, public.tx_status, text, text) from public, anon, authenticated;
grant execute on function public.settle_deposit(text, public.tx_status, text, text) to anon, authenticated;

-- ---------- withdrawals ----------
create or replace function public.withdrawal_quote(_amount_cents bigint)
returns table (amount_cents bigint, fee_cents bigint, net_cents bigint) language plpgsql stable security definer set search_path = public as $$
declare s public.platform_settings;
begin
  select * into s from public.platform_settings where id = 1;
  amount_cents := _amount_cents;
  fee_cents := floor(_amount_cents * s.withdrawal_fee_percent / 100.0)::bigint + s.withdrawal_fee_fixed_cents;
  net_cents := _amount_cents - fee_cents;
  return next;
end $$;
grant execute on function public.withdrawal_quote(bigint) to authenticated, anon;

create or replace function public.request_withdrawal(_amount_cents bigint, _method public.wallet_method, _destination text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.platform_settings; avail bigint; fee bigint; net bigint;
        req_id uuid; blocked boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select is_blocked into blocked from public.profiles where id = uid;
  if coalesce(blocked,false) then raise exception 'account_blocked'; end if;
  select * into s from public.platform_settings where id = 1;
  if _amount_cents < s.min_withdrawal_cents then raise exception 'below_min_withdrawal'; end if;
  if coalesce(nullif(trim(_destination),''), '') = '' then raise exception 'destination_required'; end if;
  perform public.ensure_wallet(uid);
  select balance_cents - locked_cents into avail from public.wallets where user_id = uid for update;
  if avail < _amount_cents then raise exception 'insufficient_funds'; end if;

  fee := floor(_amount_cents * s.withdrawal_fee_percent / 100.0)::bigint + s.withdrawal_fee_fixed_cents;
  net := _amount_cents - fee;
  if net <= 0 then raise exception 'amount_too_small_for_fee'; end if;

  update public.wallets set balance_cents = balance_cents - _amount_cents, updated_at = now() where user_id = uid;
  insert into public.transactions (user_id, kind, amount_cents, status, method, idempotency_key, description, metadata)
  values (uid, 'withdrawal', -_amount_cents, 'pending', _method,
          'wd_' || replace(gen_random_uuid()::text,'-',''), 'Levantamento para ' || _destination,
          jsonb_build_object('fee_cents', fee, 'net_cents', net));
  insert into public.payout_requests (user_id, amount_cents, fee_cents, net_cents, method, destination)
  values (uid, _amount_cents, fee, net, _method, _destination)
  returning id into req_id;
  return req_id;
end $$;
grant execute on function public.request_withdrawal(bigint, public.wallet_method, text) to authenticated;

-- ---------- admin ----------
create or replace function public.admin_settle_payout(_payout_id uuid, _status public.tx_status, _provider_ref text, _error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.payout_requests;
begin
  if not public.has_role(uid, 'admin') then raise exception 'forbidden'; end if;
  select * into r from public.payout_requests where id = _payout_id for update;
  if r.id is null then raise exception 'unknown_payout'; end if;
  if r.status <> 'pending' then raise exception 'already_processed'; end if;
  update public.payout_requests set status = _status, provider_ref = _provider_ref, error = _error, processed_at = now() where id = r.id;
  if _status = 'completed' then
    update public.transactions set status = 'completed'
      where user_id = r.user_id and kind = 'withdrawal' and status = 'pending'
        and amount_cents = -r.amount_cents;
    insert into public.notifications (user_id, title, body, kind)
    values (r.user_id, 'Levantamento pago', 'O valor foi enviado para ' || r.destination, 'system');
  elsif _status in ('failed','reversed') then
    update public.wallets set balance_cents = balance_cents + r.amount_cents, updated_at = now() where user_id = r.user_id;
    update public.transactions set status = 'reversed'
      where user_id = r.user_id and kind = 'withdrawal' and status = 'pending'
        and amount_cents = -r.amount_cents;
    insert into public.notifications (user_id, title, body, kind)
    values (r.user_id, 'Levantamento devolvido', 'O valor voltou para a tua carteira.', 'system');
  end if;
  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (uid, 'settle_payout', r.user_id, jsonb_build_object('payout_id', r.id, 'status', _status));
end $$;
grant execute on function public.admin_settle_payout(uuid, public.tx_status, text, text) to authenticated;

create or replace function public.admin_adjust_balance(_user_id uuid, _amount_cents bigint, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin') then raise exception 'forbidden'; end if;
  if _amount_cents = 0 then raise exception 'amount_required'; end if;
  perform public.ensure_wallet(_user_id);
  insert into public.transactions (user_id, kind, amount_cents, status, provider, idempotency_key, description)
  values (_user_id, 'adjustment', _amount_cents, 'completed', 'manual',
          'adj_' || replace(gen_random_uuid()::text,'-',''), coalesce(_reason,'Ajuste manual'));
  update public.wallets set balance_cents = balance_cents + _amount_cents, updated_at = now() where user_id = _user_id;
  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (uid, 'adjust_balance', _user_id, jsonb_build_object('amount_cents', _amount_cents, 'reason', _reason));
end $$;
grant execute on function public.admin_adjust_balance(uuid, bigint, text) to authenticated;

create or replace function public.admin_set_blocked(_user_id uuid, _blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin') then raise exception 'forbidden'; end if;
  update public.profiles set is_blocked = _blocked, updated_at = now() where id = _user_id;
  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (uid, 'set_blocked', _user_id, jsonb_build_object('blocked', _blocked));
end $$;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin') then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'players', (select count(*) from public.profiles),
    'balance_cents', (select coalesce(sum(balance_cents),0) from public.wallets),
    'deposits_cents', (select coalesce(sum(amount_cents),0) from public.transactions where kind='deposit' and status='completed'),
    'withdrawals_cents', (select coalesce(sum(-amount_cents),0) from public.transactions where kind='withdrawal' and status='completed'),
    'fees_cents', (select coalesce(sum(fee_cents),0) from public.payout_requests where status='completed'),
    'pending_payouts', (select count(*) from public.payout_requests where status='pending')
  );
end $$;
grant execute on function public.admin_overview() to authenticated;

-- ---------- one-time admin bootstrap ----------
create or replace function public.claim_admin(_code text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); b public.admin_bootstrap;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not public.internal_secret_matches('admin_claim_code', _code) then raise exception 'invalid_code'; end if;
  select * into b from public.admin_bootstrap where id = 1 for update;
  if b.used then raise exception 'admin_already_created'; end if;
  insert into public.user_roles (user_id, role) values (uid, 'admin') on conflict do nothing;
  update public.admin_bootstrap set used = true, used_by = uid, used_at = now() where id = 1;
  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (uid, 'claim_admin', uid, '{}'::jsonb);
  return 'ok';
end $$;
grant execute on function public.claim_admin(text) to authenticated;

-- admins may read every profile
drop policy if exists "admin reads profiles" on public.profiles;
create policy "admin reads profiles" on public.profiles for select to authenticated using (public.has_role(auth.uid(),'admin'));