-- 0012: persistent financial notifications + realtime delivery.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  url text,
  pushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS url text;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.create_user_notification(
  _user_id uuid,
  _title text,
  _body text,
  _kind text,
  _url text DEFAULT '/notifications'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, title, body, kind, read, url)
  VALUES (_user_id, _title, _body, _kind, false, _url)
  RETURNING id INTO n_id;
  RETURN n_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_notification(uuid, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_user_notification(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.on_transaction_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE amount_mzn numeric;
BEGIN
  IF NEW.status::text = 'completed' AND (TG_OP = 'INSERT' OR OLD.status::text <> 'completed') THEN
    amount_mzn := round(abs(NEW.amount_cents)::numeric / 100.0, 2);

    IF NEW.kind::text = 'deposit' THEN
      PERFORM public.create_user_notification(
        NEW.user_id, 'Depósito confirmado!',
        'O teu saldo foi creditado com ' || amount_mzn || ' MT via ' || COALESCE(NEW.metadata->>'method', 'NetShop') || '.',
        'deposit', '/wallet'
      );
    ELSIF NEW.kind::text = 'withdrawal' THEN
      PERFORM public.create_user_notification(
        NEW.user_id, 'Levantamento concluído!',
        'O montante de ' || amount_mzn || ' MT foi enviado com sucesso para a tua conta.',
        'withdrawal', '/wallet'
      );
    ELSIF NEW.kind::text = 'prize' THEN
      PERFORM public.create_user_notification(
        NEW.user_id, 'Vitória! Prémio creditado',
        'Parabéns! Ganhaste ' || amount_mzn || ' MT na tua partida.',
        'prize', '/history'
      );
    END IF;
  ELSIF NEW.status::text = 'failed' AND (TG_OP = 'INSERT' OR OLD.status::text <> 'failed') THEN
    amount_mzn := round(abs(NEW.amount_cents)::numeric / 100.0, 2);
    IF NEW.kind::text = 'withdrawal' THEN
      PERFORM public.create_user_notification(
        NEW.user_id, 'Levantamento não processado',
        'O envio de ' || amount_mzn || ' MT falhou e o valor foi integralmente estornado para o teu saldo.',
        'withdrawal', '/wallet'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tx_notify ON public.transactions;
DROP TRIGGER IF EXISTS trg_notify_on_transaction ON public.transactions;
CREATE TRIGGER trg_notify_on_transaction
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.on_transaction_notify();
