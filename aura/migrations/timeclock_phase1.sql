-- migrations/timeclock_phase1.sql
--
-- Módulo Ponto — fase 1 (registro DENTRO do Aura; o import do AFD do REP vem depois).
--
-- Uma tabela só: BATIDAS. Não existe linha "dia" nem colunas entrada1/saida1/
-- entrada2/saida2 — isso quebraria na primeira exceção (saída ao médico, dois
-- intervalos, turno que atravessa a meia-noite). A jornada é DERIVADA da
-- sequência de batidas em src/lib/timeclock.ts, então 1, 2 ou N pares por dia
-- funcionam sem migration nova.
--
-- Aplicar:  pnpm db:sql migrations/timeclock_phase1.sql             (DEV)
--           pnpm db:sql migrations/timeclock_phase1.sql --target prod

-- 1) De onde vem o ponto de cada pessoa ───────────────────────────────────────
-- Três estados MUTUAMENTE EXCLUSIVOS, padrão 'none'. Não é um booleano com um
-- modo pendurado ao lado: ou a pessoa bate no Aura, ou bate no relógio, ou não
-- bate. Isso impede o estado incoerente ("bate ponto ligado, mas de onde?") e
-- garante que o total de horas de alguém tenha uma origem só.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "timeSource" text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_time_source_chk') THEN
    ALTER TABLE staff ADD CONSTRAINT staff_time_source_chk
      CHECK ("timeSource" IN ('none', 'aura', 'rep'));
  END IF;
END $$;

-- 2) Batidas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_clock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId" text NOT NULL,
  "propertyId" text,

  /* Momento EFETIVO da batida. É este que conta as horas — e é este que o
     ajuste altera (o valor original fica preservado em "originalTs"). */
  ts timestamptz NOT NULL,
  kind text NOT NULL,                       /* in · out */

  /* De onde a batida NASCEU. Fica gravada aqui, não só no cadastro da pessoa:
     mudar alguém de 'rep' para 'aura' amanhã não pode reescrever o passado.
     aura   = botão do sistema
     rep    = importada do relógio (AFD) — fase 2
     manual = lançada à mão por esquecimento */
  source text NOT NULL DEFAULT 'aura',

  /* Contexto do registro. Coletado desde o dia 1 e SEM bloquear nada: quando um
     dia se quiser exigir "só de dentro da pousada", já haverá histórico dizendo
     qual é o IP da fazenda — em vez de descobrir na marra. O navegador não lê o
     SSID do Wi-Fi (não existe API), então o IP é o sinal viável. */
  ip text,
  lat double precision,
  lng double precision,
  "geoAccuracy" double precision,

  note text,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),

  /* Rastro de ajuste — a pessoa corrige a própria batida, mas nada some. */
  "originalTs" timestamptz,
  "editedBy" text,
  "editedByName" text,
  "editedAt" timestamptz,

  /* Exclusão é sempre lógica: batida errada sai do cálculo, não do histórico. */
  "deletedAt" timestamptz,
  "deletedBy" text,
  "deletedByName" text,
  "deleteReason" text,

  /* Fase 2 (import do AFD). O par (série do REP, NSR) é o que torna a
     importação idempotente: o AFD é cumulativo, reimportar o mesmo arquivo é o
     caso NORMAL, e sem isto cada import duplicaria o mês inteiro. */
  "repSerial" text,
  nsr bigint
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_clock_events_kind_chk') THEN
    ALTER TABLE time_clock_events ADD CONSTRAINT time_clock_events_kind_chk
      CHECK (kind IN ('in', 'out'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_clock_events_source_chk') THEN
    ALTER TABLE time_clock_events ADD CONSTRAINT time_clock_events_source_chk
      CHECK (source IN ('aura', 'rep', 'manual'));
  END IF;
END $$;

/* A consulta quente é sempre "as batidas desta pessoa neste período".
   Índice NÃO parcial de propósito: um índice parcial cujo predicado o PostgREST
   não consegue provar fica inalcançável (ver o incidente do índice de faxinas),
   e aqui o volume é de duas linhas por pessoa por dia — não há o que economizar. */
CREATE INDEX IF NOT EXISTS time_clock_events_staff_idx
  ON time_clock_events ("staffId", ts DESC);
CREATE INDEX IF NOT EXISTS time_clock_events_property_idx
  ON time_clock_events ("propertyId", ts DESC);

/* Idempotência do import do AFD (fase 2). Parcial por necessidade — batida
   nascida no Aura não tem NSR, e sem o WHERE todas colidiriam em (null, null). */
CREATE UNIQUE INDEX IF NOT EXISTS time_clock_events_nsr_uniq
  ON time_clock_events ("repSerial", nsr)
  WHERE "repSerial" IS NOT NULL AND nsr IS NOT NULL;

-- 3) Acesso: só service-role (as rotas leem/escrevem com supabaseAdmin) ───────
ALTER TABLE time_clock_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON time_clock_events FROM anon, authenticated;
