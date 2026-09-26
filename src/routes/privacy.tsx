import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacidade — MozaPlay" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28">
    <Link to="/" className="text-sm text-primary">← Início</Link>
    <h1 className="font-display text-3xl font-extrabold">Política de Privacidade e Proteção de Dados</h1>
    <p className="text-sm text-muted-foreground">Última atualização: 26 de setembro de 2026</p>
    <section className="space-y-3"><h2 className="text-xl font-bold">Dados tratados</h2><p>Podemos tratar dados de conta, autenticação, preferências, atividade de jogo e informações necessárias para segurança, suporte e funcionamento da plataforma.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Finalidades</h2><p>Os dados são utilizados para autenticar utilizadores, operar partidas, prevenir abuso, manter registos técnicos e responder a pedidos de suporte.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Segurança</h2><p>Dados sensíveis de sessão e operações protegidas devem ser processados no servidor, com controlo de acesso, validação e registos de auditoria. Não guarde segredos de servidor no navegador.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Retenção e direitos</h2><p>Os dados devem ser conservados apenas pelo período necessário às finalidades aplicáveis e às obrigações legais. Para pedidos de acesso, correção ou eliminação, utilize o canal oficial de suporte da MozaPlay.</p></section>
  </main>;
}
