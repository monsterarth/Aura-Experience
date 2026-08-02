-- =============================================================================
-- PATRIMÔNIO — FASE 1: ficha, baixa, movimentação e identificação
-- =============================================================================
-- "publicCode" é o código curto e opaco da PLAQUETA FÍSICA (QR Code). Ele vai
-- gravado em metal e colado no equipamento — não pode ser reimpresso. Por isso a
-- imutabilidade é garantida por TRIGGER no banco, e não por convenção no código.
-- 8 caracteres do alfabeto sem I/O/0/1: a plaqueta é lida em voz alta ao telefone
-- e digitada à mão. Mesmo alfabeto de StayService.generateUniqueAccessCode.
-- Unicidade GLOBAL (não por propriedade): a URL /p/<code> não carrega a
-- propriedade, então o código sozinho precisa resolver o ativo.
--
-- Baixa/alienação substitui o DELETE físico. Hoje o botão Excluir apaga a linha
-- e, por ON DELETE CASCADE, leva junto toda a depreciação contábil. "disposal*"
-- + "bookValueAtDisposal" (congelado) preservam o histórico.
--
-- "asset_movements" registra para onde o ativo foi e com quem ficou — é o
-- "cadê a TV da cabana 7". Alimentado automaticamente pelo diff do upsert.
--
-- "assetTag" (nº de patrimônio) passa a ser único por propriedade e alocado
-- sequencialmente. O contador vive em tabela própria e é incrementado num único
-- statement atômico (ON CONFLICT DO UPDATE ... RETURNING) — read-modify-write no
-- Node derraparia sob concorrência.
--
-- Convenções: colunas camelCase entre aspas. "propertyId" e "cabinId" são TEXT
-- (properties.id e cabins.id são TEXT neste banco — ver stock_phase0.sql:10-11),
-- o resto é UUID. IDs de staff entram como TEXT SEM FK, mesmo padrão de
-- stock_movements."responsibleId": funcionário desligado não quebra o histórico.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- Seguro com a produção rodando o código atual: colunas anuláveis e tabelas
-- novas. ATENÇÃO ao passo 3 — há um SELECT para rodar ANTES.
-- =============================================================================

-- ── 1) assets: novas colunas ─────────────────────────────────────────────────
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS "publicCode"          TEXT,
  ADD COLUMN IF NOT EXISTS "custodianId"         TEXT,
  ADD COLUMN IF NOT EXISTS "custodianName"       TEXT,
  ADD COLUMN IF NOT EXISTS "disposalDate"        DATE,
  ADD COLUMN IF NOT EXISTS "disposalType"        TEXT,   -- sale|donation|scrap|loss|theft|trade_in
  ADD COLUMN IF NOT EXISTS "disposalReason"      TEXT,
  ADD COLUMN IF NOT EXISTS "disposalValue"       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "disposalDocUrl"      TEXT,
  ADD COLUMN IF NOT EXISTS "bookValueAtDisposal" NUMERIC(12,2),  -- congelado na baixa
  ADD COLUMN IF NOT EXISTS "disposedBy"          TEXT,
  ADD COLUMN IF NOT EXISTS "disposedByName"      TEXT;

-- ── 2) publicCode: backfill + unicidade + imutabilidade ──────────────────────
DO $$
DECLARE
  r         RECORD;
  alphabet  TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i         INT;
BEGIN
  FOR r IN SELECT id FROM public.assets WHERE "publicCode" IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..8 LOOP
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.assets WHERE "publicCode" = candidate);
    END LOOP;
    UPDATE public.assets SET "publicCode" = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_public_code
  ON public.assets("publicCode") WHERE "publicCode" IS NOT NULL;

-- A plaqueta é física: uma vez gravada, o código não muda mais. Nunca.
CREATE OR REPLACE FUNCTION public.assets_public_code_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publicCode" IS NOT NULL AND NEW."publicCode" IS DISTINCT FROM OLD."publicCode" THEN
    RAISE EXCEPTION 'publicCode é imutável (plaqueta já impressa): %', OLD."publicCode";
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assets_public_code_immutable ON public.assets;
CREATE TRIGGER trg_assets_public_code_immutable
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.assets_public_code_immutable();

-- ── 3) assetTag: unicidade + contador sequencial ─────────────────────────────
--
--  !!  RODE ESTE SELECT ANTES DE SEGUIR. Se voltar linhas, resolva as duplicatas
--      na mão — o índice único abaixo vai falhar:
--
--      SELECT "propertyId", "assetTag", count(*)
--        FROM public.assets
--       WHERE "assetTag" IS NOT NULL AND btrim("assetTag") <> ''
--       GROUP BY 1, 2 HAVING count(*) > 1;
--
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_tag_unique
  ON public.assets("propertyId", "assetTag")
  WHERE "assetTag" IS NOT NULL AND btrim("assetTag") <> '';

CREATE TABLE IF NOT EXISTS public.asset_tag_counters (
  "propertyId" TEXT PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_settings
  ADD COLUMN IF NOT EXISTS "assetTagPrefix"  TEXT    NOT NULL DEFAULT 'PAT',
  ADD COLUMN IF NOT EXISTS "assetTagPadding" INTEGER NOT NULL DEFAULT 4;

-- Semeia o contador com o maior sufixo numérico já usado, para não colidir com
-- as etiquetas que já existem.
INSERT INTO public.asset_tag_counters ("propertyId", "lastNumber")
SELECT a."propertyId",
       COALESCE(MAX(((regexp_match(a."assetTag", '(\d+)$'))[1])::int), 0)
  FROM public.assets a
 WHERE a."assetTag" ~ '\d+$'
 GROUP BY a."propertyId"
ON CONFLICT ("propertyId") DO NOTHING;

-- ── 4) Movimentações do ativo ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_movements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"        TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "assetId"           UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  type                TEXT NOT NULL DEFAULT 'transfer',  -- transfer|custody|status|disposal|inventory
  "fromLocationId"    UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  "toLocationId"      UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  "fromCabinId"       TEXT REFERENCES public.cabins(id) ON DELETE SET NULL,
  "toCabinId"         TEXT REFERENCES public.cabins(id) ON DELETE SET NULL,
  "fromCustodianId"   TEXT,
  "fromCustodianName" TEXT,
  "toCustodianId"     TEXT,
  "toCustodianName"   TEXT,
  "fromStatus"        TEXT,
  "toStatus"          TEXT,
  reason              TEXT,
  "referenceType"     TEXT,   -- 'inventory' | 'disposal' | null
  "referenceId"       UUID,
  "performedBy"       TEXT,
  "performedByName"   TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_movements_asset
  ON public.asset_movements("assetId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_asset_movements_property
  ON public.asset_movements("propertyId");

-- ── 5) Manutenção ligada ao ativo ────────────────────────────────────────────
-- maintenance_tasks já tem RLS genérica (rls_all_properties.sql:70) e já está na
-- publicação de realtime (enable-realtime.sql:33) — só as colunas bastam.
ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS "assetId"      UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "reportSource" TEXT,            -- qr|staff|guest
  ADD COLUMN IF NOT EXISTS cost           NUMERIC(12,2);

-- Índice composto: serve tanto o histórico da ficha quanto o teto de relatos/hora
-- da plaqueta pública.
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_asset_created
  ON public.maintenance_tasks("assetId", "createdAt" DESC) WHERE "assetId" IS NOT NULL;

-- ── 6) Índices de apoio em assets ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assets_location  ON public.assets("locationId");
CREATE INDEX IF NOT EXISTS idx_assets_cabin     ON public.assets("cabinId");
CREATE INDEX IF NOT EXISTS idx_assets_custodian ON public.assets("custodianId");
CREATE INDEX IF NOT EXISTS idx_assets_warranty  ON public.assets("warrantyUntil")
  WHERE "warrantyUntil" IS NOT NULL;

-- ── 7) RLS (padrão *_auth_all — ver stock_phase2.sql:88-95) ──────────────────
ALTER TABLE public.asset_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_tag_counters ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_movements','asset_tag_counters'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_auth_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t || '_auth_all', t);
  END LOOP;
END $$;

-- ── 8) Realtime (idempotente — ver stock_phase2.sql:97-113) ──────────────────
ALTER TABLE public.asset_movements REPLICA IDENTITY FULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_movements'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    END IF;
  END LOOP;
END $$;
