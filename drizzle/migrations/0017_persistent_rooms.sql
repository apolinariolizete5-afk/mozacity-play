-- Persistent lobby rooms: room metadata outlives browser/Reatime presence.
create table if not exists public.game_rooms (
  code text primary key check (code = upper(code) and length(code) between 4 and 8),
  game text not null check (game in ('ludo','checkers','chess')),
  is_private boolean not null default true,
  bet_cents bigint not null default 0 check (bet_cents = 0),
  capacity integer not null default 2 check (capacity between 2 and 4),
  status text not null default 'WAITING' check (status in ('WAITING','READY','PLAYING')),
  host_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null default 'Jogador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_rooms_public_created_idx
  on public.game_rooms (created_at desc) where is_private = false;

alter table public.game_rooms enable row level security;
revoke all on public.game_rooms from anon;
grant select, insert, update, delete on public.game_rooms to authenticated;

drop policy if exists "Read public rooms and own private rooms" on public.game_rooms;
create policy "Read public rooms and own private rooms"
  on public.game_rooms for select to authenticated
  using (not is_private or host_id = auth.uid());

drop policy if exists "Create own game rooms" on public.game_rooms;
create policy "Create own game rooms"
  on public.game_rooms for insert to authenticated
  with check (host_id = auth.uid() and bet_cents = 0);

drop policy if exists "Update own game rooms" on public.game_rooms;
create policy "Update own game rooms"
  on public.game_rooms for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid() and bet_cents = 0);

drop policy if exists "Remove own game rooms" on public.game_rooms;
create policy "Remove own game rooms"
  on public.game_rooms for delete to authenticated
  using (host_id = auth.uid());

create or replace function public.get_game_room_by_code(_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.game_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into r from public.game_rooms where code = upper(trim(_code));
  if r.code is null then return null; end if;
  return jsonb_build_object(
    'code', r.code, 'game', r.game, 'is_private', r.is_private,
    'bet_cents', r.bet_cents, 'capacity', r.capacity, 'status', r.status,
    'host_id', r.host_id, 'host_name', r.host_name, 'created_at', r.created_at
  );
end;
$$;
revoke all on function public.get_game_room_by_code(text) from public, anon;
grant execute on function public.get_game_room_by_code(text) to authenticated;
