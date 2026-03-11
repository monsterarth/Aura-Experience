-- Phase 1: DND pause support for maintenance_tasks + system_bugs table

-- 1. Add DND pause columns to maintenance_tasks
ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS "pausedUntil" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "previousStatus" TEXT;

-- 2. Issue tracker for IT/app bugs (separate from physical maintenance)
CREATE TABLE IF NOT EXISTS public.system_bugs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "stayId" UUID REFERENCES stays(id),
  "propertyId" UUID NOT NULL REFERENCES properties(id),
  description TEXT NOT NULL,
  browser_info TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
