# Aura

Sistema de gestão hoteleira **multi-propriedade**: um único app Next.js que atende o
back-office administrativo, os apps mobile da equipe de campo (governança, camareira, garçom,
manutenção, etc.) e o portal do hóspede — tudo sobre um backend Supabase.

## Stack

Next.js 14 (App Router) · Supabase (Postgres + Auth + Realtime) · TypeScript · Tailwind CSS ·
Zustand · Sonner · Vercel Blob. Deploy na Vercel.

## Começando

```bash
pnpm install
cp .env.example .env.local   # preencha as variáveis (veja .env.example)
pnpm dev                     # http://localhost:3000
```

| Comando | O que faz |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção + checagem de tipos (não há testes — este é o principal guarda-redes) |
| `pnpm start` | Servidor de produção |
| `pnpm lint` | ESLint |

## Estrutura

```
src/
  app/
    admin/        # back-office (uma pasta por módulo)
    api/          # rotas de API (admin, guest, field, cron, push, ...)
    check-in/     # portal do hóspede (mobile, PT/EN/ES)
    governanta/ maid/ waiter/ houseman/ maintenance/ director/   # apps mobile por papel
    actions/      # server actions
  services/       # lógica de negócio (um arquivo por domínio)
  types/aura.ts   # tipos/entidades compartilhados
  lib/            # clients Supabase, auth de API, push, utilitários
  context/        # AuthContext, PropertyContext, NotificationContext
  components/     # componentes (admin, auth, guest, ui)
migrations/       # SQL aplicado manualmente no Supabase (ver migrations/README.md)
whatsapp-service/ # container standalone de WhatsApp
docs/             # documentação detalhada
```

## Documentação

- **[CLAUDE.md](CLAUDE.md)** — convenções, mapa do repositório e a receita "como adicionar um
  módulo". É a fonte canônica (e o que os agentes de IA leem primeiro).
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — visão geral, auth, multi-propriedade,
  realtime, notificações, uploads.
- **[docs/MODULES.md](docs/MODULES.md)** — catálogo de todos os módulos, apps e rotas de API.
- **[docs/DATABASE.md](docs/DATABASE.md)** — domínios, ERD e RLS do banco.
- **[docs/CRON.md](docs/CRON.md)** — runbook dos jobs agendados.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — setup, variáveis de ambiente, migrations.
- **[docs/REFACTORING.md](docs/REFACTORING.md)** — plano de quebra dos arquivos maiores.
