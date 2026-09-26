-- 0005_notification_test.sql
-- Safe self-test: creates a real notification for the authenticated user.
create or replace function public.send_test_notification()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  notification_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.notifications (user_id, title, body, kind, read, url)
  values (
    uid,
    'Teste de notificação',
    'O MozaPlay recebeu o teu aviso de teste com sucesso.',
    'system',
    false,
    '/notifications'
  )
  returning id into notification_id;

  return notification_id;
end
$$;

revoke all on function public.send_test_notification() from public, anon;
grant execute on function public.send_test_notification() to authenticated;
