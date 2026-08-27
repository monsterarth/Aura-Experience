# Módulo Financeiro do AURA — plano

> Status: **plano aprovado, não iniciado**. Escrito em 25/08/2026.
>
> Decisões com o usuário: escopo **completo** (caixa, recebimentos, a receber, a
> pagar, DRE, relatórios) · formas em uso: **dinheiro, cheque, cartão
> (bandeira + parcelas), bancário/Pix, uso de crédito e boleto** · fechamento de caixa **diário** · dos
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

## Antecipação — a peça central

Quase todo o dinheiro entra **antes** da estadia. O movimento de caixa comprova:
num turno com R$ 37.772,50 de contas, **R$ 36.392,50 já eram antecipações** — só
R$ 1.340 foram pagos no balcão. Antecipação não é um caso à parte do caixa; é o
caso normal.

### A tela (dentro da reserva)

Colunas: data/horário · valor · **forma** · C/C · **lançado por** ·
**origem/confirmação** · obs · **a prazo**. Ações: **incluir · confirmar ·
transferir · estornar · recibo**.

Disso saem regras que o AURA precisa ter:

- **A antecipação nasce confirmada** — corrigido pela recepção em 26/08. Não
  existe lançamento "provisório": enquanto o cliente não paga, o que existe é uma
  **pré-reserva pendente com saldo em aberto**. O botão *Confirmar* existe na
  tela, mas não faz parte do fluxo normal. Quem faz o papel de auditoria é o
  **recibo assinado** (ver abaixo), não um estado no sistema.
- **Transferir entre reservas.** O hóspede pagou e mudou de reserva (remarcou,
  trocou de titular, virou outro grupo): o dinheiro se move **sem estorno**,
  preservando o histórico. Sem isso, a recepção estorna e relança — e o caixa do
  dia mente duas vezes.
- **Estornar, nunca apagar.** Contra-lançamento, como o resto do módulo.
- **Recibo** — o comprovante que o hóspede leva.
- **A prazo** — antecipação parcelada (cartão em N vezes) contra a pagamento
  à vista.

### As formas, como elas são de fato

| Forma | O que o AURA precisa guardar |
|---|---|
| **Dinheiro** | entra no caixa físico do turno |
| **Cheque** | ainda existe; tem data de bom-para |
| **Cartão** | **bandeira** (Visa, Master, Elo, Elo Débito, Amex, Hipercard, Diners…), **nº de parcelas** e **NSU** |
| **Bancário** (Pix/transferência) | identificação do depósito; é o que passa pela caixa de entrada quando cai sem dono |
| **Uso de crédito** | abate crédito que o cliente já tinha (conta corrente) — não é dinheiro novo entrando |
| **Boleto** | nos títulos a pagar; não passa pelo caixa |

> **Uso de crédito** é o conceito que faltava: o cliente com saldo a favor (pagou
> a mais, cancelou uma reserva e ficou com crédito) usa esse valor numa nova
> reserva. É movimento entre contas, não entrada de caixa — e se for tratado como
> entrada, o caixa fecha com dinheiro que não existe.

### O caminho do link de pagamento (hoje)

A recepção captura o pagamento no **web app da Cielo**, copia **NSU, bandeira e
número de parcelas**, e lança no PMS como **antecipação já efetivada**. O
financeiro audita depois.

É exatamente essa digitação que a fase 8 elimina: com o webhook da Cielo, NSU,
bandeira e parcelas chegam sozinhos e a antecipação nasce confirmada. Até lá, o
formulário do AURA precisa pedir esses três campos — eles são a ponte com a
conciliação.

## Movimento de caixa — como é de verdade

**Não é "o dia".** É um **movimento numerado** (6267, 6268, 6269…) que abre e
fecha por pessoa, e atravessa a madrugada:

```
6267 · abertura 22/08 19:58 DAIANA → encerramento 23/08 20:12 ROMINA
```

Ou seja: o turno vira por volta das 20h, quem abre não é quem fecha, e a
numeração é sequencial e contínua. Modelar `cash_sessions` por data civil estaria
errado — é por **movimento**, com número próprio, abertura e encerramento
identificados.

### A conta de cada linha

Uma linha por hóspede/conta, e as colunas contam a história do dinheiro:

```
Bruto  −  Antecipações  −  Abatimentos  =  Líquido   → e o líquido se divide
37.772,50   36.392,50        40,00        1.340,00      em dinheiro/cheque/cartão
```

**Abatimento** é o terceiro conceito novo (desconto, cortesia ou ajuste dado no
fechamento). Ele reduz o que o hóspede paga sem ser pagamento — precisa de campo
próprio, senão vira "desconto" escondido numa descrição e ninguém consegue medir
quanto a casa deu de cortesia no mês.

### O caixa físico

Separado da conta das estadias, no rodapé:

```
Saldo anterior 118,00 + Entradas 3.764,50 − Saídas 3.704,50 = Saldo atual 178,00
```

É a gaveta: o que entrou em dinheiro, as sangrias e o que fica para o próximo
movimento. Duas contas diferentes na mesma tela — as contas dos hóspedes e o
dinheiro em espécie — e o AURA precisa das duas para o fechamento fazer sentido.

## O que a recepção contou (26/08/2026)

Levantamento com quem opera o balcão. Cada item aqui é uma regra ou um buraco
real — não suposição.

### A regra que organiza tudo

> **Ninguém entra na cabana sem ter quitado 100% da reserva.**

Existe uma única exceção, que a própria operação quer eliminar. Isso simplifica o
módulo mais do que qualquer decisão de arquitetura: o fólio de hospedagem nasce
zerado no check-in, e o que sobra para o check-out é só consumo.

Na **baixa temporada** aceitam **50% na reserva e 50% no check-in** — nunca no
check-out. O AURA precisa saber cobrar essa segunda parcela na chegada, e avisar
quem ainda não pagou.

### O caminho de cada forma

| Como entra | Como é hoje |
|---|---|
| **Walk-in** | Reserva criada na hora, cadastro completo, cartão na maquininha, guarda-se a **notinha com o NSU** e lança-se antecipação de 100% |
| **Cartão (link)** | A recepção **cria o link na Cielo à mão**, envia ao cliente e, quando ele avisa que pagou, **volta à Cielo para capturar** a transação. Dois passos manuais fora do PMS |
| **Pix** | Comprovante vai para um **grupo de WhatsApp do financeiro** com o número da reserva; o financeiro confere e lança; a recepção então acha o valor na lista da forma **bancário** |
| **Dinheiro** | Só no check-in/balcão, entra no caixa físico |

**Todo valor lançado gera um recibo que o recebedor assina** e entrega ao
financeiro no fechamento. O papel assinado é o controle real — mais do que
qualquer estado no sistema.

### O buraco do fim de semana

O financeiro trabalha **de segunda a sexta**, conferindo o extrato ~2× por dia.
Pix pago numa sexta à noite só é confirmado na segunda. Nesse intervalo:

> "Quando o hóspede chega e só temos o comprovante ainda não validado, a gente
> faz um teatro, disfarça e faz de conta que tá tudo certo, e manda mensagem pro
> financeiro acelerar."

Esse é o problema mais claro do levantamento — e o que a integração Pix da Cielo
resolve sozinha: com cobrança gerada pelo AURA (`txid`), o pagamento se confirma
em segundos, inclusive domingo de madrugada. **Vale mais que qualquer relatório.**

### Vouchers moram em três lugares

Cliente que fica com crédito recebe um **voucher feito à mão no Canva**, anotado
**numa planilha do Excel**, enquanto o saldo real vive **no HMAX**. Validade de
**1 ano**.

Três fontes para o mesmo dinheiro, nenhuma conversando com a outra. O AURA
precisa de voucher como entidade: código, valor, origem (qual reserva gerou),
validade, status e onde foi usado — e o resgate vira a forma de pagamento
*uso de crédito*.

### Transferência entre reservas é rotina

Dois casos frequentes, ambos legítimos:

1. Hóspede vai embora deixando crédito.
2. **Uma pessoa paga R$ 10.000 num link só para três reservas de R$ 3.333,33** —
   a recepção antecipa tudo numa reserva e depois distribui para as outras duas.

O segundo caso é o que prova que transferir precisa ser fácil e rastreável: é uma
operação normal de grupo, não uma correção de erro.

### O troco sai do caixa (e o caixa fecha menor)

Conta de R$ 38, cliente paga com R$ 50: devolve-se R$ 12 **do caixa**, e os R$ 50
inteiros vão para o movimento. O fundo de troco fecha R$ 12 menor. É a mecânica
real, e o fechamento do AURA precisa reproduzi-la — senão vai apontar diferença
onde não há erro nenhum.

Quando o caixa não bate, são quase sempre duas causas: **valor esquecido de
lançar** ou **dinheiro retirado do caixa para outro fim** (o estacionamento pede
troco quando o financeiro já saiu ou é fim de semana).

### O estacionamento é a pior dor repetitiva

A guarita anota **nome, placa, valor e forma de pagamento numa planilha** e
guarda as notas. No fim do dia a recepção **abre uma reserva numa cabana
qualquer, sem diária**, e lança tudo um a um — inclusive o NSU de cada cartão.

Uma reserva-fantasma existindo só para servir de recipiente. No AURA isso pede
uma **venda avulsa** (lançamento sem reserva, com sua própria forma de pagamento
e recibo) — e, mais adiante, a guarita lançando direto pelo celular.

### Cortesia e permuta são "abatimento"

Hoje: reserva com **diária zerada**, fechada sem lançar nada. Acontece em três
situações — uso da casa, **permuta com pousadeiros parceiros** (os sócios se
hospedam nas propriedades deles em troca) e cortesia de diretoria.

Zerar a diária resolve a cobrança e **apaga a informação**: ninguém sabe quanto a
casa deu de cortesia no mês, nem separa permuta de favor. Com abatimento como
campo (valor cheio + abatimento com motivo e autor), o hóspede continua pagando
zero e o número passa a existir.

### O que mais demora no balcão

> "Copiar os documentos e preencher os dados dele no sistema."

Isso o AURA **já resolve** — o pré-check-in do portal traz FNRH completa,
documento e endereço antes de o hóspede chegar. É o ganho mais visível para
mostrar a quem ainda não conhece o sistema.

### Cargos

Estorno de antecipação hoje é de gestão ou do **líder da recepção** (que tem
acesso de gestor por falta de opção). O AURA precisa de um **cargo intermediário**
— mais poder que recepcionista, sem virar gerente:

| Cargo | Pode |
|---|---|
| `reception` | lançar pagamento, emitir recibo, fechar o próprio movimento |
| **`reception_lead`** (novo) | + estornar, transferir entre reservas, abatimento até um limite |
| `finance` (novo) | + conciliação, títulos, relatórios, reabrir movimento |

### Turno

Recepção trabalha **12×36, das 8:30 às 20:30** — o que confirma o movimento de
caixa virando por volta das 20h. No fim do turno "roda-se o dia" no HMAX: confere
os papéis impressos contra a tela de movimento, conta o caixa e transfere o
dinheiro para o financeiro, mantendo só o fundo de troco.

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
`expectedCreditAt` (banco), **bandeira**, parcelas, **NSU**, `cashSessionId`,
origem (`balcao` · `link` · `pix` · `manual`) e o par que a auditoria exige:
`status` (`launched` | `confirmed` | `reversed`) com **quem lançou** e **quem
confirmou**. Transferência entre reservas move o registro preservando a origem —
não estorna e relança.

**`unidentified_receipts`** — o Pix (ou transferência) que caiu sem dono: valor,
data, identificação do pagador quando houver, status (`open` · `linked` ·
`ignored`), e o `paymentId` gerado ao vincular. É a fila de trabalho do
financeiro.

**`cash_sessions`** — o **movimento**, não o dia: número sequencial, quem abriu e
quando, quem encerrou e quando, saldo anterior, entradas por método, sangrias,
saldo contado, **diferença** (contado − esperado) e observações. Fechado =
congelado. O turno atravessa a madrugada (≈20h às 20h) e quem abre raramente é
quem fecha — a sessão pertence ao movimento, não ao operador nem à data.

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
| **0 — Antecipação & forma de pagamento** | `payment_methods` + `payments`; **antecipação** com estados (lançada → confirmada), bandeira/parcelas/NSU no cartão, uso de crédito, transferência entre reservas, estorno e recibo | Sem isto nada depois é confiável — e é por onde entra quase todo o dinheiro |
| **1 — Movimento de caixa** | Movimento numerado com abertura/encerramento por pessoa (turno ≈20h–20h), linha por conta (bruto − antecipações − **abatimentos** = líquido), caixa físico (saldo anterior/entradas/saídas), fechamento com diferença; cargo `finance` | A rotina que já existe, agora no AURA |
| **2 — Pix & vouchers** | Caixa de entrada do financeiro (o que caiu sem dono) **e voucher como entidade** — código, validade de 1 ano, origem e resgate como *uso de crédito* | Tira o Pix do grupo de WhatsApp e o voucher do Canva+Excel |
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
