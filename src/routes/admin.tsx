import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { useIsAdmin } from "@/lib/auth";

export const Route = createFileRoute("/admin")({ component: AdminPage });
function AdminPage(){
 const [code,setCode]=useState("");
 const [ok,setOk]=useState(useIsAdmin());
 if(!ok) return <main className="mx-auto w-full max-w-md space-y-4 px-4"><PageHeader title="Administração" subtitle="Modo local"/><Card className="space-y-3"><p className="text-sm">Use a chave local de administrador.</p><input className="h-12 w-full rounded-2xl border border-border bg-secondary px-4" value={code} onChange={e=>setCode(e.target.value)}/><Button className="w-full" onClick={()=>{if(code.trim()==="MOZAPLAY-ADMIN"){localStorage.setItem("mozaplay:admin","1");setOk(true)}}}>Ativar administração</Button></Card></main>;
 return <main className="mx-auto w-full max-w-md space-y-4 px-4"><PageHeader title="Administração" subtitle="Modo local"/><Card><p className="font-bold">Painel local ativo</p><p className="mt-2 text-sm text-muted-foreground">Os dados desta versão ficam no dispositivo. Pagamentos reais ainda não estão ligados.</p></Card></main>;
}
