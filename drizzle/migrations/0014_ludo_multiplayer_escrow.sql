-- Multiplayer Ludo escrow: support 2-4 player wagers and settlement.
-- Kept as 0014 because 0008 is already used by the repository.
alter table public.room_escrows
  add column if not exists player_three uuid references auth.users(id),
  add column if not exists player_four uuid references auth.users(id),
  add column if not exists locked_three boolean not null default false,
  add column if not exists locked_four boolean not null default false,
  add column if not exists total_players integer not null default 2;

create or replace function public.register_room_match_multi(
  _room_code text, _game text, _player_ids uuid[], _bet_cents bigint
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e public.room_escrows;
  num_players integer;
  normalized_code text := upper(trim(_room_code));
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if normalized_code is null or length(normalized_code) < 4 then raise exception 'invalid_room'; end if;
  if _game not in ('ludo','checkers','chess') then raise exception 'invalid_game'; end if;
  if _bet_cents < 0 then raise exception 'invalid_bet'; end if;
  num_players := coalesce(array_length(_player_ids, 1), 0);
  if num_players < 2 or num_players > 4 then raise exception 'invalid_players_count'; end if;
  if _player_ids[1] is null or _player_ids[2] is null then raise exception 'invalid_players'; end if;
  if _player_ids[1] = _player_ids[2]
     or (num_players >= 3 and (_player_ids[3] is null or _player_ids[3] in (_player_ids[1],_player_ids[2])))
     or (num_players = 4 and (_player_ids[4] is null or _player_ids[4] in (_player_ids[1],_player_ids[2],_player_ids[3])))
  then raise exception 'invalid_players'; end if;
  if not (uid = any(_player_ids)) then raise exception 'not_participant'; end if;

  select * into e from public.room_escrows where room_code = normalized_code for update;

  if e.room_code is null then
    insert into public.room_escrows (
      room_code, game, player_one, player_two, player_three, player_four,
      total_players, bet_cents, status
    ) values (
      normalized_code, _game, _player_ids[1], _player_ids[2],
      case when num_players >= 3 then _player_ids[3] end,
      case when num_players = 4 then _player_ids[4] end,
      num_players, _bet_cents,
      case when _bet_cents = 0 then 'playing' else 'ready' end
    ) returning * into e;
  else
    if e.game <> _game or e.bet_cents <> _bet_cents or e.total_players <> num_players
       or e.player_one <> _player_ids[1] or e.player_two <> _player_ids[2]
       or e.player_three is distinct from case when num_players >= 3 then _player_ids[3] end
       or e.player_four is distinct from case when num_players = 4 then _player_ids[4] end
    then raise exception 'room_match_mismatch'; end if;
    if e.status in ('finished','cancelled') then raise exception 'room_closed'; end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'match_id', e.room_code, 'bet_cents', e.bet_cents,
    'total_players', e.total_players, 'status', e.status
  );
end
$$;

create or replace function public.lock_room_wager(_room_code text, _amount_cents bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e public.room_escrows;
  avail bigint;
  blocked boolean;
  s public.platform_settings;
  already_locked boolean := false;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into e from public.room_escrows where room_code = upper(trim(_room_code)) for update;
  if e.room_code is null then raise exception 'unknown_room'; end if;
  if uid not in (e.player_one,e.player_two,e.player_three,e.player_four) then raise exception 'not_participant'; end if;
  if e.bet_cents <> _amount_cents then raise exception 'bet_mismatch'; end if;
  if e.status in ('finished','cancelled') then return jsonb_build_object('ok',false,'status',e.status); end if;

  already_locked := (uid=e.player_one and e.locked_one)
                 or (uid=e.player_two and e.locked_two)
                 or (uid=e.player_three and e.locked_three)
                 or (uid=e.player_four and e.locked_four);
  if already_locked then
    return jsonb_build_object('ok',true,'already',true,'locked',e.bet_cents,'status',e.status);
  end if;
  if e.status <> 'ready' then raise exception 'match_not_waiting'; end if;

  select is_blocked into blocked from public.profiles where id=uid;
  if coalesce(blocked,false) then raise exception 'account_blocked'; end if;
  select * into s from public.platform_settings where id=1;
  if e.bet_cents < s.min_bet_cents then raise exception 'below_min_bet'; end if;

  perform public.ensure_wallet(uid);
  select balance_cents-locked_cents into avail from public.wallets where user_id=uid for update;
  if avail < e.bet_cents then raise exception 'insufficient_funds'; end if;

  update public.wallets
     set balance_cents=balance_cents-e.bet_cents,
         wagered_cents=wagered_cents+e.bet_cents,
         rollover_required_cents=greatest(0,rollover_required_cents-e.bet_cents),
         updated_at=now()
   where user_id=uid;

  insert into public.transactions(user_id,kind,amount_cents,status,idempotency_key,description)
  values(uid,'bet',-e.bet_cents,'completed',
         'rbet_'||e.room_code||'_'||replace(uid::text,'-',''),
         'Aposta em '||e.game||' (sala '||e.room_code||')');

  update public.room_escrows
     set locked_one = locked_one or uid=player_one,
         locked_two = locked_two or uid=player_two,
         locked_three = locked_three or uid=player_three,
         locked_four = locked_four or uid=player_four
   where room_code=e.room_code
   returning * into e;

  update public.room_escrows
     set status = case
       when (not e.locked_one and e.player_one is not null)
         or (not e.locked_two and e.player_two is not null)
         or (e.total_players >= 3 and not e.locked_three)
         or (e.total_players = 4 and not e.locked_four)
       then 'ready' else 'playing' end
   where room_code=e.room_code
   returning * into e;

  update public.profiles set last_seen_at=now() where id=uid;
  return jsonb_build_object('ok',true,'locked',e.bet_cents,'status',e.status);
end
$$;

create or replace function public.settle_room_result_multi(_room_code text, _winner_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e public.room_escrows;
  s public.platform_settings;
  total_pot bigint;
  rake bigint;
  payout bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into e from public.room_escrows where room_code=upper(trim(_room_code)) for update;
  if e.room_code is null then raise exception 'room_not_found'; end if;
  if uid not in (e.player_one,e.player_two,e.player_three,e.player_four) then raise exception 'not_participant'; end if;
  if _winner_id is null or _winner_id not in (e.player_one,e.player_two,e.player_three,e.player_four) then
    raise exception 'invalid_winner';
  end if;
  if e.status='finished' then
    return jsonb_build_object('ok',true,'already',true,'winner_id',e.winner_id,'payout_cents',e.payout_cents,'rake_cents',e.rake_cents);
  end if;
  if e.status <> 'playing' then raise exception 'match_not_started'; end if;

  select * into s from public.platform_settings where id=1;
  total_pot := e.bet_cents * coalesce(e.total_players,2);
  rake := floor((total_pot * coalesce(s.house_fee_percent,5))/100.0)::bigint;
  payout := greatest(0,total_pot-rake);

  if payout > 0 then
    update public.wallets set balance_cents=balance_cents+payout, updated_at=now() where user_id=_winner_id;
    insert into public.transactions(user_id,kind,amount_cents,status,idempotency_key,description,metadata)
    values(_winner_id,'prize',payout,'completed','rpay_'||e.room_code,
           'Prémio de '||e.game,
           jsonb_build_object('rake_cents',rake,'pot_cents',total_pot,'room',e.room_code,'players',e.total_players));
  end if;

  update public.room_escrows
     set status='finished', winner_id=_winner_id, payout_cents=payout, rake_cents=rake, finished_at=now()
   where room_code=e.room_code;

  return jsonb_build_object('ok',true,'winner_id',_winner_id,'total_pot',total_pot,'payout_cents',payout,'rake_cents',rake);
end
$$;

revoke all on function public.register_room_match_multi(text,text,uuid[],bigint) from public,anon;
revoke all on function public.settle_room_result_multi(text,uuid) from public,anon;
revoke all on function public.lock_room_wager(text,bigint) from public,anon;
grant execute on function public.register_room_match_multi(text,text,uuid[],bigint) to authenticated;
grant execute on function public.settle_room_result_multi(text,uuid) to authenticated;
grant execute on function public.lock_room_wager(text,bigint) to authenticated;
