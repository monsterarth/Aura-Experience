-- Execute este script no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS public.cabins (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'available',
    "allowedSetups" JSONB DEFAULT '[]'::jsonb,
    "currentStayId" TEXT,
    "wifi" JSONB,
    "equipment" JSONB DEFAULT '[]'::jsonb,
    "housekeepingItems" JSONB DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast property queries
CREATE INDEX IF NOT EXISTS cabins_property_id_idx ON public.cabins ("propertyId");

-- Enable RLS
ALTER TABLE public.cabins ENABLE ROW LEVEL SECURITY;

-- Como o Firebase é a fonte de Auth primária ainda, daremos acesso irrestrito 
-- às chaves Anon/Service Role até que a Auth global migre pro Supabase
CREATE POLICY "Enable global read for cabins" 
ON public.cabins FOR SELECT USING (true);

CREATE POLICY "Enable global insert/update for cabins" 
ON public.cabins FOR ALL USING (true) WITH CHECK (true);
