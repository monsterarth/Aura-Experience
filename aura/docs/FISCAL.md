# Emissão fiscal no AURA — plano

> Status: **plano aprovado, não iniciado**. Escrito em 25/08/2026.
> Decisões já tomadas com o usuário: NFS-e **e** NFC-e · três regimes tributários
> previstos · emissão **manual** por botão na conta · via **API terceirizada** ·
> NFC-e sai **no encerramento da hospedagem** (é como o HMAX já opera hoje).

## Por que

Hoje a nota sai pelo HMAX, e é só por isso que ele continua sendo o PMS oficial.
Enquanto a emissão morar lá, a operação depende de dois sistemas: as reservas
entram no AURA (via [Hsystem](#), ver `hsystem-service.ts`), mas o fechamento
financeiro precisa ser redigitado no outro. Emitir no AURA é o que fecha a
migração — não é um módulo a mais, é o último pré-requisito da troca de PMS.

## O que a hospedagem exige

Dois documentos diferentes, de fiscos diferentes:

| O que | Documento | Fisco | Base |
|---|---|---|---|
| Diária e taxas de hospedagem | **NFS-e** | Município (ISS) | Item **9.01** da LC 116 — "hospedagem de qualquer natureza" |
| **Estacionamento** | **NFS-e** | Município (ISS) | Item **11.01** — "guarda e estacionamento de veículos" *(confirmar com a contabilidade)* |
| Outros serviços (lavanderia, passeio, café extra) | **NFS-e** | Município (ISS) | Item próprio de cada um — **não herdam o 9.01** |
| Produto físico vendido ao hóspede (frigobar, loja, bebida) | **NFC-e** | Estado (ICMS — SEFAZ/SC) | Venda a consumidor presente |

> **Cada serviço tem seu código, e isso é decisão de modelo:** o código de serviço
> **não pode ser configuração global da propriedade**. Hospedagem é 9.01,
> estacionamento é 11.01, lavanderia e passeios têm os seus — com alíquotas de ISS
> possivelmente diferentes. O código mora **no item/serviço**, e `fiscal_settings`
> guarda apenas o padrão.

Isso significa que uma estadia com frigobar gera **dois** documentos. Não é
escolha nossa: é a natureza da operação (serviço × mercadoria).

### O calendário aperta (2026)

- A NFS-e de padrão **nacional** passou a ser obrigatória em janeiro/2026.
- IBS/CBS (reforma tributária): na NFS-e a informação começa opcional, e **até
  31/12/2026 a ausência não rejeita** a nota — mas os prazos setoriais caem
  entre **outubro e dezembro/2026**. Ou seja: o que for construído agora precisa
  nascer preparado para esses campos.
- Simples Nacional tem folga maior (destaque de IBS/CBS só em 2027).

**Consequência de projeto:** integrar direto no webservice da prefeitura nos
obrigaria a acompanhar cada mudança de layout no meio da reforma. Por isso a
opção pela API terceirizada — o provedor mantém o layout atualizado.

## Arquitetura

```
Conta da estadia (StayAccountPanel)
      │ botão "Emitir nota"
      ▼
/api/admin/fiscal/*  ──►  fiscal-service.ts  ──►  provedor (REST/JSON)
      │                        │                        │
      │                        │                        ├─► Prefeitura (NFS-e)
      │                        │                        └─► SEFAZ-SC (NFC-e)
      │                        ▼
      │                  fiscal_documents (status, valores, chave, XML/PDF)
      ▼
 webhook do provedor ──► atualiza status ──► notifica recepção
```

**O certificado digital A1 fica hospedado no provedor, não no AURA.** É a decisão
de segurança mais importante do módulo: um `.pfx` com senha é a identidade
jurídica da empresa. Guardá-lo aqui significaria assinar XML no nosso servidor e
virar alvo. Os provedores oferecem upload do certificado na plataforma deles —
o AURA guarda apenas o token de API no cofre `property_secrets`, junto do que já
existe (Evolution, Chatwoot, HUnit).

### Provedor

Requisito: **NFS-e e NFC-e no mesmo contrato**, sandbox, webhook de status e
contingência offline para NFC-e.

- **PlugNotas (TecnoSpeed)** — cobre NF-e, NFC-e, NFS-e, webhooks em tempo real,
  contingência offline de NFC-e e sandbox completo. É o mais aderente ao escopo.
- **Focus NFe** — cobre os mesmos documentos, +1.300 municípios integrados, sem
  fidelidade contratual, e compromisso de integrar município novo por taxa fixa.
- **Nuvem Fiscal / eNotas** — alternativas a cotar.

Preço não está definido publicamente por plano; **cotar dois** antes de fechar,
informando volume (~estadias/mês) e os dois tipos de documento.

## Modelo de dados

Nada disso existe hoje — `properties` não guarda nem endereço, quanto mais CNPJ.

### `fiscal_settings` (uma linha por propriedade)

Identificação (CNPJ, razão social, nome fantasia, IM, IE), endereço completo com
código IBGE, **regime tributário** (`simples` | `presumido` | `real`), e a
configuração de cada documento:

- NFS-e: código de serviço **padrão** (9.01), natureza da operação, se ISS é
  retido, regime especial. **A alíquota e o código de cada serviço vêm do item**
  — hospedagem, estacionamento e lavanderia não compartilham código.
- NFC-e: série, CSC/token (no cofre), CFOP padrão, origem da mercadoria.
- Provedor: qual, ambiente (`homologacao` | `producao`), id da empresa no
  provedor. Token: **cofre**.

O regime é campo, não constante: o payload muda entre Simples (sem destaque de
IBS/CBS até 2027, sem retenções federais) e Presumido/Real (destaque e possíveis
retenções de IR/PIS/COFINS/CSLL). Multi-propriedade herda isso de graça.

### `fiscal_documents`

Um por documento emitido: tipo (`nfse` | `nfce`), `stayId` (nullable — venda
avulsa existe), status (`draft` → `queued` → `processing` → `authorized` |
`rejected` | `cancelled`), número/série/chave, protocolo, **snapshot do
destinatário** (nome, CPF/CNPJ, endereço — congelado no momento da emissão, não
join com `guests`, porque a nota é um documento imutável), valores (base, ISS,
IBS, CBS, total), URLs de XML e PDF no Blob, motivo de rejeição, tentativas, e
quem emitiu.

### `fiscal_document_items`

Linhas da nota: descrição, quantidade, unitário, total, e os códigos fiscais
(código de serviço para NFS-e; NCM, CFOP, CEST e unidade comercial para NFC-e).

**Gap no catálogo:** nada no AURA carrega código fiscal hoje. Produto precisa de
NCM/CFOP (`concierge_items`, fase da NFC-e) e **serviço precisa de código de
serviço + alíquota de ISS já na fase 1** — hospedagem, estacionamento e demais
serviços, cada um com o seu.

## Fluxo de emissão

1. Recepção abre a conta e clica em **Emitir nota**.
2. Drawer mostra: destinatário (titular por padrão; permite trocar para outra
   pessoa ou **empresa com CNPJ** — faturamento corporativo), a separação
   automática entre **serviços** (vão para a NFS-e) e **produtos** (NFC-e), e o
   total de cada documento.
3. Confirma → `fiscal_documents` em `queued` → provedor.
4. Webhook do provedor atualiza para `authorized` (com XML/PDF salvos) ou
   `rejected` (com o motivo em texto claro na tela).
5. Nota autorizada aparece na conta com link do PDF e botão para enviar ao
   hóspede (e-mail/WhatsApp — a fila de mensagens já existe).
6. Cancelamento e substituição disponíveis dentro do prazo legal.

**Rejeição não pode ser um toast que some.** Ela vira pendência visível na conta,
como os quatro sinais — a conta não deveria encerrar em silêncio com nota
rejeitada.

## Fases

| Fase | Escopo | Entrega |
|---|---|---|
| **0 — Fundação** | `fiscal_settings` + tela de configuração fiscal + contrato do provedor em homologação | Cadastro completo da empresa, conexão testada em sandbox |
| **1 — NFS-e** | Emissão manual na conta, destinatário, itens de serviço, XML/PDF, envio ao hóspede | O que substitui o HMAX no dia a dia |
| **2 — Ciclo completo** | Cancelamento, substituição, fila com retry, relatório por período e exportação para a contabilidade | Operação sem depender de ninguém |
| **3 — NFC-e** | IE, CSC, NCM/CFOP no catálogo, contingência offline, emissão de produto | Frigobar e loja legalizados no AURA |
| **4 — Automação** | Emitir no encerramento da conta, regras por origem (OTA × direto), nota de antecipação | Só depois que o manual estiver provado |

A fase 1 é a que muda a vida da recepção. As fases 0 e 1 juntas são o mínimo
para parar de redigitar no HMAX **para hospedagem**; a NFC-e (fase 3) é o que
libera o frigobar.

### A emissão é o gargalo de tudo, não só do fiscal

Descoberto no levantamento de 26/08: o **estacionamento** é lançado no HMAX não
porque falta tela no AURA, mas porque **a nota sai de lá**. O mesmo valeria para
qualquer venda nova. Enquanto a emissão morar no HMAX, toda venda tem que existir
no HMAX — e qualquer módulo que o AURA construa antes disso duplica digitação em
vez de eliminá-la.

Isso reordena as prioridades do projeto: **o fiscal não é o último módulo, é o
que destrava os outros.**

### O estacionamento é o piloto ideal — e ele é NFS-e

Correção de 26/08: **estacionamento é serviço, não mercadoria**. Ele não espera a
NFC-e da fase 3 — sai já na **fase 1**, junto com a NFS-e de hospedagem. Isso
antecipa em duas fases o momento em que o AURA emite o primeiro documento de
verdade, e faz do estacionamento a estreia natural:

- **Venda pequena e repetitiva** — muitos documentos por dia, erra rápido e
  barato, aprende rápido.
- **Isolada da hospedagem** — se der problema, não afeta a conta do hóspede nem
  o check-out.
- **É serviço avulso**, sem as complicações de rateio, antecipação, uso de
  crédito ou OTA que a hospedagem carrega.
- **Some uma gambiarra junto** — a reserva-fantasma numa cabana qualquer deixa de
  existir no mesmo dia.

## Perguntas para a contabilidade

Estas mudam o desenho e **não são decisão de software** — precisam de resposta
antes da fase 1:

1. **Momento da NFC-e.** ~~Aberta.~~ **Resolvida na prática:** no HMAX a NFC-e
   já sai no encerramento da hospedagem, e é assim que a pousada opera hoje. O
   AURA mantém o mesmo comportamento — a nota de produto acompanha o
   fechamento da conta, não cada lançamento. Vale uma confirmação de rotina com
   a contabilidade, mas o precedente operacional existe e é o que define o
   desenho da fase 3.
2. **Reserva de OTA (`CanalCollect`).** Quando a Booking cobra do hóspede e
   repassa, o tomador da nota é o hóspede ou a OTA? E a comissão, entra como
   despesa ou desconto na nota?
3. **Antecipações e sinal.** O fólio já registra pagamentos antes da estadia.
   Emite nota de adiantamento ou só no fechamento?
4. **Consumo acessório.** Café da manhã extra, lavanderia e passeios: tudo dentro
   do item 9.01 ou cada um tem código de serviço próprio no município?
5. **Regime e alíquotas.** Confirmar regime atual, alíquota de ISS praticada e se
   há retenção na fonte para hóspede pessoa jurídica.
6. **Município.** Confirmar a prefeitura (para checar a cobertura do provedor) e
   se a inscrição municipal está ativa e liberada para NFS-e.

## Riscos

- **Nota errada tem multa.** Todo o payload fiscal precisa de validação da
  contabilidade antes de sair do sandbox. Sem exceção.
- **A janela da reforma.** Se a fase 1 atravessar outubro/2026, os campos de
  IBS/CBS já entram na conta — o provedor cobre o layout, mas a configuração
  (alíquotas, classificação) é nossa.
- **Dupla emissão.** Enquanto HMAX e AURA existirem juntos, é preciso um combinado
  claro de quem emite o quê, ou o hóspede recebe duas notas. Sugestão: virada
  por data de check-out, não por estadia.
- **Certificado vencendo.** A1 vale 1 ano. O vencimento precisa de alerta no
  AURA (mesmo padrão dos alertas de estoque), senão a emissão para sem aviso.

## O que já joga a favor

O AURA chega nesta obra com quase todo o dado pronto:

- **Hóspede completo** — FNRH exige CPF, endereço e código IBGE do município, que
  é exatamente o que a nota pede (`guests.address.ibgeCityId`).
- **Fólio consolidado** — itens com descrição, quantidade, valor e categoria, já
  separando `lodging` de consumo.
- **Encerramento da conta** — o momento fiscal natural já existe como ação.
- **Cofre de segredos** (`property_secrets`), **Blob** para XML/PDF, **fila de
  mensagens** para enviar ao hóspede e **auditoria** para o rastro de quem
  emitiu. Nada disso precisa ser inventado.

## Próximos passos

1. Confirmar município e cotar **PlugNotas** e **Focus NFe** (NFS-e + NFC-e,
   volume da pousada, sandbox).
2. Levar as seis perguntas acima à contabilidade.
3. Com as respostas, executar a **fase 0** — que já pode começar em paralelo,
   porque o cadastro fiscal e a tela de configuração não dependem do provedor
   escolhido.
