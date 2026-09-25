import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button, Card, PageHeader, Pill } from "@/components/ui/primitives";
import { formatMzn, METHOD_LABELS } from "@/lib/money";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/lib/auth";
import {
  claimAdmin,
  getAdminOverview,
  settlePayout,
  updateSettings,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel de administração — MozaPlay" },
      {
        name: "description",
        content:
          "Comissão da casa, taxas de levantamento, rollover, fila de pagamentos e métricas da MozaPlay.",
      },
      { property: "og:title", content: "Painel de administração — MozaPlay" },
      { property: "og:description", content: "Gestão da banca e dos levantamentos da MozaPlay." },
    ],
  }),
  component: AdminPage,
});

interface Settings {
  house_fee_percent: number;
  withdrawal_fee_percent: number;
  withdrawal_fee_fixed_cents: number;
  min_deposit_cents: number;
  min_withdrawal_cents: number;
  rollover_enabled: boolean;
  rollover_multiplier: number;
}

interface PayoutRow {
  id: string;
  user_id: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  method: string;
  destination: string;
  status: string;
  created_at: string;
}

function AdminPage() {
  const { user, ready } = useAuth();
  const isAdmin = useIsAdmin(user);
  const [code, setCode] = useState("");
  const claim = useServerFn(claimAdmin);
  const qc = useQueryClient();

  const claimMutation = useMutation({
    mutationFn: () => claim({ data: { code: code.trim() } }),
    onSuccess: () => window.location.reload(),
  });

  if (!ready) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-4">
        <PageHeader title="Administração" subtitle="Acesso restrito" />
        <Card className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Entra primeiro na tua conta.</p>
          <Link to="/auth">
            <Button className="w-full">Entrar</Button>
          </Link>
        </Card>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-4">
        <PageHeader title="Administração" subtitle="Criação única de conta" />
        <Card className="space-y-3">
          <KeyRound className="h-6 w-6 text-accent" />
          <p className="text-sm text-muted-foreground">
            Insere a chave de criação de administrador. Só pode ser usada uma vez.
          </p>
          <input
            className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 font-mono text-sm outline-none focus:border-primary"
            placeholder="MOZAPLAY-ADMIN-…"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          {claimMutation.isError ? (
            <p className="text-xs font-semibold text-destructive">
              {(claimMutation.error as Error).message.includes("invalid_code")
                ? "Chave inválida."
                : (claimMutation.error as Error).message.includes("admin_already_created")
                  ? "A conta de administrador já foi criada."
                  : (claimMutation.error as Error).message}
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={code.trim().length < 10 || claimMutation.isPending}
            onClick={() => claimMutation.mutate()}
          >
            {claimMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Tornar-me administrador
          </Button>
        </Card>
      </main>
    );
  }

  return <AdminDashboard onRefresh={() => void qc.invalidateQueries()} />;
}

function AdminDashboard({ onRefresh }: { onRefresh: () => void }) {
  const overviewFn = useServerFn(getAdminOverview);
  const saveFn = useServerFn(updateSettings);
  const settleFn = useServerFn(settlePayout);

  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => overviewFn() });

  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select(
          "house_fee_percent, withdrawal_fee_percent, withdrawal_fee_fixed_cents, min_deposit_cents, min_withdrawal_cents, rollover_enabled, rollover_multiplier",
        )
        .eq("id", 1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as unknown as Settings;
    },
  });

  const payouts = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("id, user_id, amount_cents, fee_cents, net_cents, method, destination, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PayoutRow[];
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (settings.data && !form) setForm(settings.data);
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          house_fee_percent: Number(form!.house_fee_percent),
          withdrawal_fee_percent: Number(form!.withdrawal_fee_percent),
          withdrawal_fee_fixed_cents: Math.round(Number(form!.withdrawal_fee_fixed_cents)),
          min_deposit_cents: Math.round(Number(form!.min_deposit_cents)),
          min_withdrawal_cents: Math.round(Number(form!.min_withdrawal_cents)),
          rollover_enabled: form!.rollover_enabled,
          rollover_multiplier: Number(form!.rollover_multiplier),
        },
      }),
    onSuccess: onRefresh,
  });

  const settle = useMutation({
    mutationFn: (v: { id: string; status: "completed" | "failed" }) =>
      settleFn({ data: { payout_id: v.id, status: v.status } }),
    onSuccess: onRefresh,
  });


  const o = overview.data;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-4">
      <PageHeader title="Administração" subtitle="Banca, taxas e pagamentos" />

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Total depositado" value={o ? formatMzn(o.deposits_cents) : "—"} />
        <Metric label="Total levantado" value={o ? formatMzn(o.withdrawals_cents) : "—"} />
        <Metric
          label="Lucro em comissões"
          value={o ? formatMzn(o.rake_cents + o.withdrawal_fees_cents) : "—"}
          tone="success"
        />
        <Metric label="Volume de apostas" value={o ? formatMzn(o.bet_volume_cents) : "—"} />
        <Metric label="Saldo dos jogadores" value={o ? formatMzn(o.balance_cents) : "—"} />
        <Metric label="Jogadores" value={o ? String(o.players) : "—"} />
      </div>

      <Card className="space-y-3">
        <p className="font-display font-bold">Configuração da casa</p>
        {form ? (
          <>
            <Field
              label={`Comissão da casa (rake): ${form.house_fee_percent}%`}
              hint="Entre 5% e 15%, deduzida do pote antes de pagar o vencedor."
            >
              <input
                type="range"
                min={5}
                max={15}
                step={0.5}
                className="w-full accent-primary"
                value={form.house_fee_percent}
                onChange={(e) => setForm({ ...form, house_fee_percent: Number(e.target.value) })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Taxa levantamento (%)">
                <NumInput
                  value={form.withdrawal_fee_percent}
                  onChange={(v) => setForm({ ...form, withdrawal_fee_percent: v })}
                />
              </Field>
              <Field label="Taxa fixa (MT)">
                <NumInput
                  value={form.withdrawal_fee_fixed_cents / 100}
                  onChange={(v) => setForm({ ...form, withdrawal_fee_fixed_cents: v * 100 })}
                />
              </Field>
              <Field label="Depósito mínimo (MT)">
                <NumInput
                  value={form.min_deposit_cents / 100}
                  onChange={(v) => setForm({ ...form, min_deposit_cents: v * 100 })}
                />
              </Field>
              <Field label="Levantamento mínimo (MT)">
                <NumInput
                  value={form.min_withdrawal_cents / 100}
                  onChange={(v) => setForm({ ...form, min_withdrawal_cents: v * 100 })}
                />
              </Field>
            </div>
            <label className="flex items-center justify-between rounded-2xl bg-secondary/70 p-3 text-sm">
              <span>
                Rollover do depósito
                <span className="block text-[11px] text-muted-foreground">
                  Obriga a apostar o depósito antes de levantar.
                </span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary"
                checked={form.rollover_enabled}
                onChange={(e) => setForm({ ...form, rollover_enabled: e.target.checked })}
              />
            </label>
            <Field label={`Multiplicador de rollover: ${form.rollover_multiplier}x`}>
              <input
                type="range"
                min={0}
                max={3}
                step={0.5}
                className="w-full accent-primary"
                value={form.rollover_multiplier}
                onChange={(e) => setForm({ ...form, rollover_multiplier: Number(e.target.value) })}
              />
            </Field>
            {save.isError ? (
              <p className="text-xs font-semibold text-destructive">
                {(save.error as Error).message}
              </p>
            ) : null}
            <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar configuração
            </Button>

          </>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        )}
      </Card>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 px-1 font-display text-lg font-bold">
          Fila de levantamentos
          {o && o.pending_payouts > 0 ? (
            <Pill tone="accent">{o.pending_payouts} pendente(s)</Pill>
          ) : null}
        </h3>
        {(payouts.data ?? []).length === 0 ? (
          <Card className="text-sm text-muted-foreground">Sem pedidos.</Card>
        ) : (
          (payouts.data ?? []).map((p) => (
            <Card key={p.id} className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-bold tabular-nums">{formatMzn(p.amount_cents)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {METHOD_LABELS[p.method] ?? p.method} · {p.destination}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Taxa {formatMzn(p.fee_cents)} · líquido {formatMzn(p.net_cents)}
                  </p>
                </div>
                <Pill
                  tone={
                    p.status === "completed" ? "success" : p.status === "pending" ? "accent" : "danger"
                  }
                >
                  {p.status}
                </Pill>
              </div>
              {p.status === "pending" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={settle.isPending}
                    onClick={() => settle.mutate({ id: p.id, status: "completed" })}
                  >
                    <ShieldCheck className="h-4 w-4" /> Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    className="flex-1"
                    disabled={settle.isPending}
                    onClick={() => settle.mutate({ id: p.id, status: "failed" })}
                  >
                    Recusar
                  </Button>
                </div>
              ) : null}
            </Card>
          ))
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <Card className="p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-display text-lg font-bold tabular-nums ${tone === "success" ? "text-success" : ""}`}
      >
        {value}
      </p>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      className="h-11 w-full rounded-2xl border border-border bg-secondary px-3 text-sm tabular-nums outline-none focus:border-primary"
      inputMode="decimal"
      value={String(value)}
      onChange={(e) => {
        const n = Number(e.target.value.replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
