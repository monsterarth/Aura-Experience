CREATE TABLE IF NOT EXISTS public.contacts (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isGuest" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_propertyId_idx ON public.contacts ("propertyId");

CREATE TABLE IF NOT EXISTS public.communications (
    "id" TEXT PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "lastMessage" TEXT,
    "unread" INTEGER DEFAULT 0,
    "archived" BOOLEAN DEFAULT false,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS communications_propertyId_idx ON public.communications ("propertyId");

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Contacts" ON public.contacts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Communications" ON public.communications FOR ALL USING (true) WITH CHECK (true);
