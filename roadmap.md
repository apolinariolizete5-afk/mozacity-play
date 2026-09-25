# MozaPlay — roadmap de produção

## Fase 1 — Economia protegida (servidor)
- [ ] Colunas de rollover/wagered nas carteiras; settings de rake e taxas dinâmicas
- [ ] RPCs autoritativas: iniciar aposta, liquidar partida com rake de 8%
- [ ] Levantamento: mínimo 50 MT, saldo levantável (rollover 1x), taxa 5 MT + 2%
- [ ] Server functions TanStack (sem service role no frontend)

## Fase 2 — Carteira e autenticação
- [ ] Ecrã de entrada/registo (e-mail + Google)
- [ ] Painel de carteira: Saldo Disponível, Saldo Levantável, Depositar/Levantar, histórico

## Fase 3 — Painel de administrador
- [ ] Criação única via chave MOZAPLAY-ADMIN-6F34B071F75C
- [ ] Rake 5–15%, taxas de levantamento, rollover on/off
- [ ] Fila de moderação de levantamentos + métricas

## Fase 4 — Jogos verdadeiros
- [x] Ludo: tabuleiro clássico LudoVerse, dados e sons próprios, 6 para sair, jogada extra, 3x6 anula, captura + bónus, casas seguras, corredor final exacto, cronómetro 15s, seta animada, peças válidas com brilho
- [ ] Damas: captura obrigatória + lei da maioria, cadeias, tabuleiro madeira, drag-and-drop
- [ ] Xadrez: en passant, roque, diálogo de promoção, painel de capturas/vantagem/notação

## Fase 5 — Notificações e retenção
- [ ] Ícone próprio de notificações com badge
- [ ] Web push com marca (partidas, vez de jogar, depósitos, levantamentos)
- [ ] Lembretes de inactividade (3 dias) e saldo parado (48h)

## Fase 6 — PWA e deploy
- [ ] Pop-up de instalação (standalone detectado, 1x cada 5 dias, instruções iOS)
- [ ] Segredos via variáveis de ambiente; pronto para Render
