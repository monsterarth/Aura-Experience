-- Creation of fb_categories table
CREATE TABLE IF NOT EXISTS public.fb_categories (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    property_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL, -- 'breakfast', 'restaurant', or 'both'
    created_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT fb_categories_pkey PRIMARY KEY (id),
    CONSTRAINT fb_categories_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties (id) ON DELETE CASCADE
);

-- Creation of fb_menu_items table
CREATE TABLE IF NOT EXISTS public.fb_menu_items (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    property_id text NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    description text NULL,
    price numeric NOT NULL DEFAULT 0,
    ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
    active boolean NOT NULL DEFAULT true,
    image_url text NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT fb_menu_items_pkey PRIMARY KEY (id),
    CONSTRAINT fb_menu_items_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties (id) ON DELETE CASCADE,
    CONSTRAINT fb_menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.fb_categories (id) ON DELETE CASCADE
);

-- Creation of fb_orders table
CREATE TABLE IF NOT EXISTS public.fb_orders (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    property_id text NOT NULL,
    stay_id text NULL, -- Pode ser nulo se for venda avulsa, mas para café é obrigatório
    type text NOT NULL, -- 'breakfast', 'restaurant'
    modality text NOT NULL, -- 'delivery', 'buffet', 'table'
    status text NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'preparing', 'delivered', 'cancelled'
    items jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array das escolhas e quantidades
    total_price numeric NOT NULL DEFAULT 0,
    delivery_time text NULL, -- Exemplo: "08:30"
    delivery_date date NULL, -- Requerido se delivery agendado (ex: cafe da manha dia seguinte)
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT fb_orders_pkey PRIMARY KEY (id),
    CONSTRAINT fb_orders_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties (id) ON DELETE CASCADE,
    CONSTRAINT fb_orders_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES public.stays (id) ON DELETE SET NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.fb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_orders ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS generais
CREATE POLICY "Allow all to authenticated users" ON public.fb_categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all to authenticated users" ON public.fb_menu_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all to authenticated users" ON public.fb_orders FOR ALL TO authenticated USING (true);
