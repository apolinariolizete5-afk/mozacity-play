# MozaPlay — Joga. Desafia. Compete.

Plataforma mobile-first de jogos competitivos (Ludo, Damas e Xadrez) com estética de app
Android nativa, dark mode, salas com código curto, carteira de moedas de demonstração,
ranking e suporte PWA.

## Stack

- TanStack Start (React 19 + Vite 7, SSR)
- TypeScript
- Tailwind CSS v4 (tokens semânticos em `src/styles.css`)
- Estado local persistente (`localStorage`) — pronto para trocar por backend

## Instalação

```sh
npm i
npm run dev      # http://localhost:8080
npm run build    # build de produção
npm start        # servir o build
```

## Arquitetura de jogos

Todos os jogos implementam a mesma interface `GameEngine` (`src/lib/games/types.ts`):

```ts
createGame() · validateMove() · applyMove() · getState() · isGameOver() · getWinner()
```

| Jogo | Motor | Rota |
| --- | --- | --- |
| Ludo (2-4) | `src/lib/games/ludo.ts` | `/games/ludo` |
| Damas (2) | `src/lib/games/checkers.ts` | `/games/checkers` |
| Xadrez (2) | `src/lib/games/chess.ts` | `/games/chess` |

Para adicionar um jogo novo: criar `src/lib/games/<jogo>.ts` exportando um
`GameEngine`, registar em `GAME_META` e criar a rota `src/routes/games/<jogo>.tsx`.

Regras cobertas: Ludo com saída no 6, capturas, casas seguras e chegada ao centro;
Damas com capturas obrigatórias, capturas em cadeia e coroação; Xadrez com roque,
promoção, xeque, xeque-mate e empate por afogamento. Timer por turno configurável
(5s, 10s padrão, 15s, 30s) com jogada automática no timeout.

## Salas e matchmaking

Códigos curtos (`MP7K92`), salas públicas/privadas e estados
`WAITING → READY → STARTING → PLAYING → FINISHED | CANCELLED`.
Partida rápida procura jogadores e permite preencher vagas com bots.

## Pagamentos

`src/lib/payments.ts` define a camada desacoplada: `PaymentProvider`, `Deposit`,
`Withdrawal`, `Transaction`, `Wallet`, `WebhookEvent` e `PaymentService` com
processamento idempotente de webhooks. O provedor ativo é `demoProvider`
(moedas virtuais, sem valor real). Para integrar um provedor real:
`paymentService.register(meuProvider)` e receber webhooks em
`src/routes/api/public/*`.

## Variáveis de ambiente

A demo funciona sem configuração. Para integrações futuras:

```
# servidor (nunca com prefixo VITE_)
PAYMENT_PROVIDER=demo
PAYMENT_API_KEY=
PAYMENT_WEBHOOK_SECRET=

# cliente
VITE_APP_NAME=MozaPlay
```

## PWA

`public/manifest.webmanifest` + ícones em `public/icons` (192, 512 e maskable),
`apple-touch-icon` e `theme-color` em `src/routes/__root.tsx`. Instalável em
Android/iOS via "Adicionar ao ecrã principal".

## Deploy no Render

1. New → Web Service → conectar o repositório.
2. Build Command: `npm install && npm run build`
3. Start Command: `npm start`
4. Environment: Node 20+, adicionar as variáveis acima quando necessárias.
5. Health check path: `/`

Também pode ser publicado diretamente pelo botão **Publish** no Lovable.
