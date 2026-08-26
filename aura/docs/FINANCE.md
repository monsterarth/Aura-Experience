# Módulo Financeiro do AURA — plano

> Status: **plano aprovado, não iniciado**. Escrito em 25/08/2026.
>
> Decisões com o usuário: escopo **completo** (caixa, recebimentos, a receber, a
> pagar, DRE, relatórios) · formas em uso: **Pix, dinheiro, cartão
> crédito/débito, transferência, boleto** · fechamento de caixa **diário** · dos
> relatórios do HMAX importam **Faturamento/Movimento** e **Previsão de receita**
> · **sinal cria a reserva na hora** · cargo **`finance`** novo · virada **em
> paralelo ao HMAX** antes do corte definitivo · adquirente: **Cielo**.
>
> Companheiro: `docs/FISCAL.md` (emissão de notas). Receber dinheiro e emitir
> nota são eventos diferentes e continuam separados.

## O ponto de partida honesto

**Hoje o AURA não é fonte da verdade financeira.** Os créditos que existem no
fólio são simbólicos/organizacionais — o dinheiro de verdade é controlado no
HMAX. Isso não é um defeito a corrigir com backfill: é uma data de corte a
definir. O plano assume que o histórico financeiro **fica no HMAX** e o AURA
começa a valer a partir de um dia combinado.

## A rotina que existe (e que o módulo precisa respeitar)

A pousada **já tem** um processo estruturado. O AURA não vai inventar um novo —
vai reproduzir este, tirando a digitação:

1. **Toda entrada de pagamento vira uma antecipação dentro da reserva.** Seja no
   balcão pela maquininha, seja por link de pagamento. O dinheiro sempre nasce
   amarrado a uma reserva.
2. **Pix é diferente:** o valor cai na conta primeiro, sem dono. O financeiro
   confere no extrato e só então **vincula o depósito à respectiva reserva**.
3. **Fechamento de caixa é diário**, consolidado.
4. **Sinal confirma a reserva** — quando o cliente paga para fechar, a reserva é
   criada na hora e a antecipação nasce dentro dela. Não existe dinheiro de
   hóspede sem reserva.

Disso saem dois conceitos que o AURA não tem hoje:

- **Antecipação** — pagamento vinculado à reserva antes de qualquer consumo, e
  quase sempre antes do check-in.
- **Recebimento não identificado** — dinheiro que entrou na conta e ainda não tem
  reserva. Precisa de lugar próprio: uma caixa de entrada do financeiro, onde o
  valor espera até ser vinculado. Hoje esse estado simplesmente não existe no
  sistema; ele vive na cabeça de quem confere o extrato.

## O gap fundador

```ts
// finance-service.ts — addPayment()
description: "Pix hospedagem"   // ← a forma de pagamento é TEXTO LIVRE
```

Não existe campo de **forma de pagamento**: "Pix", "cartão 3x" e "dinheiro" são
palavras na descrição. Enquanto for assim é impossível fechar caixa, calcular
receita líquida (cartão tem taxa) ou conciliar com o banco. A fase 0 existe para
consertar isto — é a peça de que todo o resto depende.

## Os dois eixos de tempo

| Eixo | Pergunta | Onde vive |
|---|---|---|
| **Competência** | A que noite/período esta receita pertence? | `folio_items.refDate` (já existe nas diárias) |
| **Caixa** | Em que dia o dinheiro entrou? | `payments.receivedAt` (a criar) |

Uma antecipação paga em novembro para uma estadia de dezembro é caixa de
novembro e receita de dezembro. Um cartão parcelado é caixa de um dia e crédito
em três. Sem os dois eixos, ou o gerente vê receita que não entrou, ou vê caixa
que não explica o mês. É o que separa um extrato de um financeiro.

## Arquitetura

```
reserva (stays)
   │
   ├── folio_items          o que o hóspede DEVE            (existe)
   │
   └── payments             como o dinheiro ENTROU          método · bruto · taxa · líquido
          │                                                  previsão de crédito · adquirente
          ├── cash_sessions        o dia de caixa: abertura, conferência, fechamento
          ├── unidentified_receipts   caixa de entrada do Pix sem dono → vincular
          └── (fase 5) receivables/payables → finance_accounts → DRE
```

### Tabelas novas

**`payment_methods`** — config por propriedade: tipo (`pix` · `cash` · `credit` ·
`debit` · `transfer`), taxa (% e fixa), prazo de crédito (D+1, D+30), conta de
destino, se entra no caixa físico. Taxa e prazo são **cadastro, não código** —
mudou a negociação com a Cielo, muda o cadastro.

**`payments`** — um por recebimento: reserva, `folioItemId` correspondente,
método, valor **bruto**, taxa, **líquido**, `receivedAt` (caixa),
`expectedCreditAt` (banco), parcelas, NSU/autorização, `cashSessionId` e origem
(`balcao` · `link` · `pix` · `manual`).

**`unidentified_receipts`** — o Pix (ou transferência) que caiu sem dono: valor,
data, identificação do pagador quando houver, status (`open` · `linked` ·
`ignored`), e o `paymentId` gerado ao vincular. É a fila de trabalho do
financeiro.

**`cash_sessions`** — o dia: quem abriu, saldo inicial, entradas por método,
sangrias, saldo contado, **diferença** (contado − esperado), observações, quem
fechou. Fechado = congelado.

**`finance_accounts`**, **`receivables`**, **`payables`** — plano de contas com
centro de custo e títulos em aberto (fases 5–6).

## Cielo: a rotina pode ficar automática

A Cielo tem as duas APIs de que precisamos, e isso muda o teto do módulo:

- **API Link de Pagamento** — o AURA gera o link a partir da reserva e recebe
  *webhook* de notificação quando a transação é processada. A antecipação se
  cria sozinha, já vinculada, sem ninguém digitar.
- **API Pix** — webhook dedicado que notifica os Pix recebidos. **Só notifica Pix
  associado a um `txid`**: se o AURA gerar a cobrança (QR dinâmico com txid), o
  pagamento chega identificado e **acaba a conferência manual no extrato**.

Duas ressalvas honestas: o Pix "solto" (cliente copia a chave e paga por fora)
continua caindo sem `txid` e permanece manual — por isso a caixa de entrada de
não identificados não é descartável, é o caminho de exceção permanente. E a API
Pix de produção exige **mTLS** (certificado do estabelecimento), o que traz de
volta a discussão de onde guardar certificado — a decidir junto com o fiscal.

## Cargo `finance`

Cargo novo em `UserRole` (hoje não existe — o financeiro usaria admin/gerente e
enxergaria governança, manutenção e escalas sem necessidade). Vê caixa,
conciliação, a receber/a pagar e relatórios; não vê operação. Toca
`src/types/aura.ts`, `RoleGuard`, `supabase-middleware`, `api-auth`, `Sidebar` e
`role-routes` — o padrão de sempre para cargo novo.

## A Receber & A Pagar — a tela que não pode faltar

É a tela central do financeiro (no HMAX: *Financeiro → Receber & Pagar*), e o
plano a trata como entrega própria, não como apêndice do DRE.

### Anatomia (do que existe hoje e funciona)

**Uma lista só**, com receber e pagar juntos, navegável por mês/ano e com recorte
"a vencer". Colunas: vencimento · pagamento · emissão · **competência** · pessoa
(física/jurídica) · documento (NF, ORC, NFS…) · nota fiscal · forma de pagamento
· `$ Receber` · `$ Pagar` · status. No rodapé, o que o financeiro olha primeiro:
**total a receber, total a pagar e o saldo** do período.

Selecionando um título, o rodapé mostra o **histórico** e o rastro — quem lançou
e quando (`22/07/2026 09:09 h · CIBELE`). Esse rastro é requisito, não enfeite.

**Ações:** lançar · quitar · editar · cancelar · visualizar · pesquisar · seleção
múltipla · relatórios. E duas que dependem de fases posteriores: *Conc. Cartão*
(conciliação com a adquirente) e *Boleto*.

### O lançamento

Tipo (**Pagar** ou **Receber**), forma de pagamento, e **quatro datas** que não
podem ser confundidas:

| Data | O que responde |
|---|---|
| Emissão | quando o documento foi emitido |
| **Competência** | a que mês o custo/receita pertence |
| Vencimento | quando deve ser pago |
| Pagamento | quando foi pago de fato (vazio = em aberto) |

Mais: pessoa (busca), **histórico** (obrigatório — é o que se lê na lista),
documento, valor, observação, **plano de contas** e **parcelas** (quantidade +
frequência, gerando a grade de vencimentos e valores).

> **Origem/Destino é o plano de contas** — um campo só, não dois: digita-se (ou
> busca-se com F3) o **código hierárquico** e o sistema resolve o nome ao lado:
>
> ```
> 3.04.003.0003  →  MANUTENCAO PREDIAL/INSTAL
> ```
>
> Quatro níveis (`natureza.grupo.subgrupo.analítica`), no padrão contábil
> clássico. O AURA precisa do mesmo formato — e o plano de contas tem que ser o
> que a contabilidade já usa, importado, não inventado.

### O que o print de edição ensina sobre as regras

- **Tipo não se edita.** Depois de criado, um título "Pagar" nunca vira
  "Receber" — o campo aparece travado. Se errou, cancela e lança de novo.
- **Data de pagamento também não se digita.** Ela é preenchida pela ação
  **Quitar**, nunca à mão. Baixa é evento, não campo — e é isso que garante que
  todo pagamento tenha um lançamento de caixa por trás.
- **Valor bruto × líquido.** A tela mostra os dois (`Valor 47,17 · Valor líquido:
  47,17`) — desconto, juros e multa entram na baixa e o líquido é o que de fato
  saiu.
- **NSU** fica ao lado do documento: é o número da transação do cartão, chave da
  conciliação com a adquirente.
- **Botão "Alterações"** — o histórico de edições do título é visível na própria
  tela, não escondido num log. No AURA sai de graça (`audit_logs`), mas precisa
  estar à mão no drawer.
- **Documentos** — anexos do título (boleto em PDF, comprovante).
- **Boleto é forma de pagamento**, ao lado de Pix, dinheiro, cartão e
  transferência — e é a mais comum nos títulos a pagar. Diferente das outras,
  **não passa pelo caixa da recepção**: sai direto do banco. Por isso
  `payment_methods` tem o flag "entra no caixa físico".

### Modelo

**`finance_accounts`** — plano de contas hierárquico: `code` (`3.04.003.0003`),
`name` (`MANUTENCAO PREDIAL/INSTAL`), natureza (receita/despesa), nível, conta
pai e se aceita lançamento (só a folha analítica aceita; grupo é para somar).
**Importar o plano que a contabilidade já usa** — se o AURA inventar o próprio,
nasce a segunda contabilidade que o `docs/FISCAL.md` também alerta.

**`finance_titles`** — o título, receber ou pagar:

- `type` (`receive` | `pay`), `status` (`open` | `partial` | `paid` | `cancelled`)
- pessoa: tipo (fornecedor · hóspede · outro), id e **nome em snapshot**
- `history` (obrigatório), `documentNumber`, `invoiceNumber`, `nsu`,
  `paymentMethodId`, `notes`, anexos
- as quatro datas, `amount` (bruto), `discount`/`interest`/`fine` e `netAmount`
- `accountCode` (plano de contas, formato `3.04.003.0003`)
- parcelamento: `installment` (3/12), `parentTitleId`, `frequency`
- procedência: `sourceType` (`manual` · `purchase` · `stay` · `card`) + `sourceId`
- rastro: quem criou, quem quitou, quando

**Quitar** não é mudar um campo: gera um `payment` (o mesmo do resto do módulo),
move caixa/conta e carimba a data de pagamento. Baixa parcial é suportada —
daí `paidAmount` e o status `partial`.

### De onde os títulos nascem

| Origem | Como |
|---|---|
| **Compra do estoque** | A NF-e importada por XML já traz fornecedor, valor e número. Vira título a pagar **sugerido**, que o financeiro **confirma** antes de virar dívida oficial (decisão do usuário) |
| **Cartão corporativo** | Compra parcelada da pousada (ex.: `SICREDI CARTOES`, `NF 5649 10/12`) gera as parcelas a pagar |
| **Faturamento** | Empresa/evento que paga depois vira título a receber |
| **Manual** | O lançamento avulso da tela |

> **Repasse da adquirente** (as vendas em cartão que a Cielo credita em D+30):
> ainda **em aberto** — o usuário não opera essa parte hoje. Fica para a fase de
> conciliação de cartão, quando o funcionamento estiver claro.

## Fases

| Fase | Escopo | Por que nesta ordem |
|---|---|---|
| **0 — Forma de pagamento** | `payment_methods` + `payments`; lançar crédito passa a exigir método; **antecipação** vira conceito de primeira classe na reserva | Sem isto nada depois é confiável |
| **1 — Caixa diário** | Abertura, movimento por método, sangria, fechamento com conferência e diferença; cargo `finance` | A rotina que já existe, agora no AURA |
| **2 — Pix não identificado** | Caixa de entrada do financeiro: lançar o que caiu na conta e vincular à reserva | Reproduz o passo do extrato sem depender de memória |
| **3 — A Receber & A Pagar** | Plano de contas, títulos com as quatro datas, parcelas, quitação (total e parcial), seleção múltipla, totais e busca | **A tela que não pode faltar** — é onde o financeiro vive |
| **4 — Compras → títulos** | NF-e do estoque sugere o título a pagar; financeiro confirma | Acaba a redigitação entre estoque e financeiro |
| **5 — Movimento & Faturamento** | Relatório do dia e do período por método, categoria e origem; exportação | Os relatórios que você usa de fato |
| **6 — Painel gerencial** | RevPAR, ADR, ocupação e receita por canal no `/director` | Depende do dado limpo das fases anteriores |
| **7 — Previsão de receita** | Reservas futuras + orçamentos ganhos + parcelas a receber | O outro relatório que importa |
| **8 — Cielo integrada** | Link de pagamento pela reserva + webhook; Pix com `txid` identificado na hora | Só depois que o manual estiver provado |
| **9 — DRE & conciliações** | Resultado por centro de custo; conciliação de cartão (repasse da adquirente) e bancária | Só com meses de dado limpo |

## A virada em paralelo

Você escolheu rodar o financeiro do AURA **junto com o HMAX** antes do corte. Isso
tem um custo que precisa estar dito: durante o paralelo, **cada pagamento é
lançado duas vezes**. Para que o esforço valha, o paralelo precisa de um teste
objetivo:

> O fechamento diário do AURA tem que bater com o do HMAX, no total e por
> método, por N dias seguidos.

Por isso a fase 3 (Movimento do dia) deve nascer no formato que permita essa
comparação lado a lado. Sugestão de critério de virada: **15 dias consecutivos
sem divergência**, ou 30 dias se houver muita venda com cartão parcelado. Quando
bater, o lançamento duplo acaba e o AURA assume.

## RevPAR e ADR — o dado já dá

- Receita de hospedagem por noite: `folio_items` de categoria `lodging` já têm
  `refDate`.
- Inventário: `cabins` com `ignoreInOccupancy` fora do denominador.
- **ADR** = receita de hospedagem ÷ noites vendidas · **RevPAR** = receita ÷
  (cabanas vendáveis × noites).

Armadilhas: **uso da casa** (`internalUse`) não é venda e sai dos dois; **cortesia**
(`nightlyOverrides` = 0) é noite ocupada com receita zero — se virar noite não
vendida, o ADR infla.

## Regras de desenho

- **Módulo com flag** (`settings.hasFinance`), como manda `docs/MODULARIZATION.md`.
- **Nada se apaga** — estorno é contra-lançamento; o dia fechado precisa continuar
  batendo daqui a um ano.
- **Caixa fechado é imutável** — correção exige reabertura registrada, com autor e
  motivo (mesmo padrão de reabrir conta).
- **Dinheiro sempre tem dono** — todo pagamento nasce vinculado a uma reserva; a
  única exceção é o não identificado, que é transitório por definição.
- **Toda escrita auditada.**

## Riscos

- **Lançamento duplo cansa.** O paralelo é a decisão certa para ganhar confiança,
  mas tem prazo de validade: sem critério de virada, vira rotina eterna e a
  equipe passa a lançar mal nos dois.
- **Taxa de cartão chumbada em código** faria a receita líquida errar em silêncio
  — por isso é cadastro.
- **Sem histórico anterior ao corte**, todo relatório de período que atravesse a
  data de virada precisa dizer isso na cara, ou alguém vai comparar mês com meio
  mês.
- **DRE precisa da contabilidade** — o plano de contas tem que espelhar o que o
  contador já usa, senão nascem dois conjuntos de números.
- **mTLS da API Pix** — guardar certificado de estabelecimento tem o mesmo peso do
  certificado fiscal; decidir junto, não no meio da fase 6.

## Fora de escopo (por decisão)

**Comissões** e **contas correntes/recibos**: não são usados hoje no HMAX.
Comissão volta à mesa quando o repasse de OTA existir de fato (fase 7).
