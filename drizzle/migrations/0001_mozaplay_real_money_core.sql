do $$ begin create type public.app_role as enum ('admin', 'player'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wallet_method as enum ('mpesa', 'mola', 'mcash', 'bank'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tx_kind as enum ('deposit','withdrawal','bet','prize','refund','fee','adjustment','bonus'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tx_status as enum ('pending','completed','failed','reversed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.room_status as enum ('WAITING','READY','STARTING','PLAYING','FINISHED','CANCELLED'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key,
  display_name text not null default 'Jogador',
  avatar text not null default '🦁',
  phone text,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists "read own roles" on public.user_roles;
create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table if not exists public.wallets (
  user_id uuid primary key,
  balance_cents bigint not null default 0,
  locked_cents bigint not null default 0,
  currency text not null default 'MZN',
  updated_at timestamptz not null default now()
);
grant select on public.wallets to authenticated;
grant all on public.wallets to service_role;
alter table public.wallets enable row level security;
drop policy if exists "own wallet" on public.wallets;
create policy "own wallet" on public.wallets for select to authenticated using (auth.uid() = user_id);
drop policy if exists "admin reads wallets" on public.wallets;
create policy "admin reads wallets" on public.wallets for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  method public.wallet_method not null,
  account_number text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, method, account_number)
);
grant select, insert, update, delete on public.payment_methods to authenticated;
grant all on public.payment_methods to service_role;
alter table public.payment_methods enable row level security;
drop policy if exists "own methods" on public.payment_methods;
create policy "own methods" on public.payment_methods for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind public.tx_kind not null,
  amount_cents bigint not null,
  status public.tx_status not null default 'completed',
  method public.wallet_method,
  provider text not null default 'netshop',
  provider_ref text,
  idempotency_key text not null unique,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_created_idx on public.transactions (user_id, created_at desc);
grant select on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "admin reads transactions" on public.transactions;
create policy "admin reads transactions" on public.transactions for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount_cents bigint not null,
  fee_cents bigint not null default 0,
  net_cents bigint not null default 0,
  method public.wallet_method not null,
  destination text not null,
  status public.tx_status not null default 'pending',
  provider_ref text,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
grant select on public.payout_requests to authenticated;
grant all on public.payout_requests to service_role;
alter table public.payout_requests enable row level security;
drop policy if exists "own payouts" on public.payout_requests;
create policy "own payouts" on public.payout_requests for select to authenticated using (auth.uid() = user_id);
drop policy if exists "admin reads payouts" on public.payout_requests;
create policy "admin reads payouts" on public.payout_requests for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table if not exists public.platform_settings (
  id smallint primary key default 1,
  house_fee_percent numeric(5,2) not null default 10.00,
  min_bet_cents bigint not null default 1000,
  max_bet_cents bigint not null default 100000,
  min_deposit_cents bigint not null default 5000,
  min_withdrawal_cents bigint not null default 5000,
  withdrawal_fee_percent numeric(5,2) not null default 3.00,
  withdrawal_fee_fixed_cents bigint not null default 500,
  methods_enabled jsonb not null default '{"mpesa":true,"mola":true,"mcash":true,"bank":true}'::jsonb,
  real_money_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
alter table public.platform_settings add column if not exists min_deposit_cents bigint not null default 5000;
alter table public.platform_settings add column if not exists withdrawal_fee_percent numeric(5,2) not null default 3.00;
alter table public.platform_settings add column if not exists withdrawal_fee_fixed_cents bigint not null default 500;
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;
grant select on public.platform_settings to authenticated, anon;
grant update on public.platform_settings to authenticated;
grant all on public.platform_settings to service_role;
alter table public.platform_settings enable row level security;
drop policy if exists "settings readable" on public.platform_settings;
create policy "settings readable" on public.platform_settings for select to authenticated, anon using (true);
drop policy if exists "admin updates settings" on public.platform_settings;
create policy "admin updates settings" on public.platform_settings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game text not null,
  is_private boolean not null default false,
  bet_cents bigint not null default 0,
  timer_seconds integer not null default 10,
  capacity integer not null default 2,
  status public.room_status not null default 'WAITING',
  host_id uuid not null,
  match_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.rooms to authenticated;
grant all on public.rooms to service_role;
alter table public.rooms enable row level security;
drop policy if exists "rooms readable" on public.rooms;
create policy "rooms readable" on public.rooms for select to authenticated using (true);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  seat integer not null,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);
grant select on public.room_players to authenticated;
grant all on public.room_players to service_role;
alter table public.room_players enable row level security;
drop policy if exists "room players readable" on public.room_players;
create policy "room players readable" on public.room_players for select to authenticated using (true);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  game text not null,
  state jsonb not null,
  turn_seat integer not null default 0,
  seats jsonb not null default '[]'::jsonb,
  bet_cents bigint not null default 0,
  pot_cents bigint not null default 0,
  status text not null default 'PLAYING',
  winner_seat integer,
  ply integer not null default 0,
  turn_deadline timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
grant select on public.matches to authenticated;
grant all on public.matches to service_role;
alter table public.matches enable row level security;
drop policy if exists "match visible to participants" on public.matches;
create policy "match visible to participants" on public.matches for select to authenticated
  using (exists (select 1 from jsonb_array_elements(seats) s where (s->>'user_id')::uuid = auth.uid()));
drop policy if exists "admin reads matches" on public.matches;
create policy "admin reads matches" on public.matches for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table if not exists public.match_moves (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  seat integer not null,
  ply integer not null,
  move jsonb not null,
  created_at timestamptz not null default now(),
  unique (match_id, ply)
);
grant select on public.match_moves to authenticated;
grant all on public.match_moves to service_role;
alter table public.match_moves enable row level security;
drop policy if exists "moves visible to participants" on public.match_moves;
create policy "moves visible to participants" on public.match_moves for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id
    and exists (select 1 from jsonb_array_elements(m.seats) s where (s->>'user_id')::uuid = auth.uid())));

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid,
  user_id uuid not null,
  game text not null,
  result text not null,
  bet_cents bigint not null default 0,
  payout_cents bigint not null default 0,
  opponents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists match_results_user_idx on public.match_results (user_id, created_at desc);
grant select on public.match_results to authenticated;
grant all on public.match_results to service_role;
alter table public.match_results enable row level security;
drop policy if exists "results readable by authenticated" on public.match_results;
create policy "results readable by authenticated" on public.match_results for select to authenticated using (true);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text not null default '',
  kind text not null default 'system',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own notifications update" on public.notifications;
create policy "own notifications update" on public.notifications for update to authenticated using (auth.uid() = user_id);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  action text not null,
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.admin_audit_log to authenticated;
grant all on public.admin_audit_log to service_role;
alter table public.admin_audit_log enable row level security;
drop policy if exists "admin reads audit" on public.admin_audit_log;
create policy "admin reads audit" on public.admin_audit_log for select to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.ensure_wallet(_user_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.wallets (user_id) values (_user_id) on conflict (user_id) do nothing;
$$;

create or replace function public.credit_wallet(
  _user_id uuid, _amount_cents bigint, _kind public.tx_kind, _description text,
  _idempotency_key text, _method public.wallet_method default null,
  _provider_ref text default null, _metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare tx_id uuid;
begin
  if _amount_cents <= 0 then raise exception 'amount must be positive'; end if;
  perform public.ensure_wallet(_user_id);
  insert into public.transactions (user_id, kind, amount_cents, status, method, provider_ref, idempotency_key, description, metadata)
  values (_user_id, _kind, _amount_cents, 'completed', _method, _provider_ref, _idempotency_key, _description, _metadata)
  on conflict (idempotency_key) do nothing
  returning id into tx_id;
  if tx_id is null then return null; end if;
  update public.wallets set balance_cents = balance_cents + _amount_cents, updated_at = now() where user_id = _user_id;
  return tx_id;
end $$;

create or replace function public.debit_wallet(
  _user_id uuid, _amount_cents bigint, _kind public.tx_kind, _description text,
  _idempotency_key text, _method public.wallet_method default null,
  _provider_ref text default null, _metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare tx_id uuid; avail bigint;
begin
  if _amount_cents <= 0 then raise exception 'amount must be positive'; end if;
  perform public.ensure_wallet(_user_id);
  select balance_cents - locked_cents into avail from public.wallets where user_id = _user_id for update;
  if avail < _amount_cents then raise exception 'insufficient_funds'; end if;
  insert into public.transactions (user_id, kind, amount_cents, status, method, provider_ref, idempotency_key, description, metadata)
  values (_user_id, _kind, -_amount_cents, 'completed', _method, _provider_ref, _idempotency_key, _description, _metadata)
  on conflict (idempotency_key) do nothing
  returning id into tx_id;
  if tx_id is null then return null; end if;
  update public.wallets set balance_cents = balance_cents - _amount_cents, updated_at = now() where user_id = _user_id;
  return tx_id;
end $$;

revoke all on function public.credit_wallet(uuid,bigint,public.tx_kind,text,text,public.wallet_method,text,jsonb) from public, anon, authenticated;
revoke all on function public.debit_wallet(uuid,bigint,public.tx_kind,text,text,public.wallet_method,text,jsonb) from public, anon, authenticated;
revoke all on function public.ensure_wallet(uuid) from public, anon;

create table if not exists public.admin_bootstrap (
  id smallint primary key default 1,
  used boolean not null default false,
  used_by uuid,
  used_at timestamptz,
  constraint single_row_bootstrap check (id = 1)
);
insert into public.admin_bootstrap (id) values (1) on conflict (id) do nothing;
grant select on public.admin_bootstrap to authenticated, anon;
grant all on public.admin_bootstrap to service_role;
alter table public.admin_bootstrap enable row level security;
drop policy if exists "bootstrap status readable" on public.admin_bootstrap;
create policy "bootstrap status readable" on public.admin_bootstrap for select to authenticated, anon using (true);

do $$ begin
  alter publication supabase_realtime add table public.matches;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.room_players;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.wallets;
exception when duplicate_object then null; end $$;