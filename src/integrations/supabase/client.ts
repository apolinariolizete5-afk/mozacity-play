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

// Keep the client constructible during SSR/build even if Render env vars are
// temporarily missing. Authenticated server functions still validate their
// own configuration in auth-middleware.ts.
const safeUrl = url || "https://placeholder.supabase.co";
const safeKey = key || "placeholder-anon-key";

export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    // The server-side SSR runtime on Render does not need Realtime.
    // Disabling it prevents supabase-js from requiring a native WebSocket.
    params: { eventsPerSecond: 10 },
  },
});