-- Require both authenticated players to report the same winner before a wager is settled.
-- A single client can no longer choose the payout recipient unilaterally.
create or replace function public.settle_room_result(_room_code text, _winner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e public.room_escrows;
  s public.platform_settings;
  report text := coalesce(_winner_id::text, 'draw');
  loser uuid;
  pot bigint;
  rake bigint := 0;
  payout bigint := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into e
    from public.room_escrows
   where room_code = upper(trim(_room_code))
   for update;

  if e.room_code is null then raise exception 'unknown_room'; end if;
  if uid not in (e.player_one, e.player_two) then raise exception 'not_participant'; end if;
  if _winner_id is not null and _winner_id not in (e.player_one, e.player_two) then
    raise exception 'invalid_winner';
  end if;

  if e.status = 'finished' then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'winner_id', e.winner_id,
      'payout', e.payout_cents,
      'rake', e.rake_cents
    );
  end if;

  if e.status <> 'playing' then raise exception 'match_not_started'; end if;

  if uid = e.player_one then
    e.report_one := report;
  else
    e.report_two := report;
  end if;

  update public.room_escrows
     set report_one = e.report_one,
         report_two = e.report_two
   where room_code = e.room_code;

  -- Never settle from one client's report. Both players must report the
  -- exact same winner (or both report draw).
  if e.report_one is null or e.report_two is null then
    return jsonb_build_object('ok', true, 'pending', true);
  end if;

  if e.report_one <> e.report_two then
    return jsonb_build_object('ok', true, 'pending', true, 'conflict', true);
  end if;

  if e.report_one = 'draw' then
    if e.bet_cents > 0 then
      update public.wallets
         set balance_cents = balance_cents + e.bet_cents,
             updated_at = now()
       where user_id in (e.player_one, e.player_two);

      insert into public.transactions
        (user_id, kind, amount_cents, status, idempotency_key, description)
      values
        (e.player_one, 'refund', e.bet_cents, 'completed', 'rdraw_' || e.room_code || '_1', 'Empate devolvido'),
        (e.player_two, 'refund', e.bet_cents, 'completed', 'rdraw_' || e.room_code || '_2', 'Empate devolvido');
    end if;

    payout := e.bet_cents;

    insert into public.match_results (user_id, game, result, bet_cents, payout_cents)
    values
      (e.player_one, e.game, 'draw', e.bet_cents, payout),
      (e.player_two, e.game, 'draw', e.bet_cents, payout);

    perform public.notify_user(e.player_one, 'Empate', 'A partida terminou empatada.', 'result', '/history');
    perform public.notify_user(e.player_two, 'Empate', 'A partida terminou empatada.', 'result', '/history');
  else
    loser := case when _winner_id = e.player_one then e.player_two else e.player_one end;
    if _winner_id is null then raise exception 'invalid_winner'; end if;

    if e.bet_cents > 0 then
      pot := e.bet_cents * 2;
      select * into s from public.platform_settings where id = 1;
      rake := floor(pot * s.house_fee_percent / 100.0)::bigint;
      payout := pot - rake;

      update public.wallets
         set balance_cents = balance_cents + payout,
             updated_at = now()
       where user_id = _winner_id;

      insert into public.transactions
        (user_id, kind, amount_cents, status, idempotency_key, description, metadata)
      values
        (_winner_id, 'prize', payout, 'completed', 'rpay_' || e.room_code,
         'Prémio de ' || e.game,
         jsonb_build_object('rake_cents', rake, 'pot_cents', pot, 'room', e.room_code));
    end if;

    insert into public.match_results (user_id, game, result, bet_cents, payout_cents)
    values
      (_winner_id, e.game, 'win', e.bet_cents, payout),
      (loser, e.game, 'loss', e.bet_cents, 0);

    perform public.notify_user(
      _winner_id,
      'Vitória!',
      case when payout > 0 then 'Ganhaste ' || to_char(payout/100.0,'FM999999990.00') || ' MT.'
           else 'Venceste a partida.' end,
      'result',
      '/wallet'
    );
    perform public.notify_user(
      loser,
      'Partida terminada',
      'Perdeste esta partida. Tenta a revanche!',
      'result',
      '/play'
    );
  end if;

  update public.room_escrows
     set status = 'finished',
         winner_id = _winner_id,
         rake_cents = rake,
         payout_cents = payout,
         finished_at = now()
   where room_code = e.room_code;

  update public.profiles
     set last_seen_at = now()
   where id in (e.player_one, e.player_two);

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'winner_id', _winner_id,
    'payout', payout,
    'rake', rake
  );
end
$$;

revoke all on function public.settle_room_result(text,uuid) from public, anon;
grant execute on function public.settle_room_result(text,uuid) to authenticated;
