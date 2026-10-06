-- 0015: PAY.CO.MZ payout lifecycle.
-- Keeps withdrawals provider-neutral and replaces the legacy NetShop webhook RPC.

CREATE OR REPLACE FUNCTION public.record_payco_payout_provider(
  _payout_id uuid,
  _provider_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.payout_requests
     SET status = 'processing'::public.tx_status,
         provider_ref = nullif(left(trim(coalesce(_provider_ref,'')),120),''),
         provider_status = 'processing',
         updated_at = now()
   WHERE id = _payout_id
     AND user_id = uid
     AND status::text IN ('pending','processing');

  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found_or_already_settled'; END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'processing');
END;
$$;

REVOKE ALL ON FUNCTION public.record_payco_payout_provider(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_payco_payout_provider(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_payco_payout_webhook(
  _reference text,
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
  st text := lower(trim(coalesce(_status,'')));
  ref text := trim(coalesce(_reference,''));
BEGIN
  SELECT *
    INTO p
    FROM public.payout_requests
   WHERE id::text = ref
      OR provider_ref = ref
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  IF p.status::text = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'already_completed', true);
  END IF;

  IF st IN ('completed','success','succeeded','successful','paid') THEN
    UPDATE public.payout_requests
       SET status = 'completed'::public.tx_status,
           provider_ref = coalesce(nullif(left(trim(coalesce(_provider_ref,'')),120),''), provider_ref),
           provider_status = st,
           error = NULL,
           processed_at = now(),
           updated_at = now()
     WHERE id = p.id;

    UPDATE public.transactions
       SET status = 'completed'::public.tx_status,
           metadata = coalesce(metadata, '{}'::jsonb) ||
                      jsonb_build_object('provider_ref', coalesce(_provider_ref, ''))
     WHERE user_id = p.user_id
       AND kind::text = 'withdrawal'
       AND metadata->>'payout_id' = p.id::text
       AND status::text <> 'completed';

    PERFORM public.notify_user(
      p.user_id,
      'Levantamento concluído',
      'O teu levantamento foi confirmado pela PAY.CO.MZ.',
      'system',
      '/wallet'
    );

    RETURN jsonb_build_object('ok', true, 'status', 'completed');
  END IF;

  IF st IN ('failed','rejected','cancelled','canceled','error','expired','reversed') THEN
    RETURN public.refund_failed_payout(p.id, coalesce(_reason, 'provider_rejected'));
  END IF;

  UPDATE public.payout_requests
     SET status = 'processing'::public.tx_status,
         provider_ref = coalesce(nullif(left(trim(coalesce(_provider_ref,'')),120),''), provider_ref),
         provider_status = st,
         updated_at = now()
   WHERE id = p.id;

  RETURN jsonb_build_object('ok', true, 'status', 'processing');
END;
$$;

REVOKE ALL ON FUNCTION public.process_payco_payout_webhook(text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.process_payco_payout_webhook(text,text,text,text) TO anon, authenticated;
