import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Termos e Condições — MozaPlay" }] }),
  component: TermsPage,
});

function TermsPage() {
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28">
    <Link to="/" className="text-sm text-primary">← Início</Link>
    <h1 className="font-display text-3xl font-extrabold">Termos e Condições de Uso</h1>
    <p className="text-sm text-muted-foreground">Última atualização: 26 de setembro de 2026</p>
    <section className="space-y-3"><h2 className="text-xl font-bold">1. Aceitação</h2><p>Ao utilizar a MozaPlay, o utilizador declara que leu e aceita estes termos. A utilização pode estar sujeita a requisitos adicionais de identidade, idade e jurisdição.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">2. Conta e segurança</h2><p>O utilizador deve fornecer dados verdadeiros, manter as credenciais seguras e comunicar imediatamente qualquer acesso não autorizado. Uma conta não deve ser partilhada.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">3. Jogos e disponibilidade</h2><p>Os jogos, salas e funcionalidades podem ser interrompidos para manutenção, segurança ou cumprimento de requisitos legais. Resultados devem ser determinados pelo estado validado no servidor quando a funcionalidade estiver disponível.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">4. Cancelamentos e suporte</h2><p>Pedidos de cancelamento, disputas ou correções devem ser apresentados pelos canais oficiais de suporte. Não serão prometidos reembolsos automáticos fora das regras aplicáveis e dos registos verificáveis da plataforma.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">5. Uso proibido</h2><p>É proibido explorar falhas, utilizar automação não autorizada, manipular partidas, tentar obter acesso indevido ou praticar fraude.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">6. Conformidade</h2><p>Funcionalidades sujeitas a licença, verificação de identidade, idade ou outras obrigações legais só devem ser disponibilizadas depois de as respetivas condições terem sido cumpridas.</p></section>
  </main>;
}
