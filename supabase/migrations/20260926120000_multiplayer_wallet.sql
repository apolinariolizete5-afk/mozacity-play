-- MozaPlay: escrow and settlement for paid multiplayer rooms.
-- Run this migration in the Lovable Cloud SQL editor if the project does
-- not automatically apply repository migrations.

CREATE OR REPLACE FUNCTION public.lock_room_wager(
  _room_code text,
  _user_id uuid,
  _amount_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
  v_existing bigint;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _amount_cents < 0 THEN
    RAISE EXCEPTION 'invalid_wager';
  END IF;

  IF _amount_cents = 0 THEN
    RETURN jsonb_build_object('ok', true, 'locked', 0, 'already', false);
  END IF;

  -- Idempotency: the same authenticated player cannot lock the same room twice.
  SELECT amount_cents
    INTO v_existing
  FROM public.transactions
  WHERE user_id = _user_id
    AND type = 'wager'
    AND reference = _room_code
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    IF v_existing = -_amount_cents THEN
      RETURN jsonb_build_object(
        'ok', true,
        'locked', _amount_cents,
        'already', true
      );
    END IF;

    RAISE EXCEPTION 'room_wager_mismatch';
  END IF;

  SELECT balance_cents
    INTO v_balance
  FROM public.wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < _amount_cents THEN
    RAISE EXCEPTION 'Saldo insuficiente para a aposta de % MT', (_amount_cents / 100.0);
  END IF;

  UPDATE public.wallets
  SET balance_cents = balance_cents - _amount_cents,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.transactions (
    user_id,
    amount_cents,
    type,
    status,
    description,
    reference
  ) VALUES (
    _user_id,
    -_amount_cents,
    'wager',
    'completed',
    'Aposta na sala ' || _room_code,
    _room_code
  );

  RETURN jsonb_build_object(
    'ok', true,
    'locked', _amount_cents,
    'already', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_room_match(
  _room_code text,
  _winner_id uuid,
  _loser_id uuid,
  _bet_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_pot bigint;
  v_rake bigint;
  v_payout bigint;
  v_existing bigint;
BEGIN
  IF auth.uid() IS NULL
     OR (auth.uid() <> _winner_id AND auth.uid() <> _loser_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _winner_id = _loser_id THEN
    RAISE EXCEPTION 'invalid_match_participants';
  END IF;

  IF _bet_cents < 0 THEN
    RAISE EXCEPTION 'invalid_wager';
  END IF;

  IF _bet_cents = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'payout', 0,
      'rake', 0,
      'already', false
    );
  END IF;

  -- Idempotency: never pay the same room twice.
  SELECT amount_cents
    INTO v_existing
  FROM public.transactions
  WHERE user_id = _winner_id
    AND type = 'payout'
    AND reference = _room_code
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'payout', v_existing,
      'rake', (_bet_cents * 2) - v_existing,
      'already', true
    );
  END IF;

  v_total_pot := _bet_cents * 2;
  v_rake := round(v_total_pot * 0.08);
  v_payout := v_total_pot - v_rake;

  -- Lock the winner wallet row before crediting it.
  PERFORM 1
  FROM public.wallets
  WHERE user_id = _winner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'winner_wallet_not_found';
  END IF;

  UPDATE public.wallets
  SET balance_cents = balance_cents + v_payout,
      withdrawable_cents = withdrawable_cents + v_payout,
      updated_at = now()
  WHERE user_id = _winner_id;

  INSERT INTO public.transactions (
    user_id,
    amount_cents,
    type,
    status,
    description,
    reference
  ) VALUES (
    _winner_id,
    v_payout,
    'payout',
    'completed',
    'Prémio da sala ' || _room_code || ' (taxa de 8% deduzida)',
    _room_code
  );

  RETURN jsonb_build_object(
    'ok', true,
    'payout', v_payout,
    'rake', v_rake,
    'already', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lock_room_wager(text, uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_room_match(text, uuid, uuid, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.lock_room_wager(text, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_room_match(text, uuid, uuid, bigint) TO authenticated;
