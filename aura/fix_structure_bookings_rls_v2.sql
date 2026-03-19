-- fix_structure_bookings_rls_v2.sql
-- Substitui a política aberta (USING true) por uma política property-scoped segura.
-- O guest portal usa supabaseAdmin (service role) que bypassa RLS.
-- O admin portal usa o anon client autenticado, que é filtrado por esta política.

-- 1. Dropar a política aberta insegura
DROP POLICY IF EXISTS "Allow ALL on structure_bookings" ON public.structure_bookings;

-- 2. Dropar qualquer política anterior
DROP POLICY IF EXISTS "property_scoped_all" ON public.structure_bookings;
DROP POLICY IF EXISTS "Allow all to authenticated users" ON public.structure_bookings;

-- 3. Garantir que RLS está habilitado
ALTER TABLE public.structure_bookings ENABLE ROW LEVEL SECURITY;

-- 4. Criar política property-scoped (mesmo padrão de todas as outras tabelas)
CREATE POLICY "property_scoped_all" ON public.structure_bookings
  FOR ALL TO authenticated
  USING (is_super_admin() OR "propertyId" = auth_property_id())
  WITH CHECK (is_super_admin() OR "propertyId" = auth_property_id());

-- Nota: Guest API routes usam supabaseAdmin (service role key),
-- que automaticamente bypassa todas as políticas RLS.
-- Esta política só afeta staff autenticados no admin portal.
