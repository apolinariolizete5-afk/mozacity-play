import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { Logo } from "@/components/Logo";
import { loginLocal } from "@/lib/auth";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (name.trim()) localStorage.setItem("mozaplay:player-name", name.trim());
    loginLocal();
    setTimeout(() => void navigate({ to: "/wallet" }), 150);
  };
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center"><Logo />
        <h1 className="font-display text-2xl font-extrabold">Entrar na MozaPlay</h1>
        <p className="text-sm text-muted-foreground">Modo local: sem Supabase, sem base de dados.</p>
      </div>
      <Card className="space-y-3">
        <form className="space-y-3" onSubmit={submit}>
          <input required className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none"
            placeholder="Nome de jogador" value={name} onChange={e=>setName(e.target.value)} />
          <Button className="w-full" size="lg" disabled={busy} type="submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Mail className="h-4 w-4"/>}
            Entrar
          </Button>
        </form>
      </Card>
    </main>
  );
}
