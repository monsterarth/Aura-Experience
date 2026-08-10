# 0.8.0 — Setor Comercial (CRM)

**Data:** 2026-08-10
**Highlight:** Setor Comercial

## Novo (feature)

### 🤝 Pipeline de Reservas
- **Nova cotação num só fluxo:** dados do cliente (nome, telefone/e-mail, origem) → composição do pedido (uma ou várias acomodações na MESMA negociação — por exemplo, 2 cabanas de casal, ou 1 casal + 1 família) → cruzamento automático com a base por telefone/nome/CPF, para não abrir um lead duplicado → calculadora do tarifário embutida, já com disponibilidade real e avisos de evento do período.
- **Editar cotação** recalcula o mesmo lead; **Nova cotação para o cliente** clona os dados e abre uma negociação separada, sem tocar na anterior.
- **Preço por cabana:** o vendedor pode oferecer um valor diferente do tarifário para cada cabana dentro de uma acomodação. Quando o valor é mais baixo, o cliente vê o preço de tabela riscado e o oferecido em destaque — no drawer e na proposta pública.
- **Kanban arrastável** com fila "Hoje" (follow-ups e cobranças vencidas num só lugar, com WhatsApp e ação por linha) e alternância para visão em lista; leads perdidos ficam ocultos por padrão.
- **Drawer do lead com mais espaço:** editar os dados do cliente e o orçamento lado a lado com o histórico e os alarmes, escolher a cabana de cada acomodação com confirmação (e desfazer), vincular a uma estadia já existente e excluir o orçamento.
- **Promover a hóspede virou uma decisão, não um clique:** vincular a uma ficha existente (com sugestão automática por telefone e busca por nome/CPF) ou criar uma ficha nova — CPF que já tem cadastro vincula em vez de duplicar. Marcar como **Ganho** agora exige essa promoção.
- **Histórico do cliente no drawer:** depois de promovido, aparecem as hospedagens anteriores e os outros orçamentos do mesmo hóspede, sem sair da tela.
- **Proposta pública** (`/cotacao/<id>`): o próprio cliente escolhe a cabana de cada acomodação e aceita a reserva pela internet. O aceite move o lead para "negociando", entra na timeline e cria um alarme para a recepção confirmar. Mostra "O que está incluso" e as regras da pousada, com aceite obrigatório antes de confirmar.
- **Datas por acomodação:** cada cabana pedida pode ter um período próprio (chegada escalonada), recalculando ao vivo — o cabeçalho mostra o período único quando todos chegam juntos, e passa a mostrar em cada acomodação quando as datas divergem.
- **Lista de espera por período**, com posição na fila; "Converter" abre a cotação já preenchida com os dados da entrada, e ela só vira "convertida" quando o orçamento é de fato salvo para aquele mesmo cliente.
- **Alarmes** de follow-up, cobrança e lembrete — valem para lead ativo e para negociação já fechada — com badge no menu.
- **Aba Orçamentos na ficha do hóspede**, cruzando por vínculo e por telefone (alcança até leads de antes da ficha existir).
- Mensagem padrão do orçamento passa a levar o link da proposta (`{QUOTE_LINK}`), e a validade só aparece no texto quando falta mais de um dia para o check-in.

### 💍 Casamentos
- **Parcelas reais do contrato**, com vencimento: cobrança vencida entra sozinha na fila de alarmes e soma no badge; contrato novo já nasce com o parcelamento padrão.
- **Contato do casal** (WhatsApp e e-mail) e **origem do lead** — o cadastro de casamento não tinha nenhum contato registrado até agora.
- **Negociação perdida** vira um status próprio, sem se confundir com cancelado.
- **Validade do lead:** próximo follow-up e prazo de expiração da negociação.

### 💰 Tarifário — reformulado
- **Página trocada de ponta a ponta:** Calendário (o preço "a partir de" mês a mês, já com a flutuação do período aplicada), Tabelas, Flutuações e Arquivo. A calculadora e o funil antigos saíram — viraram o Pipeline de Reservas.
- **Flutuação automática por período:** atribui um percentual pré-cadastrado a um intervalo de datas, e a cotação nova já nasce calculando noite a noite (ex.: 3 noites com +5%, 1 sem regra e 1 com +20% resultam numa média de +7%, mostrada ao vendedor).
- **Arquivo de tarifários:** toda alteração de preço guarda a versão anterior sozinha, tabelas antigas podem ser arquivadas (ou restauradas), e dá para importar direto do Excel um tarifário de anos passados só para consulta.
- **Colar do Excel ganhou pré-visualização:** a grade calculada aparece antes de confirmar a importação, com aviso das categorias não reconhecidas.
- Recepção passa a poder consultar tabelas e calendário e editar as **flutuações** (com auditoria); criar/editar tabela ou regra de calendário fica com a gestão.

### 📣 Marketing
- De "módulo em definição" para página de verdade: indicadores do pipeline (em negociação, conversão, ticket médio), origem dos leads por canal, resumo das pesquisas de satisfação (NPS, nota geral, o que mais pedem para melhorar) e a gestão de **descontos manuais** e **promoções automáticas**, que saíram do Tarifário.

## Melhoria (improvement)

- **Identidade visual:** todo o setor Comercial (funis, drawer, fila, alarmes, lista de espera) foi reescrito na identidade visual do admin — a mesma de Concierge e Casamentos.
- **Configurações → Comercial:** taxa de pet, templates de WhatsApp do orçamento e os percentuais de flutuação (usados como opção na cotação) saíram do Tarifário e passaram para o hub de Configurações, que muda com menos frequência.
- Sidebar recolhido automaticamente ao entrar nas telas de pipeline (kanban largo), voltando ao normal ao sair.
- "O que está incluso" ganhou um texto próprio e editável, mostrado na proposta pública acima das regras da pousada.

## Correção (fix)

- O orçamento com várias acomodações mostrava o período errado quando as datas divergiam entre cabanas — corrigido.
- A página da proposta pública quebrava quando a propriedade já tinha as políticas preenchidas (o texto vinha em vários idiomas e o código tratava como texto simples).
- Recepção não conseguia trocar a modalidade do café da manhã (buffet ou entrega) — a permissão nunca tinha sido liberada para o cargo.
- Ficha de hóspede aparecia vazia para o cargo gerente, e o link "abrir ficha" de um lead vinculado não filtrava o hóspede certo.
- Autopreenchimento do navegador entrava por engano no campo de busca do wizard, e fechar a tela sem salvar descartava o que foi digitado sem avisar.
- 7 pequenas correções no formulário de casamento: campo perdia o foco a cada tecla, status "perdido" sumia da edição, percentual de pagamento quebrava em contrato vazio, botão sem função, entre outras.
