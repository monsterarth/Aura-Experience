-- Ativa as policies necessárias para que o sistema consiga ler e escrever nas tabelas de Survey
-- Execute isto no SQL Editor do seu Supabase

-- Garante que o RLS (Row Level Security) esteja ativado
ALTER TABLE public.survey_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_insights ENABLE ROW LEVEL SECURITY;

-- Remove policies antigas (caso existam) para evitar duplicações e erros na hora de rodar o código
DROP POLICY IF EXISTS "Allow ALL on survey_categories" ON public.survey_categories;
DROP POLICY IF EXISTS "Allow ALL on survey_templates" ON public.survey_templates;
DROP POLICY IF EXISTS "Allow ALL on survey_responses" ON public.survey_responses;
DROP POLICY IF EXISTS "Allow ALL on survey_insights" ON public.survey_insights;

-- Cria as políticas permitindo Select, Insert, Update, Delete livremente 
-- (para fins do sistema funcionar corretamente com ou sem login via anon key)
CREATE POLICY "Allow ALL on survey_categories" ON public.survey_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow ALL on survey_templates" ON public.survey_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow ALL on survey_responses" ON public.survey_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow ALL on survey_insights" ON public.survey_insights FOR ALL USING (true) WITH CHECK (true);
