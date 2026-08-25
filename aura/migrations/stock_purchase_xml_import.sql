-- =============================================================================
-- COMPRAS — IMPORTAR A NOTA PELO XML (NF-e / NFC-e)
-- =============================================================================
-- Hoje a compra é digitada linha a linha. O XML da nota já traz fornecedor,
-- número, itens, quantidades, custos, frete e desconto — falta só ensinar ao
-- AURA que "REFRIG COCA COLA 2L CX/6" do fornecedor é o "Coca-Cola 2L" daqui.
--
-- Duas coisas nascem aqui:
--
--   1) purchases ganha a identidade fiscal da nota — a CHAVE de 44 dígitos é o
--      que impede lançar a mesma NF duas vezes (índice único parcial abaixo).
--      "invoiceDeclaredTotal" guarda o vNF do XML: é contra ele que a tela
--      confere a soma dos itens, e a divergência continua visível depois.
--
--   2) supplier_product_map — o DE-PARA que se lembra. Chave: fornecedor + o
--      código do produto NA NOTA DELE (cProd). Guarda também o FATOR de
--      embalagem: 1 CX do fornecedor = 12 un aqui, então quantidade multiplica
--      e custo unitário divide por 12. O XML costuma entregar esse fator de
--      graça em qTrib/qCom, mas quem confirma é a pessoa.
--      "assetLine" marca a linha que não é estoque e sim PATRIMÔNIO (uma TV,
--      uma cadeira) — na próxima nota do mesmo fornecedor ela já vem marcada.
--
-- O EAN não mora aqui: código de barras é do produto (stock_products.barcode),
-- não do fornecedor. A importação casa por barcode primeiro e, quando a pessoa
-- vincula uma linha à mão, grava o EAN no produto se ele ainda não tiver.
--
-- Aplicar ANTES do deploy. Idempotente.
-- Seguro com a produção rodando o código atual: só colunas anuláveis (sem
-- rewrite) e uma tabela nova que ninguém ainda lê.
-- =============================================================================

-- 1) Identidade fiscal da nota -----------------------------------------------
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS "invoiceKey"           TEXT,           -- chave de acesso (44 dígitos)
  ADD COLUMN IF NOT EXISTS "invoiceSeries"        TEXT,           -- ide/serie
  ADD COLUMN IF NOT EXISTS "invoiceModel"         TEXT,           -- 55 = NF-e · 65 = NFC-e
  ADD COLUMN IF NOT EXISTS "invoiceXmlUrl"        TEXT,           -- XML original arquivado (Blob)
  ADD COLUMN IF NOT EXISTS "invoiceDeclaredTotal" NUMERIC(12,2),  -- vNF do XML
  ADD COLUMN IF NOT EXISTS "importSource"         TEXT;           -- null|manual|xml_upload|xml_dfe

-- A mesma nota não entra duas vezes. Parcial: nota digitada à mão não tem chave
-- e continua livre para repetir.
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchases_invoice_key
  ON public.purchases("propertyId", "invoiceKey")
  WHERE "invoiceKey" IS NOT NULL;

-- 2) De-para fornecedor → produto do AURA -------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_product_map (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"      TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "supplierId"      UUID NOT NULL REFERENCES public.suppliers(id)  ON DELETE CASCADE,
  "supplierCode"    TEXT NOT NULL,                       -- cProd do XML
  "productId"       UUID REFERENCES public.stock_products(id) ON DELETE CASCADE,
  "assetLine"       BOOLEAN NOT NULL DEFAULT false,      -- linha vira ativo, não estoque
  "ignoreLine"      BOOLEAN NOT NULL DEFAULT false,      -- linha sempre fora do lançamento
  factor            NUMERIC(12,4) NOT NULL DEFAULT 1,    -- 1 un do XML = N un do AURA
  "xmlUnit"         TEXT,                                -- uCom original (CX, FD, UN…)
  "lastDescription" TEXT,                                -- xProd da última nota, para reconhecer
  "lastEan"         TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_supplier_product_map_code
  ON public.supplier_product_map("propertyId", "supplierId", "supplierCode");
CREATE INDEX IF NOT EXISTS idx_supplier_product_map_product
  ON public.supplier_product_map("productId");

-- 3) RLS + grants (mesmo padrão do stock_phase1: API usa service-role) --------
ALTER TABLE public.supplier_product_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_product_map_auth_all ON public.supplier_product_map;
CREATE POLICY supplier_product_map_auth_all ON public.supplier_product_map
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- A chave pública não tem nada que fazer aqui (mesma linha do security_revoke_anon).
REVOKE ALL PRIVILEGES ON TABLE public.supplier_product_map FROM anon;

-- Verificação ----------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'purchases' AND column_name LIKE 'invoice%';
-- Esperado: invoiceNumber, invoiceUrl, invoiceKey, invoiceSeries, invoiceModel,
--           invoiceXmlUrl, invoiceDeclaredTotal
-- SELECT count(*) FROM public.supplier_product_map;  -- 0 numa base nova
