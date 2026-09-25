import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_PROJECT_ID && `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co` ||
  process.env.SUPABASE_URL ||
  (process.env.SUPABASE_PROJECT_ID ? `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co` : "");

const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

if (!url || !key) {
  console.error("[Supabase] Missing SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});