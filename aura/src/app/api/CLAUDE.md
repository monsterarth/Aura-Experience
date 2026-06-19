# API routes (`src/app/api/`)

Next.js route handlers (`route.ts`). Groups: `admin/`, `guest/` (public), `field/` (mobile),
`director/`, `cron/`, `push/`, plus messaging integrations (`webhook/`, `chatwoot/`, `chat/`,
`whatsapp/`), `ai/`, `upload/`, `media/`, `broadcast/`, `auth/`.

**Always validate the session server-side** (except intentionally public `guest/*` routes):

```ts
import { requireAuth, isAuthError } from '@/lib/api-auth';

const auth = await requireAuth(['admin', 'manager']);
if (isAuthError(auth)) return auth;
// auth.staff.role, auth.staff.propertyId
```

- Use `supabaseAdmin` (from `@/lib/supabase`) for reads that must bypass RLS; filter by
  `propertyId` explicitly. Use `createClientServer()` (`@/lib/supabase-server`) when you must
  act as the logged-in user (RLS-respecting).
- Put real logic in a service (`src/services/`) and keep the route thin (some older routes
  don't — don't copy that).
- `cron/*` routes require `Authorization: Bearer $CRON_SECRET` in prod — see
  `../../../docs/CRON.md`.
- A route's `requireAuth([...])` is the **source of truth for which roles may access it**.
