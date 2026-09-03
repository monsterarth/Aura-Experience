# Política Pet — plano

> Status: **fatias 2 e 3 no DEV** (03/09/2026). Escrito em 02/09/2026.
>
> Decisões com o usuário (02/09): o limite conta **cabeça**, não peso · a solução
> começa **fora do sistema** — a política precisa de rigor antes de a tela ganhar
> trava · nasce uma **segunda política (PET EXCEÇÃO)**, mais dura, que o hóspede
> de exceção assina no lugar da base · o peso deixa de bloquear e vira pedido,
> **até um teto absoluto configurável** · o aceite acontece **no pedido**, ciente
> de que pode ser recusado · os critérios (alta temporada, exceção concorrente)
> **informam, não decidem** · a **recepção** resolve, com campo livre para "quem
> autorizou" · aprovou, **lança no fólio** · **a multa por pet não informado sai**
> — no lugar dela, recusa de entrada **sem reembolso da hospedagem**.
>
> Corrigido em 03/09: a taxa de pet **é** cobrada — no HMAX, que segue sendo a
> fonte da verdade do fólio. O que nunca foi aplicado são as multas e a recusa,
> por não querer gerar confronto, desconforto ou avaliação de retaliação.

## Por que agora

Um hóspede declarou 2 pets no pré-check-in e a pousada teria que recusar — mas o
sistema não recusa, não avisa e não pergunta. Ele registra e segue.

Isso não é um defeito do formulário. O formulário faz exatamente o que foi
desenhado para fazer, e por um bom motivo: **melhor o hóspede informar dois pets
do que aparecer com dois na portaria**. O comentário em `src/lib/pets.ts` diz
isso com todas as letras, e ele está certo.

O buraco é o outro lado. O formulário promete, em três idiomas, que *"a recepção
confirma a possibilidade antes da sua chegada"*
(`src/app/check-in/form/[stayId]/page.tsx:88`) — e essa promessa **não tem dono
no sistema**: nenhuma notificação, nenhuma pendência, nenhum prazo, nenhum lugar
para registrar a decisão.

## O que a produção mostra (medido em 02/09/2026)

| Medida | Número |
|---|---|
| Estadias na base | 473 |
| Com pet | 38 |
| Com **2 pets** | **2** |
| Com algum pet acima de 15 kg | 2 |
| Cotações nos últimos 12 meses | 97 |
| Cotações **com pet declarado** | **0** |

As duas estadias de 2 pets:

| Estadia | Check-in | Pets | Peso somado |
|---|---|---|---|
| Mel + Bud (Spitz) | 01/09/2026 — `active` | 2 | 9 kg |
| Pipo + Anne (Chihuahua) | 04/09/2026 — `pre_checkin_done` | 2 | 8 kg |

Três leituras que mudam o desenho:

1. **A do Mel + Bud é a prova do buraco.** O sistema soube dos 2 pets desde o
   pré-check-in, mostrou a pílula "Acima do limite (1)" numa tela que ninguém
   abriu, e o hóspede chegou com os dois. Ninguém foi chamado para decidir.
2. **Os dois pares pesam menos que um pet único permitido** (9 kg e 8 kg contra
   15 kg). A régua atual conta cabeça; foi confirmado que é assim que deve
   continuar — mas vale saber que os casos reais não são os casos temidos.
3. **A taxa de pet é cobrada, mas o AURA não sabe disso.** `settings.petFee`
   (R$ 50/pet/noite) só é calculada no motor de orçamento
   (`src/lib/rate-engine.ts:122`), e zero das 97 cotações do ano declarou pet —
   os 38 pets apareceram todos no pré-check-in, depois da cotação fechada. Nada
   no fólio do AURA cobra pet. **A cobrança acontece no HMAX**, que segue sendo a
   fonte da verdade financeira (`docs/FINANCE.md`). O que falta aqui é registro,
   não dinheiro.

O que de fato nunca foi aplicado são **as multas previstas na política** — a de
pet não informado à frente de todas — e a recusa de entrada. Não por falha de
mecanismo: por não querer gerar confronto, desconforto ou avaliação de retaliação.
É esse o buraco que a política nova fecha, e ele se fecha com texto, não com
código.

## O que já existe

| Peça | Onde | Estado |
|---|---|---|
| Lista de pets (múltiplos) | `src/lib/pets.ts` — `readPets`/`writePets` | Funciona; trio `pets`/`hasPet`/`petDetails` coerente |
| Limite declarado | `settings.maxPets` (padrão 1) | Só avisa |
| Faixa de peso | `settings.petMinWeight` / `petMaxWeight` | **Bloqueia** o pet no formulário |
| Trava anti-abuso | `PET_HARD_CAP = 5` | Funciona |
| Aviso de excedente ao hóspede | `petOverLimit`, PT/EN/ES | Funciona |
| Pílula "Acima do limite" | `StayDetailCards.tsx:293` | Só dentro do detalhe da estadia |
| Taxa base | `settings.petFee` → `rate-engine.ts:122` | Só na cotação; a cobrança real é no HMAX |
| Aceite da política pet | checkbox `agreedPet` | **Não é gravado** — só destrava o botão |

## Os três buracos

1. **A promessa sem dono.** Declarar acima do limite não gera pendência,
   notificação, prazo nem registro de decisão.
2. **A política errada assinada.** Quem traz 2 pets aceita hoje a política base
   — o texto que diz que só pode 1. O documento contradiz a situação que ele
   está autorizando.
3. **O aceite que não existe.** O checkbox da política pet não é persistido —
   ele só destrava o botão. Não há registro de que o hóspede concordou com coisa
   alguma, o que é justamente o que sustentaria uma recusa de entrada ou uma
   cobrança contestada.

E, por trás dos três, o buraco que não é do sistema: **a política nunca foi
aplicada**. Nem a multa, nem a recusa. O texto existe, ninguém tem estômago para
executá-lo, e o hóspede aprende — corretamente — que a política é decorativa.

## O modelo

### Três faixas, não duas

| Faixa | Exemplo | O que acontece |
|---|---|---|
| **Dentro da política base** | 1 pet, 6 kg | Segue como hoje. Taxa base no fólio. |
| **Exceção** | 2 pets · 1 pet de 20 kg | O hóspede informa, aceita a POLÍTICA PET EXCEÇÃO e a tela diz que **está em análise**. Recepção decide. |
| **Acima do teto absoluto** | 1 pet de 45 kg · 4 pets | O formulário recusa: nem adianta pedir. Único bloqueio que sobra. |

O teto absoluto é configurável, como os limites da base. É ele que impede
"exceção" de virar fila infinita de são-bernardos — e é a razão de o peso poder
deixar de bloquear na faixa intermediária. Hoje o bloqueio duro em 15 kg **ensina
o hóspede a mentir o peso**, que é o mesmo bug de origem da permissividade.

### As duas políticas

- **POLÍTICA PET (base)** — revisada, com a cláusula da direção: a Pousada
  reserva-se o direito de não aceitar animal cuja presença não tenha sido
  informada no pré-check-in. Não é ameaça de multa: é recusa.
- **POLÍTICA PET EXCEÇÃO** — nova. Mais dura, com taxa própria, regras próprias e
  os critérios de análise declarados ao hóspede antes de ele pedir.

Os dois textos oficiais chegaram em 03/09 — ver "Os textos oficiais" no fim deste
documento, com o que confere, o que o texto promete que o sistema não faz e o que
precisa ser reconciliado. **A fatia 0 é fechar esses pontos**, não escrever os
textos.

### O pedido de exceção

Estado que vive na estadia:

```ts
petException?: {
  status: 'pending' | 'approved' | 'refused';
  requestedAt: Timestamp;       // quando o hóspede pediu
  policyAcceptedAt: Timestamp;  // o aceite que autoriza a taxa
  decidedAt?: Timestamp;
  decidedBy?: string;           // staff logado que registrou
  authorizedBy?: string;        // texto livre: quem mandou ("Dona Rê", "Arthur")
  note?: string;
  feeItemId?: string;           // item do fólio gerado na aprovação
}
```

A direção não opera a plataforma — ela manda fazer. Por isso a decisão é da
recepção, e o campo `authorizedBy` é livre: registra **quem mandou** ao lado de
**quem digitou** e **quando**. É o registro que hoje não existe em lugar nenhum.

### Os critérios informam, não decidem

Quando a recepção abre a pendência, ela vê:

- **"Período de alta — a política prevê recusa"** quando as datas caem na janela
  configurada (padrão 15/12 a 15/03).
- **"Já há exceção aprovada nestas datas: estadia X"** por sobreposição de datas
  de estadia.

Nenhum dos dois recusa sozinho. A direção segue podendo liberar — e a liberação
contra o critério fica registrada com nome, que é exatamente o que falta hoje.

### O alerta

- O ícone de pet na lista de estadias e nas chegadas **fica vermelho** quando há
  exceção pendente (hoje é sempre laranja).
- Notificação no sino para o cargo `reception` e item no card de Alertas do
  painel (`useReceptionLive.ts:174` já tem a estrutura).
- **Nada é enviado ao hóspede automaticamente.** O contato é por fora; o sistema
  só registra a decisão. Recusar pet é conversa delicada demais para texto de robô.

### Sem resposta até a chegada

A pendência **continua viva** e aparece na chegada do dia. Nada é decidido à
revelia — nem a favor, nem contra.

### O dinheiro

Configuração por propriedade, nas duas políticas separadamente:

| Chave | O quê |
|---|---|
| `petFee` (existe) | valor da taxa base |
| `petFeeMode` (nova) | `per_pet_night` (= hoje) · `per_pet_stay` · `flat` |
| `petExceptionFee` (nova) | valor da taxa de exceção |
| `petExceptionFeeMode` (nova) | mesmas três formas |

`petFeeMode` com padrão `per_pet_night` mantém o motor de orçamento calculando
exatamente o que calcula hoje — a mudança não mexe em cotação nenhuma já emitida.

Dois lançamentos no fólio:

- **Taxa base** — calculada quando o pet é declarado no pré-check-in, para o
  valor deixar de depender de alguém lembrar. Hoje ela é cobrada no HMAX.
- **Taxa de exceção** — na aprovação. O hóspede já aceitou a política de exceção
  no momento do pedido, então **ninguém precisa ter a conversa**: o valor já está
  definido quando ele chega. É a ordem dos passos que torna isso legítimo — se o
  aceite fosse depois da aprovação, o lançamento automático não teria base.

> **Atenção à fonte da verdade.** O fólio financeiro ainda é o HMAX
> (`docs/FINANCE.md`) e a virada é por data de corte, com período de lançamento
> duplo. Lançar a taxa no fólio do AURA **hoje** cria cobrança em dois lugares.
> Enquanto a virada não acontece, a fatia 4 entrega o valor **calculado e
> visível** na estadia (para a recepção lançar no HMAX sem recalcular na mão), e
> só vira lançamento de verdade no fólio do AURA junto com a virada do
> financeiro. Esta ressalva corrige o escopo combinado em 02/09, que partia da
> premissa errada de que a taxa nunca era cobrada.

Idempotência importa: `feeItemId` guarda o item gerado, para reaprovar ou editar
a estadia não duplicar cobrança.

## Onde encosta no código

| Arquivo | O quê |
|---|---|
| `src/lib/pets.ts` | classificação das três faixas (`classifyPets`) — ponto único |
| `src/types/aura.ts` | `petException` na `Stay`; chaves novas em `settings` |
| `src/app/check-in/form/[stayId]/page.tsx` | faixas, tela "em análise", aceite da política certa, persistência do aceite |
| `src/app/api/guest/precheckin/route.ts` | grava `petException` + aceite; lança a taxa base |
| `src/app/admin/configuracoes/politicas/page.tsx` | texto da política de exceção (PT/EN/ES) |
| `src/app/admin/configuracoes/operacao/page.tsx` | tetos, taxas, modos, janela de alta |
| `src/app/admin/stays/[stayId]/_components/` | painel da decisão (aprovar/recusar + quem autorizou) |
| `src/app/admin/stays/_components/StayCard.tsx` · `StayListView.tsx` | ícone vermelho |
| `src/app/admin/reception/_components/useReceptionLive.ts` | item no card de Alertas |
| `src/lib/notifications.ts` | roteamento da notificação nova |
| `src/lib/rate-engine.ts` | respeitar `petFeeMode` |
| `migrations/` | backfill explícito das chaves novas |

## As fatias

**Fatia 0 — os textos (bloqueante).** Política base revisada + POLÍTICA PET
EXCEÇÃO, aprovadas pela direção. Sem isso o resto não tem o que exibir.

**Fatia 2 — o pedido. FEITA NO DEV em 03/09** (`migrations/pet_exception_phase1.sql`).
`classifyPets` em `src/lib/pets.ts`; o formulário com três faixas; a tela de "em
análise" com os motivos; o aceite da política certa **gravado**. As chaves de
configuração nasceram aqui, com quem as aplica — a fatia 1 original (criar chaves
sem applier) violava a regra 4 da seção 1 de `docs/MODULARIZATION.md` e foi
absorvida.

Verificado: 16 casos de `classifyPets` (dentro/exceção/bloqueado, com e sem teto,
com e sem exceção habilitada); pedido forjado com `status: 'approved'` e
`authorizedBy: 'Dona Rê'` **rebaixado a `pending`** pelo servidor; e recusa já
registrada **sobrevive** ao reenvio do formulário. Backfill conferido: 2
propriedades com `acceptsPets` receberam as chaves, a terceira não.

**Fatia 3 — a decisão. FEITA NO DEV em 03/09.** Ícone de pet **vermelho** na lista
e nos cartões quando há pedido pendente; filtro "Pet — exceção pendente"; contagem
no sino; item no card de Alertas da recepção (primeiro da lista, com "chega em N
dias"); painel de aprovar/recusar no detalhe da estadia, com `authorizedBy` livre;
e os dois avisos de critério interno (janela de alta e exceção com datas
sobrepostas) vindos de `GET /api/admin/stays/[id]/pet-exception`.

Duas escolhas que valem registro:

- **Sem canal de realtime em `stays` no sino.** A tabela muda o tempo todo (fólio,
  status, faxina) e cada evento custaria as 7 contagens do `fetchAll`. Exceção
  aparece poucas vezes por mês e tem dias de prazo — a contagem se atualiza no
  próximo `fetchAll`, que os outros canais disparam com sobra. O egresso do plano
  free já estourou uma vez por tráfego de realtime.
- **A janela de alta é configurável e INTERNA** (`petExceptionBlackout`, padrão
  15/12–15/03). Ela informa quem decide e nunca aparece no texto do hóspede — o
  texto público diz "ocupação do período" e "decisão discricionária", de propósito.

Verificado: 19 casos de `touchesBlackout`, incluindo a virada do ano (o caso que
quebra: comparar "12-20" com "03-15" como texto dá falso sempre) e as estadias que
atravessam a borda nos dois sentidos. O filtro do sino foi testado pelo caminho
real do PostgREST (devolveu a contagem certa), e o índice parcial provou-se
alcançável com `force_generic_plan` + `PREPARE` — `Index Cond: (("petException" ->>
'status') = $1)`, sem repetir a armadilha do índice que o PostgREST nunca alcançou.

**Não verificado:** as telas em si. Ver o painel exige login de staff, e eu não
entro com senha de ninguém. Ficaram dois pedidos pendentes semeados no DEV para
quem for olhar (um em setembro, fora da alta; outro em 14/01/2027, dentro dela).

**Fatia 4 — o dinheiro.** `petFeeMode`, taxa base e taxa de exceção **calculadas
e visíveis** na estadia; lançamento no fólio do AURA só junto com a virada do
financeiro (ver a ressalva acima). Idempotência por `feeItemId`.

As fatias 1–3 podem subir sem a 4: a decisão registrada já vale sozinha. A 4 sem
a 2 não existe — sem aceite gravado não há base para cobrar.

## O que ficou de fora, de propósito

- **Bloquear o pré-check-in por quantidade.** Continua sendo o bug original:
  hóspede que não consegue informar o segundo pet chega com ele mesmo assim.
- **Multa por pet não informado.** Retirada por decisão de 02/09: parar de
  ameaçar uma multa que ninguém tem coragem de cobrar, e trocar por dureza maior
  — se trouxer sem informar, não entra, e não há reembolso da hospedagem paga.
  Ameaça que não se cumpre ensina que a política é decorativa.
- **Mensagem automática ao hóspede** no desfecho.
- **Remover o pet excedente da ficha** ao recusar. Apagar o registro é apagar
  justamente a informação que o modelo inteiro existe para capturar.
- **Recusa automática na alta temporada.** Tiraria da direção a possibilidade de
  liberar, que hoje é usada várias vezes por mês.
- **Limite por cabana.** A regra é da pousada, não da acomodação.
- **Cobrança retroativa** dos 38 pets do último ano.

## Regras da casa que se aplicam (docs/MODULARIZATION.md §1)

- Chave só nasce na fatia que a aplica — nada de `petExceptionFee` na fatia 1 se
  quem cobra é a 4.
- Chave nova vem com **migration de backfill explícito**.
- `acceptsPetExceptions` (bool, padrão herdado de `acceptsPets`) permite a uma
  propriedade não ter exceção nenhuma sem depender de texto vazio.

## Os dois casos abertos agora (operacional, não código)

- **Mel + Bud** — já hospedados desde 01/09. Nada a decidir; serve de marco zero.
- **Pipo + Anne** — chega **04/09**, dois chihuahuas, 8 kg somados, `status
  pre_checkin_done`. **Esta precisa de decisão humana esta semana**, antes de
  qualquer linha de código deste plano existir.

---

## Os textos oficiais (recebidos em 03/09/2026)

Os rascunhos que eu havia escrito foram substituídos pelos textos da pousada, que
são mais completos:

- `POLÍTICA PET base 2026.pdf` — 12 itens
- `POLÍTICA PET EXCEÇÃO 2026.pdf` — 6 itens + **TERMO DE AUTORIZAÇÃO** para
  assinatura

Ambos em `RECEPÇÃO/DOCUMENTOS RESERVAS/` no OneDrive. Eles trazem coisas que o
plano não previa e que precisam entrar: enxoval e tapetes (base, item 6), janela
de limpeza condicionada à ausência do pet, danos com **diárias perdidas e custo de
realocação** (base, item 10), check-out antecipado (base, item 11), e o termo
assinado da exceção.

### O que confere

- **R$ 50,00 por animal/diária** bate exatamente com `rate_settings.petFee` em
  produção (a taxa vive em `rate_settings`, não em `properties.settings`).
- **"1 animal por cabana"** bate com o limite por estadia do AURA: reserva de
  grupo é desmembrada em uma estadia por cabana.
- **Espécie** — `PetDetails.species` já é `Cachorro | Gato | Outro`, então
  "espécie diversa das habitualmente recebidas" mapeia direto: `Outro` sempre cai
  na exceção.

### O que o texto promete e o sistema não faz — resolvido em 03/09

| # | Onde | Promessa | Decisão |
|---|---|---|---|
| 1 | base, item 2 | confirmação por e-mail autoriza a entrada | **O AURA não envia e-mail** (nenhuma infra). Vai ser construído — serve também recuperação de senha do staff, pré-check-in de quem não tem WhatsApp e propriedade sem o módulo da API. O texto muda para exigir autorização expressa **só na exceção**; dentro da base, a autorização é implícita |
| 2 | base, item 6 | agendar horário da limpeza no portal | Hoje só existe Não Perturbe. Vai ser construído, **primeiro só para hospedagem com pet**, depois para todos |
| 3 | base, item 11 | check-out às 11h00 | Confirmado: estadia com pet sai **1 h antes** para a higienização. O padrão segue 12h. Vira requisito de check-out específico da estadia com pet |
| 4 | exceção | sem teto declarado | Fica sem teto no texto por decisão. No sistema o teto é **opcional** (`petExceptionMaxPets`/`petExceptionMaxWeight` nulos = analisa tudo) |
| 5 | ambos | "em até 24 horas" e nada de análise na chegada | Mantido de propósito: **é proteção**. Sem confirmação da pousada não há autorização — corta o "quem cala consente" |

### Ajustes que a direção vai fazer nos textos

- **Base, item 1** — nomear **cães e gatos**, dando âncora à "espécie diversa" da exceção.
- **Base, item 8** — passa a remeter ao item 4 (sem reembolso), fechando a única consequência sem cláusula financeira.
- **Exceção, item 4** — focinheira passa a ser **obrigatória**, não "essencial".
- **Deixar o pet sozinho na acomodação: segue permitido**, por decisão — cada animal é diferente e proibir de saída é duro demais. **Atenção:** a política que está hoje no sistema (`settings.petPolicyText`, item 3.2) **proíbe** expressamente. Então isto é uma flexibilização consciente, não uma omissão do texto novo.

### Dois textos no sistema que também precisam mudar

Os PDFs não são os únicos lugares onde a política vive:

1. **`generalPolicyText`, seção "Pets"** repete a multa que está saindo: *"a omissão de informações sobre a presença de pets acarretará cobrança retroativa da taxa pet acrescida de multa de 50%"*. Tirar a multa só da política pet deixa a contradição viva no documento que **todo** hóspede aceita.
2. **`petPolicyText` (a política pet de hoje no sistema)** tem coisas que o texto de 2026 não tem: multa de **R$ 500,00 por regra infringida**, higienização de **R$ 600,00**, e a proibição de deixar o pet sozinho. Trocar o texto apaga essas três — as duas multas por decisão, a proibição também.

### O que muda no plano

- **Os critérios publicados são outros — e é de propósito.** O que está no texto
  do hóspede não é o que a recepção usa: internamente valem as regras combinadas
  (janela de alta e uma exceção por datas sobrepostas), e o texto público fica
  discricionário. Confirmado em 03/09.
- **O que os critérios publicados trouxeram de novo.** Saíram "uma exceção por período" e a janela
  15/12–15/03; entraram ocupação, duração, categoria da acomodação, temperamento e
  **histórico do tutor e do animal**, com "decisão discricionária e não precisa ser
  fundamentada". Confirmar se as duas regras internas seguem valendo — a fatia 3 ia
  exibi-las. O histórico é viável e novo: `guests.id` é o CPF, dá para mostrar as
  estadias anteriores com pet do mesmo hóspede no painel da decisão.
- **O silêncio deixou de cair no balcão.** O texto diz que não se analisa na
  chegada e que sem confirmação não há autorização. Prazo e escalada da pendência
  ficam para depois, por decisão de 03/09 — mas o desenho já assume que atrasar
  tem custo para o hóspede.
- **O AURA gera o termo já preenchido** (animal, datas, cabana, valor da taxa) para
  impressão — confirmado em 03/09. Só a assinatura é no papel. O aceite digital do
  pré-check-in é o aceite prévio; o termo é a formalização na chegada.
- **Caução / pré-autorização** aparece no termo e nunca foi discutida. O AURA não
  tem esse conceito; segue manual/HMAX.
- **Check-out específico para estadia com pet** (11h) vira requisito, incluindo
  não oferecer late check-out a ela no portal.

## Escopo novo que saiu daqui (03/09)

Três coisas que não eram deste módulo e viraram trabalho por causa dele:

- **Envio de e-mail.** O AURA não tem nenhuma infra de e-mail. Serve muito além do
  pet: recuperação de senha do staff, pré-check-in para quem não tem WhatsApp e
  propriedade sem o módulo da API do WhatsApp.
- **Agendamento do horário da limpeza** no portal. Hoje só existe Não Perturbe
  (pausa por N horas). Nasce **só para hospedagem com pet** e depois abre para todos.
- **Check-out específico da estadia com pet** — 1 h antes do padrão, para a
  higienização especializada. Inclui não oferecer late check-out a ela no portal.
- **Termo de exceção preenchido pelo AURA** para impressão; só a assinatura é no papel.
