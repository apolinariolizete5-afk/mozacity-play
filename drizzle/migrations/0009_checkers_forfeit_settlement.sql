-- Server-authoritative abandonment settlement for Damas.
-- The player who leaves can never choose the winner: the database always
-- selects the other participant and settles/refunds atomically.
create or replace function public.forfeit_room_match(_room_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e public.room_escrows;
  s public.platform_settings;
  winner uuid;
  pot bigint := 0;
  rake bigint := 0;
  payout bigint := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into e
    from public.room_escrows
   where room_code = upper(trim(_room_code))
   for update;

  if e.room_code is null then raise exception 'unknown_room'; end if;
  if e.game <> 'checkers' then raise exception 'unsupported_game'; end if;
  if uid not in (e.player_one, e.player_two) then raise exception 'not_participant'; end if;

  if e.status = 'finished' then
    return jsonb_build_object(
      'ok', true,
      'status', 'finished',
      'winner_id', e.winner_id,
      'payout', e.payout_cents,
      'rake', e.rake_cents
    );
  end if;

  if e.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;

  -- Leaving before both players have started cancels the escrow and refunds
  -- every stake that was already locked.
  if e.status = 'ready' then
    if e.locked_one then
      update public.wallets
         set balance_cents = balance_cents + e.bet_cents,
             updated_at = now()
       where user_id = e.player_one;
      insert into public.transactions
        (user_id, kind, amount_cents, status, idempotency_key, description)
      values
        (e.player_one, 'refund', e.bet_cents, 'completed',
         'rforfeit_' || e.room_code || '_1', 'Damas canceladas por desistência');
    end if;

    if e.locked_two then
      update public.wallets
         set balance_cents = balance_cents + e.bet_cents,
             updated_at = now()
       where user_id = e.player_two;
      insert into public.transactions
        (user_id, kind, amount_cents, status, idempotency_key, description)
      values
        (e.player_two, 'refund', e.bet_cents, 'completed',
         'rforfeit_' || e.room_code || '_2', 'Damas canceladas por desistência');
    end if;

    update public.room_escrows
       set status = 'cancelled',
           finished_at = now()
     where room_code = e.room_code;

    return jsonb_build_object(
      'ok', true,
      'status', 'cancelled',
      'refunded', e.bet_cents
    );
  end if;

  if e.status <> 'playing' then
    raise exception 'match_not_started';
  end if;

  winner := case
    when uid = e.player_one then e.player_two
    else e.player_one
  end;

  pot := e.bet_cents * 2;

  if pot > 0 then
    select * into s from public.platform_settings where id = 1;
    rake := floor(pot * s.house_fee_percent / 100.0)::bigint;
    payout := pot - rake;

    update public.wallets
       set balance_cents = balance_cents + payout,
           updated_at = now()
     where user_id = winner;

    insert into public.transactions
      (user_id, kind, amount_cents, status, idempotency_key, description, metadata)
    values
      (winner, 'prize', payout, 'completed',
       'rforfeit_prize_' || e.room_code,
       'Vitória por desistência em Damas',
       jsonb_build_object(
         'rake_cents', rake,
         'pot_cents', pot,
         'room', e.room_code,
         'reason', 'opponent_forfeit'
       ));
  end if;

  insert into public.match_results (user_id, game, result, bet_cents, payout_cents)
  values
    (winner, e.game, 'win', e.bet_cents, payout),
    (uid, e.game, 'loss', e.bet_cents, 0);

  perform public.notify_user(
    winner,
    'Vitória por desistência',
    case
      when payout > 0 then 'O adversário saiu da partida. Recebeste ' ||
        to_char(payout / 100.0, 'FM999999990.00') || ' MT.'
      else 'O adversário saiu da partida. A vitória foi registada.'
    end,
    'result',
    '/wallet'
  );

  perform public.notify_user(
    uid,
    'Partida abandonada',
    'Saíste da partida de Damas. A vitória foi atribuída ao adversário.',
    'result',
    '/play'
  );

  update public.room_escrows
     set status = 'finished',
         winner_id = winner,
         rake_cents = rake,
         payout_cents = payout,
         finished_at = now()
   where room_code = e.room_code;

  update public.profiles
     set last_seen_at = now()
   where id in (e.player_one, e.player_two);

  return jsonb_build_object(
    'ok', true,
    'status', 'finished',
    'winner_id', winner,
    'payout', payout,
    'rake', rake
  );
end
$$;

revoke all on function public.forfeit_room_match(text) from public, anon;
grant execute on function public.forfeit_room_match(text) to authenticated;
