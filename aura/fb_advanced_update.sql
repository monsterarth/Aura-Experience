-- Atualização do Banco de Dados para Lógica Premium de Café da Manhã

-- 1. Novas colunas na tabela de Categorias
ALTER TABLE public.fb_categories 
ADD COLUMN IF NOT EXISTS selection_target text DEFAULT 'individual', -- Pode ser 'individual' ou 'group'
ADD COLUMN IF NOT EXISTS max_per_guest integer DEFAULT 1; -- Quantidade máxima permitida

-- 2. Novas colunas na tabela de Itens do Menu
ALTER TABLE public.fb_menu_items
ADD COLUMN IF NOT EXISTS flavors jsonb DEFAULT '[]'::jsonb; -- Lista de sabores/opções do item
