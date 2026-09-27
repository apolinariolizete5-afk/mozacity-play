-- 0010: extend payout status lifecycle before functions use the new enum value.
DO $$
BEGIN
  ALTER TYPE public.tx_status ADD VALUE IF NOT EXISTS 'processing';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
