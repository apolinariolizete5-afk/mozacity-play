import { createClient } from "@supabase/supabase-js";

const vite = import.meta.env;
const nodeEnv = typeof process !== "undefined" ? process.env : undefined;

const url =
  vite.VITE_SUPABASE_URL ||
  (vite.VITE_SUPABASE_PROJECT_ID ? `https://${vite.VITE_SUPABASE_PROJECT_ID}.supabase.co` : "") ||
  nodeEnv?.SUPABASE_URL ||
  (nodeEnv?.SUPABASE_PROJECT_ID ? `https://${nodeEnv.SUPABASE_PROJECT_ID}.supabase.co` : "");

const key =
  vite.VITE_SUPABASE_PUBLISHABLE_KEY ||
  vite.VITE_SUPABASE_ANON_KEY ||
  nodeEnv?.SUPABASE_PUBLISHABLE_KEY ||
  nodeEnv?.SUPABASE_ANON_KEY ||
  "";

if (!url || !key) {
  console.error("[Supabase] Missing Supabase URL or publishable key.");
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});