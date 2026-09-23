-- Rollover e volume apostado na carteira
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS wagered_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS rollover_required_cents bigint NOT NULL DEFAULT 0;

-- Configuração dinâmica da casa
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS rollover_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS rollover_multiplier numeric NOT NULL DEFAULT 1.0;

-- Partidas contra o computador (autoridade do servidor sobre a aposta)
CREATE TABLE IF NOT EXISTS public.solo_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game text NOT NULL,
  bet_cents bigint NOT NULL DEFAULT 0,
  rake_cents bigint NOT NULL DEFAULT 0,
  payout_cents bigint NOT NULL DEFAULT 0,
  result text,
  status text NOT NULL DEFAULT 'PLAYING',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.solo_matches TO authenticated;
GRANT ALL ON public.solo_matches TO service_role;
ALTER TABLE public.solo_matches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own solo matches" ON public.solo_matches FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin reads solo matches" ON public.solo_matches FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS solo_matches_user_idx ON public.solo_matches (user_id, created_at DESC);

-- Subscrições de web push
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own push subs" ON public.push_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Última actividade (retenção)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- Resumo da carteira: saldo total, saldo levantável, rollover pendente
CREATE OR REPLACE FUNCTION public.wallet_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare uid uuid := auth.uid(); w public.wallets; s public.platform_settings;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into s from public.platform_settings where id = 1;
  select * into w from public.wallets where user_id = uid;
  if w.user_id is null then
    return jsonb_build_object('balance_cents',0,'withdrawable_cents',0,'rollover_required_cents',0,
      'wagered_cents',0,'min_deposit_cents',s.min_deposit_cents,'min_withdrawal_cents',s.min_withdrawal_cents,
      'withdrawal_fee_percent',s.withdrawal_fee_percent,'withdrawal_fee_fixed_cents',s.withdrawal_fee_fixed_cents,
      'house_fee_percent',s.house_fee_percent,'rollover_enabled',s.rollover_enabled);
  end if;
  return jsonb_build_object(
    'balance_cents', w.balance_cents,
    'withdrawable_cents', greatest(0, w.balance_cents - (case when s.rollover_enabled then w.rollover_required_cents else 0 end)),
    'rollover_required_cents', case when s.rollover_enabled then w.rollover_required_cents else 0 end,
    'wagered_cents', w.wagered_cents,
    'min_deposit_cents', s.min_deposit_cents,
    'min_withdrawal_cents', s.min_withdrawal_cents,
    'withdrawal_fee_percent', s.withdrawal_fee_percent,
    'withdrawal_fee_fixed_cents', s.withdrawal_fee_fixed_cents,
    'house_fee_percent', s.house_fee_percent,
    'rollover_enabled', s.rollover_enabled
  );
end $$;

-- Depósito liquidado passa a exigir rollover (valor integral creditado, sem descontos)
CREATE OR REPLACE FUNCTION public.settle_deposit(_idempotency_key text, _status tx_status, _provider_ref text, _token text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare t public.transactions; s public.platform_settings;
begin
  if not public.internal_secret_matches('wallet_rpc_token', _token) then raise exception 'unauthorized'; end if;
  select * into s from public.platform_settings where id = 1;
  select * into t from public.transactions where idempotency_key = _idempotency_key for update;
  if t.id is null then raise exception 'unknown_transaction'; end if;
  if t.status <> 'pending' then return 'already_settled'; end if;
  update public.transactions set status = _status, provider_ref = coalesce(_provider_ref, provider_ref) where id = t.id;
  if _status = 'completed' then
    update public.wallets
       set balance_cents = balance_cents + t.amount_cents,
           rollover_required_cents = rollover_required_cents + floor(t.amount_cents * s.rollover_multiplier)::bigint,
           updated_at = now()
     where user_id = t.user_id;
    insert into public.notifications (user_id, title, body, kind)
    values (t.user_id, 'Depósito confirmado', 'Creditámos ' || to_char(t.amount_cents/100.0,'FM999999990.00') || ' MT na tua carteira.', 'system');
  end if;
  return 'settled';
end $$;

-- Iniciar partida com aposta (debita do servidor, reduz rollover pendente)
CREATE OR REPLACE FUNCTION public.start_solo_match(_game text, _bet_cents bigint)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare uid uuid := auth.uid(); s public.platform_settings; avail bigint; mid uuid; blocked boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select is_blocked into blocked from public.profiles where id = uid;
  if coalesce(blocked,false) then raise exception 'account_blocked'; end if;
  if _bet_cents < 0 then raise exception 'invalid_bet'; end if;
  select * into s from public.platform_settings where id = 1;
  if _bet_cents > 0 then
    if _bet_cents < s.min_bet_cents then raise exception 'below_min_bet'; end if;
    if _bet_cents > s.max_bet_cents then raise exception 'above_max_bet'; end if;
    perform public.ensure_wallet(uid);
    select balance_cents - locked_cents into avail from public.wallets where user_id = uid for update;
    if avail < _bet_cents then raise exception 'insufficient_funds'; end if;
    update public.wallets
       set balance_cents = balance_cents - _bet_cents,
           wagered_cents = wagered_cents + _bet_cents,
           rollover_required_cents = greatest(0, rollover_required_cents - _bet_cents),
           updated_at = now()
     where user_id = uid;
    insert into public.transactions (user_id, kind, amount_cents, status, idempotency_key, description)
    values (uid, 'bet', -_bet_cents, 'completed', 'bet_' || replace(gen_random_uuid()::text,'-',''), 'Aposta em ' || _game);
  end if;
  insert into public.solo_matches (user_id, game, bet_cents) values (uid, _game, _bet_cents) returning id into mid;
  update public.profiles set last_seen_at = now() where id = uid;
  return mid;
end $$;

-- Liquidar partida: rake da casa deduzido do pote antes de creditar o vencedor
CREATE OR REPLACE FUNCTION public.finish_solo_match(_match_id uuid, _result text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare uid uuid := auth.uid(); m public.solo_matches; s public.platform_settings;
        pot bigint; rake bigint := 0; payout bigint := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if _result not in ('win','loss','draw') then raise exception 'invalid_result'; end if;
  select * into m from public.solo_matches where id = _match_id and user_id = uid for update;
  if m.id is null then raise exception 'unknown_match'; end if;
  if m.status <> 'PLAYING' then
    return jsonb_build_object('already', true, 'payout_cents', m.payout_cents, 'rake_cents', m.rake_cents);
  end if;
  select * into s from public.platform_settings where id = 1;
  pot := m.bet_cents * 2;
  if _result = 'win' then
    rake := floor(pot * s.house_fee_percent / 100.0)::bigint;
    payout := pot - rake;
  elsif _result = 'draw' then
    payout := m.bet_cents;
  end if;
  update public.solo_matches
     set status = 'FINISHED', result = _result, rake_cents = rake, payout_cents = payout, finished_at = now()
   where id = m.id;
  if payout > 0 then
    update public.wallets set balance_cents = balance_cents + payout, updated_at = now() where user_id = uid;
    insert into public.transactions (user_id, kind, amount_cents, status, idempotency_key, description, metadata)
    values (uid, case when _result = 'win' then 'prize' else 'refund' end, payout, 'completed',
            'pay_' || replace(m.id::text,'-',''),
            case when _result = 'win' then 'Prémio de ' || m.game else 'Empate devolvido' end,
            jsonb_build_object('rake_cents', rake, 'pot_cents', pot));
  end if;
  if rake > 0 then
    insert into public.transactions (user_id, kind, amount_cents, status, idempotency_key, description)
    values (uid, 'fee', 0, 'completed', 'rake_' || replace(m.id::text,'-',''),
            'Comissão da casa ' || to_char(rake/100.0,'FM999999990.00') || ' MT');
  end if;
  insert into public.match_results (user_id, game, result, bet_cents, payout_cents)
  values (uid, m.game, _result, m.bet_cents, payout);
  update public.profiles set last_seen_at = now() where id = uid;
  return jsonb_build_object('already', false, 'payout_cents', payout, 'rake_cents', rake);
end $$;

-- Levantamento: mínimo, saldo levantável (rollover) e taxa transparente
CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount_cents bigint, _method wallet_method, _destination text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  withdrawable := greatest(0, w.balance_cents - w.locked_cents
                  - (case when s.rollover_enabled then w.rollover_required_cents else 0 end));
  if withdrawable < _amount_cents then raise exception 'rollover_pending'; end if;

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

-- Configuração dinâmica pelo administrador (com limites)
CREATE OR REPLACE FUNCTION public.admin_update_settings(
  _house_fee_percent numeric, _withdrawal_fee_percent numeric, _withdrawal_fee_fixed_cents bigint,
  _min_deposit_cents bigint, _min_withdrawal_cents bigint, _rollover_enabled boolean, _rollover_multiplier numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin') then raise exception 'forbidden'; end if;
  if _house_fee_percent < 5 or _house_fee_percent > 15 then raise exception 'house_fee_out_of_range'; end if;
  if _withdrawal_fee_percent < 0 or _withdrawal_fee_percent > 15 then raise exception 'withdrawal_fee_out_of_range'; end if;
  if _withdrawal_fee_fixed_cents < 0 then raise exception 'invalid_fixed_fee'; end if;
  if _rollover_multiplier < 0 or _rollover_multiplier > 10 then raise exception 'invalid_multiplier'; end if;
  update public.platform_settings
     set house_fee_percent = _house_fee_percent,
         withdrawal_fee_percent = _withdrawal_fee_percent,
         withdrawal_fee_fixed_cents = _withdrawal_fee_fixed_cents,
         min_deposit_cents = greatest(_min_deposit_cents, 0),
         min_withdrawal_cents = greatest(_min_withdrawal_cents, 0),
         rollover_enabled = _rollover_enabled,
         rollover_multiplier = _rollover_multiplier,
         updated_at = now()
   where id = 1;
  insert into public.admin_audit_log (admin_id, action, details)
  values (uid, 'update_settings', jsonb_build_object('house_fee_percent', _house_fee_percent));
end $$;

-- Métricas em tempo real
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin') then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'players', (select count(*) from public.profiles),
    'balance_cents', (select coalesce(sum(balance_cents),0) from public.wallets),
    'deposits_cents', (select coalesce(sum(amount_cents),0) from public.transactions where kind='deposit' and status='completed'),
    'withdrawals_cents', (select coalesce(sum(-amount_cents),0) from public.transactions where kind='withdrawal' and status='completed'),
    'withdrawal_fees_cents', (select coalesce(sum(fee_cents),0) from public.payout_requests where status='completed'),
    'rake_cents', (select coalesce(sum(rake_cents),0) from public.solo_matches),
    'bet_volume_cents', (select coalesce(sum(-amount_cents),0) from public.transactions where kind='bet'),
    'pending_payouts', (select count(*) from public.payout_requests where status='pending'),
    'pending_payouts_cents', (select coalesce(sum(amount_cents),0) from public.payout_requests where status='pending')
  );
end $$;