-- Modo de visualização da página de Estadias, por usuário e por aba.
--
-- A recepção pediu cartão / compacto / lista em Ativas e Futuras, com a escolha
-- persistida. localStorage não serve: o computador da recepção é compartilhado e
-- mais de um login usa o mesmo navegador — a preferência de uma pessoa passaria
-- para a próxima. Fica no `staff`, ao lado de `uiTheme` e `sidebarDefaultCollapsed`,
-- e viaja com o usuário entre o balcão e o celular.
--
-- Uma coluna por aba: as duas têm ritmos diferentes (Ativas é vigília, Futuras é
-- preparação) e a mesma pessoa costuma querer densidades diferentes em cada uma.
--
-- Aditivo e idempotente. Sem default explícito de linha: NULL significa "nunca
-- escolheu" e a página cai em 'card', o padrão de hoje.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS "staysViewAtivas"  text,
  ADD COLUMN IF NOT EXISTS "staysViewFuturas" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_stays_view_ativas_check'
  ) THEN
    ALTER TABLE staff ADD CONSTRAINT staff_stays_view_ativas_check
      CHECK ("staysViewAtivas" IS NULL OR "staysViewAtivas" IN ('card', 'compact', 'list'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_stays_view_futuras_check'
  ) THEN
    ALTER TABLE staff ADD CONSTRAINT staff_stays_view_futuras_check
      CHECK ("staysViewFuturas" IS NULL OR "staysViewFuturas" IN ('card', 'compact', 'list'));
  END IF;
END $$;

COMMENT ON COLUMN staff."staysViewAtivas" IS
  'Modo da aba Ativas em /admin/stays: card | compact | list. NULL = nunca escolheu (usa card).';
COMMENT ON COLUMN staff."staysViewFuturas" IS
  'Modo da aba Futuras em /admin/stays: card | compact | list. NULL = nunca escolheu (usa card).';
