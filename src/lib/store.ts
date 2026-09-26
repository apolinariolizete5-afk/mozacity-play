import { useEffect, useState } from "react";
import type { GameId } from "./games/types";
import type { Transaction, TransactionKind } from "./payments";

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

const AVATARS = ["🦁", "🐆", "🦅", "🐘", "🦈", "🐊", "🦒", "🐅"];
const emptyStats = (): Stats => ({ wins: 0, losses: 0, draws: 0 });

export const uid = () => Math.random().toString(36).slice(2, 10);
export const roomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "MP";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

export function defaultState(): AppState {
  return {
    profile: {
      id: uid(),
      name: "Jogador",
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
      phone: "",
      bio: "",
      joinedAt: new Date().toISOString(),
    },
    coins: 0,
    timer: 10,
    stats: {
      total: emptyStats(),
      ludo: emptyStats(),
      checkers: emptyStats(),
      chess: emptyStats(),
    },
    matches: [],
    transactions: [],
    notifications: [
      {
        id: uid(),
        title: "Bem-vindo à MozaPlay",
        body: "A tua conta está pronta. Entra numa sala para jogar com outros jogadores reais.",
        kind: "system",
        read: false,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

let state: AppState | null = null;
const listeners = new Set<() => void>();

function read(): AppState {
  if (state) return state;
  const base = defaultState();
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem("mozaplay:state:v1");
      if (saved) {
        const persisted = JSON.parse(saved) as Partial<AppState>;
        state = { ...base, ...persisted, profile: { ...base.profile, ...(persisted.profile ?? {}) } };
        return state;
      }
      const profile = window.localStorage.getItem("mozaplay:profile:v2");
      if (profile) {
        const parsed = JSON.parse(profile) as Partial<AppState["profile"]>;
        base.profile = { ...base.profile, ...parsed };
      }
    } catch {}
  }
  state = base;
  return state;
}

function write(next: AppState) {
  state = next;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem("mozaplay:state:v1", JSON.stringify(next)); } catch {}
  }
  listeners.forEach((listener) => listener());
}

export function update(fn: (s: AppState) => AppState) {
  write(fn(read()));
}

export function useApp(): AppState {
  const [snapshot, setSnapshot] = useState<AppState | null>(null);
  useEffect(() => {
    const sync = () => setSnapshot({ ...read() });
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return snapshot ?? defaultState();
}

export function useHydratedApp(): { app: AppState; ready: boolean } {
  const [snapshot, setSnapshot] = useState<AppState | null>(null);
  useEffect(() => {
    const sync = () => setSnapshot({ ...read() });
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return { app: snapshot ?? defaultState(), ready: snapshot !== null };
}

/* ---------- actions ---------- */

export function addTransaction(
  kind: TransactionKind,
  amount: number,
  description: string,
  reference = uid(),
) {
  update((s) => ({
    ...s,
    coins: Math.max(0, s.coins + amount),
    transactions: [
      {
        id: uid(),
        walletOwnerId: s.profile.id,
        kind,
        amount,
        currency: "COIN" as const,
        status: "completed" as const,
        reference,
        description,
        createdAt: new Date().toISOString(),
      },
      ...s.transactions,
    ].slice(0, 100),
  }));
}

export function notify(n: Omit<Notification, "id" | "read" | "createdAt">) {
  update((s) => ({
    ...s,
    notifications: [
      { ...n, id: uid(), read: false, createdAt: new Date().toISOString() },
      ...s.notifications,
    ].slice(0, 50),
  }));
}

export function markNotificationsRead() {
  update((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
}

export function setTimerPreference(timer: number) {
  update((s) => ({ ...s, timer }));
}

export function setProfile(name: string, avatar: string, phone = "", bio = "") {
  update((s) => {
    const profile = { ...s.profile, name: name.trim() || "Jogador", avatar, phone: phone.trim(), bio: bio.trim() };
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem("mozaplay:profile:v2", JSON.stringify(profile)); } catch {}
    }
    return { ...s, profile };
  });
}

export function recordMatch(input: {
  game: GameId;
  result: "win" | "loss" | "draw";
  opponents: string[];
  bet: number;
}) {
  const coins = 0;
  update((s) => {
    const bump = (st: Stats): Stats => ({
      wins: st.wins + (input.result === "win" ? 1 : 0),
      losses: st.losses + (input.result === "loss" ? 1 : 0),
      draws: st.draws + (input.result === "draw" ? 1 : 0),
    });
    return {
      ...s,
      stats: {
        ...s.stats,
        total: bump(s.stats.total),
        [input.game]: bump(s.stats[input.game]),
      },
      matches: [
        {
          id: uid(),
          game: input.game,
          result: input.result,
          opponents: input.opponents,
          coins,
          bet: input.bet,
          createdAt: new Date().toISOString(),
        },
        ...s.matches,
      ].slice(0, 100),
    };
  });
  if (coins > 0) addTransaction("prize", coins, `Prémio de partida (${input.game})`);
  notify({
    title: input.result === "win" ? "Vitória!" : input.result === "draw" ? "Empate" : "Derrota",
    body:
      input.result === "win"
        ? `Ganhaste ${coins} moedas.`
        : input.result === "draw"
          ? "Aposta devolvida."
          : "Tenta outra vez — a revanche espera.",
    kind: "result",
  });
}

export function placeBet(amount: number, _game: GameId) {
  // Real-money bets are authorized and settled by Supabase RPCs.
  // The client-side store never creates, debits or credits money.
  return amount <= 0;
}

export const winRate = (s: Stats) => {
  const total = s.wins + s.losses + s.draws;
  return total === 0 ? 0 : Math.round((s.wins / total) * 100);
};

/** Leaderboard entries come from the backend; no seeded players are created locally. */
export const LEADERBOARD_SEED: never[] = [];
