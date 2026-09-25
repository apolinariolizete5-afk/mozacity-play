import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

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

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const url =
      process.env.SUPABASE_URL ||
      (process.env.SUPABASE_PROJECT_ID ? `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co` : "");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("supabase_not_configured");

    const request = getRequest();
    const header = request?.headers.get("authorization") || "";
    if (!header.startsWith("Bearer ")) throw new Error("Unauthorized: No valid token");

    const token = header.slice(7).trim();
    if (!token) throw new Error("Unauthorized: No token");

    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        transport: NoopWebSocket as unknown as typeof WebSocket,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) throw new Error("Unauthorized: Invalid token");

    return next({ context: { supabase, userId: data.claims.sub, claims: data.claims } });
  },
);