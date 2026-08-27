-- events_type_hygiene.sql — 26/08/2026
--
-- Higiene do `type` de eventos (fatia 1 do docs/EVENTS-V2.md), pré-requisito de
-- qualquer filtro confiável na tabela `events`.
--
-- O tipo em TypeScript é 'local' | 'external' | 'private', mas a coluna é `text`
-- sem CHECK: 8 das 13 linhas de produção carregavam `type = 'internal'`, valor que
-- nunca existiu no código. Consequência prática: todo mapa de rótulo/tom indexado
-- por `type` devolvia undefined, e o filtro positivo que o portal e a cotação
-- passam a usar (`type IN ('local','external')`) deixaria esses eventos invisíveis
-- sem nenhum erro.
--
-- Decisão do dono do produto: os 8 são "Sunset Maram" — evento nosso, na nossa
-- propriedade — logo `local`. Como o Maram vai ser assunto do contrato com o
-- Altamare, isso pode ser revisto junto com o parceiro; por ora, `local`.
--
-- REVERSÃO — os 8 ids afetados, todos com título "Sunset Maram":
--   84370bf4-dd21-41db-b6c7-20a5390b880e  cancelled  2026-07-11
--   0017b360-acc2-4026-a33c-327386d28957  cancelled  2026-07-25
--   c64538a1-57cd-4241-92fd-fd331b23cf15  cancelled  2026-08-08
--   e074e65b-6bf7-4217-adee-4c75e6f034b5  draft      2026-09-05
--   4a1ec78e-4879-40c9-9e4e-0189ea97c5a7  draft      2026-09-06
--   7d42e745-7b9b-40aa-98bd-74162f90e10e  draft      2026-10-10
--   d28509f5-57d4-4e59-b30e-cd9d649339e3  draft      2026-10-11
--   85348acf-8ec2-48c1-b39f-57d6108da861  draft      2026-10-31
-- Para desfazer: DROP a constraint e UPDATE esses ids de volta para 'internal'.

-- 1) Backfill ANTES da constraint. (O runner roda o arquivo inteiro numa
--    transação: CHECK antes do backfill abortaria tudo.)
UPDATE events SET type = 'local', "updatedAt" = now()
WHERE type NOT IN ('local', 'external', 'private');

-- 2) Trava para não voltar. `type` é o eixo que decide o que sai de casa
--    (o filtro positivo das leituras públicas), então valor fora da lista é
--    exatamente o tipo de dado que não pode existir.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE events ADD CONSTRAINT events_type_check
  CHECK (type IN ('local', 'external', 'private'));

-- 3) Default do banco: 'external' -> 'local'. O default só é usado por escrita
--    que não manda o campo (a rota do parceiro, amanhã). Errar para "externo"
--    manda o hóspede procurar o evento fora da propriedade; errar para "local"
--    no máximo o traz até a recepção perguntar.
ALTER TABLE events ALTER COLUMN type SET DEFAULT 'local';

-- Deliberadamente FORA deste arquivo: CHECK de `category`. A lista vai ser
-- revisada junto com o parceiro (entram `music` e `wellness`) — escrever a
-- constraint agora seria escrevê-la duas vezes. Ver docs/EVENTS-V2.md.

SELECT type, count(*) FROM events GROUP BY type ORDER BY type;
