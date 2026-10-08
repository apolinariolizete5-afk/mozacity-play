import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Plus, Share2, Users2, AlertCircle } from "lucide-react";
import { Button, Card, PageHeader, Pill } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { createRoom, joinRoom, removeRoom, useRealtimeLobby } from "@/lib/realtime";
import { MOZAPLAY_TEST_MODE } from "@/lib/test-mode";
import { useApp } from "@/lib/store";
import { getPublicPlatformSettings } from "@/lib/platform.functions";
import { getWalletSummary } from "@/lib/wallet.functions";
import { PrivateRoomLobbyModal } from "@/components/PrivateRoomLobbyModal";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Salas de Jogo — MozaPlay" },
      { name: "description", content: "Cria uma sala real e joga com outros jogadores através do Realtime." },
    ],
  }),
  component: Rooms,
});

function Rooms() {
  const app = useApp();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [game, setGame] = useState<GameId>("ludo");
  const [isPrivate, setIsPrivate] = useState(true);
  const [bet, setBet] = useState(0);
  const [betInput, setBetInput] = useState("");
  const betInputEditingRef = useRef(false);
  const [capacity, setCapacity] = useState(2);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [minBetMzn, setMinBetMzn] = useState<number | null>(null);
  const getSettings = useServerFn(getPublicPlatformSettings);
  const getWallet = useServerFn(getWalletSummary);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useEffect(() => {
    getWallet()
      .then((w: any) => setWalletBalance(Number(w?.balance_cents ?? 0) / 100))
      .catch(() => setWalletBalance(null));
  }, [getWallet]);

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        if (!active) return;
        const minimum = Math.max(0, Math.ceil(settings.min_bet_cents / 100));
        setMinBetMzn(minimum);
        setBet((current) => (current > 0 ? Math.max(current, minimum) : minimum));
        if (!betInputEditingRef.current) {
          setBetInput((current) => {
            const parsed = Number(current);
            if (!current || !Number.isFinite(parsed) || parsed < minimum) return String(minimum);
            return current;
          });
        }
      } catch {
        // Keep the current value; the server remains the source of truth.
      }
    };

    void loadSettings();
    const timer = window.setInterval(() => void loadSettings(), 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadSettings();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const invitedCode = new URLSearchParams(window.location.search).get("code");
    if (invitedCode) setCode(invitedCode.toUpperCase().slice(0, 6));
  }, []);

  const [activeLobby, setActiveLobby] = useState<{
    code: string;
    game: GameId;
    bet: number;
    capacity: number;
    isHost: boolean;
  } | null>(null);

  const { remoteRooms } = useRealtimeLobby(
    { playerId: app.profile.id, name: app.profile.name },
    true,
  );

  const navigateToGame = (targetGame: GameId, targetCode: string, targetBet: number, targetCapacity: number) => {
    const wager = MOZAPLAY_TEST_MODE ? 0 : Math.max(minBetMzn ?? 0, Math.round(Number(targetBet) || 0));
    if (targetGame === "ludo") {
      void navigate({
        to: "/games/ludo",
        search: {
          bet: wager,
          timer: 15,
          players: Math.min(4, Math.max(2, targetCapacity)),
          room: targetCode,
        },
      });
    } else if (targetGame === "checkers") {
      void navigate({
        to: "/games/checkers",
        search: { bet: wager, timer: 15, room: targetCode },
      });
    } else {
      void navigate({
        to: "/games/chess",
        search: { bet: wager, timer: 15, room: targetCode },
      });
    }
  };

  const submitCreate = async () => {
    if (!app.profile.id) {
      await navigate({ to: "/auth" });
      return;
    }
    try {
      const entered = Number(betInput);
      if (!MOZAPLAY_TEST_MODE) {
        if (!Number.isFinite(entered) || entered < (minBetMzn ?? 0)) {
        setMessage(`O valor mínimo da aposta é ${minBetMzn ?? 0} MT.`);
          return;
        }
      }
      const wager = MOZAPLAY_TEST_MODE ? 0 : Math.round(entered);

      const userBalance = walletBalance ?? Number.POSITIVE_INFINITY;
      if (!MOZAPLAY_TEST_MODE && wager > 0 && userBalance < wager) {
        setMessage(`Saldo insuficiente para esta aposta de ${wager} MT.`);
        return;
      }

      setBet(wager);
      const room = await createRoom({
        game,
        isPrivate,
        capacity: game === "ludo" ? capacity : 2,
        bet: wager,
        player: { playerId: app.profile.id, name: app.profile.name },
      });

      setCreating(false);
      setMessage(null);
      setActiveLobby({
        code: room.code,
        game: room.game,
        bet: room.bet,
        capacity: room.capacity,
        isHost: true,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a sala.");
    }
  };

  const join = async (roomCode: string) => {
    if (!app.profile.id) {
      await navigate({ to: "/auth" });
      return;
    }
    try {
      const targetCode = roomCode.toUpperCase().trim();
      const existing = remoteRooms.find((r) => r.code === targetCode);
      const roomBet = MOZAPLAY_TEST_MODE ? 0 : existing?.bet ?? bet ?? 0;

      const userBalance = walletBalance ?? Number.POSITIVE_INFINITY;
      if (!MOZAPLAY_TEST_MODE && roomBet > 0 && userBalance < roomBet) {
        setMessage(`Saldo insuficiente (${userBalance.toFixed(2)} MT) para esta sala com aposta de ${roomBet} MT.`);
        return;
      }

      const room = await joinRoom(targetCode, { playerId: app.profile.id, name: app.profile.name });
      setMessage(null);
      setActiveLobby({
        code: room.code,
        game: room.game,
        bet: room.bet,
        capacity: room.capacity,
        isHost: false,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar na sala.");
    }
  };

  const shareRoom = async (room: { game: GameId; code: string; bet?: number; capacity?: number }) => {
    const path = `/rooms?code=${room.code}`;
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "MozaPlay",
          text: `Entra na minha sala de ${GAME_META[room.game]?.name || room.game} no MozaPlay! Código: ${room.code}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setMessage("Link de convite copiado.");
    } catch {
      setMessage(url);
    }
  };

  const visibleRooms = remoteRooms.filter((r) => !r.isPrivate);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-28 pt-5 sm:px-6">
      {activeLobby && (
        <PrivateRoomLobbyModal
          isOpen={Boolean(activeLobby)}
          roomCode={activeLobby.code}
          gameId={activeLobby.game}
          bet={activeLobby.bet}
          capacity={activeLobby.capacity}
          currentPlayerId={app.profile.id}
          currentPlayerName={app.profile.name || "Jogador"}
          isHost={activeLobby.isHost}
          onStartMatch={() => {
            navigateToGame(activeLobby.game, activeLobby.code, activeLobby.bet, activeLobby.capacity);
          }}
          onCancel={() => {
            setActiveLobby(null);
          }}
        />
      )}
      <PageHeader
        title="Salas de Jogo"
        subtitle="Cria salas privadas com código para desafiar amigos ou entra em salas abertas"
        right={
          <Button size="sm" onClick={() => setCreating((value) => !value)}>
            <Plus className="h-4 w-4" /> Criar Sala
          </Button>
        }
      />

      {MOZAPLAY_TEST_MODE && (
        <Card className="border-primary/40 bg-primary/10 text-xs font-bold text-primary">
          MODO TESTE TOTAL ATIVO — todos os jogos são gratuitos e sem apostas.
        </Card>
      )}

      {message && (
        <Card className="border-primary/40 bg-primary/10 text-xs font-semibold text-primary">
          {message}
        </Card>
      )}

      {creating && (
        <Card className="space-y-4 border-primary/30 p-4">
          <h2 className="font-display font-extrabold text-foreground">Nova Sala de Jogo</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground">Modalidade</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["ludo", "checkers", "chess"] as GameId[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGame(g)}
                    className={`rounded-xl border p-2.5 text-xs font-bold transition-all ${
                      game === g
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary/50 text-foreground"
                    }`}
                  >
                    {GAME_META[g]?.name || g}
                  </button>
                ))}
              </div>
            </div>

            {game === "ludo" && (
              <div>
                <label className="text-xs font-bold text-muted-foreground">Número de Jogadores</label>
                <div className="mt-1 flex gap-2">
                  {[2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCapacity(num)}
                      className={`flex-1 rounded-xl border p-2 text-xs font-bold ${
                        capacity === num ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/50"
                      }`}
                    >
                      {num} Jogadores
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-muted-foreground">Valor da aposta (MZN)</label>
              {MOZAPLAY_TEST_MODE && (
                <p className="mt-1 text-xs font-extrabold text-primary">MODO TESTE TOTAL — todos os jogos sem apostas nem cobranças.</p>
              )}
              <input
                type="number"
                min={MOZAPLAY_TEST_MODE ? 0 : minBetMzn ?? undefined}
                step={1}
                value={MOZAPLAY_TEST_MODE ? "0" : betInput}
                disabled={(game === "ludo" && LUDO_TEST_MODE) || (game === "checkers" && CHECKERS_TEST_MODE)}
                onFocus={() => {
                  betInputEditingRef.current = true;
                }}
                onChange={(event) => setBetInput(event.target.value)}
                onBlur={() => {
                  betInputEditingRef.current = false;
                  
                  const value = Number(betInput);
                  if (!Number.isFinite(value) || value < (minBetMzn ?? 0)) {
                    setBetInput(String(minBetMzn ?? 0));
                    setBet(minBetMzn ?? 0);
                  } else {
                    const normalized = String(Math.round(value));
                    setBetInput(normalized);
                    setBet(Number(normalized));
                  }
                }}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
              />
              <p className="mt-1 text-[11px] font-bold text-primary">
                Valor mínimo: {minBetMzn ?? "…"} MT
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="privateRoom"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <label htmlFor="privateRoom" className="text-xs font-medium text-foreground">
                Sala Privada (visível apenas para quem tiver o código)
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={submitCreate} className="flex-1 font-bold">
                Criar Sala e Gerar Código
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tens um código de amigo?</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ex: ABC123"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold tracking-widest uppercase"
          />
          <Button size="sm" disabled={code.trim().length < 4} onClick={() => void join(code)}>
            Entrar
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Salas Públicas Abertas ({visibleRooms.length})</h3>

        {visibleRooms.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground">
            Nenhuma sala pública aberta no momento. Cria uma nova e desafia outros jogadores!
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleRooms.map((r) => (
              <Card key={r.code} className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill>{GAME_META[r.game]?.name || r.game}</Pill>
                    <span className="text-xs font-extrabold text-primary">{r.bet} MT</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users2 className="h-3.5 w-3.5" />
                    <span>{r.players.length}/{r.capacity}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="font-mono text-xs font-bold text-foreground">Código: {r.code}</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => void shareRoom(r)}>
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" onClick={() => void join(r.code)}>
                      Jogar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}