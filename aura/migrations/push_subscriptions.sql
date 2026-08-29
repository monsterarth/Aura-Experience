-- Tabela `push_subscriptions` — a que o código sempre esperou e nunca existiu.
--
-- Treze pontos do código leem e escrevem nela (`src/lib/push-notify.ts`,
-- `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/send/*`), mas
-- nenhuma migration a criava: o push nunca chegou a ninguém em produção, e
-- falhava calado — o `error` do Supabase não é checado no caminho de envio.
--
-- O formato aqui é o que o código já usa, não um desenho novo:
--   subscribe faz upsert com onConflict "endpoint"  → endpoint precisa ser único;
--   fanOut filtra por ("propertyId", "staffId")     → índice composto;
--   fanOutByRole filtra por ("propertyId", role)    → índice composto;
--   a limpeza de endpoint expirado apaga por endpoint (coberto pelo único).
--
-- `role` é uma CÓPIA do cargo no momento da inscrição, de propósito: quem troca
-- de cargo re-inscreve no próximo login e a cópia se corrige sozinha. Ler o
-- cargo vivo aqui obrigaria um join em todo disparo.
--
-- Aplicar:  pnpm db:sql migrations/push_subscriptions.sql             (DEV)
--           pnpm db:sql migrations/push_subscriptions.sql --target prod

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId" text NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  "propertyId" text,
  /* cargo no momento da inscrição — ver nota acima */
  role text,
  /* a URL do serviço de push do navegador; identifica o APARELHO, não a pessoa */
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- O upsert de /api/push/subscribe depende deste único: sem ele, cada login no
-- mesmo aparelho criaria uma linha nova e a pessoa receberia a notificação
-- várias vezes.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uniq
  ON push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_staff_idx
  ON push_subscriptions ("propertyId", "staffId");

CREATE INDEX IF NOT EXISTS push_subscriptions_role_idx
  ON push_subscriptions ("propertyId", role);

-- Segurança: a linha guarda a credencial que permite MANDAR notificação para o
-- aparelho de um funcionário. Só service-role toca — o acesso é pelas rotas de
-- /api/push/*, nunca pelo client do navegador.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_subscriptions FROM anon, authenticated;

COMMENT ON TABLE push_subscriptions IS
  'Inscrições de Web Push por aparelho. Uma linha por endpoint do navegador; a limpeza de endpoint expirado (410/404) é feita no envio.';
