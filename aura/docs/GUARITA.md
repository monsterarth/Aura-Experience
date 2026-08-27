# Módulo Guarita — plano

> Status: **plano aprovado, não iniciado**. Escrito em 26/08/2026.
>
> Decisões com o usuário: tarifa **flutuante por dia** (tabelada para lançamento
> rápido) · **todo mundo é registrado, só cliente externo paga** · pagamento **na
> guarita, na hora** · **sem controle de vagas** · duas frentes: **vendas** e
> **painel operacional** (tipo KDS de cozinha) · app mobile para os guaritas.
>
> O cargo `porter` já existe em `UserRole` e a rota `/porter` já está reservada
> em `role-routes.ts` ("WIP — módulo ainda não criado").

## Por que agora

O estacionamento é a pior dor repetitiva da recepção, e é a única que **não tem
trava nenhuma**:

- A guarita anota nome, placa, valor e forma de pagamento **numa planilha de
  papel** e guarda as notinhas.
- No fim do dia leva tudo para a recepção, que **abre uma reserva-fantasma numa
  cabana qualquer, sem diária**, e lança item por item — incluindo o NSU de cada
  cartão.
- Esse lançamento no HMAX existe **apenas para o valor aparecer no faturamento**
  (confirmado em 26/08). Não há emissão fiscal envolvida.

Ou seja: diferente de qualquer outro módulo, aqui **não é preciso esperar a
emissão de notas**. Basta o AURA entregar o número do faturamento do dia e o
lançamento no HMAX perde a razão de existir.

## O módulo tem dois lados

### 1. Vendas — o que substitui a planilha

Cada veículo vira um registro na hora em que entra, feito pelo guarita no
celular ou tablet.

### 2. Painel — o que a guarita precisa saber

Uma tela sempre ligada, no espírito de um KDS de cozinha: informação do turno,
grande, sem navegação. O guarita é a primeira pessoa que todo mundo encontra ao
chegar — hoje ele descobre as coisas por rádio ou telefone.

## O que já existe para alimentar o painel

O AURA tem quase tudo — é o módulo que mais aproveita dado existente:

| No painel | De onde vem |
|---|---|
| Chegadas de hoje: nome, cabana, **horário previsto** e **placa** | `stays` — `checkIn`, `expectedArrivalTime`, `vehiclePlate` |
| Saídas de hoje | `stays` — `checkOut` |
| Evento/casamento do dia | módulos de eventos e casamentos |
| Quem está hospedado agora | `stays` ativas |
| Veículos no pátio | o próprio módulo |
| Entregas esperadas | cadastro do módulo (+ compras, adiante) |

`vehiclePlate` e `expectedArrivalTime` já são preenchidos no pré-check-in do
portal — a guarita passa a ver, na chegada, quem é aquele carro **antes de
perguntar**.

## Modelo de dados

### `parking_rates` — a tarifa do dia

A cobrança é **decidida diariamente pela oferta e demanda**: dia bonito de alta
temporada chega a R$ 150; na baixa há dia de R$ 30 e dia em que nem abre.

Por isso a tarifa não é cadastro fixo nem digitação livre: é **um valor por
data**, escolhido a partir de **presets** (R$ 30 · 50 · 80 · 100 · 150 —
ajustáveis). Quem define é a recepção ou a gestão, na véspera ou na abertura; a
guarita só usa. Guarda quem definiu e quando.

Sem tarifa do dia, o app avisa e a guarita não lança — evita o valor errado
virar padrão.

### `parking_entries` — cada veículo

Data e hora, **placa**, veículo (modelo/cor, opcional), **tipo de visitante**,
valor cobrado, forma de pagamento, NSU quando cartão, quem registrou,
observação. Quando houver vínculo, `stayId` — o visitante que veio ver um
hóspede fica ligado à reserva dele.

### Quem paga, quem não paga

Entra de tudo; a cobrança é a exceção, não a regra:

| Tipo | Paga? |
|---|---|
| Hóspede | não |
| Fornecedor | não |
| Funcionário (pousada e restaurante) | não |
| **Visitante de hóspede** | **sim** |
| **Cliente do estacionamento (pé na areia)** | **sim** |

O tipo é a primeira escolha do registro, e ele decide se a tela pede valor. O
isento também é registrado: é dele que sai a resposta para "de quem é esse carro
no pátio?".

### `deliveries` — entregas esperadas

Fornecedor, o que vem, para quem (pousada, restaurante ou evento), previsão e
status (esperada · chegou · liberada). A guarita marca a chegada e a informação
aparece para quem espera.

## Fechamento do turno

O guarita fecha e o resumo sai pronto: total do dia, quantidade de veículos,
divisão por forma de pagamento, isentos por tipo. É o que a recepção recebe hoje
em papel — só que somado e conferido.

Enquanto o financeiro do AURA não existir, esse resumo é **o número que substitui
a reserva-fantasma no HMAX**. Quando existir, o mesmo fechamento vira entrada de
caixa (`payments` com origem `guarita`) sem redigitar nada.

## Sobre a nota fiscal

Hoje o estacionamento **não gera nota** — o lançamento no HMAX serve só ao
faturamento. Isso é decisão da empresa com a contabilidade, e o módulo **não a
altera**: nasce sem emissão.

O que ele faz é preservar o dado correto para o dia em que essa decisão mudar.
Hoje, ao virar reserva-fantasma, o cliente some e tudo vira "ESTACIONAMENTO"
genérico; com o registro na guarita, **nome, CPF (quando informado) e placa ficam
guardados**. Se um dia a emissão for ligada, a nota sai com o tomador real em vez
de um cadastro fictício — sem nenhum retrabalho.

Está na lista de perguntas do `docs/FISCAL.md`: confirmar com a contabilidade
quais serviços geram nota, por qual emissor e em que momento.

## Telas

**App da guarita** (`/porter` — mobile e tablet)

1. **Painel** — chegadas de hoje com hora e placa, saídas, evento do dia,
   entregas esperadas, veículos no pátio. É a tela que fica aberta.
2. **Registrar veículo** — tipo → placa → (valor, se pagante) → forma de
   pagamento → pronto. Precisa funcionar com uma mão, na chuva, com o carro
   esperando.
3. **Fechamento** — resumo do turno e envio para a recepção.

Segue as regras dos apps de campo: mutação sempre por `/api/field/*` (nunca
escrita direta pelo browser) e `RoleGuard` incluindo `super_admin`, `admin` e
`manager` junto de `porter`.

**Admin** (`/admin/guarita`)

Tarifa do dia, histórico de fechamentos, relatório por período (que é o número do
faturamento), busca por placa e cadastro de entregas.

## Fases

| Fase | Escopo | Entrega |
|---|---|---|
| **1 — Registro & tarifa** | `parking_rates` + `parking_entries`, app de registro, fechamento do turno, relatório | Mata a planilha e a reserva-fantasma |
| **2 — Painel** | Chegadas, saídas, evento do dia, veículos no pátio | A guarita para de descobrir as coisas por rádio |
| **3 — Entregas** | Entregas esperadas e recebimento | Fornecedor deixa de ser surpresa |
| **4 — Integração** | Fechamento vira entrada de caixa no financeiro; visitante ligado à reserva do hóspede | Depende do módulo financeiro |

A fase 1 sozinha já elimina trabalho diário de duas equipes. É a primeira entrega
do AURA que **tira** um processo do HMAX em vez de duplicá-lo.

## Fora de escopo

- **Controle de vagas** — decidido: só registro.
- **Cancela/leitor de placa** — hardware não entra agora.
- **Cobrança por hora** — a tarifa é do dia, não do tempo.
