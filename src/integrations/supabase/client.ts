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

// TanStack Start also evaluates this module during SSR. Supabase Realtime
// constructs its WebSocket transport immediately, so give SSR a no-op transport
// and keep the real browser WebSocket for client-side Realtime.
class NoopWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = NoopWebSocket.CLOSED;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {
    this.readyState = NoopWebSocket.CLOSED;
  }
}

export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    transport:
      typeof window !== "undefined"
        ? WebSocket
        : (NoopWebSocket as unknown as typeof WebSocket),
    params: { eventsPerSecond: 10 },
  },
});