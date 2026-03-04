-- Execute no SQL Editor do Supabase - Fase 4 (Refatoração Completa)

-- PROPERTIES
CREATE TABLE IF NOT EXISTS public.properties (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "theme" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- STAFF
CREATE TABLE IF NOT EXISTS public.staff (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "profilePictureUrl" TEXT,
    "birthDate" TEXT,
    "phone" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS staff_propertyId_idx ON public.staff ("propertyId");

-- GUESTS
CREATE TABLE IF NOT EXISTS public.guests (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationality" TEXT DEFAULT 'Brasil',
    "email" TEXT,
    "phone" TEXT,
    "document" JSONB,
    "birthDate" TEXT,
    "gender" TEXT,
    "occupation" TEXT,
    "address" JSONB,
    "allergies" JSONB DEFAULT '[]'::jsonb,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS guests_propertyId_idx ON public.guests ("propertyId");

-- STAYS
CREATE TABLE IF NOT EXISTS public.stays (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "groupId" TEXT,
    "guestId" TEXT NOT NULL,
    "cabinId" TEXT NOT NULL,
    "accessCode" TEXT,
    "cabinConfigs" JSONB DEFAULT '[]'::jsonb,
    "checkIn" TIMESTAMP WITH TIME ZONE NOT NULL,
    "checkOut" TIMESTAMP WITH TIME ZONE NOT NULL,
    "expectedArrivalTime" TEXT,
    "vehiclePlate" TEXT,
    "roomSetup" TEXT,
    "roomSetupNotes" TEXT,
    "counts" JSONB NOT NULL DEFAULT '{"adults":2,"children":0,"babies":0}'::jsonb,
    "additionalGuests" JSONB DEFAULT '[]'::jsonb,
    "travelReason" TEXT,
    "transportation" TEXT,
    "lastCity" TEXT,
    "nextCity" TEXT,
    "hasPet" BOOLEAN DEFAULT false,
    "petDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "automationFlags" JSONB DEFAULT '{}'::jsonb,
    "housekeepingItems" JSONB DEFAULT '[]'::jsonb,
    "hasOpenFolio" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS stays_propertyId_idx ON public.stays ("propertyId");
CREATE INDEX IF NOT EXISTS stays_cabinId_idx ON public.stays ("cabinId");

-- STRUCTURES
CREATE TABLE IF NOT EXISTS public.structures (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT DEFAULT 'guest_auto_approve',
    "capacity" INTEGER DEFAULT 1,
    "status" TEXT DEFAULT 'available',
    "operatingHours" JSONB DEFAULT '{}'::jsonb,
    "imageUrl" TEXT,
    "units" JSONB DEFAULT '[]'::jsonb,
    "bookingType" TEXT DEFAULT 'fixed_slots',
    "requiresTurnover" BOOLEAN DEFAULT false,
    "housekeepingChecklist" JSONB DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS structures_propertyId_idx ON public.structures ("propertyId");

-- STRUCTURE BOOKINGS
CREATE TABLE IF NOT EXISTS public.structure_bookings (
    "id" TEXT PRIMARY KEY,
    "structureId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "stayId" TEXT,
    "guestId" TEXT,
    "guestName" TEXT,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unitId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS structure_bookings_propertyId_idx ON public.structure_bookings ("propertyId");
CREATE INDEX IF NOT EXISTS structure_bookings_structureId_idx ON public.structure_bookings ("structureId");

-- HOUSEKEEPING TASKS
CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "cabinId" TEXT,
    "structureId" TEXT,
    "unitId" TEXT,
    "stayId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedTo" JSONB DEFAULT '[]'::jsonb,
    "conferredBy" TEXT,
    "startedAt" TIMESTAMP WITH TIME ZONE,
    "finishedAt" TIMESTAMP WITH TIME ZONE,
    "checklist" JSONB DEFAULT '[]'::jsonb,
    "observations" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS housekeeping_tasks_propertyId_idx ON public.housekeeping_tasks ("propertyId");

-- MAINTENANCE TASKS
-- Rename to maintenance_tasks if desired (it was implicitly discussed in planning)
CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "cabinId" TEXT,
    "structureId" TEXT,
    "unitId" TEXT,
    "stayId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedTo" JSONB DEFAULT '[]'::jsonb,
    "isRecurring" BOOLEAN DEFAULT false,
    "recurrenceRule" TEXT,
    "lastRecurrenceCreated" TIMESTAMP WITH TIME ZONE,
    "checklist" JSONB DEFAULT '[]'::jsonb,
    "completion" JSONB,
    "startedAt" TIMESTAMP WITH TIME ZONE,
    "finishedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS maintenance_tasks_propertyId_idx ON public.maintenance_tasks ("propertyId");

-- FOLIO (CONSUMPTION)
CREATE TABLE IF NOT EXISTS public.folio_items (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" NUMERIC NOT NULL,
    "totalPrice" NUMERIC NOT NULL,
    "category" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS folio_items_propertyId_idx ON public.folio_items ("propertyId");
CREATE INDEX IF NOT EXISTS folio_items_stayId_idx ON public.folio_items ("stayId");

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldData" JSONB,
    "newData" JSONB,
    "details" TEXT,
    "timestamp" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_propertyId_idx ON public.audit_logs ("propertyId");

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Properties" ON public.properties FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Staff" ON public.staff FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Guests" ON public.guests FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Stays" ON public.stays FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Structures" ON public.structures FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.structure_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Structure Bookings" ON public.structure_bookings FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Housekeeping" ON public.housekeeping_tasks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Maintenance" ON public.maintenance_tasks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.folio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Folio" ON public.folio_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Audit" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ==========================================================
-- CORREÇÕES (FALTA DE COLUNAS NA RESERVA E TABELAS EXTRAS)
-- ==========================================================

-- Adicionando colunas esquecidas na tabela de Stays (reservas) 
-- que causavam erro silencioso no Check-in/Check-out e Pre-checkin
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS "checkInActual" TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS "checkOutActual" TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- CHECKLISTS TEMPLATES (Governança)
CREATE TABLE IF NOT EXISTS public.checklists (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "items" JSONB DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS checklists_propertyId_idx ON public.checklists ("propertyId");

-- MESSAGE TEMPLATES (Automação de WhatsApp)
CREATE TABLE IF NOT EXISTS public.message_templates (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS message_templates_propertyId_idx ON public.message_templates ("propertyId");

-- AUTOMATION RULES (Gatilhos de envio de mensagens)
CREATE TABLE IF NOT EXISTS public.automation_rules (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "templateId" TEXT,
    "active" BOOLEAN DEFAULT false,
    "delayMinutes" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS automation_rules_propertyId_idx ON public.automation_rules ("propertyId");

-- QUEUED MESSAGES (Fila do CRON do WhatsApp)
CREATE TABLE IF NOT EXISTS public.messages (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "contactId" TEXT,
    "stayId" TEXT,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "isAutomated" BOOLEAN DEFAULT false,
    "triggerEvent" TEXT,
    "scheduledFor" TIMESTAMP WITH TIME ZONE,
    "lastAttemptAt" TIMESTAMP WITH TIME ZONE,
    "errorMessage" TEXT,
    "status" TEXT DEFAULT 'pending',
    "attempts" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_propertyId_idx ON public.messages ("propertyId");

-- Permissões RLS (Permissivas igual as demais da migração parcial)
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Checklists" ON public.checklists FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public MsgTemplates" ON public.message_templates FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public AutoRules" ON public.automation_rules FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
