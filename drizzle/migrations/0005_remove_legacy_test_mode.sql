-- Remove legacy local test-deposit support left by the old demo migration.
-- The application no longer exposes or calls these functions.
DROP FUNCTION IF EXISTS public.settle_own_test_deposit(text);
DROP FUNCTION IF EXISTS public.admin_set_test_mode(boolean);
ALTER TABLE public.platform_settings
  DROP COLUMN IF EXISTS test_mode_enabled;
