-- Liga o módulo Guarita nas propriedades que o usam.
--
-- Por que isto existe: `hasGuarita` nasceu com default DESLIGADO (módulo novo,
-- ninguém contratou — ver src/lib/modules.ts). O código do gate e a tela de
-- Módulos sobem juntos; se ninguém ligar a flag ANTES, a Guarita desaparece do
-- menu no mesmo deploy e parece que a migration das tabelas não pegou.
--
-- Rodar ANTES (ou junto com) o deploy que leva o gate a produção.
--
-- Escopo deliberado:
--   fazenda-do-rosa      → opera a guarita de verdade;
--   fazenda-modelo-aura  → é onde o módulo foi construído e demonstrado;
--   estanciadovale       → fica de FORA. Uma pousada de uma cabana sem portaria
--                          é exatamente o caso que justifica a flag existir.
--
-- Merge raso no jsonb: preserva todas as outras chaves de `settings`.
-- Aditivo e idempotente — rodar duas vezes dá o mesmo resultado.

UPDATE properties
SET settings = coalesce(settings, '{}'::jsonb) || '{"hasGuarita": true}'::jsonb
WHERE id IN ('fazenda-do-rosa', 'fazenda-modelo-aura');
