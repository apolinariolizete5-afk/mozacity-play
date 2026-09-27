-- 0013: remove the legacy enum-typed withdrawal overload.
-- The production implementation in 0011 accepts text. Keeping both overloads
-- can make PostgREST RPC resolution ambiguous for JSON string arguments.
DROP FUNCTION IF EXISTS public.request_withdrawal(bigint, public.wallet_method, text);
