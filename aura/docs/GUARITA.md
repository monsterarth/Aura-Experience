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
| **Quem está no pátio agora** | `vehicle_movements` — entrada sem saída |
| Entregas esperadas | cadastro do módulo (+ compras, adiante) |

`vehiclePlate` e `expectedArrivalTime` já são preenchidos no pré-check-in do
portal — a guarita passa a ver, na chegada, quem é aquele carro **antes de
perguntar**.

## O que as planilhas ensinaram

Existem **duas** planilhas hoje, e elas são coisas diferentes:

**"Estacionamento Pé na Areia"** (uma por dia) — `PLACA · NOME · CONTATO · VALOR`
e quatro colunas de forma de pagamento (`CRÉ · DÉB · PIX · DIN`). É a venda.

**"Controle de Veículos Hóspedes"** — `DATA · PLACA HÓSPEDE · PLACA VISITA ·
NOME · CABANA · HORÁRIO ENTRADA`. Serve **só** para o guarita saber de quem é
cada carro quando alguém estaciona no lugar errado.

> **A segunda planilha não deveria existir.** Ela é uma re-digitação diária de
> algo que é *cadastro*, não movimento: a placa do hóspede já chega pelo
> pré-check-in (`stays.vehiclePlate`), o nome e a cabana o AURA já sabe. Copiar
> isso à mão todo dia é trabalho que nasce morto.

Daí a peça central do módulo: **um cadastro de placas**, não uma lista diária.

## Modelo de dados

### `vehicles` — o cadastro de placas

Uma linha por **placa**, permanente. Responde "de quem é esse carro?" sem
ninguém digitar nada no dia a dia.

Campos: placa (chave), modelo e cor, nome do dono, contato, observação e o
**vínculo** — que é o que dá inteligência ao painel:

| Vínculo | De onde vem |
|---|---|
| **Hóspede** | `stays.vehiclePlate`, preenchido no pré-check-in — entra sozinho |
| **Funcionário** | cadastro do staff (placa passa a ser campo do funcionário) |
| **Fornecedor** | cadastro de fornecedores do estoque |
| **Cliente / visitante** | criado na primeira vez que estaciona |

E o **status**: `normal` · **`whitelist`** (sempre liberado, sem cobrança —
sócios, parceiros, permuta) · **`blacklist`** (alerta na tela quando a placa
entra). A blacklist conversa com a de hóspedes já prevista no `docs/ROADMAP.md`.

O ganho real aparece no balcão da guarita: **digita a placa e o sistema já diz
quem é** — "hóspede da cabana 12", "funcionário do restaurante", "cliente,
esteve aqui 4 vezes" ou "atenção". A digitação vira conferência.

### `vehicle_movements` — entrada e saída

O ciclo é registrado dos dois lados (decisão de 26/08): entrada com hora, saída
com hora. Com isso o painel responde **quem está no pátio agora** — que é
exatamente o que a planilha de hóspedes tentava responder sem conseguir.

Por movimento: placa (ligada ao cadastro), **tipo no momento** (hóspede ·
visitante · fornecedor · funcionário · cliente externo), entrada, saída, e —
quando pagante — valor, **uma forma de pagamento** (crédito · débito · Pix ·
dinheiro; não se divide), NSU do cartão, quem registrou.

Vínculo opcional com `stayId`: a visita que veio ver o hóspede fica ligada à
reserva dele.

### `parking_rates` — a tarifa do dia

A cobrança é **decidida diariamente pela oferta e demanda**: dia bonito de alta
temporada chega a R$ 150; na baixa há dia de R$ 30 e dia em que nem abre.

Por isso a tarifa não é cadastro fixo nem digitação livre: é **um valor por
data**, escolhido a partir de **presets** (R$ 30 · 50 · 80 · 100 · 150 —
ajustáveis). Quem define é a recepção ou a gestão, na véspera ou na abertura; a
guarita só usa. Guarda quem definiu e quando.

Sem tarifa do dia, o app avisa e a guarita não lança — evita o valor errado
virar padrão.

### Quem paga, quem não paga

Entra de tudo; a cobrança é a exceção, não a regra:

| Tipo | Paga? |
|---|---|
| Hóspede | não |
| Fornecedor | não |
| Funcionário (pousada e restaurante) | não |
| Visita de hóspede | **não** — só registro, para saber de quem é o carro |
| **Cliente do estacionamento (pé na areia)** | **sim** |

O tipo é a primeira escolha do registro e decide se a tela pede valor — mas
quando a placa está cadastrada, ele já vem preenchido.

### Sobre o contato do cliente

Hoje o telefone é pedido para **uso operacional e segurança** (farol aceso,
alarme, identificar o dono). O usuário quer poder usá-lo para **marketing no
futuro** — e aí a regra muda de natureza: uso operacional se justifica sozinho,
marketing precisa de **consentimento registrado**. O campo nasce com um marcador
de "aceita receber contato", em vez de virar base de disparo por acidente.

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
2. **Registrar veículo** — **placa primeiro**: se já é conhecida, o sistema
   preenche dono, tipo e vínculo, e a guarita só confirma; se é nova, pede o
   mínimo. Placa em blacklist avisa na hora. A saída se registra pela mesma tela,
   achando o carro no pátio. Precisa funcionar com uma mão, na chuva, com o carro
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
| **1 — Placas, registro & tarifa** | `vehicles` (cadastro, com a placa do hóspede vindo do pré-check-in) + `vehicle_movements` (entrada/saída) + `parking_rates`, app de registro, fechamento, relatório | Mata **as duas** planilhas e a reserva-fantasma |
| **2 — Painel** | Chegadas, saídas, evento do dia, quem está no pátio, alerta de blacklist | A guarita para de descobrir as coisas por rádio |
| **3 — Entregas** | Entregas esperadas e recebimento | Fornecedor deixa de ser surpresa |
| **4 — Integração** | Fechamento vira entrada de caixa no financeiro; visitante ligado à reserva do hóspede | Depende do módulo financeiro |

A fase 1 sozinha já elimina trabalho diário de duas equipes. É a primeira entrega
do AURA que **tira** um processo do HMAX em vez de duplicá-lo.

## Fora de escopo

- **Controle de vagas** — decidido: só registro.
- **Cancela/leitor de placa** — hardware não entra agora.
- **Cobrança por hora** — a tarifa é do dia, não do tempo (entrada e saída são
  registradas para saber quem está no pátio, não para calcular preço).
- **Disparo de marketing** — o consentimento é coletado; o uso fica para depois.
