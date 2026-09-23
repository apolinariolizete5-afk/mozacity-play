ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS test_mode_enabled boolean NOT NULL DEFAULT true;

-- Simulação Netshop: o próprio jogador confirma o depósito enquanto a gateway
-- real não está ligada. Bloqueado assim que o modo de teste for desligado.
CREATE OR REPLACE FUNCTION public.settle_own_test_deposit(_idempotency_key text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare uid uuid := auth.uid(); t public.transactions; s public.platform_settings;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into s from public.platform_settings where id = 1;
  if not s.test_mode_enabled then raise exception 'test_mode_disabled'; end if;
  select * into t from public.transactions
   where idempotency_key = _idempotency_key and user_id = uid and kind = 'deposit' for update;
  if t.id is null then raise exception 'unknown_transaction'; end if;
  if t.status <> 'pending' then return 'already_settled'; end if;
  update public.transactions set status = 'completed', provider_ref = 'TEST-' || left(replace(t.id::text,'-',''), 12) where id = t.id;
  update public.wallets
     set balance_cents = balance_cents + t.amount_cents,
         rollover_required_cents = rollover_required_cents + floor(t.amount_cents * s.rollover_multiplier)::bigint,
         updated_at = now()
   where user_id = uid;
  insert into public.notifications (user_id, title, body, kind)
  values (uid, 'Depósito confirmado',
          'Creditámos ' || to_char(t.amount_cents/100.0,'FM999999990.00') || ' MT na tua carteira.', 'system');
  return 'settled';
end $$;

CREATE OR REPLACE FUNCTION public.admin_set_test_mode(_enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin') then raise exception 'forbidden'; end if;
  update public.platform_settings set test_mode_enabled = _enabled, updated_at = now() where id = 1;
  insert into public.admin_audit_log (admin_id, action, details)
  values (uid, 'set_test_mode', jsonb_build_object('enabled', _enabled));
end $$;