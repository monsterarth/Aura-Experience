-- =============================================================================
-- automation_rules — regra é POR PROPRIEDADE, não global
-- =============================================================================
-- A chave primária é o `id`, e o código sempre gravou `id = triggerEvent`
-- ("welcome_checkin"). Resultado: existem 7 linhas no banco INTEIRO para 3
-- propriedades. As automações são globais na prática.
--
-- O que isso causa, concretamente:
--   • Abrir a tela de automações com outra pousada ativa fazia upsert em
--     `onConflict: id` e ROUBAVA as linhas da Fazenda do Rosa — trocando o
--     propertyId. A pousada original perdia todas as automações de uma vez.
--   • Depois da trava no getRules (ON CONFLICT DO NOTHING) o roubo acidental
--     parou, mas a segunda propriedade passou a NUNCA conseguir criar regra: o
--     insert colide com a linha da primeira e não faz nada. De destrutivo virou
--     impossível — os dois errados.
--   • `updateRule` ainda tem um fallback que faz upsert por `id`: configurar a
--     segunda pousada de propósito roubaria a linha da primeira.
--
-- A correção é o par (propertyId, triggerEvent) ser único, e o id deixar de ser
-- o nome do gatilho. Nada referencia automation_rules.id (conferido em
-- messages e audit_logs), então re-chavear é seguro.
--
-- Aplicar ANTES do deploy: o código novo faz upsert com
-- onConflict "propertyId,triggerEvent", que exige a constraint existir.
-- Idempotente.
-- =============================================================================

-- 1) Re-chaveia só as linhas que ainda usam o nome do gatilho como id.
UPDATE public.automation_rules
   SET id = "propertyId" || '__' || "triggerEvent"
 WHERE id = "triggerEvent";

-- 2) A trava de verdade: uma regra por gatilho POR PROPRIEDADE.
ALTER TABLE public.automation_rules
  DROP CONSTRAINT IF EXISTS automation_rules_property_trigger_key;
ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_property_trigger_key UNIQUE ("propertyId", "triggerEvent");

-- Verificação:
-- SELECT id, "propertyId", "triggerEvent" FROM public.automation_rules ORDER BY "propertyId";
-- Esperado: os 7 ids agora no formato fazenda-do-rosa__welcome_checkin.
