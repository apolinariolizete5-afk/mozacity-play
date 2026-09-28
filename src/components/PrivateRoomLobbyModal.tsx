import { useEffect, useState } from "react";
import { Copy, Check, Share2, Play, X, ShieldCheck, UserCheck, Loader2 } from "lucide-react";
import type { GameId } from "@/lib/games/types";
import { GAME_META } from "@/lib/games/types";
import { supabase } from "@/integrations/supabase/client";

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
}

interface PrivateRoomLobbyModalProps {
  isOpen: boolean;
  roomCode: string;
  gameId: GameId;
  bet: number;
  capacity: number;
  currentPlayerId: string;
  currentPlayerName: string;
  isHost: boolean;
  onStartMatch: () => void;
  onCancel: () => void;
}

export function PrivateRoomLobbyModal({
  isOpen,
  roomCode,
  gameId,
  bet,
  capacity,
  currentPlayerId,
  currentPlayerName,
  isHost,
  onStartMatch,
  onCancel,
}: PrivateRoomLobbyModalProps) {
  const [copied, setCopied] = useState(false);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

  const gameInfo = GAME_META[gameId];

  useEffect(() => {
    if (!isOpen || !roomCode) return;

    const channel = supabase.channel(`mozaplay:lobby_room:${roomCode}`, {
      config: {
        presence: { key: currentPlayerId },
        broadcast: { self: false, ack: true },
      },
    });

    const syncPresence = () => {
      const state = channel.presenceState();
      const list: LobbyPlayer[] = [];
      for (const entries of Object.values(state)) {
        for (const entry of entries as any[]) {
          if (entry && entry.id && !list.some((p) => p.id === entry.id)) {
            list.push({
              id: entry.id,
              name: entry.name || "Jogador",
              isHost: Boolean(entry.isHost),
            });
          }
        }
      }
      setPlayers(list);
    };

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.on("presence", { event: "join" }, syncPresence);
    channel.on("presence", { event: "leave" }, syncPresence);

    (channel as any).on("broadcast", { event: "start_match" }, () => {
      let count = 3;
      setCountdown(count);
      const interval = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          clearInterval(interval);
          onStartMatch();
        } else {
          setCountdown(count);
        }
      }, 1000);
    });

    (channel as any).on("broadcast", { event: "cancel_room" }, () => {
      alert("O anfitrião cancelou esta sala.");
      onCancel();
    });

    void channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          id: currentPlayerId,
          name: currentPlayerName,
          isHost,
        });
      }
    });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [isOpen, roomCode, currentPlayerId, currentPlayerName, isHost, onStartMatch, onCancel]);

  if (!isOpen) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencioso.
    }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `Criei uma sala de ${gameInfo.name} no MozaPlay! Entra com o código: ${roomCode}
Acesse: ${window.location.origin}/rooms?code=${roomCode}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleHostStart = async () => {
    if (!isHost || players.length < capacity) return;
    const channel = supabase.channel(`mozaplay:lobby_room:${roomCode}`);
    await channel.send({
      type: "broadcast",
      event: "start_match",
      payload: { roomCode },
    });

    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        onStartMatch();
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  const handleCancelClick = async () => {
    if (isHost) {
      const channel = supabase.channel(`mozaplay:lobby_room:${roomCode}`);
      await channel.send({
        type: "broadcast",
        event: "cancel_room",
        payload: { roomCode },
      });
    }
    onCancel();
  };

  const isRoomFull = players.length >= capacity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Sala Privada — {gameInfo.name}
            </span>
          </div>
          <button
            onClick={handleCancelClick}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-6 flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Código da Sala</p>
          <div className="my-2 font-mono text-4xl font-black tracking-widest text-primary">{roomCode}</div>
          <div className="flex gap-2">
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground transition hover:bg-secondary"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar Código"}
            </button>
            <button
              onClick={shareWhatsApp}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
            >
              <Share2 className="h-3.5 w-3.5" /> Convidar no WhatsApp
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-secondary/40 p-3 text-center text-xs">
          <div>
            <span className="text-muted-foreground">Aposta por jogador:</span>
            <span className="block font-extrabold text-foreground">{bet > 0 ? `${bet} MT` : "Amistoso"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Prêmio Total:</span>
            <span className="block font-extrabold text-primary">{bet > 0 ? `${bet * capacity} MT` : "Amistoso"}</span>
          </div>
        </div>

        <div className="my-6 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>JOGADORES NA SALA ({players.length}/{capacity})</span>
            {!isRoomFull && (
              <span className="flex items-center gap-1 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> Aguardando oponente...
              </span>
            )}
          </div>

          <div className="grid gap-2">
            {Array.from({ length: capacity }).map((_, index) => {
              const player = players[index];
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between rounded-xl border p-3 ${
                    player ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-secondary/20 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold ${
                      player ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}>
                      {player ? player.name.slice(0, 2).toUpperCase() : `P${index + 1}`}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {player ? player.name : "Vaga aberta (aguardando entrada...)"}
                      </p>
                      {player && (
                        <p className="text-[10px] font-semibold text-muted-foreground">
                          {player.isHost ? "Anfitrião (Criador)" : "Desafiante"}
                        </p>
                      )}
                    </div>
                  </div>
                  {player ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-500">
                      <UserCheck className="h-4 w-4" /> Pronto
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">Livre</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {countdown !== null ? (
          <div className="rounded-2xl bg-primary p-4 text-center text-primary-foreground shadow-lg animate-pulse">
            <p className="text-xs font-bold uppercase tracking-wider">A partida vai começar em...</p>
            <p className="font-display text-4xl font-black">{countdown}</p>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={handleCancelClick}
              className="flex-1 rounded-2xl border border-border bg-secondary py-3 text-sm font-bold text-foreground transition hover:bg-secondary/70"
            >
              {isHost ? "Cancelar Sala" : "Sair da Sala"}
            </button>

            {isHost ? (
              <button
                disabled={!isRoomFull}
                onClick={handleHostStart}
                className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                {isRoomFull ? "Iniciar Partida Agora" : `Aguardando ${capacity - players.length} jogador(es)`}
              </button>
            ) : (
              <div className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-primary/20 py-3 text-xs font-bold text-primary">
                <Loader2 className="h-4 w-4 animate-spin" /> Aguardando o anfitrião iniciar...
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          A aposta só é bloqueada quando a partida for confirmada por ambos.
        </div>
      </div>
    </div>
  );
}
