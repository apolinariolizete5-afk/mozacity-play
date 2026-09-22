import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  display_name: string;
  avatar: string;
  phone: string | null;
  is_blocked: boolean;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data: d }) => {
      setSession(d.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, ready };
}

export function useProfile(user: User | null) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar, phone, is_blocked")
        .eq("id", user.id)
        .maybeSingle();
      if (alive) setProfile((data as Profile | null) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  return profile;
}

export function useIsAdmin(user: User | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (alive) setIsAdmin(Boolean(data));
    })();
    return () => {
      alive = false;
    };
  }, [user]);
  return isAdmin;
}
