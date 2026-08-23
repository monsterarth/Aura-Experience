# 0.8.1 — Segurança, WhatsApp e alertas

**Data:** 2026-08-17
**Highlight:** Segurança

## Novo (feature)

### 🔒 Segurança
- **Login da equipe passou para o servidor,** com limite de tentativas por IP e registro de cada tentativa falha. Antes a senha era conferida no navegador, sem trava contra força bruta.
- **Cada cargo enxerga só a própria pousada:** 35 rotas do admin (estoque, patrimônio, hóspedes, concierge, pesquisas, governança, cardápio, contatos, mapa, escalas e o painel da recepção) passaram a conferir a posse da propriedade. Antes, cargos operacionais conseguiam ler ou gravar dados de outra pousada só trocando o identificador na chamada.
- **Código de acesso do hóspede com limite de tentativas** por IP e gerado de forma criptograficamente segura.
- Negação de acesso a dado de outra pousada responde "não existe", sem confirmar que o registro existe em outro lugar.
- Erros internos do banco deixaram de vazar na resposta (nomes de coluna e tabela) em 15 rotas — o detalhe fica só no log do servidor.
- Next.js atualizado para fechar a CVE-2025-29927 (bypass do middleware); proteção extra contra injeção de prompt na IA das avaliações; segredos do WhatsApp nunca passam pelo navegador.

### 💬 WhatsApp — vigia com reinício automático
- **A sessão "zumbi" agora é detectada** pelos sinais honestos — envio real falhando e sonda expirando (a Evolution diz que está conectada mesmo com o socket morto) — e o sistema reage em escada: reinicia o serviço no servidor sozinho (no máximo a cada 30 min), avisa a equipe por push quando precisa de QR novo e avisa de novo quando volta.
- **Botão Reiniciar Evolution** em Configurações → Integrações, que funciona mesmo quando o painel da Evolution não abre.

### 🔔 Notificações
- **WhatsApp agregado no sino:** uma notificação só com "N novas mensagens" e a prévia das conversas, em vez de uma linha por mensagem (que afogava concierge e agendamentos). "Limpar" agora confere o resultado no servidor antes de sumir com as mensagens.
- **Concierge chama mais alto:** seção no topo do sino, toast persistente até atender, campainha própria e re-alerta a cada 2 minutos enquanto houver pedido pendente; o pedido também chega por push no desktop da recepção.

### 🌐 Site institucional
- **A apresentação do Aura mora em /aura:** números reais de produção, badge da última versão publicada e faixa do changelog ao vivo, catálogo dos módulos, dos apps de campo e das rotinas, com mocks fiéis das telas (admin, app da camareira e portal camaleão).

## Melhoria (improvement)

- **Logs de auditoria reformulados:** rajadas do mesmo autor e ação viram uma linha só ("Check-outs realizados: 04, 06, 15…") com "ver detalhes" para abrir cada registro; alternância Agrupado/Plano; rótulos em português para todas as ações; detalhes com nomes legíveis no lugar de IDs (hóspede, cabana, item, mesa, gatilho).
- **Login sem "preso na tela":** no sucesso a navegação vai direto para a tela do cargo, e quem já tem sessão sai do login automaticamente.
- **A fila de automações mostra também os disparos em massa,** com reenvio e correção de número; o alerta da recepção diz a origem real da mensagem (automação, disparo em massa ou manual).

## Correção (fix)

- **O lembrete de pré-check-in parou de sair de 09/08 a 16/08:** desde que as regras passaram a ser por pousada, o robô procurava a regra pelo nome antigo e não achava nenhuma. A rede de segurança do pré-checkout também nunca tinha disparado (comparava data com hora). Os dois voltaram.
- Site institucional e login abrem sem sessão; a rota de login não fica mais atrás da própria parede que ela abre.
