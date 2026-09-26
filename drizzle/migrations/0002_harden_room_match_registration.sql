-- Strengthen multiplayer escrow registration.
-- A room can only be registered once with the exact same game, players and bet.
-- This prevents a client from changing the opponent or wager after the room exists.
create or replace function public.register_room_match(
  _room_code text,
  _game text,
  _player_one_id uuid,
  _player_two_id uuid,
  _bet_cents bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e public.room_escrows;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if _room_code is null or length(trim(_room_code)) < 4 then raise exception 'invalid_room'; end if;
  if _game not in ('ludo','checkers','chess') then raise exception 'invalid_game'; end if;
  if _player_one_id = _player_two_id then raise exception 'invalid_players'; end if;
  if uid not in (_player_one_id, _player_two_id) then raise exception 'not_participant'; end if;
  if _bet_cents < 0 then raise exception 'invalid_bet'; end if;

  select * into e
    from public.room_escrows
   where room_code = upper(trim(_room_code))
   for update;

  if e.room_code is null then
    insert into public.room_escrows (
      room_code, game, player_one, player_two, bet_cents, status
    )
    values (
      upper(trim(_room_code)),
      _game,
      _player_one_id,
      _player_two_id,
      _bet_cents,
      case when _bet_cents = 0 then 'playing' else 'ready' end
    )
    returning * into e;
  else
    if e.game <> _game
       or e.player_one <> _player_one_id
       or e.player_two <> _player_two_id
       or e.bet_cents <> _bet_cents
    then
      raise exception 'room_match_mismatch';
    end if;

    if e.status in ('finished','cancelled') then
      raise exception 'room_closed';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'match_id', e.room_code,
    'bet_cents', e.bet_cents,
    'status', e.status
  );
end
$$;

revoke all on function public.register_room_match(text,text,uuid,uuid,bigint) from public, anon;
grant execute on function public.register_room_match(text,text,uuid,uuid,bigint) to authenticated;

-- Locking is allowed only while the escrow is waiting for both deposits.
-- A finished/cancelled room can never receive a new wager.
create or replace function public.lock_room_wager(_room_code text, _amount_cents bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e public.room_escrows;
  avail bigint;
  blocked boolean;
  s public.platform_settings;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into e
    from public.room_escrows
   where room_code = upper(trim(_room_code))
   for update;

  if e.room_code is null then raise exception 'unknown_room'; end if;
  if uid not in (e.player_one, e.player_two) then raise exception 'not_participant'; end if;
  if e.bet_cents <> _amount_cents then raise exception 'bet_mismatch'; end if;

  if e.status = 'finished' or e.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'status', e.status);
  end if;

  if e.status = 'playing' and (
    (uid = e.player_one and e.locked_one) or
    (uid = e.player_two and e.locked_two)
  ) then
    return jsonb_build_object('ok', true, 'already', true, 'locked', e.bet_cents, 'status', e.status);
  end if;

  if (uid = e.player_one and e.locked_one) or (uid = e.player_two and e.locked_two) then
    return jsonb_build_object('ok', true, 'already', true, 'locked', e.bet_cents, 'status', e.status);
  end if;

  if e.status <> 'ready' then
    raise exception 'match_not_waiting';
  end if;

  select is_blocked into blocked from public.profiles where id = uid;
  if coalesce(blocked,false) then raise exception 'account_blocked'; end if;

  select * into s from public.platform_settings where id = 1;
  if e.bet_cents < s.min_bet_cents then raise exception 'below_min_bet'; end if;

  perform public.ensure_wallet(uid);
  select balance_cents - locked_cents
    into avail
    from public.wallets
   where user_id = uid
   for update;

  if avail < e.bet_cents then raise exception 'insufficient_funds'; end if;

  update public.wallets
     set balance_cents = balance_cents - e.bet_cents,
         wagered_cents = wagered_cents + e.bet_cents,
         rollover_required_cents = greatest(0, rollover_required_cents - e.bet_cents),
         updated_at = now()
   where user_id = uid;

  insert into public.transactions (
    user_id, kind, amount_cents, status, idempotency_key, description
  )
  values (
    uid,
    'bet',
    -e.bet_cents,
    'completed',
    'rbet_' || e.room_code || '_' || replace(uid::text,'-',''),
    'Aposta em ' || e.game || ' (sala ' || e.room_code || ')'
  )
  on conflict (idempotency_key) do nothing;

  if uid = e.player_one then
    e.locked_one := true;
  else
    e.locked_two := true;
  end if;

  update public.room_escrows
     set locked_one = e.locked_one,
         locked_two = e.locked_two,
         status = case when e.locked_one and e.locked_two then 'playing' else 'ready' end
   where room_code = e.room_code
   returning * into e;

  update public.profiles set last_seen_at = now() where id = uid;

  return jsonb_build_object(
    'ok', true,
    'locked', e.bet_cents,
    'status', e.status
  );
end
$$;

revoke all on function public.lock_room_wager(text,bigint) from public, anon;
grant execute on function public.lock_room_wager(text,bigint) to authenticated;
