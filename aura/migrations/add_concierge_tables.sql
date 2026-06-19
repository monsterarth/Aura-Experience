-- Catalog: items configured per property
CREATE TABLE IF NOT EXISTS public.concierge_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"  UUID NOT NULL REFERENCES properties(id),
  name          TEXT NOT NULL,
  name_en       TEXT,
  name_es       TEXT,
  description   TEXT,
  description_en TEXT,
  description_es TEXT,
  category      TEXT NOT NULL DEFAULT 'consumption', -- 'consumption' | 'loan'
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  loss_price    NUMERIC(10,2),               -- charged if status = 'lost' (loan only)
  included_qty  INTEGER NOT NULL DEFAULT 0,  -- free units per stay
  image_url     TEXT,
  active        BOOLEAN DEFAULT true,
  "order"       INTEGER DEFAULT 0,
  "createdAt"   TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ DEFAULT NOW()
);

-- Requests: one row per guest order
CREATE TABLE IF NOT EXISTS public.concierge_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"  UUID NOT NULL REFERENCES properties(id),
  "stayId"      UUID NOT NULL REFERENCES stays(id),
  "cabinId"     UUID REFERENCES cabins(id),
  "itemId"      UUID NOT NULL REFERENCES concierge_items(id),
  quantity      INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'delivered'|'returned'|'lost'
  total_price   NUMERIC(10,2),
  notes         TEXT,
  "createdAt"   TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ DEFAULT NOW()
);

-- Enable realtime for concierge_requests
ALTER TABLE public.concierge_requests REPLICA IDENTITY FULL;
