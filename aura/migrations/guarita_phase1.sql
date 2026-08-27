-- migrations/guarita_phase1.sql
--
-- Módulo Guarita — fase 1 (ver docs/GUARITA.md).
--
-- Quatro tabelas: o CADASTRO de placas (permanente, responde "de quem é esse
-- carro"), os MOVIMENTOS (entrada/saída), a TARIFA do dia e o TURNO.
--
-- Aplicar:  pnpm db:sql migrations/guarita_phase1.sql             (DEV)
--           pnpm db:sql migrations/guarita_phase1.sql --target prod

-- 1) Cadastro de placas ───────────────────────────────────────────────────────
-- A placa é a chave do dia a dia. Guardada NORMALIZADA (maiúscula, sem hífen ou
-- espaço) para que "abc-1d23" e "ABC1D23" sejam o mesmo carro.
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL,
  plate text NOT NULL,
  model text,
  color text,
  "ownerName" text,
  "ownerPhone" text,
  /* consentimento explícito — uso operacional não precisa, marketing sim */
  "marketingOptIn" boolean NOT NULL DEFAULT false,
  /* guest · visitor · supplier · staff · customer */
  kind text NOT NULL DEFAULT 'customer',
  "guestId" text,
  "staffId" text,
  "supplierId" text,
  /* normal · whitelist (sempre liberado) · blacklist (alerta na entrada) */
  status text NOT NULL DEFAULT 'normal',
  "statusReason" text,
  "statusBy" text,
  "statusByName" text,
  "statusAt" timestamptz,
  notes text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_uniq
  ON vehicles ("propertyId", plate);

-- 2) Tarifa do dia ────────────────────────────────────────────────────────────
-- Uma linha por data. `closed` = dia em que o estacionamento não abre (baixa
-- temporada) — diferente de tarifa zero.
CREATE TABLE IF NOT EXISTS parking_rates (
  "propertyId" text NOT NULL,
  date date NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  closed boolean NOT NULL DEFAULT false,
  "setBy" text,
  "setByName" text,
  "setAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("propertyId", date)
);

-- 3) Turno (movimento) ────────────────────────────────────────────────────────
-- Numerado e sequencial por propriedade, como o do PMS. Quem abre não é
-- necessariamente quem fecha.
CREATE TABLE IF NOT EXISTS parking_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL,
  number integer NOT NULL,
  status text NOT NULL DEFAULT 'open',   /* open · closed */
  "openedAt" timestamptz NOT NULL DEFAULT now(),
  "openedBy" text,
  "openedByName" text,
  "closedAt" timestamptz,
  "closedBy" text,
  "closedByName" text,
  /* resumo CONGELADO no fechamento — o turno fechado não se recalcula */
  summary jsonb,
  notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS parking_shifts_number_uniq
  ON parking_shifts ("propertyId", number);
CREATE UNIQUE INDEX IF NOT EXISTS parking_shifts_one_open
  ON parking_shifts ("propertyId") WHERE status = 'open';

-- 4) Movimentos de veículo ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL,
  "vehicleId" uuid,
  /* desnormalizada: o histórico não muda se o cadastro for corrigido depois */
  plate text NOT NULL,
  kind text NOT NULL,
  "stayId" text,
  "enteredAt" timestamptz NOT NULL DEFAULT now(),
  "exitedAt" timestamptz,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  /* credit · debit · pix · cash — nulo quando isento */
  "paymentMethod" text,
  "cardBrand" text,
  installments integer,
  nsu text,
  "shiftId" uuid,
  "registeredBy" text,
  "registeredByName" text,
  "exitBy" text,
  "exitByName" text,
  notes text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

/* O pátio é a consulta mais quente do app: entrada sem saída. */
CREATE INDEX IF NOT EXISTS vehicle_movements_open_idx
  ON vehicle_movements ("propertyId", "enteredAt" DESC) WHERE "exitedAt" IS NULL;
CREATE INDEX IF NOT EXISTS vehicle_movements_shift_idx
  ON vehicle_movements ("shiftId");
CREATE INDEX IF NOT EXISTS vehicle_movements_plate_idx
  ON vehicle_movements ("propertyId", plate, "enteredAt" DESC);

-- 5) Acesso: só service-role (as rotas leem/escrevem com supabaseAdmin) ───────
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vehicles, parking_rates, parking_shifts, vehicle_movements FROM anon, authenticated;

-- 6) Placa do funcionário — o cadastro de staff passa a carregar a dele ───────
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "vehiclePlate" text;
