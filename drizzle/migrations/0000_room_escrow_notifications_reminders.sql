create table public.room_escrows (
  room_code text primary key,
  game text not null check (game in ('ludo','checkers','chess')),
  player_one uuid not null,
  player_two uuid not null,
  bet_cents bigint not null default 0 check (bet_cents >= 0),
  locked_one boolean not null default false,
  locked_two boolean not null default false,
  report_one text,
  report_two text,
  status text not null default 'ready' check (status in ('ready','playing','finished','cancelled')),
  winner_id uuid,
  rake_cents bigint not null default 0,
  payout_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
grant select on public.room_escrows to authenticated;
grant all on public.room_escrows to service_role;
alter table public.room_escrows enable row level security;
create policy "participants read escrow" on public.room_escrows for select to authenticated
  using (auth.uid() in (player_one, player_two));

create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  sent_at timestamptz not null default now()
);
create index reminder_log_user_kind on public.reminder_log(user_id, kind, sent_at desc);
grant all on public.reminder_log to service_role;
alter table public.reminder_log enable row level security;

alter table public.notifications add column if not exists pushed_at timestamptz;
alter table public.notifications add column if not exists url text;

create or replace function public.notify_user(_uid uuid, _title text, _body text, _kind text, _url text default '/')
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, kind, read, url) values (_uid, _title, _body, _kind, false, _url);
$$;
revoke all on function public.notify_user(uuid,text,text,text,text) from public, anon, authenticated;

create or replace function public.register_room_match(_room_code text, _game text, _player_one_id uuid, _player_two_id uuid, _bet_cents bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); e public.room_escrows;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if uid not in (_player_one_id, _player_two_id) or _player_one_id = _player_two_id then raise exception 'not_participant'; end if;
  if _bet_cents < 0 then raise exception 'invalid_bet'; end if;
  select * into e from public.room_escrows where room_code = _room_code for update;
  if e.room_code is null then
    insert into public.room_escrows (room_code, game, player_one, player_two, bet_cents, status)
    values (_room_code, _game, _player_one_id, _player_two_id, _bet_cents, case when _bet_cents = 0 then 'playing' else 'ready' end)
    returning * into e;
  elsif uid not in (e.player_one, e.player_two) then raise exception 'not_participant';
  end if;
  return jsonb_build_object('ok', true, 'match_id', e.room_code, 'bet_cents', e.bet_cents, 'status', e.status);
end $$;

create or replace function public.lock_room_wager(_room_code text, _amount_cents bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); e public.room_escrows; avail bigint; blocked boolean; s public.platform_settings;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into e from public.room_escrows where room_code = _room_code for update;
  if e.room_code is null then raise exception 'unknown_room'; end if;
  if uid not in (e.player_one, e.player_two) then raise exception 'not_participant'; end if;
  if e.bet_cents <> _amount_cents then raise exception 'bet_mismatch'; end if;
  if e.status in ('finished','cancelled') then return jsonb_build_object('ok', false, 'status', e.status); end if;
  if (uid = e.player_one and e.locked_one) or (uid = e.player_two and e.locked_two) then
    return jsonb_build_object('ok', true, 'already', true, 'locked', e.bet_cents, 'status', e.status);
  end if;
  select is_blocked into blocked from public.profiles where id = uid;
  if coalesce(blocked,false) then raise exception 'account_blocked'; end if;
  select * into s from public.platform_settings where id = 1;
  if e.bet_cents < s.min_bet_cents then raise exception 'below_min_bet'; end if;
  perform public.ensure_wallet(uid);
  select balance_cents - locked_cents into avail from public.wallets where user_id = uid for update;
  if avail < e.bet_cents then raise exception 'insufficient_funds'; end if;
  update public.wallets set balance_cents = balance_cents - e.bet_cents,
    wagered_cents = wagered_cents + e.bet_cents,
    rollover_required_cents = greatest(0, rollover_required_cents - e.bet_cents), updated_at = now()
   where user_id = uid;
  insert into public.transactions (user_id, kind, amount_cents, status, idempotency_key, description)
  values (uid, 'bet', -e.bet_cents, 'completed', 'rbet_' || e.room_code || '_' || replace(uid::text,'-',''), 'Aposta em ' || e.game || ' (sala ' || e.room_code || ')');
  if uid = e.player_one then e.locked_one := true; else e.locked_two := true; end if;
  update public.room_escrows set locked_one = e.locked_one, locked_two = e.locked_two,
    status = case when e.locked_one and e.locked_two then 'playing' else 'ready' end
   where room_code = e.room_code returning * into e;
  update public.profiles set last_seen_at = now() where id = uid;
  return jsonb_build_object('ok', true, 'locked', e.bet_cents, 'status', e.status);
end $$;

create or replace function public.cancel_room_escrow(_room_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); e public.room_escrows;
begin
  select * into e from public.room_escrows where room_code = _room_code for update;
  if e.room_code is null or uid not in (e.player_one, e.player_two) then raise exception 'not_participant'; end if;
  if e.status <> 'ready' then return jsonb_build_object('ok', false, 'status', e.status); end if;
  if e.locked_one then
    update public.wallets set balance_cents = balance_cents + e.bet_cents, updated_at = now() where user_id = e.player_one;
    insert into public.transactions (user_id, kind, amount_cents, status, idempotency_key, description)
    values (e.player_one, 'refund', e.bet_cents, 'completed', 'rref_' || e.room_code || '_1', 'Sala cancelada');
  end if;
  if e.locked_two then
    update public.wallets set balance_cents = balance_cents + e.bet_cents, updated_at = now() where user_id = e.player_two;
    insert into public.transactions (user_id, kind, amount_cents, status, idempotency_key, description)
    values (e.player_two, 'refund', e.bet_cents, 'completed', 'rref_' || e.room_code || '_2', 'Sala cancelada');
  end if;
  update public.room_escrows set status = 'cancelled', finished_at = now() where room_code = e.room_code;
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $$;

create or replace function public.settle_room_result(_room_code text, _winner_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); e public.room_escrows; s public.platform_settings;
        report text := coalesce(_winner_id::text, 'draw'); loser uuid; pot bigint; rake bigint := 0; payout bigint := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into e from public.room_escrows where room_code = _room_code for update;
  if e.room_code is null or uid not in (e.player_one, e.player_two) then raise exception 'not_participant'; end if;
  if _winner_id is not null and _winner_id not in (e.player_one, e.player_two) then raise exception 'invalid_winner'; end if;
  if e.status = 'finished' then
    return jsonb_build_object('ok', true, 'already', true, 'winner_id', e.winner_id, 'payout', e.payout_cents, 'rake', e.rake_cents);
  end if;
  if e.status <> 'playing' then raise exception 'match_not_started'; end if;
  if uid = e.player_one then e.report_one := report; else e.report_two := report; end if;
  update public.room_escrows set report_one = e.report_one, report_two = e.report_two where room_code = e.room_code;
  if not ((_winner_id is not null and _winner_id <> uid) or (e.report_one is not null and e.report_one = e.report_two)) then
    return jsonb_build_object('ok', true, 'pending', true);
  end if;
  select * into s from public.platform_settings where id = 1;
  pot := e.bet_cents * 2;
  if _winner_id is null then
    if e.bet_cents > 0 then
      update public.wallets set balance_cents = balance_cents + e.bet_cents, updated_at = now() where user_id in (e.player_one, e.player_two);
      insert into public.transactions (user_id, kind, amount_cents, status, idempotency_key, description)
      values (e.player_one, 'refund', e.bet_cents, 'completed', 'rdraw_' || e.room_code || '_1', 'Empate devolvido'),
             (e.player_two, 'refund', e.bet_cents, 'completed', 'rdraw_' || e.room_code || '_2', 'Empate devolvido');
    end if;
    payout := e.bet_cents;
    insert into public.match_results (user_id, game, result, bet_cents, payout_cents)
    values (e.player_one, e.game, 'draw', e.bet_cents, payout), (e.player_two, e.game, 'draw', e.bet_cents, payout);
    perform public.notify_user(e.player_one, 'Empate', 'A partida terminou empatada.', 'result', '/history');
    perform public.notify_user(e.player_two, 'Empate', 'A partida terminou empatada.', 'result', '/history');
  else
    loser := case when _winner_id = e.player_one then e.player_two else e.player_one end;
    if pot > 0 then
      rake := floor(pot * s.house_fee_percent / 100.0)::bigint;
      payout := pot - rake;
      update public.wallets set balance_cents = balance_cents + payout, updated_at = now() where user_id = _winner_id;
      insert into public.transactions (user_id, kind, amount_cents, status, idempotency_key, description, metadata)
      values (_winner_id, 'prize', payout, 'completed', 'rpay_' || e.room_code, 'Prémio de ' || e.game,
              jsonb_build_object('rake_cents', rake, 'pot_cents', pot, 'room', e.room_code));
    end if;
    insert into public.match_results (user_id, game, result, bet_cents, payout_cents)
    values (_winner_id, e.game, 'win', e.bet_cents, payout), (loser, e.game, 'loss', e.bet_cents, 0);
    perform public.notify_user(_winner_id, 'Vitória!', case when payout > 0 then 'Ganhaste ' || to_char(payout/100.0,'FM999999990.00') || ' MT.' else 'Venceste a partida.' end, 'result', '/wallet');
    perform public.notify_user(loser, 'Partida terminada', 'Perdeste esta partida. Tenta a revanche!', 'result', '/play');
  end if;
  update public.room_escrows set status = 'finished', winner_id = _winner_id, rake_cents = rake, payout_cents = payout, finished_at = now()
   where room_code = e.room_code;
  update public.profiles set last_seen_at = now() where id in (e.player_one, e.player_two);
  return jsonb_build_object('ok', true, 'already', false, 'winner_id', _winner_id, 'payout', payout, 'rake', rake);
end $$;

revoke all on function public.register_room_match(text,text,uuid,uuid,bigint) from public, anon;
revoke all on function public.lock_room_wager(text,bigint) from public, anon;
revoke all on function public.cancel_room_escrow(text) from public, anon;
revoke all on function public.settle_room_result(text,uuid) from public, anon;
grant execute on function public.register_room_match(text,text,uuid,uuid,bigint) to authenticated;
grant execute on function public.lock_room_wager(text,bigint) to authenticated;
grant execute on function public.cancel_room_escrow(text) to authenticated;
grant execute on function public.settle_room_result(text,uuid) to authenticated;

create or replace function public.tg_tx_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status::text = 'completed' and (tg_op = 'INSERT' or old.status::text <> 'completed') then
    if new.kind::text = 'deposit' then
      perform public.notify_user(new.user_id, 'Depósito confirmado', to_char(abs(new.amount_cents)/100.0,'FM999999990.00') || ' MT creditados na tua carteira.', 'system', '/wallet');
    elsif new.kind::text = 'withdrawal' then
      perform public.notify_user(new.user_id, 'Levantamento enviado', to_char(abs(new.amount_cents)/100.0,'FM999999990.00') || ' MT foram enviados para a tua conta.', 'system', '/wallet');
    end if;
  elsif new.status::text = 'failed' and tg_op = 'UPDATE' and old.status::text <> 'failed' and new.kind::text in ('deposit','withdrawal') then
    perform public.notify_user(new.user_id, case when new.kind::text = 'deposit' then 'Depósito falhou' else 'Levantamento recusado' end, 'Consulta a carteira para mais detalhes.', 'system', '/wallet');
  end if;
  return new;
end $$;
drop trigger if exists tx_notify on public.transactions;
create trigger tx_notify after insert or update of status on public.transactions for each row execute function public.tg_tx_notify();

create or replace function public.claim_push_batch(_token text)
returns table (notification_id uuid, user_id uuid, title text, body text, url text, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.internal_secret_matches('wallet_rpc_token', _token) then raise exception 'forbidden'; end if;
  with ins as (
    insert into public.reminder_log (user_id, kind)
    select p.id, 'inactive' from public.profiles p
     where coalesce(p.last_seen_at, p.created_at) < now() - interval '3 days'
       and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
       and not exists (select 1 from public.reminder_log r where r.user_id = p.id and r.kind = 'inactive' and r.sent_at > now() - interval '3 days')
    returning reminder_log.user_id
  )
  insert into public.notifications (user_id, title, body, kind, read, url)
  select ins.user_id, 'Sentimos a tua falta!', 'Há 3 dias que não jogas. Volta e desafia alguém no MozaPlay.', 'system', false, '/play' from ins;

  with ins as (
    insert into public.reminder_log (user_id, kind)
    select w.user_id, 'idle_balance' from public.wallets w
     where w.balance_cents > 0
       and exists (select 1 from public.push_subscriptions ps where ps.user_id = w.user_id)
       and not exists (select 1 from public.transactions t where t.user_id = w.user_id and t.kind::text = 'bet' and t.created_at > now() - interval '48 hours')
       and not exists (select 1 from public.reminder_log r where r.user_id = w.user_id and r.kind = 'idle_balance' and r.sent_at > now() - interval '48 hours')
    returning reminder_log.user_id
  )
  insert into public.notifications (user_id, title, body, kind, read, url)
  select ins.user_id, 'O teu saldo está à espera', 'Tens saldo disponível. Entra numa partida e joga!', 'system', false, '/play' from ins;

  return query
  with batch as (
    update public.notifications n set pushed_at = now()
     where n.id in (select x.id from public.notifications x where x.pushed_at is null and x.created_at > now() - interval '1 day' order by x.created_at limit 200)
    returning n.id, n.user_id, n.title, n.body, n.url
  )
  select b.id, b.user_id, b.title, b.body, coalesce(b.url,'/'), ps.endpoint, ps.p256dh, ps.auth
    from batch b join public.push_subscriptions ps on ps.user_id = b.user_id;
end $$;
revoke all on function public.claim_push_batch(text) from public;
grant execute on function public.claim_push_batch(text) to anon, authenticated;

create or replace function public.drop_push_subscription(_token text, _endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.internal_secret_matches('wallet_rpc_token', _token) then raise exception 'forbidden'; end if;
  delete from public.push_subscriptions where endpoint = _endpoint;
end $$;
revoke all on function public.drop_push_subscription(text,text) from public;
grant execute on function public.drop_push_subscription(text,text) to anon, authenticated;

create or replace function public.touch_last_seen() returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;