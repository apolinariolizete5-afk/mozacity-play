import { useEffect, useState } from "react";
import type { GameId } from "./games/types";
import type { Transaction, TransactionKind } from "./payments";

export type RoomStatus = "WAITING" | "READY" | "STARTING" | "PLAYING" | "FINISHED" | "CANCELLED";

export interface RoomPlayer {
  id: string;
  name: string;
  bot: boolean;
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
  profile: { id: string; name: string; avatar: string; phone: string; joinedAt: string };
  coins: number;
  timer: number;
  stats: Record<GameId | "total", Stats>;
  matches: MatchRecord[];
  transactions: Transaction[];
  notifications: Notification[];
  rooms: Room[];
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

const BOT_NAMES = [
  "Nito",
  "Chico",
  "Amina",
  "Dino",
  "Rui",
  "Tembe",
  "Laura",
  "Zeca",
  "Mira",
  "Salim",
];
export const botName = () => BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!;


export function defaultState(): AppState {
  return {
    profile: {
      id: uid(),
      name: "Jogador",
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
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
        body: "A tua carteira é alimentada por depósitos reais confirmados.",
        kind: "system",
        read: false,
        createdAt: new Date().toISOString(),
      },
    ],
    rooms: [],
  };
}

let state: AppState | null = null;
const listeners = new Set<() => void>();

function read(): AppState {
  return state ?? (state = defaultState());
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

export function setProfile(name: string, avatar: string) {
  update((s) => ({ ...s, profile: { ...s.profile, name, avatar } }));
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

export function createRoom(input: {
  game: GameId;
  isPrivate: boolean;
  bet: number;
  timer: number;
  capacity: number;
}): Room {
  const s = read();
  const room: Room = {
    id: uid(),
    code: roomCode(),
    game: input.game,
    isPrivate: input.isPrivate,
    bet: input.bet,
    timer: input.timer,
    capacity: input.capacity,
    status: "WAITING",
    players: [{ id: s.profile.id, name: s.profile.name, bot: false }],
    hostId: s.profile.id,
    createdAt: new Date().toISOString(),
  };
  update((prev) => ({ ...prev, rooms: [room, ...prev.rooms] }));
  return room;
}

export function joinRoom(roomId: string) {
  update((s) => ({
    ...s,
    rooms: s.rooms.map((r) => {
      if (r.id !== roomId) return r;
      if (r.players.some((p) => p.id === s.profile.id) || r.players.length >= r.capacity) return r;
      const players = [...r.players, { id: s.profile.id, name: s.profile.name, bot: false }];
      return { ...r, players, status: players.length >= r.capacity ? "READY" : "WAITING" };
    }),
  }));
}

export function fillWithBots(roomId: string) {
  update((s) => ({
    ...s,
    rooms: s.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const players = [...r.players];
      while (players.length < r.capacity) players.push({ id: uid(), name: botName(), bot: true });
      return { ...r, players, status: "READY" };
    }),
  }));
}

export function setRoomStatus(roomId: string, status: RoomStatus) {
  update((s) => ({ ...s, rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, status } : r)) }));
}

export function leaveRoom(roomId: string) {
  update((s) => ({
    ...s,
    rooms: s.rooms.map((r) =>
      r.id === roomId
        ? {
            ...r,
            players: r.players.filter((p) => p.id !== s.profile.id),
            status: r.hostId === s.profile.id ? "CANCELLED" : "WAITING",
          }
        : r,
    ),
  }));
}

export function getRoom(roomId: string): Room | undefined {
  return read().rooms.find((r) => r.id === roomId);
}

export function findRoomByCode(code: string): Room | undefined {
  return read().rooms.find((r) => r.code.toUpperCase() === code.trim().toUpperCase());
}

export const winRate = (s: Stats) => {
  const total = s.wins + s.losses + s.draws;
  return total === 0 ? 0 : Math.round((s.wins / total) * 100);
};

/** Leaderboard entries come from the backend; no seeded players are created locally. */
export const LEADERBOARD_SEED: never[] = [];
