import { useEffect, useState } from "react";
import { useApp } from "./store";

export interface Profile {
  id: string;
  display_name: string;
  avatar: string;
  phone: string | null;
  is_blocked: boolean;
}

const AUTH_KEY = "mozaplay:logged-in";

export function useAuth() {
  const app = useApp();
  const [ready, setReady] = useState(false);
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    setLogged(localStorage.getItem(AUTH_KEY) === "1");
    setReady(true);
  }, []);

  if (!logged) return { user: null, ready };
  return {
    user: { id: app.profile.id, email: "jogador@mozaplay.local" },
    ready,
  };
}

export function loginLocal() {
  localStorage.setItem(AUTH_KEY, "1");
  window.dispatchEvent(new Event("mozaplay-auth"));
}

export function logoutLocal() {
  localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new Event("mozaplay-auth"));
}

export function useProfile() {
  const app = useApp();
  return {
    id: app.profile.id,
    display_name: app.profile.name,
    avatar: app.profile.avatar,
    phone: null,
    is_blocked: false,
  } satisfies Profile;
}

export function useIsAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    setAdmin(localStorage.getItem("mozaplay:admin") === "1");
  }, []);
  return admin;
}
