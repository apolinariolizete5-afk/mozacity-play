-- Admin panel fixes: use the current financial schema and add user controls.
-- The payout_requests table does not expose fee_cents/net_cents in this project,
-- so the admin summary must derive totals from transactions and only use the
-- payout amount/status columns that are actually present.

create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  deposits bigint := 0;
  withdrawals bigint := 0;
  withdrawal_fees bigint := 0;
  rake bigint := 0;
  bet_volume bigint := 0;
  balance bigint := 0;
  players bigint := 0;
  pending_count bigint := 0;
  pending_amount bigint := 0;
begin
  if uid is null or not exists (
    select 1 from public.user_roles
    where user_id = uid and role = 'admin'
  ) then
    raise exception 'admin_required';
  end if;

  select count(*) into players from public.profiles;

  select coalesce(sum(balance_cents),0) into balance
    from public.wallets;

  select coalesce(sum(case when kind::text = 'deposit' then abs(amount_cents) else 0 end),0),
         coalesce(sum(case when kind::text = 'withdrawal' then abs(amount_cents) else 0 end),0),
         coalesce(sum(case when kind::text = 'bet' then abs(amount_cents) else 0 end),0),
         coalesce(sum(case when kind::text = 'prize' and metadata ? 'rake_cents'
                           then (metadata->>'rake_cents')::bigint else 0 end),0)
    into deposits, withdrawals, bet_volume, rake
    from public.transactions
   where status::text = 'completed';

  select count(*), coalesce(sum(amount_cents),0)
    into pending_count, pending_amount
    from public.payout_requests
   where status::text = 'pending';

  -- Historical withdrawal fees are not stored as payout_requests.fee_cents.
  -- Keep this metric at zero rather than inventing historical values.
  withdrawal_fees := 0;

  return jsonb_build_object(
    'players', players,
    'balance_cents', balance,
    'deposits_cents', deposits,
    'withdrawals_cents', withdrawals,
    'withdrawal_fees_cents', withdrawal_fees,
    'rake_cents', rake,
    'bet_volume_cents', bet_volume,
    'pending_payouts', pending_count,
    'pending_payouts_cents', pending_amount
  );
end
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_list_users()
returns table(
  id uuid,
  display_name text,
  phone text,
  email text,
  is_blocked boolean,
  created_at timestamptz,
  last_seen_at timestamptz,
  balance_cents bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from public.user_roles
    where user_id = uid and role = 'admin'
  ) then
    raise exception 'admin_required';
  end if;

  return query
  select
    p.id,
    coalesce(p.display_name, 'Jogador'),
    p.phone,
    u.email::text,
    coalesce(p.is_blocked,false),
    p.created_at,
    p.last_seen_at,
    coalesce(w.balance_cents,0)::bigint
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.wallets w on w.user_id = p.id
  order by p.created_at desc;
end
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_set_user_blocked(
  _user_id uuid,
  _blocked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from public.user_roles
    where user_id = uid and role = 'admin'
  ) then
    raise exception 'admin_required';
  end if;

  if _user_id = uid then
    raise exception 'cannot_block_self';
  end if;

  if not exists (select 1 from public.profiles where id = _user_id) then
    raise exception 'user_not_found';
  end if;

  update public.profiles
     set is_blocked = _blocked,
         last_seen_at = case when _blocked then last_seen_at else now() end
   where id = _user_id;

  return jsonb_build_object('ok', true, 'user_id', _user_id, 'is_blocked', _blocked);
end
$$;

revoke all on function public.admin_set_user_blocked(uuid,boolean) from public, anon;
grant execute on function public.admin_set_user_blocked(uuid,boolean) to authenticated;
