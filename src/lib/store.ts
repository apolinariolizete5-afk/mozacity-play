import { useEffect, useState } from "react";
import type { GameId } from "./games/types";
import type { Transaction, TransactionKind } from "./payments";
import { supabase } from "@/integrations/supabase/client";

export type RoomStatus = "WAITING" | "READY" | "STARTING" | "PLAYING" | "FINISHED" | "CANCELLED";

export interface RoomPlayer {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  code: string;
  game: GameId;
  isPrivate: boolean;
  bet: number;
  timer: number;
  capacity: number;
  status: RoomStatus;
  players: RoomPlayer[];
  hostId: string;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  game: GameId;
  result: "win" | "loss" | "draw";
  opponents: string[];
  coins: number;
  bet: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  kind: "invite" | "challenge" | "result" | "system";
  read: boolean;
  createdAt: string;
}

export interface Stats {
  wins: number;
  losses: number;
  draws: number;
}

export interface AppState {
  profile: { id: string; name: string; avatar: string; phone: string; bio: string; joinedAt: string };
  coins: number;
  timer: number;
  stats: Record<GameId | "total", Stats>;
  matches: MatchRecord[];
  transactions: Transaction[];
  notifications: Notification[];
}

const emptyStats = (): Stats => ({ wins: 0, losses: 0, draws: 0 });

export const uid = () => crypto.randomUUID();

export function defaultState(): AppState {
  return {
    profile: {
      id: "",
      name: "Jogador",
      avatar: "🙂",
      phone: "",
      bio: "",
      joinedAt: new Date().toISOString(),
    },
    coins: 0,
    timer: 15,
    stats: {
      total: emptyStats(),
      ludo: emptyStats(),
      checkers: emptyStats(),
      chess: emptyStats(),
    },
    matches: [],
    transactions: [],
    notifications: [],
  };
}

let state: AppState | null = null;
const listeners = new Set<() => void>();

async function loadStats(userId: string) {
  const { data, error } = await supabase
    .from("stats")
    .select("wins, losses, draws")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Stats]", error.message);
    return emptyStats();
  }
  return {
    wins: Number(data?.wins ?? 0),
    losses: Number(data?.losses ?? 0),
    draws: Number(data?.draws ?? 0),
  };
}

async function loadProfile(userId: string) {
  const userResult = await supabase.auth.getUser();
  const metadata = (userResult.data.user?.user_metadata ?? {}) as Record<string, unknown>;

  const first = await supabase
    .from("user_profiles")
    .select("id, display_name, avatar, phone, bio, created_at")
    .eq("id", userId)
    .maybeSingle();

  const data = first.error
    ? (
        await supabase
          .from("profiles")
          .select("id, display_name, avatar, phone, bio, created_at")
          .eq("id", userId)
          .maybeSingle()
      ).data
    : first.data;

  return {
    id: userId,
    name: String(data?.display_name ?? metadata.display_name ?? "Jogador"),
    avatar: String(data?.avatar ?? metadata.avatar ?? "🙂"),
    phone: String(data?.phone ?? metadata.phone ?? ""),
    bio: String(data?.bio ?? metadata.bio ?? ""),
    joinedAt: String(data?.created_at ?? new Date().toISOString()),
  };
}

async function hydrate() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    state = defaultState();
    listeners.forEach((listener) => listener());
    return;
  }

  const [profile, stats] = await Promise.all([loadProfile(user.id), loadStats(user.id)]);
  const next = defaultState();
  next.profile = profile;
  next.stats.total = stats;
  state = next;
  listeners.forEach((listener) => listener());
}

function read() {
  return state ?? defaultState();
}

export function update(fn: (current: AppState) => AppState) {
  state = fn(read());
  listeners.forEach((listener) => listener());
}

export function useApp(): AppState {
  const [snapshot, setSnapshot] = useState<AppState>(() => read());

  useEffect(() => {
    const sync = () => setSnapshot({ ...read() });
    listeners.add(sync);
    void hydrate();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void hydrate();
    });
    return () => {
      listeners.delete(sync);
      data.subscription.unsubscribe();
    };
  }, []);

  return snapshot;
}

export function useHydratedApp() {
  const app = useApp();
  return { app, ready: Boolean(app.profile.id) };
}

export async function addTransaction(
  _kind: TransactionKind,
  _amount: number,
  _description: string,
  _reference = uid(),
) {
  throw new Error("Transações financeiras são processadas pelos endpoints reais da carteira.");
}

export async function notify(_notification: Omit<Notification, "id" | "read" | "createdAt">) {
  // Notifications are delivered by Lovable Cloud / Realtime / Push.
  // No fake notifications are seeded or persisted locally.
}

export function markNotificationsRead() {
  // Notifications are read-state managed by the backend when that endpoint is enabled.
}

export function setTimerPreference(timer: number) {
  update((current) => ({ ...current, timer: Math.max(1, Math.min(15, timer)) }));
}

export async function setProfile(name: string, avatar: string, phone = "", bio = "") {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("auth_required");

  const payload = {
    id: data.user.id,
    display_name: name.trim() || "Jogador",
    avatar,
    phone: phone.trim(),
    bio: bio.trim(),
  };

  let result = await supabase.from("user_profiles").upsert(payload);
  if (result.error) result = await supabase.from("profiles").upsert(payload);
  if (result.error) throw new Error(result.error.message);

  await supabase.auth.updateUser({
    data: {
      display_name: payload.display_name,
      avatar: payload.avatar,
      phone: payload.phone,
      bio: payload.bio,
    },
  });

  update((current) => ({
    ...current,
    profile: {
      ...current.profile,
      name: payload.display_name,
      avatar: payload.avatar,
      phone: payload.phone,
      bio: payload.bio,
    },
  }));
}

export async function recordMatch(input: {
  game: GameId;
  result: "win" | "loss" | "draw";
  opponents: string[];
  opponentIds?: string[];
  playerIds?: string[];
  bet: number;
  winnerId?: string | null;
  matchId?: string;
}) {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("auth_required");

  const playerIds = input.playerIds ?? [userId, ...(input.opponentIds ?? [])].slice(0, 2);
  const winnerId = input.winnerId ?? (input.result === "win" ? userId : input.result === "draw" ? null : playerIds[1] ?? null);

  const matchRow = {
    id: input.matchId ?? crypto.randomUUID(),
    game_type: input.game,
    player1_id: playerIds[0] ?? userId,
    player2_id: playerIds[1] ?? null,
    winner_id: winnerId,
    status: "finished",
    created_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
  };

  if (input.persistMatch !== false) {
    const { error: matchError } = await supabase.from("matches").insert(matchRow);
    if (matchError) {
      console.error("[Match]", matchError.message);
      throw new Error(matchError.message);
    }
  }

  const { data: currentStats } = await supabase
    .from("stats")
    .select("wins, losses, draws, total_matches")
    .eq("user_id", userId)
    .maybeSingle();

  const nextStats = {
    user_id: userId,
    wins: Number(currentStats?.wins ?? 0) + (input.result === "win" ? 1 : 0),
    losses: Number(currentStats?.losses ?? 0) + (input.result === "loss" ? 1 : 0),
    draws: Number(currentStats?.draws ?? 0) + (input.result === "draw" ? 1 : 0),
    total_matches: Number(currentStats?.total_matches ?? 0) + 1,
  };

  const { error: statsError } = await supabase.from("stats").upsert(nextStats, { onConflict: "user_id" });
  if (statsError) console.error("[Stats]", statsError.message);

  update((current) => ({
    ...current,
    stats: {
      ...current.stats,
      total: {
        wins: nextStats.wins,
        losses: nextStats.losses,
        draws: nextStats.draws,
      },
    },
  }));

  return { ...matchRow, bet, opponents };
}

export function placeBet(amount: number, _game: GameId) {
  if (amount < 0) throw new Error("invalid_bet");
  return true;
}

export const winRate = (s: Stats) => {
  const total = s.wins + s.losses + s.draws;
  return total === 0 ? 0 : Math.round((s.wins / total) * 100);
};

export const LEADERBOARD_SEED: never[] = [];
