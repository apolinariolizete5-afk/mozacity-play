-- Safely cancel a ready room and refund any wagers already locked.
-- Refunds are performed under a row lock and are idempotent because the match
-- is moved to cancelled in the same transaction.
CREATE OR REPLACE FUNCTION public.cancel_room_match(
  _room_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.multiplayer_matches;
  v_refund_one bigint := 0;
  v_refund_two bigint := 0;
  v_reference text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_match
  FROM public.multiplayer_matches
  WHERE room_code = upper(trim(_room_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_registered';
  END IF;

  IF auth.uid() <> v_match.player_one_id
     AND auth.uid() <> v_match.player_two_id THEN
    RAISE EXCEPTION 'not_match_player';
  END IF;

  -- A started match must be settled/forfeited, never refunded as a room cancel.
  IF v_match.status <> 'ready' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', v_match.status = 'cancelled',
      'status', v_match.status,
      'refunded_cents', 0
    );
  END IF;

  -- Lock every affected wallet before changing the match, then refund only
  -- the wagers that were actually locked.
  IF v_match.player_one_locked THEN
    PERFORM 1
    FROM public.wallets
    WHERE user_id = v_match.player_one_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'player_one_wallet_not_found';
    END IF;

    v_refund_one := v_match.bet_cents;
  END IF;

  IF v_match.player_two_locked THEN
    PERFORM 1
    FROM public.wallets
    WHERE user_id = v_match.player_two_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'player_two_wallet_not_found';
    END IF;

    v_refund_two := v_match.bet_cents;
  END IF;

  IF v_refund_one > 0 THEN
    UPDATE public.wallets
    SET balance_cents = balance_cents + v_refund_one,
        updated_at = now()
    WHERE user_id = v_match.player_one_id;

    v_reference := v_match.room_code || ':refund:' || v_match.player_one_id::text;
    INSERT INTO public.transactions (
      user_id, amount_cents, type, status, description, reference
    ) VALUES (
      v_match.player_one_id,
      v_refund_one,
      'refund',
      'completed',
      'Devolução da caução da sala ' || v_match.room_code,
      v_reference
    );
  END IF;

  IF v_refund_two > 0 THEN
    UPDATE public.wallets
    SET balance_cents = balance_cents + v_refund_two,
        updated_at = now()
    WHERE user_id = v_match.player_two_id;

    v_reference := v_match.room_code || ':refund:' || v_match.player_two_id::text;
    INSERT INTO public.transactions (
      user_id, amount_cents, type, status, description, reference
    ) VALUES (
      v_match.player_two_id,
      v_refund_two,
      'refund',
      'completed',
      'Devolução da caução da sala ' || v_match.room_code,
      v_reference
    );
  END IF;

  UPDATE public.multiplayer_matches
  SET status = 'cancelled',
      finished_at = now()
  WHERE id = v_match.id
    AND status = 'ready';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_cancel_race';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'status', 'cancelled',
    'refunded_cents', v_refund_one + v_refund_two
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_room_match(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_room_match(text) TO authenticated;
