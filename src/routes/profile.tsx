import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  LogOut,
  Camera,
  Check,
  ChevronRight,
  Coins,
  Edit3,
  History,
  Phone,
  Save,
  ShieldCheck,
  Trophy,
  UserRound,
} from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { GAME_META, type GameId } from "@/lib/games/types";
import { setProfile, setTimerPreference, useApp, winRate } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Perfil — MozaPlay" },
      {
        name: "description",
        content: "Edita o teu perfil, foto, nome, contacto e acompanha o teu desempenho.",
      },
    ],
  }),
  component: Profile,
});

const AVATAR_PRESETS = ["🦁", "🐆", "🦅", "🐘", "🦈", "🐊", "🦒", "🐅"];

function Profile() {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(app.profile.name);
  const [phone, setPhone] = useState(app.profile.phone);
  const [bio, setBio] = useState(app.profile.bio);
  const [avatar, setAvatar] = useState(app.profile.avatar);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [gameStats, setGameStats] = useState<Record<GameId, { wins: number; losses: number }>>({
    ludo: { wins: 0, losses: 0 },
    checkers: { wins: 0, losses: 0 },
    chess: { wins: 0, losses: 0 },
  });

  useEffect(() => {
    setName(app.profile.name);
    setPhone(app.profile.phone);
    setBio(app.profile.bio);
    setAvatar(app.profile.avatar);
  }, [app.profile]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data: matches } = await supabase
        .from("matches")
        .select("game_type, player1_id, winner_id")
        .or(`player1_id.eq.${user.user.id},player2_id.eq.${user.user.id}`);
      const next = {
        ludo: { wins: 0, losses: 0 },
        checkers: { wins: 0, losses: 0 },
        chess: { wins: 0, losses: 0 },
      };
      for (const match of matches ?? []) {
        const key = match.game_type as GameId;
        if (!next[key]) continue;
        if (!match.winner_id) continue;
        if (match.winner_id === user.user.id) next[key].wins += 1;
        else next[key].losses += 1;
      }
      if (active) setGameStats(next);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setAccountEmail(data.user?.email ?? "");
      const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
      if (meta) {
        const nextName = typeof meta.display_name === "string" ? meta.display_name : "";
        const nextPhone = typeof meta.phone === "string" ? meta.phone : "";
        const nextBio = typeof meta.bio === "string" ? meta.bio : "";
        const nextAvatar = typeof meta.avatar === "string" ? meta.avatar : "";
        if (nextName) setName(nextName);
        if (nextPhone) setPhone(nextPhone);
        if (nextBio) setBio(nextBio);
        if (nextAvatar) setAvatar(nextAvatar);
      }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: name.trim() || "Jogador",
          phone: phone.trim(),
          bio: bio.trim(),
          avatar,
        },
      });
      if (error) throw error;
      setProfile(name, avatar, phone, bio);
      setSaved(true);
      setEditing(false);
    } catch (error) {
      console.error("[Profile]", error);
    } finally {
      setSaving(false);
    }
  };

  const chooseImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatar(reader.result);
        setEditing(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const initials = (name || "Jogador").trim().slice(0, 2).toUpperCase();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-28 pt-5 sm:px-6">
      <PageHeader title="Perfil" subtitle="A tua identidade e o teu percurso na MozaPlay" />

      <Card className="overflow-hidden p-0">
        <div className="h-28 bg-gradient-to-r from-primary/20 via-primary/5 to-accent/15 sm:h-36" />
        <div className="px-5 pb-5 sm:px-7">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-[2rem] border-4 border-card bg-secondary text-4xl shadow-xl sm:h-28 sm:w-28">
                  {avatar.startsWith("data:image") ? (
                    <img src={avatar} alt="Foto de perfil" className="h-full w-full object-cover" />
                  ) : (
                    avatar || initials
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-lg"
                  aria-label="Alterar foto de perfil"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => chooseImage(e.target.files?.[0])} />
              </div>
              <div className="pb-1">
                <h1 className="font-display text-2xl font-black">{name || "Jogador"}</h1>
                <p className="mt-1 text-xs text-muted-foreground">{accountEmail || "Conta MozaPlay"}</p>
              </div>
            </div>
            <Button variant={editing ? "outline" : "default"} onClick={() => setEditing((v) => !v)} className="gap-2">
              {editing ? <ChevronRight className="h-4 w-4 rotate-90" /> : <Edit3 className="h-4 w-4" />}
              {editing ? "Fechar edição" : "Editar perfil"}
            </Button>
          </div>

          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {bio || "Adiciona uma pequena descrição sobre ti para personalizar o teu perfil."}
          </p>
        </div>
      </Card>

      {editing && (
        <Card className="space-y-5 border-primary/20">
          <div>
            <p className="font-display text-lg font-black">Editar informações</p>
            <p className="mt-1 text-xs text-muted-foreground">As alterações ficam guardadas no perfil da tua conta.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold">Nome de jogador</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold">Contacto</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+258 84 000 0000" className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary" />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-bold">Sobre mim</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} placeholder="Conta um pouco sobre ti..." className="w-full resize-none rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none focus:border-primary" />
            <span className="block text-right text-[10px] text-muted-foreground">{bio.length}/160</span>
          </label>

          <div>
            <p className="mb-2 text-xs font-bold">Avatar rápido</p>
            <div className="flex flex-wrap gap-2">
              {AVATAR_PRESETS.map((item) => (
                <button key={item} type="button" onClick={() => setAvatar(item)} className={`grid h-11 w-11 place-items-center rounded-2xl text-xl ${avatar === item ? "bg-primary/15 ring-2 ring-primary" : "bg-secondary"}`}>
                  {item}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Ou usa o botão da foto para escolher uma imagem do teu telemóvel (máx. 2 MB).</p>
          </div>

          <Button disabled={saving} onClick={save} className="w-full gap-2 sm:w-auto">
            {saving ? <ShieldCheck className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
            {saving ? "A guardar..." : "Guardar alterações"}
          </Button>
          {saved && <p className="flex items-center gap-2 text-xs font-bold text-success"><Check className="h-4 w-4" /> Perfil atualizado.</p>}
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center"><p className="font-display text-2xl font-extrabold">{app.stats.total.wins}</p><p className="text-[11px] text-muted-foreground">Vitórias</p></Card>
        <Card className="text-center"><p className="font-display text-2xl font-extrabold">{app.stats.total.losses}</p><p className="text-[11px] text-muted-foreground">Derrotas</p></Card>
        <Card className="text-center"><p className="font-display text-2xl font-extrabold">{winRate(app.stats.total)}%</p><p className="text-[11px] text-muted-foreground">Taxa</p></Card>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><p className="font-display font-bold">Desempenho por jogo</p></div>
        {(Object.keys(GAME_META) as GameId[]).map((id) => (
          <div key={id} className="flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3 text-sm">
            <span className="font-semibold">{GAME_META[id].name}</span>
            <span className="text-xs text-muted-foreground">{gameStats[id].wins}V · {gameStats[id].losses}D · {winRate({ ...gameStats[id], draws: 0 })}%</span>
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /><p className="font-display font-bold">Preferências</p></div>
        <p className="text-xs text-muted-foreground">Escolhe o teu tempo preferido por turno.</p>
        <div className="flex gap-2">{[5, 10, 15].map((t) => <button key={t} onClick={() => setTimerPreference(t)} className={`h-11 flex-1 rounded-2xl text-sm font-bold ${app.timer === t ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{t}s</button>)}</div>
      </Card>

      <Card className="flex flex-col gap-4 border-destructive/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display font-bold">Sessão da conta</p>
          <p className="mt-1 text-xs text-muted-foreground">Termina a sessão neste dispositivo.</p>
        </div>
        <Button
          variant="outline"
          disabled={loggingOut}
          onClick={async () => {
            setLoggingOut(true);
            const { error } = await supabase.auth.signOut();
            if (error) {
              setLoggingOut(false);
              return;
            }
            window.location.href = "/auth";
          }}
          className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 sm:w-auto"
        >
          <LogOut className="h-4 w-4" />
          {loggingOut ? "A terminar sessão..." : "Terminar sessão"}
        </Button>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Link to="/wallet"><Button variant="ghost" className="w-full flex-col gap-1 py-2 text-xs" size="lg"><Coins className="h-5 w-5" /> Carteira</Button></Link>
        <Link to="/history"><Button variant="ghost" className="w-full flex-col gap-1 py-2 text-xs" size="lg"><History className="h-5 w-5" /> Histórico</Button></Link>
        <Link to="/notifications"><Button variant="ghost" className="w-full flex-col gap-1 py-2 text-xs" size="lg"><Bell className="h-5 w-5" /> Avisos</Button></Link>
      </div>
    </main>
  );
}
