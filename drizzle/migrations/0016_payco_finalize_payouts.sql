-- 0016: finalize PAY.CO.MZ payout migration.
-- The older migrations remain immutable history; all live payout entry points are PAY.CO.MZ.

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
  IF p.status::text <> 'pending' THEN RAISE EXCEPTION 'payout_already_processing'; END IF;

  UPDATE public.payout_requests
     SET status = 'processing'::public.tx_status,
         error = NULL,
         updated_at = now()
   WHERE id = _payout_id
     AND status::text = 'pending';

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

DROP FUNCTION IF EXISTS public.process_netshop_payout_webhook(text,uuid,text,text,text);
DROP FUNCTION IF EXISTS public.admin_record_payout_provider(uuid,text,text);
