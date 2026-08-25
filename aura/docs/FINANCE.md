# Módulo Financeiro do AURA — plano

> Status: **plano aprovado, não iniciado**. Escrito em 25/08/2026.
> Decisões com o usuário: escopo **completo** (caixa, recebimentos, a receber, a
> pagar, DRE, relatórios) · formas de pagamento em uso: **Pix, dinheiro, cartão
> crédito/débito, transferência** · fechamento de caixa **diário** (não por
> turno) · dos relatórios do HMAX, os que importam são **Faturamento/Movimento**
> e **Previsão de receita**.
> Companheiro deste plano: `docs/FISCAL.md` (emissão de notas). São coisas
> diferentes — receber dinheiro não é emitir nota — e devem permanecer separadas.

## Onde estamos

O AURA tem um **fólio bom**: `folio_items` registra débitos (diárias com
`refDate` por noite, consumo, serviços) e créditos (pagamentos), com estorno
auditado e encerramento de conta (`billClosedAt`). Isso resolve a conta *do
hóspede*.

O que não existe é a contabilidade *da pousada*. Depois que o hóspede paga, o
dinheiro desaparece do sistema: não se sabe **como** entrou, **quanto** entrou no
dia, **quanto ainda falta entrar**, nem **quanto disso é lucro**.

O `/director` já denuncia o buraco — tem um cartão escrito "Receita, ADR e RevPAR
serão exibidos aqui quando o módulo for ativado".

### O gap fundador

```ts
// finance-service.ts — addPayment()
description: "Pix hospedagem"   // ← a forma de pagamento é TEXTO LIVRE
```

Não existe campo de **forma de pagamento**. "Pix", "cartão 3x" e "dinheiro" são
palavras dentro da descrição. Enquanto for assim, é impossível: fechar caixa,
saber a receita líquida (cartão tem taxa), conciliar com o extrato do banco,
ou dizer quanto entrou por método no mês. **Toda a fase 0 existe para consertar
isso** — é a peça de que todo o resto depende.

## O conceito que separa extrato de financeiro

Dois eixos de tempo, e ambos precisam existir:

| Eixo | Pergunta que responde | Onde vive |
|---|---|---|
| **Competência** | A que noite/período esta receita pertence? | `folio_items.refDate` (já existe para diárias) |
| **Caixa** | Em que dia o dinheiro efetivamente entrou? | `payments.receivedAt` (a criar) |

Uma diária de 31/12 paga em 20/12 é receita de dezembro pelos dois eixos; a mesma
diária paga em cartão parcelado cai no banco em janeiro, fevereiro e março. Sem
os dois eixos, ou o gerente vê receita que não entrou, ou vê caixa que não
explica o mês. É isso que faz um financeiro "de respeito".

## Arquitetura

```
folio_items          o que o hóspede DEVE          (existe)
     │
     ├── payments    como o dinheiro ENTROU        método · bruto · taxa · líquido · previsão de crédito
     │        │
     │        ├── cash_sessions      o dia de caixa: abertura, conferência, fechamento
     │        └── bank_reconcile     (fase futura) previsto × extrato
     │
     ├── receivables o que FALTA entrar            faturado, OTA, parcela de cartão
     └── payables    o que falta SAIR              fornecedores (Compras já existe), despesas fixas
                │
                └── finance_accounts   plano de contas + centro de custo → DRE
```

### Tabelas novas

**`payment_methods`** (config por propriedade) — cada método com: tipo (`pix`,
`cash`, `credit`, `debit`, `transfer`), se tem taxa (% e/ou fixa), prazo de
crédito em dias (D+1, D+30), conta bancária de destino e se entra no caixa
físico. É config, não constante: bandeira nova ou mudança de taxa é cadastro.

**`payments`** — um por recebimento: `folioItemId` (o crédito correspondente),
método, valor **bruto**, taxa, valor **líquido**, `receivedAt` (caixa),
`expectedCreditAt` (quando cai no banco), parcelas, autorização/NSU, e
`cashSessionId`.

**`cash_sessions`** — o dia: quem abriu, saldo inicial, entradas por método
(calculadas), sangrias, saldo contado no fechamento, **diferença** (contado −
esperado), observações e quem fechou. Fechado = **congelado**.

**`receivables` / `payables`** — títulos em aberto: valor, vencimento, origem
(estadia, OTA, fornecedor), status, e o pagamento que o baixou.

**`finance_accounts`** — plano de contas simples (receita de hospedagem, receita
de A&B, comissão, pessoal, manutenção…) com centro de custo. É o que transforma
lançamento solto em DRE.

## Fases

| Fase | Escopo | Por que nesta ordem |
|---|---|---|
| **0 — Forma de pagamento** | `payment_methods` + `payments`; o lançamento de crédito na conta passa a exigir método; backfill do legado como "não informado" | Sem isto nenhuma fase seguinte é confiável |
| **1 — Caixa diário** | Abertura, movimento do dia por método, sangria, fechamento com conferência e diferença | Rotina da recepção; fecha o dia com número conferido |
| **2 — Movimento & Faturamento** | Relatório do dia e do período, por método, categoria e origem; exportação | Os dois relatórios que você realmente usa no HMAX |
| **3 — Painel gerencial** | RevPAR, diária média (ADR), ocupação e receita por canal no `/director` — preenche o placeholder que já está lá | Depende de dado limpo das fases anteriores |
| **4 — Previsão de receita** | Reservas futuras (`stays.lodgingTotal`) + orçamentos ganhos (`rate_quotes`) + parcelas de cartão a receber | O outro relatório que importa |
| **5 — Contas a receber** | Faturado para empresa, repasse de OTA (com o Hsystem), parcelamento | Ganha urgência quando o canal passar a cobrar (`CanalCollect`) |
| **6 — Contas a pagar + DRE** | Fornecedores (Compras já registra NF e valores), despesas fixas, centro de custo, resultado do mês | Fecha o ciclo: entrada, saída e resultado |
| **7 — Conciliação bancária** | Previsto × extrato (OFX/CSV ou open finance) | Só faz sentido com 0–2 rodando há alguns meses |

As fases 0 a 2 são o coração: com elas a pousada fecha o dia sozinha no AURA. As
3 e 4 entregam o que o print da Gerência do HMAX mostra.

## RevPAR e ADR — dá para calcular certo

Não é chute: o dado já existe.

- **Receita de hospedagem por noite** — `folio_items` de categoria `lodging` já
  têm `refDate`, então a receita é atribuída à noite correta.
- **Inventário** — `cabins` com `ignoreInOccupancy` para tirar do denominador o
  que não é vendável.
- **ADR** = receita de hospedagem ÷ noites vendidas.
- **RevPAR** = receita de hospedagem ÷ (cabanas vendáveis × noites do período).

Duas armadilhas a respeitar no cálculo: **uso da casa** (`internalUse`) não é
venda e não entra em nenhum dos dois; e cortesias/diária zerada
(`nightlyOverrides` com valor 0) contam como noite ocupada, mas com receita zero
— senão o ADR fica inflado.

## Regras de desenho

- **Módulo com flag** (`settings.hasFinance`), seguindo `docs/MODULARIZATION.md`:
  o core nunca depende dele.
- **Nada se apaga.** Estorno é contra-lançamento, não `DELETE` — o dia fechado
  precisa continuar batendo depois.
- **Caixa fechado é imutável.** Correção depois do fechamento exige reabertura
  registrada, com autor e motivo (mesmo padrão de reabrir conta).
- **Toda escrita auditada** (`audit_logs`), como o resto do sistema.
- **Papéis**: recepção lança e fecha caixa; gerência vê relatório e reabre; DRE e
  contas a pagar ficam com admin/manager.

## Riscos

- **Backfill dos pagamentos antigos.** Os créditos existentes viraram texto. Dá
  para inferir "Pix"/"cartão" da descrição no que for óbvio e marcar o resto como
  *não informado* — o que **não** dá é inventar método para fechar caixa
  retroativo. Relatórios antes da fase 0 nascem com essa ressalva explícita.
- **Fechamento de caixa é disciplina, não software.** Se a recepção não fechar
  todo dia, o relatório vira ficção. Vale combinar a rotina antes de construir.
- **DRE precisa da contabilidade.** O plano de contas tem que espelhar o que o
  contador já usa, senão gera um segundo conjunto de números que ninguém concilia.
- **Taxa de cartão muda.** Se a taxa for chumbada em código em vez de cadastro, a
  receita líquida fica errada silenciosamente.

## Fora de escopo (por decisão)

**Comissões** e **contas correntes/recibos** não entram: você não usa esses
relatórios no HMAX hoje. Comissão volta à mesa se/quando o repasse de OTA passar
a existir de fato (fase 5).

## Fronteira com o fiscal

Receber dinheiro e emitir nota são eventos diferentes, e o módulo trata assim:
o pagamento entra no caixa quando o hóspede paga; a nota sai no encerramento da
hospedagem (`docs/FISCAL.md`). O elo entre eles é a estadia — não uma dependência
de um para o outro. Um hóspede pode pagar antes e receber nota depois, e é comum.
