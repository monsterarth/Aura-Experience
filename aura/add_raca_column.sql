ALTER TABLE guests 
ADD COLUMN raca TEXT;

-- Atualizar o cache de schema do PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
