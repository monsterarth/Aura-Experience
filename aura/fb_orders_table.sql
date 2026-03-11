-- Criação da tabela de pedidos do F&B (Restaurante e Café da Manhã)
CREATE TABLE public.fb_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    property_id text NOT NULL, -- ID da propriedade (Geralmente em formato slug / texto)
    stay_id uuid, -- Referência à estadia (Opcional, pois pode ser um pedido avulso no futuro)
    type text NOT NULL, -- 'breakfast' ou 'restaurant'
    modality text NOT NULL, -- 'delivery', 'buffet', ou 'table'
    status text NOT NULL, -- 'pending', 'confirmed', 'preparing', 'delivered', 'cancelled'
    items jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array de itens escolhidos no pedido
    total_price numeric NOT NULL DEFAULT 0, -- Valor total dos extras
    delivery_time text, -- Ex: "08:30"
    delivery_date text, -- Ex: "2026-03-10"
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Opcional: Criar RLS (Row Level Security) se o banco estiver configurado com RLS em outras tabelas
-- ALTER TABLE public.fb_orders ENABLE ROW LEVEL SECURITY;
