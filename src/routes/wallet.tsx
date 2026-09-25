import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, Wallet as WalletIcon } from "lucide-react";
import { useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { formatMzn } from "@/lib/money";
import { depositDemo, withdrawDemo, useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/wallet")({ component: WalletPage });

function WalletPage() {
  const { user, ready } = useAuth();
  const app = useApp();
  const [tab,setTab]=useState<"deposit"|"withdraw"|null>(null);
  const [amount,setAmount]=useState("50");
  const [method,setMethod]=useState("M-Pesa");
  const [message,setMessage]=useState("");

  if(!ready) return <main className="flex min-h-[60vh] items-center justify-center">A carregar…</main>;
  if(!user) return <main className="mx-auto w-full max-w-md space-y-4 px-4"><PageHeader title="Carteira" subtitle="Modo local"/><Card className="space-y-3 text-center"><WalletIcon className="mx-auto h-8 w-8 text-primary"/><p>Entra para usar a carteira.</p><Button className="w-full" onClick={()=>location.href="/auth"}>Entrar</Button></Card></main>;

  const submit=()=>{
    const n=Number(amount);
    const ok=tab==="deposit"?depositDemo(n,method):withdrawDemo(n,method);
    setMessage(ok ? (tab==="deposit"?"Depósito de demonstração creditado.":"Levantamento de demonstração registado.") : (tab==="deposit"?"Valor mínimo: 50 MT.":"Saldo insuficiente ou valor inválido."));
    if(ok) setTab(null);
  };

  return <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-4">
    <PageHeader title="Carteira" subtitle="Moedas de demonstração"/>
    <Card className="space-y-4">
      <p className="text-xs font-bold uppercase text-muted-foreground">Saldo disponível</p>
      <p className="font-display text-4xl font-extrabold">{formatMzn(app.coins*100)}</p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={()=>{setTab("deposit");setMessage("")}}><ArrowDownToLine className="h-4 w-4"/> Depositar</Button>
        <Button variant="ghost" className="flex-1" onClick={()=>{setTab("withdraw");setMessage("")}}><ArrowUpFromLine className="h-4 w-4"/> Levantar</Button>
      </div>
      {tab ? <div className="space-y-3 rounded-2xl bg-secondary p-4">
        <p className="font-bold">{tab==="deposit"?"Depositar":"Levantar"}</p>
        <input className="h-12 w-full rounded-2xl border border-border bg-background px-4" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value.replace(",","."))}/>
        <select className="h-12 w-full rounded-2xl border border-border bg-background px-4" value={method} onChange={e=>setMethod(e.target.value)}>
          <option>M-Pesa</option><option>e-Mola</option><option>mCash</option><option>Banco</option>
        </select>
        <Button className="w-full" size="lg" onClick={submit}>{tab==="deposit"?"Confirmar depósito":"Confirmar levantamento"}</Button>
      </div>:null}
      {message?<p className="text-sm font-semibold text-primary">{message}</p>:null}
    </Card>
    <Card><p className="font-display font-bold">Histórico</p><div className="mt-2 space-y-2">{app.transactions.length?app.transactions.slice(0,20).map(t=><div key={t.id} className="flex justify-between text-sm"><span>{t.description}</span><span>{t.amount>0?"+":""}{t.amount}</span></div>):<p className="text-sm text-muted-foreground">Sem movimentos.</p>}</div></Card>
  </main>;
}
