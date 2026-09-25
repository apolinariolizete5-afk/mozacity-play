import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar na MozaPlay — jogos com apostas em MZN" },
      {
        name: "description",
        content:
          "Cria a tua conta MozaPlay para jogar Ludo, Damas e Xadrez com apostas reais em meticais.",
      },
      { property: "og:title", content: "Entrar na MozaPlay" },
      { property: "og:description", content: "Joga Ludo, Damas e Xadrez e aposta em meticais." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void navigate({ to: "/wallet" });
    });
    void supabase.auth.getSession().then(({ data: d }) => {
      if (d.session) void navigate({ to: "/wallet" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name.trim() || "Jogador" },
          },
        });
        if (err) throw err;
        setInfo("Conta criada. Se pedirmos confirmação, verifica o teu e-mail.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo />
        <h1 className="font-display text-2xl font-extrabold">
          {mode === "signin" ? "Entrar" : "Criar conta"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Joga Ludo, Damas e Xadrez e aposta em meticais.
        </p>
      </div>

      <Card className="space-y-3">
        <form className="space-y-3" onSubmit={submit}>
          {mode === "signup" ? (
            <input
              className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary"
              placeholder="Nome de jogador"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          ) : null}
          <input
            className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary"
            type="email"
            required
            autoComplete="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Palavra-passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
          {info ? <p className="text-xs font-semibold text-success">{info}</p> : null}
          <Button className="w-full" size="lg" disabled={busy} type="submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {mode === "signin" ? "Entrar com e-mail" : "Criar conta"}
          </Button>
        </form>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" size="lg" onClick={google} type="button">
          Continuar com Google
        </Button>
      </Card>

      <button
        type="button"
        className="text-center text-sm font-semibold text-primary"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "Não tenho conta — criar agora" : "Já tenho conta — entrar"}
      </button>
    </main>
  );
}
