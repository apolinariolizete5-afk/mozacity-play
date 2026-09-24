# Próxima fase: jogos, apostas, notificações e instalação

## Objetivo
Substituir os comportamentos demonstrativos por partidas completas, ligar as apostas à carteira real e acrescentar retenção e instalação sem comprometer a segurança financeira.

## Implementação

### 1. Jogos completos
- **Ludo:** corrigir cores para Verde, Amarelo, Vermelho e Azul; redesenhar o tabuleiro com profundidade isométrica, percurso legível, estrelas seguras, corredores finais e centro; destacar jogador ativo, cronómetro fixo de 15 segundos, seta animada para o dado e peças válidas com brilho.
- Completar as regras do Ludo: saída apenas com 6, bónus por 6 e captura, terceiro 6 anulado, casas seguras imunes, captura de adversários e chegada apenas com valor exato.
- **Damas:** implementar captura em ambas as direções, captura obrigatória, lei da maioria considerando toda a sequência, capturas encadeadas e promoção; atualizar o tabuleiro para madeira contrastante, peças táteis e coroa dourada; aceitar toque e arrastar.
- **Xadrez:** preservar a filtragem de jogadas que deixam o rei em xeque, completar segurança do roque e en passant, mostrar diálogo de promoção, xeque destacado, peças capturadas, vantagem material e histórico em notação algébrica.
- Adicionar testes unitários focados nas regras críticas de cada motor.

### 2. Apostas ligadas à carteira
- Remover `placeBet` e prémios locais das rotas dos jogos.
- Ao entrar numa partida paga, chamar a operação protegida que debita MZN e cria o registo da partida; impedir o início e mostrar erro quando não houver sessão ou saldo.
- Ao terminar, liquidar uma única vez no servidor, aplicar o rake configurado e apresentar o prémio líquido devolvido pela carteira.
- Atualizar seleção de apostas, salas e textos para MT; partidas grátis continuam disponíveis.

### 3. Notificações e retenção
- Criar um ícone exclusivo MozaPlay e substituir os sinos atuais, mantendo badge de não lidas.
- Gravar e apresentar notificações reais de depósito, levantamento e resultado/vez de partida, mantendo estados vazios e leitura.
- Implementar subscrição web push com ícone e badge da marca e armazenamento protegido da subscrição.
- Criar um endpoint agendável e autenticado para lembretes: 3 dias sem atividade e 48 horas com saldo sem jogar, com proteção contra envios repetidos.
- Manter chaves privadas apenas no servidor; documentar as variáveis necessárias para Render.

### 4. Instalação inteligente
- Adicionar convite de instalação como painel inferior, nunca em modo standalone e no máximo uma vez a cada 5 dias.
- Usar `beforeinstallprompt` em navegadores compatíveis e instruções visuais específicas no Safari/iOS.
- Manter apenas o manifesto e ícones para instalação; não adicionar cache offline nem service worker de aplicação. O worker de mensagens push será separado.

## Validação
- Executar testes direcionados aos motores e às operações de partida.
- Verificar no navegador: Ludo, Damas e Xadrez; aposta com e sem saldo; badge/notificações; convite Android compatível, instruções iOS e ausência do convite em standalone.
- Rever em 390×844 e 1280×1800 para evitar sobreposição e garantir toque/arrastar.

## Limites operacionais
- O envio push real depende das credenciais VAPID configuradas no ambiente de produção.
- As partidas contra bots serão financeiramente liquidadas pelo servidor; salas multiplayer continuam a usar a estrutura atual até existir sincronização em tempo real entre dispositivos.
