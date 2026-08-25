# Integração Altamare — plano

> Status: **plano em construção**. Escrito em 25/08/2026.
>
> Decisões com o usuário: **o AURA expõe a API e o parceiro consome** · o AURA é
> fonte da verdade de **data e espaço** · **preço de negociação não cruza** · relação tratada
> como mesmo grupo (espaço da Fazenda, gestão do restaurante terceirizada), com o
> compartilhamento declarado na política de privacidade.
>
>
> Também decidido: a pousada **não toca em pagamento do restaurante** (eles cobram
> direto do hóspede) · o **consumo do hóspede volta com valor** para enriquecer o
> CRM · o restaurante passa a enxergar os **hóspedes do dia** · **avaliações ficam
> fora** do escopo por ora.
>
> Em aberto: a regra de cascata entre as duas vendas (ver seção própria).

## O problema

Um casamento no Altamare é **uma festa vendida em duas partes**:

- **Espaço** — vendido pelo Allan, coordenador de eventos, cujo pipeline já vive
  no AURA (`/admin/comercial/casamentos`, entidade `Wedding` com estágios,
  parcelas e site dos noivos).
- **Gastronomia** — vendida pelo restaurante, num sistema próprio que eles
  acabaram de construir.

A proposta inicial deles era colocar o Allan para trabalhar dentro da plataforma
do restaurante. Isso seria retrabalho puro: ele passaria a manter o mesmo funil em
dois lugares, e o AURA — que já é a ferramenta dele — viraria cópia
desatualizada. A integração resolve o mesmo problema pelo outro lado: **cada
equipe fica na sua ferramenta e os sistemas conversam**.

## Princípios

1. **O espaço é da Fazenda.** O AURA é fonte da verdade de data, espaço e
   exclusividade. O restaurante consulta antes de vender.
2. **Preço de negociação não cruza; consumo de cliente sim.** São coisas
   diferentes e a distinção é o coração do desenho:
   - **Não cruza** — quanto o Allan cobrou pelo espaço, quanto o restaurante
     cobrou pela gastronomia, parcelas, margem. É a informação comercial de cada
     empresa, e é o que torna a ponte aceitável entre gestões diferentes.
   - **Cruza** — quanto *o hóspede* gastou no restaurante. Isso é dado do
     cliente, não da negociação entre as empresas, e é justamente o que enriquece
     o CRM: saber que alguém janta bem lá muda como ele é tratado e cotado.
3. **O AURA expõe, o parceiro consome.** Token por parceiro, escopo restrito,
   auditoria de tudo. Como eles ainda não têm API, definimos o contrato — o que
   também deixa a porta pronta para outros parceiros no futuro.
4. **Gestão terceirizada é gestão que muda.** O acesso precisa ser revogável num
   clique, com escopo mínimo, sem depender de boa vontade.

## O evento como entidade compartilhada

Cada lado tem seu registro; a ponte é um id canônico, gerado pelo AURA (dono do
espaço), que os dois referenciam — mesmo padrão que já usamos com o HUnit
(`externalId` na estadia).

```
        AURA (espaço)                        Altamare (gastronomia)
   Wedding / Event  ──── partnerRef ────►  negociação/evento deles
        (canônico)      ◄─── externalId ───
```

`Wedding` e `Event` ganham `partnerRef` (id do lado deles) e `partnerStage`
(estágio da gastronomia, texto vindo do parceiro) — o suficiente para o card do
casamento mostrar "Gastronomia: proposta enviada" sem que o AURA precise
entender o funil interno do restaurante.

## API de parceiro (contrato proposto)

Base `/api/partner/*`, autenticação `Authorization: Bearer <token>`, token no
cofre `property_secrets`, escopos por parceiro:

| Método | Rota | Para quê |
|---|---|---|
| `GET` | `/availability?from&to` | Datas comprometidas e exclusividades — **sem valores** |
| `GET` | `/events?from&to` | Agenda: eventos e casamentos, dados operacionais |
| `POST` | `/events` | Eles criam evento do restaurante (público ou fechado) |
| `PATCH` | `/events/{id}` | Atualizar ou cancelar **o próprio** evento |
| `GET` | `/pipeline?from&to` | Negociações de espaço: estágio, data, convidados, cliente |
| `POST` | `/pipeline/{id}/stage` | Eles informam o estágio da gastronomia |
| `GET` | `/guests/today` | Hóspedes ativos: nome, cabana, período, aniversário, restrições |
| `POST` | `/consumption` | Eles reportam o consumo de um hóspede (com valor) |

**Webhooks do AURA para eles:** `event.created` · `event.updated` ·
`event.cancelled` · `wedding.created` · `wedding.stage_changed`.

Regras do contrato: `Idempotency-Key` em toda escrita (a rede falha e o retry não
pode duplicar festa), retry com backoff, e **cada parceiro só altera o que
criou** — o escopo é verificado na rota, não confiado ao cliente.

## O que trafega — e o que não

| Campo | Vai? |
|---|---|
| Nome do casal / cliente, telefone, e-mail | ✅ |
| Data, horário, espaço, exclusividade | ✅ |
| Número de convidados | ✅ |
| Estágio da negociação (de cada lado) | ✅ |
| Observações operacionais (cardápio, montagem, restrições) | ✅ |
| Consumo do hóspede no restaurante, **com valor** | ✅ (deles para nós) |
| Hóspedes do dia: nome, cabana, período, aniversário, restrições | ✅ (nossos para eles) |
| **Valor do contrato, parcelas, tarifas, comissões** | ❌ |
| Avaliações do restaurante | ❌ (fora de escopo por ora) |
| Dados de hóspedes sem relação com evento ou visita | ❌ |

## Fluxos

1. **Nasce uma negociação de espaço.** Allan cria o casamento no AURA → webhook →
   o Altamare abre a negociação de gastronomia já vinculada, com casal, data e
   convidados preenchidos. Ninguém redigita.
2. **A gastronomia anda.** Eles atualizam o estágio → o card do casamento no AURA
   mostra em que pé está a outra metade da venda.
3. **Evento do restaurante.** Eles criam no sistema deles → entra na agenda do
   AURA. Se for **público**, aparece para o hóspede no portal; se for **fechado**,
   fica só na agenda interna, bloqueando a data.
4. **Casamento confirmado com exclusividade.** O AURA bloqueia a data e o parceiro
   enxerga o bloqueio antes de vender qualquer coisa naquele fim de semana.
5. **Cancelamento de qualquer lado** notifica o outro (ver cascata abaixo).

## Em aberto: a cascata

Quando uma das duas vendas cai, o que acontece com a outra? Ainda a estruturar
com o Allan e o restaurante. A proposta que faz mais sentido operacionalmente:

- **Espaço perdido → encerra os dois.** Sem espaço não existe festa; manter a
  negociação de gastronomia viva seria só ilusão no funil deles.
- **Gastronomia perdida → alerta, evento segue.** O casamento continua de pé; a
  pousada precisa saber para reagir, não para cancelar.

Ficam junto desta decisão: se evento público do parceiro entra direto no portal
ou precisa de aprovação nossa, e como o restaurante enxerga os fins de semana de
casamento (hoje a exclusividade bloqueia a propriedade inteira).

## O retorno: consumo alimentando o CRM

Este é o lado da ponte que vale mais do que parece. Hoje o AURA sabe tudo sobre o
hóspede dentro da pousada e **nada** sobre o que ele faz no restaurante que está
dentro da propriedade. Com `POST /consumption`, cada visita vira histórico no
perfil: quanto gastou, o que consumiu, quando.

O que isso destrava, sem nenhum esforço extra da equipe:

- **Cotação com contexto** — quem janta bem lá é cliente de ticket alto, e o
  comercial passa a saber disso na hora de negociar.
- **Reconhecimento** — "na última vez o senhor pediu aquele Malbec" é o tipo de
  detalhe que fideliza e que hoje se perde.
- **Valor real do hóspede** — a receita da estadia deixa de ser a única medida.

Fica em `guests` (ou tabela satélite `guest_consumption`), com origem marcada
como parceiro — nunca misturado com o fólio, porque **não é dinheiro nosso**.

## Hóspedes do dia: o outro sentido

Com `GET /guests/today` o restaurante passa a saber quem está hospedado — nome,
cabana, período, aniversário e restrições alimentares. Serve para reconhecer quem
chega, lançar o consumo na pessoa certa e evitar o constrangimento de servir o que
alguém não pode comer.

**Cuidado explícito:** restrição alimentar é dado de saúde, categoria sensível na
LGPD. Justifica-se pela execução do serviço, mas exige menção clara na política de
privacidade e escopo próprio no token — não vai junto por descuido, vai porque foi
decidido.

## Fase futura: pedidos do restaurante pelo portal

O hóspede pede do restaurante pelo **portal**. Com a decisão de que a pousada
**não toca no pagamento**, isto ficou simples: o portal mostra o cardápio, o
hóspede pede, o pedido cai no sistema deles e **a cobrança acontece lá** — nada
entra no fólio, nada é repassado. O AURA é o canal, não o caixa.

O que ainda precisa ser combinado é operacional, não financeiro: cardápio
espelhado ou consultado em tempo real, horários de atendimento, e quem leva o
pedido (mensageiro da pousada ou entregador do restaurante).

## Fases

| Fase | Escopo |
|---|---|
| **0 — Fundação** | Cadastro de parceiro, token no cofre, escopos, sandbox e a doc do contrato para o dev deles |
| **1 — Agenda (leitura)** | Eles consultam `availability` e `events` — para de vender data comprometida |
| **2 — Eventos deles no AURA** | `POST /events` popula a agenda; público aparece no portal do hóspede |
| **3 — Pipeline cruzado** | Estágio da gastronomia no card do casamento e vice-versa; webhooks |
| **4 — Consumo no CRM** | `POST /consumption` e `GET /guests/today`: eles reconhecem o hóspede, nós ganhamos o histórico |
| **5 — Pedidos pelo portal** | Cardápio no portal e roteamento do pedido — sem dinheiro nosso no meio |

A fase 1 já mata o pior risco (vender data ocupada) e é a mais barata. A fase 3 é
a que elimina o retrabalho que originou a conversa.

## Riscos

- **Time pequeno do outro lado.** O contrato precisa ser simples e tolerante:
  poucos endpoints, payload pequeno, erro claro. Integração que exige muito do
  parceiro não sobrevive à primeira troca de desenvolvedor.
- **Gestão terceirizada muda de mãos.** Token revogável e escopo mínimo não são
  formalidade — são o que permite trocar de gestor sem trocar de sistema.
- **Dado pessoal saindo da nossa base.** Minimização (só o do evento) e a
  declaração na política de privacidade, como já foi decidido.
- **Sem preço de negociação cruzando**, relatório financeiro conjunto continua
  manual. É o custo consciente da regra 2 — e vale a pena.
- **Dado sensível no pacote de hóspedes do dia** (restrição alimentar): escopo
  próprio, política atualizada e revisão periódica de quem tem o token.
