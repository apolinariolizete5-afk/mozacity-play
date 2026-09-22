import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins } from "lucide-react";
import { Button, Card, PageHeader, Pill } from "@/components/ui/primitives";
import { paymentService } from "@/lib/payments";
import { addTransaction, useApp } from "@/lib/store";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Carteira de moedas — MozaPlay" },
      {
        name: "description",
        content: "Carteira de moedas de demonstração com histórico de transações e camada de pagamentos preparada.",
      },
      { property: "og:title", content: "Carteira de moedas — MozaPlay" },
      { property: "og:description", content: "Depósitos e retiradas de demonstração na MozaPlay." },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const app = useApp();
  const [busy, setBusy] = useState(false);

  const deposit = async (amount: number) => {
    setBusy(true);
    const dep = await paymentService.get("demo").createDeposit({
      ownerId: app.profile.id,
      amount,
      currency: "COIN",
    });
    addTransaction("deposit", amount, "Depósito de demonstração", dep.id);
    setBusy(false);
  };

  const withdraw = async (amount: number) => {
    if (app.coins < amount) return;
    setBusy(true);
    const wd = await paymentService.get("demo").createWithdrawal({
      ownerId: app.profile.id,
      amount,
      currency: "COIN",
      destination: "demo-wallet",
    });
    addTransaction("withdrawal", -amount, "Retirada de demonstração", wd.id);
    setBusy(false);
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-4">
      <PageHeader title="Carteira" subtitle="Moedas de demonstração" />

      <Card className="text-center">
        <Coins className="mx-auto h-7 w-7 text-primary" />
        <p className="mt-2 font-display text-4xl font-extrabold tabular-nums">{app.coins}</p>
        <p className="text-xs text-muted-foreground">Saldo em moedas demo</p>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => deposit(250)}>
            <ArrowDownLeft className="h-4 w-4" /> +250
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            disabled={busy || app.coins < 100}
            onClick={() => withdraw(100)}
          >
            <ArrowUpRight className="h-4 w-4" /> -100
          </Button>
        </div>
      </Card>

      <Card>
        <p className="font-display font-bold">Provedores de pagamento</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {paymentService.list().map((p) => (
            <Pill key={p.name} tone={p.enabled ? "success" : "muted"}>
              {p.name} {p.enabled ? "ativo" : "inativo"}
            </Pill>
          ))}
          <Pill tone="muted">m-pesa (futuro)</Pill>
          <Pill tone="muted">stripe (futuro)</Pill>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Camada PaymentService desacoplada, pronta para webhooks idempotentes.
        </p>
      </Card>

      <section className="space-y-2">
        <h3 className="px-1 font-display text-lg font-bold">Transações</h3>
        {app.transactions.length === 0 ? (
          <Card className="text-sm text-muted-foreground">Sem transações ainda.</Card>
        ) : (
          app.transactions.map((t) => (
            <Card key={t.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold">{t.description}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString("pt-PT")} · {t.kind}
                </p>
              </div>
              <span
                className={`font-display font-bold tabular-nums ${
                  t.amount >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {t.amount >= 0 ? "+" : ""}
                {t.amount}
              </span>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
