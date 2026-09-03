-- Política Pet — fase 1: o pedido de exceção e o aceite gravado.
--
-- Ver docs/PET-POLICY.md. Duas camadas de política: a POLÍTICA PET (1 animal,
-- até 15 kg) e a POLÍTICA PET EXCEÇÃO, que analisa caso a caso o que passa disso.
--
-- Backfill EXPLÍCITO das chaves novas em properties.settings: default implícito
-- (a chave "existir" só no TypeScript) já causou dois defeitos em produção — ver
-- a regra 5 da seção 1 de docs/MODULARIZATION.md.

BEGIN;

-- 1. O pedido de exceção e o aceite. Ambos nulos em toda estadia existente: não
--    há pedido retroativo, e ninguém aceitou nada antes de o aceite ser gravado.
ALTER TABLE stays ADD COLUMN IF NOT EXISTS "petException" jsonb;
ALTER TABLE stays ADD COLUMN IF NOT EXISTS "petPolicyAcceptedAt" timestamptz;

COMMENT ON COLUMN stays."petException" IS
  'Pedido de exceção à Política Pet: {status,reasons,requestedAt,decidedAt,decidedBy,authorizedBy,note}. Do hóspede só entra status=pending; quem decide é a recepção.';
COMMENT ON COLUMN stays."petPolicyAcceptedAt" IS
  'Quando o hóspede aceitou a política pet (base ou exceção) no pré-check-in. É o que sustenta a recusa de entrada e a taxa.';

-- Só a pendência é consultada com frequência (fila da recepção), e ela é rara:
-- índice parcial por status, sem igualdade a literal no lado da coluna — ver
-- migrations/README.md sobre o índice que o PostgREST nunca alcançou.
CREATE INDEX IF NOT EXISTS idx_stays_pet_exception_status
  ON stays ((("petException" ->> 'status')))
  WHERE "petException" IS NOT NULL;

-- 2. Backfill das chaves de configuração, propriedade por propriedade.
--    Só onde a propriedade aceita pet — quem não aceita não ganha chave morta.
UPDATE properties
   SET settings = settings
     || jsonb_build_object(
          'acceptsPetExceptions', true,
          -- Sem teto declarado: a exceção analisa qualquer caso, como está no
          -- texto da política de 2026. A propriedade fecha o teto quando quiser.
          'petExceptionMaxPets', NULL,
          'petExceptionMaxWeight', NULL
        )
 WHERE COALESCE((settings ->> 'acceptsPets')::boolean, false) IS TRUE
   AND NOT (settings ? 'acceptsPetExceptions');

-- 3. maxPets nunca foi gravado em nenhuma propriedade: o código caía no padrão 1
--    de maxPetsOf(). Grava o valor de verdade, para a regra parar de morar só no
--    TypeScript e a tela de configuração ter o que mostrar.
UPDATE properties
   SET settings = settings || jsonb_build_object('maxPets', 1)
 WHERE COALESCE((settings ->> 'acceptsPets')::boolean, false) IS TRUE
   AND NOT (settings ? 'maxPets');

COMMIT;

-- Os textos (petExceptionPolicyText, petExceptionAlert) NÃO entram aqui: são
-- conteúdo editorial, cadastrados em Configurações → Políticas depois da
-- aprovação da direção. Sem eles a tela cai na política base, nunca em branco.
