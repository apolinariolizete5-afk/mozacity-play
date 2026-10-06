# MozaPlay — Joga. Desafia. Compete.

Plataforma mobile-first de jogos competitivos (Ludo, Damas e Xadrez) com estética de app Android, salas com código curto, carteira em meticais, ranking e suporte PWA.

## Stack

- TanStack Start (React 19 + Vite 8 + SSR)
- TypeScript
- Tailwind CSS v4
- Supabase para autenticação e dados da carteira
- PAY.CO.MZ no servidor para iniciar depósitos quando a integração estiver configurada

## Instalação

```sh
npm i
npm run dev      # http://localhost:8080
npm run build    # build de produção
npm start        # servir o build
```

## Arquitetura de jogos

Todos os jogos implementam a mesma interface `GameEngine` (`src/lib/games/types.ts`).

| Jogo | Motor | Rota |
| --- | --- | --- |
| Ludo (2-4) | `src/lib/games/ludo.ts` | `/games/ludo` |
| Damas (2) | `src/lib/games/checkers.ts` | `/games/checkers` |
| Xadrez (2) | `src/lib/games/chess.ts` | `/games/chess` |

## Salas

Códigos curtos, salas públicas/privadas e estados `WAITING → READY → STARTING → PLAYING → FINISHED | CANCELLED`.

## Pagamentos

A carteira usa Supabase e server functions. Não existe provedor de pagamento demo nem crédito virtual inicial.

- O depósito cria uma transação pendente e só deve creditar saldo depois da confirmação do gateway.
- A integração PAY.CO.MZ é server-only e nunca expõe a chave ao browser.
- O levantamento entra em `processing` quando o administrador o envia ao gateway e só passa a `completed`/`failed` através da confirmação do provedor.
- Não existe fallback de depósito de teste no fluxo de produção.

## Supabase

A aplicação não usa `DATABASE_URL` nem `SUPABASE_SERVICE_ROLE_KEY`.

Variáveis públicas/SSR necessárias:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Para a primeira conta de administrador, a base precisa ter o segredo interno `admin_claim_code` com mais de 20 caracteres. O código é consumido uma única vez.

## Render

- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Node: `22.x` (o `package.json` exige Node 22+)
- Port: `10000` quando fornecida pelo Render
- Health check: `/`

Nunca coloque chaves reais no GitHub. Configure os segredos no Render/Lovable Cloud. A aplicação também usa `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` para web push.
