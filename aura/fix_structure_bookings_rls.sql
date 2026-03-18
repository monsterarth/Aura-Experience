-- ============================================================
-- FIX: RLS silenciosa em structure_bookings
-- O admin não conseguia ler reservas feitas pelo portal do hóspede
-- porque não havia política de SELECT para usuários autenticados.
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE public.structure_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow ALL on structure_bookings" ON public.structure_bookings;

CREATE POLICY "Allow ALL on structure_bookings"
  ON public.structure_bookings
  FOR ALL
  USING (true)
  WITH CHECK (true);
