-- 0011: real NetShop B2C payout lifecycle.
-- Depends on 0010 so the processing enum value is committed before use.
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _amount_cents bigint,
  _method text,
  _destination text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  w record;
  s record;
  fee_fixed bigint;
  fee_pct bigint;
  fee_total bigint;
  net_cents bigint;
  payout_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _method NOT IN ('mpesa','mola','mcash','bank') THEN RAISE EXCEPTION 'invalid_method'; END IF;
  IF length(trim(_destination)) < 6 THEN RAISE EXCEPTION 'invalid_destination'; END IF;

  SELECT * INTO s FROM public.platform_settings WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_settings_missing'; END IF;
  IF _amount_cents < s.min_withdrawal_cents THEN RAISE EXCEPTION 'amount_below_minimum'; END IF;

  SELECT * INTO w FROM public.wallets WHERE user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF w.withdrawable_cents < _amount_cents OR w.balance_cents < _amount_cents THEN
    RAISE EXCEPTION 'insufficient_withdrawable_balance';
  END IF;

  fee_fixed := s.withdrawal_fee_fixed_cents;
  fee_pct := floor((_amount_cents * s.withdrawal_fee_percent) / 100.0)::bigint;
  fee_total := fee_fixed + fee_pct;
  net_cents := _amount_cents - fee_total;
  IF net_cents <= 0 THEN RAISE EXCEPTION 'fee_exceeds_amount'; END IF;

  UPDATE public.wallets
     SET balance_cents = balance_cents - _amount_cents,
         withdrawable_cents = withdrawable_cents - _amount_cents,
         updated_at = now()
   WHERE user_id = uid;

  INSERT INTO public.payout_requests
    (user_id, amount_cents, method, destination, status, created_at, updated_at)
  VALUES
    (uid, net_cents, _method::public.wallet_method, trim(_destination),
     'pending'::public.tx_status, now(), now())
  RETURNING id INTO payout_id;

  INSERT INTO public.transactions
    (user_id, kind, amount_cents, status, description, metadata)
  VALUES
    (uid, 'withdrawal', -_amount_cents, 'pending',
     'Pedido de levantamento via ' || _method,
     jsonb_build_object(
       'payout_id', payout_id,
       'gross_cents', _amount_cents,
       'fee_cents', fee_total,
       'net_cents', net_cents,
       'destination', trim(_destination)
     ));

  RETURN jsonb_build_object(
    'ok', true,
    'payout_id', payout_id,
    'gross_cents', _amount_cents,
    'fee_cents', fee_total,
    'net_cents', net_cents,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal(bigint,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(bigint,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_failed_payout(
  _payout_id uuid,
  _reason text DEFAULT 'provider_rejected'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  gross_cents bigint;
BEGIN
  SELECT * INTO p
    FROM public.payout_requests
   WHERE id = _payout_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  IF p.status::text = 'failed' THEN
    RETURN jsonb_build_object('ok', true, 'already_refunded', true);
  END IF;

  IF p.status::text = 'completed' THEN
    RAISE EXCEPTION 'payout_already_completed';
  END IF;

  SELECT abs(t.amount_cents)
    INTO gross_cents
    FROM public.transactions t
   WHERE t.user_id = p.user_id
     AND t.kind::text = 'withdrawal'
     AND t.metadata->>'payout_id' = _payout_id::text
   ORDER BY t.created_at DESC
   LIMIT 1;

  IF coalesce(gross_cents, 0) <= 0 THEN
    gross_cents := p.amount_cents;
  END IF;

  UPDATE public.payout_requests
     SET status = 'failed'::public.tx_status,
         error = left(coalesce(_reason, 'provider_rejected'), 240),
         updated_at = now(),
         processed_at = now()
   WHERE id = _payout_id;

  UPDATE public.transactions
     SET status = 'failed'::public.tx_status,
         metadata = coalesce(metadata, '{}'::jsonb) ||
                    jsonb_build_object('failure_reason', coalesce(_reason, 'provider_rejected'))
   WHERE user_id = p.user_id
     AND kind::text = 'withdrawal'
     AND metadata->>'payout_id' = _payout_id::text
     AND status::text <> 'failed';

  UPDATE public.wallets
     SET balance_cents = balance_cents + gross_cents,
         withdrawable_cents = withdrawable_cents + gross_cents,
         updated_at = now()
   WHERE user_id = p.user_id;

  INSERT INTO public.transactions
    (user_id, kind, amount_cents, status, description, metadata)
  VALUES
    (p.user_id, 'refund', gross_cents, 'completed',
     'Estorno de levantamento não concluído',
     jsonb_build_object('payout_id', _payout_id, 'reason', coalesce(_reason, 'provider_rejected')));

  PERFORM public.notify_user(
    p.user_id,
    'Levantamento recusado',
    'O levantamento não foi concluído. O valor foi devolvido à tua carteira.',
    'system',
    '/wallet'
  );

  RETURN jsonb_build_object('ok', true, 'refunded_cents', gross_cents);
END;
$$;

REVOKE ALL ON FUNCTION public.refund_failed_payout(uuid,text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_claim_payout(_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p record;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin'
  ) THEN RAISE EXCEPTION 'admin_required'; END IF;

  SELECT * INTO p FROM public.payout_requests WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  IF p.status::text = 'completed' THEN RAISE EXCEPTION 'payout_already_completed'; END IF;
  IF p.status::text = 'failed' THEN RAISE EXCEPTION 'payout_already_failed'; END IF;

  UPDATE public.payout_requests
     SET status = 'processing'::public.tx_status,
         error = NULL,
         updated_at = now()
   WHERE id = _payout_id
     AND status::text IN ('pending','processing');

  SELECT * INTO p FROM public.payout_requests WHERE id = _payout_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payout_id', p.id,
    'user_id', p.user_id,
    'amount_cents', p.amount_cents,
    'method', p.method,
    'destination', p.destination,
    'status', p.status,
    'provider_ref', p.provider_ref
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_claim_payout(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_claim_payout(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_record_payout_provider(
  _payout_id uuid,
  _provider_ref text,
  _error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin'
  ) THEN RAISE EXCEPTION 'admin_required'; END IF;

  UPDATE public.payout_requests
     SET status = 'processing'::public.tx_status,
         provider_ref = nullif(left(trim(coalesce(_provider_ref,'')),120),''),
         error = nullif(left(trim(coalesce(_error,'')),240),''),
         updated_at = now()
   WHERE id = _payout_id
     AND status::text = 'processing';

  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_processing'; END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'processing');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_payout_provider(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_payout_provider(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_netshop_payout_webhook(
  _token text,
  _payout_id uuid,
  _status text,
  _provider_ref text DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  st text := lower(trim(_status));
BEGIN
  IF NOT public.internal_secret_matches('wallet_rpc_token', _token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO p FROM public.payout_requests WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  IF p.status::text = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'already_completed', true);
  END IF;

  IF st IN ('completed','success','succeeded','paid') THEN
    UPDATE public.payout_requests
       SET status = 'completed'::public.tx_status,
           provider_ref = coalesce(nullif(left(trim(coalesce(_provider_ref,'')),120),''), provider_ref),
           error = NULL,
           processed_at = now(),
           updated_at = now()
     WHERE id = _payout_id;

    UPDATE public.transactions
       SET status = 'completed'::public.tx_status,
           metadata = coalesce(metadata, '{}'::jsonb) ||
                      jsonb_build_object('provider_ref', coalesce(_provider_ref, ''))
     WHERE user_id = p.user_id
       AND kind::text = 'withdrawal'
       AND metadata->>'payout_id' = _payout_id::text;

    PERFORM public.notify_user(
      p.user_id,
      'Levantamento enviado',
      'O teu levantamento foi confirmado pelo provedor.',
      'system',
      '/wallet'
    );

    RETURN jsonb_build_object('ok', true, 'status', 'completed');
  END IF;

  IF st IN ('failed','rejected','cancelled','canceled','error') THEN
    RETURN public.refund_failed_payout(_payout_id, coalesce(_reason, 'provider_rejected'));
  END IF;

  RETURN jsonb_build_object('ok', true, 'ignored_status', st);
END;
$$;

REVOKE ALL ON FUNCTION public.process_netshop_payout_webhook(text,uuid,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.process_netshop_payout_webhook(text,uuid,text,text,text) TO anon, authenticated;


-- Include both pending and processing orders in the admin queue.
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  deposits bigint := 0;
  withdrawals bigint := 0;
  withdrawal_fees bigint := 0;
  rake bigint := 0;
  bet_volume bigint := 0;
  balance bigint := 0;
  players bigint := 0;
  pending_count bigint := 0;
  pending_amount bigint := 0;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin'
  ) THEN RAISE EXCEPTION 'admin_required'; END IF;

  SELECT count(*) INTO players FROM auth.users u
   WHERE coalesce(lower(u.raw_user_meta_data->>'is_anonymous'), 'false')
         NOT IN ('true','1','yes');

  SELECT coalesce(sum(balance_cents),0) INTO balance FROM public.wallets;

  SELECT
    coalesce(sum(case when kind::text = 'deposit' then abs(amount_cents) else 0 end),0),
    coalesce(sum(case when kind::text = 'withdrawal' then abs(amount_cents) else 0 end),0),
    coalesce(sum(case when kind::text = 'bet' then abs(amount_cents) else 0 end),0),
    coalesce(sum(case when kind::text = 'prize' and coalesce(metadata,'{}'::jsonb) ? 'rake_cents'
                      then coalesce((metadata->>'rake_cents')::bigint,0) else 0 end),0)
    INTO deposits, withdrawals, bet_volume, rake
    FROM public.transactions
   WHERE status::text = 'completed';

  SELECT count(*), coalesce(sum(amount_cents),0)
    INTO pending_count, pending_amount
    FROM public.payout_requests
   WHERE status::text IN ('pending','processing');

  RETURN jsonb_build_object(
    'players', players,
    'balance_cents', balance,
    'deposits_cents', deposits,
    'withdrawals_cents', withdrawals,
    'withdrawal_fees_cents', withdrawal_fees,
    'rake_cents', rake,
    'bet_volume_cents', bet_volume,
    'pending_payouts', pending_count,
    'pending_payouts_cents', pending_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
