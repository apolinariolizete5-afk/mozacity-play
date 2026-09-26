-- Remove a deposit attempt from history when the payment provider rejects it.
-- This never removes a completed deposit and can only target the authenticated user's
-- own non-completed deposit by its idempotency key.
create or replace function public.cancel_failed_deposit(_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.transactions
   where user_id = auth.uid()
     and kind::text = 'deposit'
     and idempotency_key = _idempotency_key
     and status::text in ('pending', 'failed');
end
$$;

revoke all on function public.cancel_failed_deposit(text) from public, anon;
grant execute on function public.cancel_failed_deposit(text) to authenticated;
