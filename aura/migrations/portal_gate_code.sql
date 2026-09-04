-- Portal: a senha do portão vira campo por propriedade (settings.gateCode).
--
-- Antes, a senha era o literal "1008#" fixo em src/app/check-in/[code]/_portal/
-- sheets.tsx — TODA propriedade nova exibia a senha do portão da Fazenda do Rosa
-- aos hóspedes dela. Agora o portal lê settings.gateCode e mostra "não configurada"
-- quando vazio (allowlist em src/lib/property-settings.ts, exposto em
-- /api/guest/session).
--
-- Backfill EXPLÍCITO (regra 5 da seção 1 de docs/MODULARIZATION.md): grava o valor
-- real na Fazenda para não perder a senha em produção; as demais ficam sem a chave
-- (o portal mostra o estado vazio até alguém cadastrar).

BEGIN;

UPDATE properties
   SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('gateCode', '1008#')
 WHERE id = 'fazenda-do-rosa';

COMMIT;
