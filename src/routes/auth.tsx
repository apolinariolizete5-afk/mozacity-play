import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, Phone } from "lucide-react";
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
  const [mode, setMode] = useState<"signin" | "signup" | "recovery" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("type=invite")) {
      setMode("reset");
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void navigate({ to: "/wallet" });
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    void supabase.auth.getSession().then(({ data: d }) => {
      if (d.session && mode !== "recovery") void navigate({ to: "/wallet" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === "signup" && !acceptedTerms) {
      setError("Confirma que leste e aceitas os Termos e Condições para criar a conta.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "recovery") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + "/auth",
        });
        if (err) throw err;
        setInfo("Se este e-mail estiver registado, enviámos um link para redefinir a palavra-passe. Verifica também a pasta de spam.");
        return;
      }

      if (mode === "reset") {
        if (newPassword.length < 6) {
          setError("A nova palavra-passe deve ter pelo menos 6 caracteres.");
          return;
        }
        const { error: err } = await supabase.auth.updateUser({ password: newPassword });
        if (err) throw err;
        setInfo("Palavra-passe alterada com sucesso. Já podes entrar com a nova palavra-passe.");
        setMode("signin");
        setPassword("");
        setNewPassword("");
        return;
      }

      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth",
            data: {
              display_name: name.trim() || "Jogador",
              phone: phone.trim(),
              terms_accepted: true,
              terms_accepted_at: new Date().toISOString(),
            },
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
      const message = (err as Error).message || "";
      const normalized = message.toLowerCase();
      if (normalized.includes("invalid login credentials")) {
        setError("E-mail ou palavra-passe incorretos.");
      } else if (normalized.includes("email not confirmed")) {
        setError("Confirma o teu e-mail antes de entrar.");
      } else if (normalized.includes("user already registered")) {
        setError("Este e-mail já está registado.");
      } else if (normalized.includes("rate limit")) {
        setError("Muitas tentativas. Aguarda alguns minutos e tenta novamente.");
      } else if (normalized.includes("password")) {
        setError("A palavra-passe não é válida. Verifica os requisitos e tenta novamente.");
      } else if (normalized.includes("network") || normalized.includes("fetch")) {
        setError("Não foi possível ligar ao servidor. Verifica a tua internet e tenta novamente.");
      } else {
        setError("Não foi possível concluir a operação. Tenta novamente.");
      }
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    } catch {
      setError("Não foi possível entrar com o Google. Tenta novamente.");
    }
  };

  const title =
    mode === "signin"
      ? "Entrar"
      : mode === "signup"
        ? "Criar conta"
        : mode === "recovery"
          ? "Recuperar palavra-passe"
          : "Definir nova palavra-passe";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo />
        <h1 className="font-display text-2xl font-extrabold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "recovery"
            ? "Introduz o teu e-mail e enviaremos um link para redefinir a palavra-passe."
            : mode === "reset"
              ? "Escolhe uma nova palavra-passe para a tua conta."
              : "Joga Ludo, Damas e Xadrez e aposta em meticais."}
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

          {mode !== "reset" ? (
            <input
              className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary"
              type="email"
              required
              autoComplete="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          ) : null}

          {mode === "reset" ? (
            <input
              className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Nova palavra-passe"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          ) : (
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
          )}

          {mode === "signup" ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-secondary/60 p-3 text-xs leading-5">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
              />
              <span>
                <span className="font-semibold">Li e aceito os </span>
                <a href="/terms" target="_blank" rel="noreferrer" className="font-bold text-primary underline">Termos e Condições</a>
                <span className="font-semibold"> e a </span>
                <a href="/privacy" target="_blank" rel="noreferrer" className="font-bold text-primary underline">Política de Privacidade</a>.
              </span>
            </label>
          ) : null}

          {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
          {info ? <p className="text-xs font-semibold text-success">{info}</p> : null}

          <Button className="w-full" size="lg" disabled={busy} type="submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {mode === "signin"
              ? "Entrar com e-mail"
              : mode === "signup"
                ? "Criar conta"
                : mode === "recovery"
                  ? "Enviar link de recuperação"
                  : "Guardar nova palavra-passe"}
          </Button>
        </form>

        {mode === "signin" ? (
          <button
            type="button"
            className="w-full text-center text-sm font-semibold text-primary"
            onClick={() => { setMode("recovery"); setError(null); setInfo(null); }}
          >
            Esqueci-me da palavra-passe
          </button>
        ) : null}

        {mode !== "signin" ? (
          <button
            type="button"
            className="w-full text-center text-sm font-semibold text-primary"
            onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
          >
            Voltar para entrar
          </button>
        ) : null}

        {mode === "signin" ? (
          <>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" size="lg" onClick={google} type="button">
              Continuar com Google
            </Button>
          </>
        ) : null}
      </Card>

      {mode === "signin" || mode === "signup" ? (
        <button
          type="button"
          className="text-center text-sm font-semibold text-primary"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
        >
          {mode === "signin" ? "Não tenho conta — criar agora" : "Já tenho conta — entrar"}
        </button>
      ) : null}
    </main>
  );
}
