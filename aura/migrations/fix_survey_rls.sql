-- fix_survey_rls.sql
-- Substitui as políticas abertas (USING true) das tabelas de survey
-- por políticas property-scoped seguras (mesmo padrão de todas as outras tabelas).

-- ==============================
-- survey_categories
-- ==============================
DROP POLICY IF EXISTS "Allow ALL on survey_categories" ON public.survey_categories;
DROP POLICY IF EXISTS "property_scoped_all" ON public.survey_categories;
ALTER TABLE public.survey_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_scoped_all" ON public.survey_categories
  FOR ALL TO authenticated
  USING (is_super_admin() OR "propertyId" = auth_property_id())
  WITH CHECK (is_super_admin() OR "propertyId" = auth_property_id());

-- ==============================
-- survey_templates
-- ==============================
DROP POLICY IF EXISTS "Allow ALL on survey_templates" ON public.survey_templates;
DROP POLICY IF EXISTS "property_scoped_all" ON public.survey_templates;
ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_scoped_all" ON public.survey_templates
  FOR ALL TO authenticated
  USING (is_super_admin() OR "propertyId" = auth_property_id())
  WITH CHECK (is_super_admin() OR "propertyId" = auth_property_id());

-- ==============================
-- survey_responses
-- ==============================
DROP POLICY IF EXISTS "Allow ALL on survey_responses" ON public.survey_responses;
DROP POLICY IF EXISTS "property_scoped_all" ON public.survey_responses;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_scoped_all" ON public.survey_responses
  FOR ALL TO authenticated
  USING (is_super_admin() OR "propertyId" = auth_property_id())
  WITH CHECK (is_super_admin() OR "propertyId" = auth_property_id());

-- ==============================
-- survey_insights
-- ==============================
DROP POLICY IF EXISTS "Allow ALL on survey_insights" ON public.survey_insights;
DROP POLICY IF EXISTS "property_scoped_all" ON public.survey_insights;
ALTER TABLE public.survey_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_scoped_all" ON public.survey_insights
  FOR ALL TO authenticated
  USING (is_super_admin() OR "propertyId" = auth_property_id())
  WITH CHECK (is_super_admin() OR "propertyId" = auth_property_id());
