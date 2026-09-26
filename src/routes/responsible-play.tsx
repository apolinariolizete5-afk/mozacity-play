import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/responsible-play")({
  head: () => ({ meta: [{ title: "Jogo Responsável e Aviso Legal — MozaPlay" }] }),
  component: ResponsiblePlayPage,
});

function ResponsiblePlayPage() {
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28">
    <Link to="/" className="text-sm text-primary">← Início</Link>
    <h1 className="font-display text-3xl font-extrabold">Jogo Responsável e Aviso Legal</h1>
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4"><p className="font-extrabold">🔞 A MozaPlay é destinada exclusivamente a maiores de 18 anos nas funcionalidades sujeitas a requisito de idade.</p></div>
    <section className="space-y-3"><h2 className="text-xl font-bold">Jogue com responsabilidade</h2><p>Defina limites, não tente recuperar perdas aumentando o risco e pare quando o jogo deixar de ser uma atividade de entretenimento. Nunca utilize dinheiro destinado a necessidades essenciais.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Menores de idade</h2><p>Menores de 18 anos não devem utilizar funcionalidades de jogo sujeitas a restrição etária. A plataforma pode solicitar verificação de idade ou identidade antes de disponibilizar funcionalidades protegidas.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Sinais de risco</h2><p>Procure ajuda se o jogo estiver a causar problemas financeiros, familiares, profissionais ou emocionais, ou se sentir perda de controlo sobre o tempo ou dinheiro gasto.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Apoio</h2><p>Em caso de necessidade, procure serviços locais de saúde mental, apoio a dependências ou outras organizações de jogo responsável disponíveis na sua jurisdição. Em situação de emergência, contacte os serviços de emergência locais.</p></section>
    <p className="text-xs text-muted-foreground">Este aviso é informativo e não substitui aconselhamento jurídico. A disponibilização de funcionalidades restritas depende da legislação e das autorizações aplicáveis.</p>
  </main>;
}
