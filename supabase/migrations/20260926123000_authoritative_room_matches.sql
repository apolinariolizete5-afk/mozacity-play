-- Authoritative multiplayer match records.
CREATE TABLE IF NOT EXISTS public.multiplayer_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL UNIQUE,
  game text NOT NULL CHECK (game IN ('ludo', 'checkers', 'chess')),
  player_one_id uuid NOT NULL,
  player_two_id uuid NOT NULL,
  bet_cents bigint NOT NULL DEFAULT 0 CHECK (bet_cents >= 0),
  player_one_locked boolean NOT NULL DEFAULT false,
  player_two_locked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','playing','finished','cancelled')),
  winner_id uuid,
  loser_id uuid,
  payout_cents bigint,
  rake_cents bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS multiplayer_matches_players_idx
  ON public.multiplayer_matches(player_one_id, player_two_id);

ALTER TABLE public.multiplayer_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "players can view their matches" ON public.multiplayer_matches;
CREATE POLICY "players can view their matches"
  ON public.multiplayer_matches
  FOR SELECT
  TO authenticated
  USING (auth.uid() = player_one_id OR auth.uid() = player_two_id);

CREATE OR REPLACE FUNCTION public.register_room_match(
  _room_code text,
  _game text,
  _player_one_id uuid,
  _player_two_id uuid,
  _bet_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.multiplayer_matches;
  v_code text := upper(trim(_room_code));
BEGIN
  IF auth.uid() IS NULL
     OR (auth.uid() <> _player_one_id AND auth.uid() <> _player_two_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF _player_one_id = _player_two_id THEN
    RAISE EXCEPTION 'invalid_match_participants';
  END IF;

  IF _bet_cents < 0 THEN
    RAISE EXCEPTION 'invalid_wager';
  END IF;

  IF _game NOT IN ('ludo','checkers','chess') THEN
    RAISE EXCEPTION 'invalid_game';
  END IF;

  SELECT * INTO v_row
  FROM public.multiplayer_matches
  WHERE room_code = v_code
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.player_one_id <> _player_one_id
       OR v_row.player_two_id <> _player_two_id
       OR v_row.game <> _game
       OR v_row.bet_cents <> _bet_cents THEN
      RAISE EXCEPTION 'room_match_mismatch';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'match_id', v_row.id,
      'bet_cents', v_row.bet_cents,
      'status', v_row.status,
      'already', true
    );
  END IF;

  INSERT INTO public.multiplayer_matches (
    room_code, game, player_one_id, player_two_id, bet_cents
  )
  VALUES (
    v_code, _game, _player_one_id, _player_two_id, _bet_cents
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'match_id', v_row.id,
    'bet_cents', v_row.bet_cents,
    'status', v_row.status,
    'already', false
  );
END;
$$;

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
  v_match public.multiplayer_matches;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_match
  FROM public.multiplayer_matches
  WHERE room_code = upper(trim(_room_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_registered';
  END IF;

  IF _user_id <> v_match.player_one_id AND _user_id <> v_match.player_two_id THEN
    RAISE EXCEPTION 'not_match_player';
  END IF;

  IF _amount_cents <> v_match.bet_cents THEN
    RAISE EXCEPTION 'wager_mismatch';
  END IF;

  IF _amount_cents = 0 THEN
    RETURN jsonb_build_object('ok', true, 'locked', 0, 'already', true);
  END IF;

  IF (_user_id = v_match.player_one_id AND v_match.player_one_locked)
     OR (_user_id = v_match.player_two_id AND v_match.player_two_locked) THEN
    RETURN jsonb_build_object('ok', true, 'locked', _amount_cents, 'already', true, 'status', v_match.status);
  END IF;

  SELECT balance_cents INTO v_balance
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
    user_id, amount_cents, type, status, description, reference
  ) VALUES (
    _user_id, -_amount_cents, 'wager', 'completed',
    'Aposta na sala ' || v_match.room_code,
    v_match.room_code
  );

  UPDATE public.multiplayer_matches
  SET player_one_locked =
        CASE WHEN _user_id = player_one_id THEN true ELSE player_one_locked END,
      player_two_locked =
        CASE WHEN _user_id = player_two_id THEN true ELSE player_two_locked END,
      status = CASE
        WHEN (CASE WHEN _user_id = player_one_id THEN true ELSE player_one_locked END)
         AND (CASE WHEN _user_id = player_two_id THEN true ELSE player_two_locked END)
        THEN 'playing'
        ELSE status
      END,
      started_at = CASE
        WHEN player_one_locked OR player_two_locked THEN COALESCE(started_at, now())
        ELSE started_at
      END
  WHERE id = v_match.id;

  SELECT status INTO v_match.status FROM public.multiplayer_matches WHERE id = v_match.id;

  RETURN jsonb_build_object('ok', true, 'locked', _amount_cents, 'already', false, 'status', v_match.status);
END;
$;

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
  v_match public.multiplayer_matches;
  v_total_pot bigint;
  v_rake bigint;
  v_payout bigint;
BEGIN
  IF auth.uid() IS NULL
     OR (auth.uid() <> _winner_id AND auth.uid() <> _loser_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_match
  FROM public.multiplayer_matches
  WHERE room_code = upper(trim(_room_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_registered';
  END IF;

  IF _winner_id = _loser_id
     OR NOT (
       (_winner_id = v_match.player_one_id AND _loser_id = v_match.player_two_id)
       OR
       (_winner_id = v_match.player_two_id AND _loser_id = v_match.player_one_id)
     ) THEN
    RAISE EXCEPTION 'match_players_mismatch';
  END IF;

  IF _bet_cents <> v_match.bet_cents THEN
    RAISE EXCEPTION 'wager_mismatch';
  END IF;

  IF v_match.status = 'finished' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'payout', COALESCE(v_match.payout_cents, 0),
      'rake', COALESCE(v_match.rake_cents, 0)
    );
  END IF;

  IF _bet_cents = 0 THEN
    UPDATE public.multiplayer_matches
    SET status = 'finished',
        winner_id = _winner_id,
        loser_id = _loser_id,
        payout_cents = 0,
        rake_cents = 0,
        finished_at = now()
    WHERE id = v_match.id;

    RETURN jsonb_build_object('ok', true, 'already', false, 'payout', 0, 'rake', 0);
  END IF;

  IF NOT v_match.player_one_locked OR NOT v_match.player_two_locked THEN
    RAISE EXCEPTION 'both_wagers_must_be_locked';
  END IF;

  v_total_pot := _bet_cents * 2;
  v_rake := round(v_total_pot * 0.08);
  v_payout := v_total_pot - v_rake;

  PERFORM 1 FROM public.wallets WHERE user_id = _winner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'winner_wallet_not_found';
  END IF;

  UPDATE public.wallets
  SET balance_cents = balance_cents + v_payout,
      withdrawable_cents = withdrawable_cents + v_payout,
      updated_at = now()
  WHERE user_id = _winner_id;

  INSERT INTO public.transactions (
    user_id, amount_cents, type, status, description, reference
  ) VALUES (
    _winner_id, v_payout, 'payout', 'completed',
    'Prémio da sala ' || v_match.room_code || ' (taxa de 8% deduzida)',
    v_match.room_code
  );

  UPDATE public.multiplayer_matches
  SET status = 'finished',
      winner_id = _winner_id,
      loser_id = _loser_id,
      payout_cents = v_payout,
      rake_cents = v_rake,
      finished_at = now()
  WHERE id = v_match.id;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'payout', v_payout,
    'rake', v_rake
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_room_match(text,text,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_room_wager(text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_room_match(text,uuid,uuid,bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_room_match(text,text,uuid,uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_room_wager(text,uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_room_match(text,uuid,uuid,bigint) TO authenticated;
