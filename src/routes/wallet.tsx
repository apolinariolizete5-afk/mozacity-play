import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";
import { Button, Card, PageHeader, Pill } from "@/components/ui/primitives";
import { formatMzn, METHOD_LABELS, TX_LABELS, toCents } from "@/lib/money";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  getWalletSummary,
  requestWithdrawal,
  startDeposit,
  type WalletSummary,
} from "@/lib/wallet.functions";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Carteira em meticais — MozaPlay" },
      {
        name: "description",
        content:
          "Deposita a partir de 50 MT por M-Pesa, e-Mola, mCash ou banco, acompanha o saldo levantável e o histórico de apostas.",
      },
      { property: "og:title", content: "Carteira em meticais — MozaPlay" },
      {
        property: "og:description",
        content: "Depósitos integrais, taxas transparentes e levantamentos a partir de 50 MT.",
      },
    ],
  }),
  component: WalletPage,
});

type Method = "mpesa" | "mola" | "mcash" | "bank";
const METHODS: Method[] = ["mpesa", "mola", "mcash", "bank"];

interface TxRow {
  id: string;
  kind: string;
  amount_cents: number;
  status: string;
  description: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function WalletPage() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const summaryFn = useServerFn(getWalletSummary);
  const [tab, setTab] = useState<"deposit" | "withdraw" | null>(null);

  const summary = useQuery({
    queryKey: ["wallet-summary", user?.id],
    queryFn: () => summaryFn(),
    enabled: Boolean(user),
  });

  const txs = useQuery({
    queryKey: ["wallet-txs", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, kind, amount_cents, status, description, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TxRow[];
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["wallet-summary"] });
    void qc.invalidateQueries({ queryKey: ["wallet-txs"] });
  };

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
        <PageHeader title="Carteira" subtitle="Meticais (MZN)" />
        <Card className="space-y-3 text-center">
          <WalletIcon className="mx-auto h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            Entra na tua conta para depositar, apostar e levantar em meticais.
          </p>
          <Link to="/auth">
            <Button className="w-full" size="lg">
              Entrar ou criar conta
            </Button>
          </Link>
        </Card>
      </main>
    );
  }

  const s = summary.data;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-4">
      <PageHeader title="Carteira" subtitle="Meticais (MZN)" />

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/20 blur-2xl" />
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Saldo disponível
        </p>
        <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">
          {s ? formatMzn(s.balance_cents) : "—"}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-secondary/70 p-3">
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Levantável
            </p>
            <p className="font-display text-lg font-bold tabular-nums text-success">
              {s ? formatMzn(s.withdrawable_cents) : "—"}
            </p>
          </div>
          <div className="rounded-2xl bg-secondary/70 p-3">
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Para jogar
            </p>
            <p className="font-display text-lg font-bold tabular-nums">
              {s ? formatMzn(s.rollover_required_cents) : "—"}
            </p>
          </div>
        </div>

        {s && s.rollover_enabled && s.rollover_required_cents > 0 ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-2xl bg-accent/10 p-2 text-[11px] leading-snug text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            Falta apostar {formatMzn(s.rollover_required_cents)} para este valor ficar levantável
            (rollover de 1x sobre o depósito).
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => setTab(tab === "deposit" ? null : "deposit")}>
            <ArrowDownToLine className="h-4 w-4" /> Depositar
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => setTab(tab === "withdraw" ? null : "withdraw")}
          >
            <ArrowUpFromLine className="h-4 w-4" /> Levantar
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Mín: {s ? formatMzn(s.min_deposit_cents) : "50,00 MT"} · o depósito entra integral, sem
          descontos
        </p>
      </Card>

      {tab === "deposit" && s ? <DepositPanel summary={s} onDone={refresh} /> : null}
      {tab === "withdraw" && s ? <WithdrawPanel summary={s} onDone={refresh} /> : null}

      <section className="space-y-2">
        <h3 className="px-1 font-display text-lg font-bold">Histórico</h3>
        {txs.isLoading ? (
          <Card className="text-sm text-muted-foreground">A carregar…</Card>
        ) : (txs.data ?? []).length === 0 ? (
          <Card className="text-sm text-muted-foreground">Sem movimentos ainda.</Card>
        ) : (
          (txs.data ?? []).map((t) => {
            const fee = Number((t.metadata?.["fee_cents"] as number | undefined) ?? 0);
            return (
              <Card key={t.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.description || TX_LABELS[t.kind]}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleString("pt-PT")} ·{" "}
                    {TX_LABELS[t.kind] ?? t.kind}
                    {t.status !== "completed" ? ` · ${t.status}` : ""}
                    {fee > 0 ? ` · taxa ${formatMzn(fee)}` : ""}
                  </p>
                </div>
                <span
                  className={`ml-2 shrink-0 font-display font-bold tabular-nums ${
                    t.amount_cents > 0
                      ? "text-success"
                      : t.amount_cents < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {t.amount_cents > 0 ? "+" : ""}
                  {formatMzn(t.amount_cents)}
                </span>
              </Card>
            );
          })
        )}
      </section>
    </main>
  );
}

function MethodPicker({
  value,
  onChange,
}: {
  value: Method;
  onChange: (m: Method) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {METHODS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`h-11 rounded-2xl border text-sm font-semibold transition-colors ${
            value === m
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-secondary text-muted-foreground"
          }`}
        >
          {METHOD_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

function DepositPanel({ summary, onDone }: { summary: WalletSummary; onDone: () => void }) {
  const deposit = useServerFn(startDeposit);
  const [amount, setAmount] = useState("50");
  const [method, setMethod] = useState<Method>("mpesa");
  const [msisdn, setMsisdn] = useState("");
  const min = summary.min_deposit_cents / 100;

  const mutation = useMutation({
    mutationFn: () =>
      deposit({
        data: {
          amount_cents: toCents(Number(amount)),
          method,
          msisdn: msisdn.trim(),
        },
      }),
    onSuccess: onDone,
  });

  const value = Number(amount);
  const invalid = !Number.isFinite(value) || value < min || msisdn.trim().length < 6;

  return (
    <Card className="space-y-3">
      <p className="font-display font-bold">Depositar</p>
      <div>
        <label className="text-[11px] font-bold uppercase text-muted-foreground">Valor (MT)</label>
        <input
          className="mt-1 h-12 w-full rounded-2xl border border-border bg-secondary px-4 font-display text-lg font-bold tabular-nums outline-none focus:border-primary"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
        />
        <div className="mt-2 flex gap-2">
          {[50, 100, 250, 500].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              className="h-8 flex-1 rounded-xl bg-secondary text-xs font-bold"
            >
              {v} MT
            </button>
          ))}
        </div>
      </div>
      <MethodPicker value={method} onChange={setMethod} />
      <input
        className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary"
        placeholder={method === "bank" ? "Número de conta / IBAN" : "Número de telemóvel (84…)"}
        inputMode="tel"
        maxLength={32}
        value={msisdn}
        onChange={(e) => setMsisdn(e.target.value)}
      />
      <div className="rounded-2xl bg-secondary/70 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Creditado na carteira</span>
          <span className="font-bold text-success">
            {Number.isFinite(value) ? formatMzn(toCents(value)) : "—"}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Sem qualquer dedução na entrada. Mínimo {formatMzn(summary.min_deposit_cents)}.
        </p>
      </div>
      {mutation.isError ? (
        <p className="text-xs font-semibold text-destructive">
          {depositError((mutation.error as Error).message)}
        </p>
      ) : null}
      {mutation.isSuccess ? (
        <p className="text-xs font-semibold text-success">
          {mutation.data.status === "completed"
            ? "Depósito confirmado e creditado."
            : "Pedido enviado. Confirma na tua carteira móvel."}
        </p>
      ) : null}
      <Button className="w-full" size="lg" disabled={invalid || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Depositar {Number.isFinite(value) ? formatMzn(toCents(value)) : ""}
      </Button>
    </Card>
  );
}

function WithdrawPanel({ summary, onDone }: { summary: WalletSummary; onDone: () => void }) {
  const withdraw = useServerFn(requestWithdrawal);
  const [amount, setAmount] = useState(String(summary.min_withdrawal_cents / 100));
  const [method, setMethod] = useState<Method>("mpesa");
  const [destination, setDestination] = useState("");

  const value = Number(amount);
  const cents = Number.isFinite(value) ? toCents(value) : 0;
  const quote = useMemo(() => {
    const fee =
      Math.floor((cents * summary.withdrawal_fee_percent) / 100) + summary.withdrawal_fee_fixed_cents;
    return { fee, net: cents - fee };
  }, [cents, summary.withdrawal_fee_percent, summary.withdrawal_fee_fixed_cents]);

  const mutation = useMutation({
    mutationFn: () =>
      withdraw({ data: { amount_cents: cents, method, destination: destination.trim() } }),
    onSuccess: onDone,
  });

  const invalid =
    cents < summary.min_withdrawal_cents ||
    cents > summary.withdrawable_cents ||
    quote.net <= 0 ||
    destination.trim().length < 6;

  return (
    <Card className="space-y-3">
      <p className="font-display font-bold">Levantar</p>
      <div>
        <label className="text-[11px] font-bold uppercase text-muted-foreground">Valor (MT)</label>
        <input
          className="mt-1 h-12 w-full rounded-2xl border border-border bg-secondary px-4 font-display text-lg font-bold tabular-nums outline-none focus:border-primary"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
        />
        <button
          type="button"
          className="mt-2 h-8 w-full rounded-xl bg-secondary text-xs font-bold"
          onClick={() => setAmount(String(summary.withdrawable_cents / 100))}
        >
          Levantar tudo ({formatMzn(summary.withdrawable_cents)})
        </button>
      </div>
      <MethodPicker value={method} onChange={setMethod} />
      <input
        className="h-12 w-full rounded-2xl border border-border bg-secondary px-4 text-sm outline-none focus:border-primary"
        placeholder={method === "bank" ? "Número de conta / IBAN" : "Número de telemóvel (84…)"}
        inputMode="tel"
        maxLength={32}
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
      />
      <div className="space-y-1 rounded-2xl bg-secondary/70 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Valor pedido</span>
          <span className="font-bold tabular-nums">{formatMzn(cents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            Taxa de serviço ({formatMzn(summary.withdrawal_fee_fixed_cents)} +{" "}
            {summary.withdrawal_fee_percent}%)
          </span>
          <span className="font-bold tabular-nums text-destructive">-{formatMzn(quote.fee)}</span>
        </div>
        <div className="flex justify-between border-t border-border/60 pt-1">
          <span className="font-semibold">Recebes na conta móvel</span>
          <span className="font-display font-bold tabular-nums text-success">
            {formatMzn(Math.max(0, quote.net))}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Mínimo {formatMzn(summary.min_withdrawal_cents)} · levantável hoje{" "}
        {formatMzn(summary.withdrawable_cents)}
      </p>
      {mutation.isError ? (
        <p className="text-xs font-semibold text-destructive">
          {depositError((mutation.error as Error).message)}
        </p>
      ) : null}
      {mutation.isSuccess ? (
        <p className="text-xs font-semibold text-success">
          Pedido enviado. Receberás {formatMzn(Math.max(0, quote.net))} depois da aprovação.
        </p>
      ) : null}
      <Button
        className="w-full"
        size="lg"
        disabled={invalid || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Pedir levantamento
      </Button>
      <div className="flex flex-wrap gap-1">
        <Pill tone="muted">Aprovação manual</Pill>
        <Pill tone="muted">Taxa transparente</Pill>
      </div>
    </Card>
  );
}

function depositError(message: string): string {
  const map: Record<string, string> = {
    below_min_deposit: "O depósito mínimo é 50 MT.",
    below_min_withdrawal: "O levantamento mínimo é 50 MT.",
    insufficient_funds: "Saldo insuficiente.",
    rollover_pending: "Ainda tens saldo por apostar antes de levantar.",
    amount_too_small_for_fee: "Valor demasiado baixo para cobrir a taxa.",
    destination_required: "Indica o número que vai receber o dinheiro.",
    account_blocked: "A tua conta está bloqueada. Fala com o suporte.",
    method_disabled: "Este método está temporariamente indisponível.",
    test_mode_disabled: "O pagamento está a ser processado pela gateway.",
  };
  for (const key of Object.keys(map)) if (message.includes(key)) return map[key]!;
  return message;
}
