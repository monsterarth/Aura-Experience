# Banco de DEV e backups

Dois problemas, uma caixa de ferramentas:

1. **Migration não pode quebrar produção.** Existe um segundo projeto Supabase (DEV) que é
   uma cópia do de produção. SQL novo roda lá primeiro, com dados reais, e só depois em
   produção.
2. **O plano free do Supabase não faz backup nenhum.** O painel diz textualmente
   *"Free Plan does not include project backups"*. O que existe de cópia do banco é o que
   estes scripts baixarem para o seu disco.

Tudo roda pelo Docker: o cliente Postgres (`pg_dump`, `psql`) vem de uma imagem, nada é
instalado no Windows.

## Os dois projetos

| | Produção | DEV |
|---|---|---|
| Projeto Supabase | `luihcsfvnfdshhqltjig` | `skzdaygdajxdozbrtbty` |
| Região | us-west-2 | us-east-1 |
| Usado por | app em produção (branch `main`) | `pnpm dev` local **e** deploy da branch `DEV` |

O DEV é um projeto free como o outro: **pausa depois de ~7 dias sem uso**. Se ele estiver
dormindo, abrir o painel do projeto já o acorda (leva ~2 minutos).

## Preparo (uma vez)

1. **`.env.db`** — conexões diretas ao Postgres, usadas só pelos scripts. Copie o modelo e
   preencha as senhas:

   ```bash
   cp .env.db.example .env.db
   ```

   As strings vêm do botão **Connect** de cada projeto, aba **Session pooler** (a
   "Direct connection" só atende IPv6). A senha não é visível depois de criada — se não
   souber, gere outra em *Settings → Database → Reset database password*. Resetar é seguro:
   o app fala com o Supabase por chave de API, não por conexão Postgres.

2. **Perfis de ambiente** — `.env.dev.local` e `.env.prod.local` guardam os dois conjuntos
   de chaves. Trocar entre eles:

   ```bash
   pnpm env:dev     # o pnpm dev local passa a usar o banco de DEV
   pnpm env:prod    # volta para produção
   pnpm env:qual    # mostra onde você está
   ```

   O `.env.local` anterior é copiado para `.env.local.bak` a cada troca.

3. **Conferir** — antes de qualquer coisa, veja se os dois bancos respondem:

   ```bash
   pnpm db:check
   ```

## Dia a dia

### Backup

```bash
pnpm db:backup                       # produção → backups/<data>-prod/
pnpm db:backup --label antes-do-x    # sufixo no nome, para achar depois
pnpm db:backup --keep 30             # quantas pastas manter (padrão: 14)
```

Cada backup é uma pasta com:

| Arquivo | Conteúdo |
|---|---|
| `public.dump` | schema + dados: tabelas, RLS, funções, triggers, sequências |
| `auth.dump` | dados de `auth.users` / `auth.identities` — é o que faz o login existir |
| `storage.dump` | as **linhas** do Storage (os binários ficam no Supabase) |
| `manifest.json` | data, versão do Postgres, extensões, tamanho e contagem por tabela |

O script recusa um dump vazio ou ilegível: um backup que não restaura é pior que nenhum,
porque dá sensação de segurança.

**Sobre o egress:** cada backup completo transfere ~60 MB do projeto de produção, e o free
tem 5 GB por ciclo. Semanal (~240 MB/mês) cabe folgado; diário (~1,8 GB/mês) não, com o
consumo atual já em 4,3 GB.

### Espelhar produção no DEV

```bash
pnpm db:mirror                  # tira um backup novo e reescreve o DEV com ele
pnpm db:mirror --with-storage   # traz também os registros de Storage
```

O DEV é apagado e reconstruído: schema, dados, RLS, extensões, publicação de realtime e os
usuários — **as mesmas senhas de produção funcionam no DEV**.

A lista de tabelas no **realtime** vem do manifest do backup, não do
`migrations/enable-realtime.sql` — aquele arquivo está defasado (lista 10 tabelas; produção
publica 34) e só é usado como plano B para backups antigos.

As **credenciais de integração não vêm junto**: ao final, `property_secrets` é zerado e
qualquer resquício de chave em `settings.whatsappConfig` é removido. Os dados são de
produção; as chaves de produção não têm por que existir num segundo projeto, com outra
service-role e outra superfície de acesso. Isso é independente do modo seguro — vale mesmo
se ele for desligado por engano. Para manter as chaves (raro, e só se você souber por quê):
`pnpm db:mirror --keep-secrets`.

### Rollback do DEV (o "test server")

Bagunçou o DEV testando? Reponha a partir de um backup que você já tem, sem tocar em
produção e sem gastar egress:

```bash
pnpm db:mirror --from-backup backups/2026-08-23_1435-prod
```

### Conferir se o espelho ficou fiel

```bash
pnpm db:diff            # estrutura + contagem de linhas
pnpm db:diff --schema   # só estrutura, sem contar linhas
```

Compara produção com o DEV e mostra só o que difere. **"Rodou sem erro" não é o mesmo que
"ficou igual"**: na primeira execução esta comparação achou duas falhas que os avisos do
`pg_restore` não deixaram claras — 188 funções de extensão faltando e a constraint
`stays_no_overlap` (a que impede duas estadias na mesma cabana) ausente. As duas vinham do
mesmo erro: extensões criadas *antes* do `drop schema public cascade`, que levava junto o
que morava em `public`. Por isso a ordem hoje é limpar → criar extensões → restaurar.

Diferença de **linhas** é normal (produção segue viva, e você mexe no DEV). O que não pode
divergir é **estrutura**. Objeto "a mais" no DEV também costuma ser inofensivo — o projeto
mais novo vem com `pg_graphql`, por exemplo.

### Migration nova

```bash
pnpm db:sql migrations/nova_coisa.sql                  # aplica no DEV (padrão)
# ... testa o app apontando para o DEV ...
pnpm db:sql migrations/nova_coisa.sql --target prod    # pede confirmação digitada
```

Tudo roda dentro de **uma transação**: se um comando falhar, nada fica pela metade — ao
contrário de colar no SQL Editor, onde um erro no meio deixa o schema num estado que
ninguém sabe descrever. Para `CREATE INDEX CONCURRENTLY` e afins, use `--no-atomic`.

### Restaurar (o dia ruim)

```bash
pnpm db:restore --from backups/2026-08-23_1435-prod --target prod
```

Pede que você digite `RESTAURAR <ref-do-projeto>` e, antes de sobrescrever, tira um backup
do estado atual — restaurar a cópia errada é um jeito conhecido de transformar um problema
em dois.

## Modo seguro (`src/lib/safe-mode.ts`)

O espelho traz os dados reais **e** as integrações reais: dentro de
`properties.settings.whatsappConfig` estão a URL e a instância da Evolution de produção.
Zerar variáveis de ambiente não resolveria, porque essa configuração vem do banco. Por
isso o corte é no código.

A regra é **fail-closed**: só o banco de produção libera envio. Qualquer outro banco →
todo envio externo vira log com o prefixo `[SAFE-MODE]`.

| Saída | Comportamento fora de produção |
|---|---|
| WhatsApp (`send-now`, `chat/send`, fila do cron) | mensagem marcada como enviada, conteúdo no log |
| Consulta de número na Evolution | responde "existe" sem consultar |
| Web Push | log, sem notificação no celular de ninguém |
| Chatwoot | sync suprimido (não cria contato nem conversa reais) |
| Restart da Evolution via Coolify | bloqueado (as envs do Coolify são as mesmas em todo ambiente) |

Duas escotilhas, via env:

- `AURA_SAFE_MODE=true` — força o modo seguro mesmo com o banco de produção. Útil para
  rodar local contra produção sem risco de disparar mensagem.
- `AURA_SAFE_MODE=false` — libera envio; só faz sentido em produção.

> Se um dia produção mudar de projeto Supabase, atualize `PROD_PROJECT_REF` em
> `src/lib/safe-mode.ts` — é ele que define o que é "produção" para esse corte.

### Por que a configuração de integração mora no banco

Pergunta que sempre volta: por que `apiUrl`/`instanceName`/inbox do Chatwoot não são
variáveis de ambiente? Porque **variam por propriedade** — cada uma tem sua instância da
Evolution e seu inbox — e o admin as edita pela tela de Configurações → Integrações. Env é
uma só para o processo inteiro e não é editável em runtime.

A divisão é deliberada, e a parte secreta foi endurecida em agosto/2026 depois que uma
sondagem achou as chaves legíveis pela chave anon:

| O quê | Onde | Por quê |
|---|---|---|
| `apiUrl`, `instanceName`, `chatwootUrl/accountId/inboxId` | `properties.settings` | não é segredo, varia por propriedade, o navegador lê |
| `evolutionApiKey`, `chatwootApiToken` | `property_secrets` | RLS ligada sem policies + REVOKE de anon/authenticated: só service-role |
| `COOLIFY_*` | env | infra compartilhada, não varia por propriedade |

Trocar isso por env não protegeria o que importa: **o destinatário sai dos dados**, não da
configuração. Um DEV com Evolution de teste continuaria mandando mensagem para o telefone
real do hóspede que veio no espelho. Daí o modo seguro ser necessário de qualquer forma.

## O que os backups **não** cobrem

- **Arquivos do Storage** (os binários). Uploads do app vão para o Vercel Blob, que tem o
  próprio armazenamento; o Storage do Supabase guarda ~28 MB de resíduo.
- **Configuração do projeto** no painel: chaves de API, provedores de auth, templates de
  e-mail, segredos. Restaurar recria o banco, não o projeto.
- **Crons da Vercel**, que rodam só no deploy de produção — a branch `DEV` não dispara
  automação sozinha.
