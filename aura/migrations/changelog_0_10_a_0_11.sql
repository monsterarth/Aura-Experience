-- Changelog: releases 0.10.0, 0.10.1 e 0.11.0.
--
-- O último publicado era o 0.9.0, de 22/08/2026 — sete dias e cerca de 60
-- commits atrás. Estas três entradas cobrem o buraco.
--
-- A numeração segue o esquema 0.MAIOR.MENOR.HOTFIX: MAIOR para módulo novo ou
-- reforma grande (0.11.0 = Guarita), MENOR para complemento (0.10.1).
--
-- Idempotente por versão: rodar duas vezes não duplica release nem item. A
-- release só entra se a versão não existir; os itens só entram se aquela
-- release ainda não tiver nenhum.
--
-- O texto foi escrito para quem OPERA a pousada, não para quem lê o código —
-- é o que aparece em /admin/changelog e na home pública.
--
-- Aplicar:  pnpm db:sql migrations/changelog_0_10_a_0_11.sql             (DEV)
--           pnpm db:sql migrations/changelog_0_10_a_0_11.sql --target prod


-- ── 0.10.0 · Estadias e Conta ──────────────────────────────────────
INSERT INTO changelogs (version, label, date, status, highlight)
SELECT '0.10.0', 'Estadias e Conta', DATE '2026-08-25', 'published', 'A conta é a estadia'
WHERE NOT EXISTS (SELECT 1 FROM changelogs WHERE version = '0.10.0');

INSERT INTO changelog_entries ("changelogId", type, text, "sortOrder")
SELECT c.id, v.type, v.text, v.ord
FROM changelogs c
CROSS JOIN (VALUES
  ('feature', 'A aba "Conta" saiu de cena: a conta virou parte da própria estadia. Abrir uma hospedagem mostra os quatro sinais que a recepção precisa — chave, objetos emprestados, esquecidos e a conta em si — no mesmo lugar em que se vê quem está na cabana.', 0),
  ('feature', 'A conta agora é a MESMA nas três telas (modal, ficha rápida e ficha completa). Antes cada uma tinha a sua, e a mais bonita era a que menos gente usava.', 1),
  ('feature', 'Lançar na conta deixou de ser só texto livre: a aba "Do catálogo" traz busca, filtro por grupo e carrinho sobre os itens do Concierge — frigobar, amenidades, empréstimos. É o mesmo caminho da camareira pelo app: cobra o preço, baixa o estoque pela ficha técnica e registra a entrega. O lançamento avulso continua na outra aba.', 2),
  ('feature', 'Empréstimos deixaram de ser uma anotação digitada no check-out e passaram a ser o que já eram no sistema: itens entregues e não devolvidos. O que a governança ou o mensageiro entregam aparece na conta sozinho, com "Devolvido" e "Extraviado" (que cobra o valor de perda) na própria linha. O passo 2 do check-out virou conferência: lista o que está com o hóspede para devolver na hora.', 3),
  ('feature', 'A ficha rápida renasceu. Mostra de relance quem está na cabana — titular, acompanhantes **pelo nome** (a lista tinha sumido da tela) e pets como parte do grupo, mais a placa do veículo —, as pendências em aberto (chave, empréstimos, esquecidos, pedidos de governança e concierge) e a origem da reserva em pill: Balcão, Site, Booking, com o código do canal e aviso quando as automações estão desligadas para OTA.', 4),
  ('feature', 'Cabana, datas, hóspedes e horário previsto subiram para o cabeçalho do modal; check-in/out, editar e ficha completa viraram ícones no canto. O que se faz mil vezes por dia precisa de alvo, não de rótulo. A chegada prevista some depois que o hóspede chega.', 5),
  ('feature', 'Estadias encerradas ganharam a grade "Últimas saídas": um card por cabana, sempre visível, até outro check-out sobrepor. Cabana sem saída aparece apagada em vez de deixar buraco; cabana fora de operação fica fora. No card: quem saiu, há quantos dias, a nota da avaliação e a carteira que abre a conta.', 6),
  ('feature', 'O histórico de encerradas agora é paginado. O corte em 100 linhas era mudo — o resto simplesmente não existia.', 7),
  ('feature', 'Cada pessoa escolhe como vê a lista de estadias (cartão, compacto ou lista) e a escolha fica salva no usuário, não no navegador: o PC da recepção é compartilhado. Filtros e ordenação de verdade, e as reservas futuras separadas por chegada em até 72 horas.', 8),
  ('feature', 'Proposta pública: depois de aceitar, o próprio cliente preenche os dados da reserva — titular, endereço, acompanhantes, placa, pet e forma de pagamento. Chega pronto, sem a recepção redigitar do WhatsApp.', 9),
  ('feature', 'A ficha do hóspede agora sabe quando foi criada. As datas reais foram recuperadas do histórico de auditoria onde existiam.', 10),
  ('improvement', 'Orçamento: as acomodações são compostas na própria calculadora, a ordem muda por arrasto no drawer e a acomodação de cabana única já leva o nome dela.', 11),
  ('improvement', 'Ambiente de teste ficou impossível de confundir com produção: aviso na barra lateral, no rodapé e na barra do celular. Junto veio um banco de testes que espelha a produção e um modo seguro em que nenhuma mensagem sai de verdade.', 12),
  ('improvement', 'Preparação para receber reservas dos canais (Booking, site) direto no sistema, sem digitação. Ainda desligado — entra em modo de observação primeiro.', 13),
  ('fix', 'O alerta "Doc pendente" ficava preso para sempre em algumas fichas. A raiz era o cadastro provisório que nunca virava o documento do hóspede; agora vira sozinho.', 14),
  ('fix', 'Automações mandavam mensagem duplicada para o hóspede e a lista de conversas congelava.', 15),
  ('fix', 'Tarifário: o botão "Sobrepor" do conflito de regras voltou a funcionar — e parou de destruir o calendário quando falhava no meio.', 16),
  ('fix', 'Comercial: casamento voltou a marcar a cotação, cabana única já vem escolhida e a aba Negociação ganhou o botão Salvar que faltava.', 17)
) AS v(type, text, ord)
WHERE c.version = '0.10.0'
  AND NOT EXISTS (SELECT 1 FROM changelog_entries e WHERE e."changelogId" = c.id);


-- ── 0.10.1 · A nota entra pelo XML ──────────────────────────────────────
INSERT INTO changelogs (version, label, date, status, highlight)
SELECT '0.10.1', 'A nota entra pelo XML', DATE '2026-08-26', 'published', 'Compra pelo XML'
WHERE NOT EXISTS (SELECT 1 FROM changelogs WHERE version = '0.10.1');

INSERT INTO changelog_entries ("changelogId", type, text, "sortOrder")
SELECT c.id, v.type, v.text, v.ord
FROM changelogs c
CROSS JOIN (VALUES
  ('feature', 'Lançar compra digitando item a item acabou. Entra o XML da nota (solto ou o .zip do contador) e ele já traz fornecedor, itens, quantidades, custos, frete e desconto prontos.', 0),
  ('feature', 'O sistema aprende o de-para do fornecedor: "REFRIG COCA COLA 2L CX/6" vira "Coca-Cola 2L" daqui, e da próxima vez ele lembra — inclusive do fator de embalagem (1 caixa = 12 unidades), que a nota costuma entregar de graça.', 1),
  ('feature', 'A linha que não é estoque vira ativo em Patrimônio na mesma leva, já ligada à compra.', 2),
  ('feature', 'A mesma nota não entra duas vezes: a chave de acesso é única por propriedade. E a compra nasce em rascunho — quem mexe em saldo, custo médio e validade continua sendo o botão Receber.', 3),
  ('feature', 'Foto tirada no celular agora é comprimida no próprio navegador antes de subir. Foto de 8 MB vira algo na casa de centenas de KB, sem diferença visível na tela.', 4),
  ('improvement', 'Os aplicativos de campo pediam **cinco meses** de faxinas a cada atualização de tela — 779 KB por chamada, em cada aparelho, o dia inteiro. Agora pedem só a janela que a tela realmente usa. A app da camareira ficou visivelmente mais rápida no 4G da fazenda.', 5),
  ('fix', '**Segurança:** a chave pública do site — a que viaja no JavaScript de qualquer visitante — conseguia ler **e escrever** 36 mil mensagens, com telefone e conteúdo, além dos registros de comunicação. Dava para enfileirar mensagem que o sistema mandaria pelo WhatsApp da pousada, e para apagar o histórico. Fechado.', 6),
  ('fix', '**Segurança:** o isolamento entre propriedades não existia de fato no navegador. Simulando o acesso de outra pousada, era possível enxergar 394 hóspedes, 448 estadias, 192 contas e 1.807 tarefas da Fazenda do Rosa. Agora cada propriedade só enxerga a si mesma.', 7),
  ('fix', 'Camareira: um toque acidental podia pular a faxina sem confirmação, e desfazer era igualmente fácil de disparar sem querer. Ação destrutiva agora pede segurar para confirmar, tem trava contra clique fantasma e desfazer dentro do próprio app.', 8),
  ('fix', 'Evento de vários dias sumia do portal do hóspede no meio do próprio evento.', 9),
  ('fix', 'Eventos: a escrita saiu do navegador e passou por rota própria com validação de verdade.', 10)
) AS v(type, text, ord)
WHERE c.version = '0.10.1'
  AND NOT EXISTS (SELECT 1 FROM changelog_entries e WHERE e."changelogId" = c.id);


-- ── 0.11.0 · Guarita e o painel da plataforma ──────────────────────────────────────
INSERT INTO changelogs (version, label, date, status, highlight)
SELECT '0.11.0', 'Guarita e o painel da plataforma', DATE '2026-08-29', 'published', 'Módulo Guarita'
WHERE NOT EXISTS (SELECT 1 FROM changelogs WHERE version = '0.11.0');

INSERT INTO changelog_entries ("changelogId", type, text, "sortOrder")
SELECT c.id, v.type, v.text, v.ord
FROM changelogs c
CROSS JOIN (VALUES
  ('feature', '**Módulo Guarita.** O estacionamento sai da planilha de papel e da reserva-fantasma no HMAX. A placa deixa de ser anotação do dia e vira cadastro: quando o guarita digita, o sistema responde de quem é o carro — hóspede (a placa vem do pré-check-in), fornecedor, equipe ou cliente conhecido. A digitação vira conferência.', 0),
  ('feature', 'App do porteiro com quatro abas: painel, registrar, pátio e turno. O painel mostra o que hoje se descobre por rádio — chegadas do dia com hora prevista e placa, saídas, evento do dia e quem está no pátio.', 1),
  ('feature', 'A tarifa é **do dia**, não do tempo: R$ 150 num sábado bonito de alta, R$ 30 na baixa, e dia em que o estacionamento nem abre. Definida pela recepção ou pela gestão, com valores prontos para um toque.', 2),
  ('feature', 'Todo veículo entra cobrável e quem dispensa é o guarita, com o botão Isento — hóspede, fornecedor e equipe normalmente não pagam, mas quem decide é quem está lá vendo quem chegou. Hóspede e visita ficam atrelados à cabana.', 3),
  ('feature', 'Fechamento de turno que sai somado: total recebido, quantidade de veículos, divisão por forma de pagamento, isentos por tipo e o que ficou em espécie na gaveta. É o resumo que hoje vai à recepção em papel — só que conferido.', 4),
  ('feature', 'A NSU do cartão é única no dia. Repetir o mesmo número em dois carros passa a ser barrado, dizendo qual carro já usou aquela NSU. E o turno não fecha com NSU pendente.', 5),
  ('feature', 'Placa marcada (quem saiu sem pagar) alerta na entrada, com o motivo e a data.', 6),
  ('feature', 'Cadastro de equipe ganhou o campo de placa: o carro do colaborador se identifica sozinho na portaria em vez de virar "visita".', 7),
  ('feature', '**Painel da plataforma** (super admin) virou um cockpit de verdade. Antes mostrava quatro contagens e dizia "3 propriedades ativas" quando duas são teste. Agora mostra o trabalho executado nos últimos 30 dias, o plantão (fila travada, falhas de envio, logins recusados, semáforo das rotinas automáticas), a infraestrutura com o ranking de quem consome o banco, e a adoção módulo a módulo — propriedade sem estadia e sem ação entra como "Dormente" em vez de fingir saúde.', 8),
  ('feature', 'Módulos podem ser desligados por propriedade de verdade: desligar esconde o menu para todos e fecha o acesso por trás, não só some o item da lista.', 9),
  ('improvement', 'Movimentações do estoque abriam com seis requisições e mostravam dado incompleto enquanto carregava.', 10),
  ('improvement', 'O sino: abrir a Comunicação passou a contar como ler as mensagens. Sem isso, nenhum gesto natural marcava nada — 3.503 notificações se acumularam em nove dias.', 11),
  ('fix', 'Os três índices de mensagens criados para aliviar o banco **nunca puderam ser usados**: um detalhe do PostgREST os tornava inalcançáveis, e cada consulta seguia varrendo as 36 mil linhas. Corrigidos e verificados no plano de execução.', 12),
  ('fix', 'App de campo: falha de carregamento se disfarçava de "não há trabalho hoje". Agora a tela diz que não conseguiu carregar.', 13),
  ('fix', '"Limpar mensagens" não marcava nada quando quem clicava era o super admin.', 14),
  ('fix', '**Segurança:** marcar mensagem como lida aceitava qualquer funcionário logado, de qualquer propriedade.', 15),
  ('fix', 'Menu suspenso dentro de janela engolia a primeira escolha e obrigava a escolher duas vezes.', 16),
  ('fix', 'Orçamento: editar o pedido parava na tela e voltava atrás sozinho — uma tela desatualizada regravava por cima do que tinha acabado de ser salvo.', 17),
  ('fix', 'Trocar a integração de canais de observação para ativo agora pede confirmação explícita.', 18)
) AS v(type, text, ord)
WHERE c.version = '0.11.0'
  AND NOT EXISTS (SELECT 1 FROM changelog_entries e WHERE e."changelogId" = c.id);
