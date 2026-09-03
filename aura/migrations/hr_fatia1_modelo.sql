-- migrations/hr_fatia1_modelo.sql
--
-- RH v2 — fatia 1: o modelo novo de escala. Ver docs/HR-V2.md.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE ESTE ARQUIVO EXISTE
--
-- O modelo velho responde "quando o fulano trabalha?" de quatro lugares que
-- ninguém reconcilia: `staff_schedules` (grade semanal), `staff.scheduleConfig`
-- (jsonb), `staff_schedule_overrides` (exceção do dia) e
-- `staff_schedule_checkpoints` (âncora de ciclo). Medido em 03/09/2026: as três
-- tabelas somam 30 registros e pararam entre maio e junho. A única peça viva é o
-- jsonb — e o histórico dele vive num ARRAY dentro do blob, o que torna
-- impossível perguntar "quem estava em 12x36 em maio" sem varrer 37 blobs no
-- navegador.
--
-- Aqui o modelo vira três camadas: PADRÃO (versionado em linhas) → AUSÊNCIA
-- (período) → o DIA MATERIALIZADO. O realizado (`time_clock_events`) já existe.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE A LEITURA DO CALCULADOR MUDOU NO DESENHO
--
-- `src/lib/schedule-calculator.ts` revela que os três tipos não são a mesma
-- coisa, e é por isso que este arquivo NÃO tem uma coluna "scheduleType":
--
--   6x1   NÃO é ciclo. É "trabalha todo dia MENOS a folga fixa", mais uma regra
--         periódica de domingo (trabalha 3, folga o 4º) ancorada numa data.
--   5x2   é regra semanal: seg-sex, menos a folga fixa se houver.
--   12x36 é ciclo de verdade: alterna 1 dia sim / 1 dia não a partir da âncora.
--
-- Modelar os três como "tipo" foi o erro original — foi o que obrigou o
-- `sundayOffCycle` a existir como booleano pendurado, resolvendo um caso só. Aqui
-- há duas BASES (`weekly` e `cycle`) e uma lista de REGRAS periódicas em cima.
-- A mesma lista dá conta do `reason = 'Domingo Mes'` que existe em produção como
-- texto livre num campo de motivo, sem coluna nova.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE O HISTÓRICO NÃO É MIGRADO
--
-- `scheduleConfig.history` PARECE versionamento e não é: é log de save. Medido:
-- a Grazi tem 18 itens com apenas 5 configurações distintas, 9 datas distintas, e
-- SETE deles idênticos ao config atual. As `endDate` não estão em ordem e se
-- repetem. Como o `getEffectiveConfig` escolhe "o primeiro item cuja endDate >= a
-- data, ordenado por endDate", a escala que o sistema mostra para o passado já é
-- arbitrária hoje.
--
-- Então: migra-se só o config ATUAL, como um padrão aberto valendo a partir de
-- 01/09/2026, e o blob cru fica arquivado em `legacyConfig` para consulta. Nada
-- se perde e nada de falso é reconstruído.
--
-- Aplicar:  pnpm db:sql migrations/hr_fatia1_modelo.sql               (DEV)
--           pnpm db:sql migrations/hr_fatia1_modelo.sql --target prod

-- ══════════════════════════════════════════════════════════════════════════════
-- 1) MODELO DE JORNADA — o preset reutilizável
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Nasce da medição, não de teoria: seis camareiras têm 6x1 08:20–16:20 idêntico e
-- quatro recepcionistas têm 12x36 08:30–20:30 idêntico. O horário é digitado
-- pessoa por pessoa, dez vezes o mesmo.
--
-- O que o modelo guarda: base, horário, tamanho do ciclo, formato das regras.
-- O que é SEMPRE da pessoa: quais dias ela trabalha (o dia de folga muda de
-- camareira para camareira — é assim que um time 6x1 cobre os sete dias) e a
-- âncora do ciclo (é o que faz a recepção alternar). Pôr isso no modelo colocaria
-- o time inteiro de folga no mesmo dia.

CREATE TABLE IF NOT EXISTS work_pattern_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL,
  name text NOT NULL,                       /* "Camareira 6x1", "Recepção 12x36" */

  base text NOT NULL,                       /* weekly · cycle */
  "startTime" text NOT NULL,                /* HH:mm */
  "endTime" text NOT NULL,

  /* base='cycle' */
  "cycleOnDays" int,
  "cycleOffDays" int,

  /* base='weekly': dias que o modelo sugere. Null = a pessoa escolhe (6x1). */
  weekdays int[],

  /* Formato das regras periódicas que o modelo sugere — a âncora vem da pessoa. */
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,

  "weekdayTimeOverrides" jsonb,

  "archivedAt" timestamptz,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wpt_base_chk') THEN
    ALTER TABLE work_pattern_templates ADD CONSTRAINT wpt_base_chk
      CHECK (base IN ('weekly', 'cycle'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wpt_property ON work_pattern_templates ("propertyId");

-- ══════════════════════════════════════════════════════════════════════════════
-- 2) PADRÃO DA PESSOA — versionado em LINHAS
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Substitui `staff.scheduleConfig` (incluindo o `history` de dentro dele),
-- `staff_schedules` e `staff_schedule_checkpoints` de uma vez. Mudar a âncora do
-- ciclo deixa de precisar de tabela própria: é uma nova vigência.
--
-- REGRAS (`rules`) — lista de objetos, aplicada DEPOIS da base, sempre subtraindo:
--
--   {"kind":"weekday_off","weekday":0}
--       folga fixa num dia da semana. Usada quando a base é `cycle` (na base
--       `weekly` a folga já está fora de `weekdays`).
--
--   {"kind":"nth_weekday_off","weekday":0,"everyN":4,"index":3,"anchor":"2026-04-07"}
--       "trabalha 3 domingos, folga o 4º". É o `sundayOffCycle` do modelo velho,
--       agora com o dia da semana, o tamanho do ciclo e a posição explícitos.
--
--   {"kind":"monthly_weekday_off","weekday":0,"nth":1}
--       "folga o primeiro domingo do mês". É o `Domingo Mes` que hoje vive como
--       texto livre num campo de motivo.
--
-- Guardar como jsonb e não como colunas é deliberado: a interface expõe TRÊS
-- perguntas ("folga fixa?", "domingos?", "algum dia do mês?"), não um editor de
-- regras. Armazenamento geral, interface estreita.

CREATE TABLE IF NOT EXISTS staff_work_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId" text NOT NULL,
  "propertyId" text NOT NULL,
  "templateId" uuid REFERENCES work_pattern_templates(id) ON DELETE SET NULL,

  /* none = sem jornada fixa. Estado EXPLÍCITO, não ausência de linha: são os 8
     da direção/administração, que senão aparecem como pendência para sempre. */
  base text NOT NULL,                       /* none · weekly · cycle */

  "startTime" text,
  "endTime" text,

  weekdays int[],                           /* base='weekly' */

  "cycleOnDays" int,                        /* base='cycle' */
  "cycleOffDays" int,
  "cycleAnchor" date,

  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  "weekdayTimeOverrides" jsonb,

  /* A MUDANÇA CENTRAL: vigência em coluna, não em array dentro de blob. */
  "effectiveFrom" date NOT NULL,
  "effectiveTo" date,                       /* null = vigente */

  /* O blob antigo, arquivado inteiro. Não é lido por código nenhum — existe para
     quem um dia perguntar "de onde veio esta linha". */
  "legacyConfig" jsonb,

  note text,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swp_base_chk') THEN
    ALTER TABLE staff_work_patterns ADD CONSTRAINT swp_base_chk
      CHECK (base IN ('none', 'weekly', 'cycle'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swp_period_chk') THEN
    ALTER TABLE staff_work_patterns ADD CONSTRAINT swp_period_chk
      CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_swp_staff_period
  ON staff_work_patterns ("staffId", "effectiveFrom" DESC);
CREATE INDEX IF NOT EXISTS idx_swp_property
  ON staff_work_patterns ("propertyId", "effectiveFrom" DESC);

/* Uma pessoa não pode ter dois padrões vigentes ao mesmo tempo. Índice parcial
   por IS NULL — que o PostgREST ALCANÇA, ao contrário do parcial com igualdade a
   literal (ver perf_indices_postgrest_parametros.sql). */
CREATE UNIQUE INDEX IF NOT EXISTS uq_swp_um_vigente
  ON staff_work_patterns ("staffId") WHERE "effectiveTo" IS NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3) AUSÊNCIAS — férias, atestado, folga, afastamento, falta, banco de horas
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Uma entidade só, com tipo e PERÍODO. Substitui `staff_schedule_overrides`
-- inteiro, onde "Folga", "Banco de horas" e "Rodízio — ciclo invertido" viviam
-- como texto livre num campo de motivo, um dia por vez.
--
-- Férias aqui é ausência, não cálculo trabalhista: a contabilidade controla
-- período aquisitivo, 1/3, abono e fracionamento (decisão 8). O AURA só precisa
-- saber quem está fora e quando.
--
-- A tabela NASCE nesta fatia mesmo com a interface vindo na fatia 3: o gerador da
-- escala precisa dela para materializar certo. Sem isso a materialização nasce
-- errada e teria que ser refeita.

CREATE TABLE IF NOT EXISTS staff_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId" text NOT NULL,
  "propertyId" text NOT NULL,

  type text NOT NULL,      /* ferias · atestado · folga · afastamento · falta · banco_horas · outro */

  "startDate" date NOT NULL,
  "endDate" date NOT NULL,

  /* Saída ao médico às 14h não vira dia inteiro fora. */
  "isPartialDay" boolean NOT NULL DEFAULT false,
  "startTime" text,
  "endTime" text,

  status text NOT NULL DEFAULT 'confirmada',   /* prevista · confirmada · cancelada */

  reason text,
  "documentUrl" text,                          /* o atestado escaneado */

  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sab_type_chk') THEN
    ALTER TABLE staff_absences ADD CONSTRAINT sab_type_chk
      CHECK (type IN ('ferias','atestado','folga','afastamento','falta','banco_horas','outro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sab_status_chk') THEN
    ALTER TABLE staff_absences ADD CONSTRAINT sab_status_chk
      CHECK (status IN ('prevista','confirmada','cancelada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sab_period_chk') THEN
    ALTER TABLE staff_absences ADD CONSTRAINT sab_period_chk
      CHECK ("endDate" >= "startDate");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sab_staff_period
  ON staff_absences ("staffId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS idx_sab_property_period
  ON staff_absences ("propertyId", "startDate", "endDate");

-- ══════════════════════════════════════════════════════════════════════════════
-- 4) O DIA MATERIALIZADO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Hoje o dia é CALCULADO no navegador de cada pessoa, em 11 arquivos, e por isso
-- nenhuma pergunta agregada tem resposta: horas previstas no mês, quem trabalha
-- domingo, quem está escalado num dia de férias, custo por setor.
--
-- Materializar custa ~11.700 linhas por ano para 32 pessoas. É nada para o
-- Postgres e transforma toda essa família de perguntas em query trivial.

CREATE TABLE IF NOT EXISTS staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId" text NOT NULL,
  "propertyId" text NOT NULL,
  date date NOT NULL,

  "isWork" boolean NOT NULL,
  "startTime" text,
  "endTime" text,
  "plannedMinutes" int NOT NULL DEFAULT 0,

  /* De onde este dia veio. `manual` é o que a pessoa que monta mexeu à mão — e é
     o único que o regerador NÃO pode sobrescrever. */
  origin text NOT NULL DEFAULT 'pattern',   /* pattern · absence · manual */
  "absenceId" uuid REFERENCES staff_absences(id) ON DELETE SET NULL,
  "patternId" uuid REFERENCES staff_work_patterns(id) ON DELETE SET NULL,

  note text,
  "updatedBy" text,
  "updatedByName" text,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  UNIQUE ("staffId", date)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ssh_origin_chk') THEN
    ALTER TABLE staff_shifts ADD CONSTRAINT ssh_origin_chk
      CHECK (origin IN ('pattern','absence','manual'));
  END IF;
END $$;

/* O acesso quente é "o mês da propriedade" e "meu dia". Índices NÃO parciais de
   propósito — o predicado com literal é o buraco que o PostgREST não prova. */
CREATE INDEX IF NOT EXISTS idx_ssh_property_date ON staff_shifts ("propertyId", date);
CREATE INDEX IF NOT EXISTS idx_ssh_staff_date    ON staff_shifts ("staffId", date);

-- ══════════════════════════════════════════════════════════════════════════════
-- 5) PUBLICAÇÃO DO MÊS — rascunho → publicada
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O conceito que faltava. Hoje a escala é sempre "ao vivo": mexeu numa célula, já
-- vale, e ninguém sabe quando o mês ficou pronto. Com publicação, quem monta
-- trabalha o mês em rascunho e publica de uma vez — e é isso que faz o time
-- confiar na escala. Enquanto o mês está em rascunho, o app de campo não o mostra.

CREATE TABLE IF NOT EXISTS schedule_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL,
  month text NOT NULL,                      /* 'YYYY-MM' */

  status text NOT NULL DEFAULT 'rascunho',  /* rascunho · publicada */
  "publishedAt" timestamptz,
  "publishedBy" text,
  "publishedByName" text,

  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  UNIQUE ("propertyId", month)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sp_status_chk') THEN
    ALTER TABLE schedule_periods ADD CONSTRAINT sp_status_chk
      CHECK (status IN ('rascunho','publicada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sp_month_chk') THEN
    ALTER TABLE schedule_periods ADD CONSTRAINT sp_month_chk
      CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6) SEGURANÇA
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Mesmo alvo de `time_clock_events` e do que a fatia 0 deixou nas tabelas velhas:
-- RLS ligada, ZERO política — nega tudo fora do service role. Todo acesso passa
-- por `/api/admin/rh/*` e `/api/rh/*`, que já escopam por propriedade.
--
-- Não "consertar" isto depois achando que falta política.

ALTER TABLE work_pattern_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_work_patterns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_absences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_periods       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON work_pattern_templates, staff_work_patterns, staff_absences,
              staff_shifts, schedule_periods
  FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7) MIGRAÇÃO DOS 19 CONFIGS
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Só o config ATUAL vira padrão (ver o cabeçalho: o `history` é log de save, não
-- versionamento). Vigência a partir de 01/09/2026 — a escala nova vale do mês
-- corrente para a frente, e o passado não ganha uma reconstrução falsa.

DO $$
DECLARE
  vigencia CONSTANT date := DATE '2026-09-01';
  r record;
  v_base text;
  v_weekdays int[];
  v_rules jsonb;
  v_on int;
  v_off int;
  v_anchor date;
  v_folga int;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id, "propertyId", "fullName", "scheduleConfig" AS c
    FROM staff
    WHERE "scheduleConfig" IS NOT NULL
  LOOP
    v_rules    := '[]'::jsonb;
    v_weekdays := NULL;
    v_on := NULL; v_off := NULL; v_anchor := NULL;
    v_folga := NULLIF(r.c->>'fixedDayOff', '')::int;

    IF (r.c->>'cycleReferenceDate') ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_anchor := (r.c->>'cycleReferenceDate')::date;
    END IF;

    CASE r.c->>'scheduleType'

      /* 6x1 — trabalha todo dia menos a folga fixa. NÃO é ciclo. */
      WHEN '6x1' THEN
        v_base := 'weekly';
        SELECT array_agg(d ORDER BY d) INTO v_weekdays
          FROM generate_series(0, 6) d
          WHERE v_folga IS NULL OR d <> v_folga;

        /* trabalha 3 domingos, folga o 4º */
        IF (r.c->>'sundayOffCycle')::boolean IS TRUE AND v_anchor IS NOT NULL THEN
          v_rules := v_rules || jsonb_build_array(jsonb_build_object(
            'kind', 'nth_weekday_off', 'weekday', 0,
            'everyN', 4, 'index', 3, 'anchor', v_anchor
          ));
        END IF;

      /* 5x2 — seg a sex, menos a folga fixa se houver. */
      WHEN '5x2' THEN
        v_base := 'weekly';
        SELECT array_agg(d ORDER BY d) INTO v_weekdays
          FROM generate_series(1, 5) d
          WHERE v_folga IS NULL OR d <> v_folga;

      /* 12x36 — ciclo de verdade: 1 dia sim, 1 dia não, a partir da âncora. */
      WHEN '12x36' THEN
        v_base := 'cycle';
        v_on := 1; v_off := 1;
        IF v_folga IS NOT NULL THEN
          v_rules := v_rules || jsonb_build_array(
            jsonb_build_object('kind', 'weekday_off', 'weekday', v_folga));
        END IF;

      /* custom caía na tabela staff_schedules, que tem 7 linhas de UMA pessoa e
         está sendo zerada. Vira 'none' — reconfigura-se na tela. */
      ELSE
        v_base := 'none';
    END CASE;

    /* 12x36 sem âncora não tem como alternar: cai para 'none' em vez de nascer
       gerando dia errado em silêncio. Nenhum dos 4 em produção cai aqui. */
    IF v_base = 'cycle' AND v_anchor IS NULL THEN
      v_base := 'none'; v_on := NULL; v_off := NULL; v_rules := '[]'::jsonb;
      RAISE NOTICE 'RH: % ficou sem âncora de ciclo — nasceu como "sem jornada fixa"', r."fullName";
    END IF;

    INSERT INTO staff_work_patterns (
      "staffId", "propertyId", base, "startTime", "endTime",
      weekdays, "cycleOnDays", "cycleOffDays", "cycleAnchor",
      rules, "weekdayTimeOverrides",
      "effectiveFrom", "legacyConfig", note, "createdByName"
    ) VALUES (
      r.id, r."propertyId", v_base,
      NULLIF(r.c->>'startTime', ''), NULLIF(r.c->>'endTime', ''),
      v_weekdays, v_on, v_off, v_anchor,
      v_rules, r.c->'weekdayTimeOverrides',
      vigencia, r.c, 'Migrado de scheduleConfig em 03/09/2026', 'migration'
    )
    ON CONFLICT DO NOTHING;

    n := n + 1;
  END LOOP;

  RAISE NOTICE 'RH: % padrões migrados', n;
END $$;

/* Os que não têm config e não vão ter jornada: estado EXPLÍCITO 'none', para
   pararem de aparecer como pendência. Só quem está ativo. */
INSERT INTO staff_work_patterns ("staffId", "propertyId", base, "effectiveFrom", note, "createdByName")
SELECT s.id, s."propertyId", 'none', DATE '2026-09-01',
       'Sem jornada fixa — criado na migração', 'migration'
FROM staff s
WHERE s.active
  AND s."scheduleConfig" IS NULL
  AND s.role IN ('director', 'admin', 'super_admin')
  AND NOT EXISTS (SELECT 1 FROM staff_work_patterns p WHERE p."staffId" = s.id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 8) MODELOS DE JORNADA a partir do que já existe
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Criados só onde a medição mostra repetição real: 6x1 08:20–16:20 (seis pessoas,
-- cada uma com o SEU dia de folga) e 12x36 08:30–20:30 (quatro, cada uma com a
-- SUA âncora). O `weekdays` do modelo fica nulo de propósito no 6x1 — quem
-- escolhe o dia de folga é a pessoa.

INSERT INTO work_pattern_templates ("propertyId", name, base, "startTime", "endTime", weekdays, "cycleOnDays", "cycleOffDays", rules, "createdBy")
SELECT DISTINCT p."propertyId", '6x1 · 08:20 às 16:20', 'weekly', '08:20', '16:20', NULL::int[], NULL::int, NULL::int,
       jsonb_build_array(jsonb_build_object('kind','nth_weekday_off','weekday',0,'everyN',4,'index',3)),
       'migration'
FROM staff_work_patterns p
WHERE p.base = 'weekly' AND p."startTime" = '08:20' AND p."endTime" = '16:20'
  AND NOT EXISTS (SELECT 1 FROM work_pattern_templates t
                  WHERE t."propertyId" = p."propertyId" AND t.name = '6x1 · 08:20 às 16:20');

INSERT INTO work_pattern_templates ("propertyId", name, base, "startTime", "endTime", weekdays, "cycleOnDays", "cycleOffDays", rules, "createdBy")
SELECT DISTINCT p."propertyId", '12x36 · 08:30 às 20:30', 'cycle', '08:30', '20:30', NULL::int[], 1, 1,
       '[]'::jsonb, 'migration'
FROM staff_work_patterns p
WHERE p.base = 'cycle' AND p."startTime" = '08:30' AND p."endTime" = '20:30'
  AND NOT EXISTS (SELECT 1 FROM work_pattern_templates t
                  WHERE t."propertyId" = p."propertyId" AND t.name = '12x36 · 08:30 às 20:30');

/* Anexa quem bate exatamente com o modelo. Quem tem horário próprio (a Nice
   começa 08:30, o Davi faz 08:00–12:00) fica solto, e está certo. */
UPDATE staff_work_patterns p SET "templateId" = t.id
FROM work_pattern_templates t
WHERE p."templateId" IS NULL
  AND t."propertyId" = p."propertyId"
  AND t.base = p.base
  AND t."startTime" = p."startTime"
  AND t."endTime" = p."endTime";

-- ══════════════════════════════════════════════════════════════════════════════
-- 9) ZERAR O MODELO VELHO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Decisão 10. São 30 registros somando as três tabelas, nenhum em uso desde
-- junho. As TABELAS ficam de pé até o deploy trocar os 11 call sites — derrubá-las
-- agora quebraria os apps de campo, que ainda leem as três rotas antigas.
--
-- O conteúdo sai; a casca cai numa faxina depois. `staff.scheduleType` e
-- `staff.scheduleConfig` também só caem depois do deploy (o calculador velho
-- ainda lê os dois).

DELETE FROM staff_schedule_overrides;
DELETE FROM staff_schedule_checkpoints;
DELETE FROM staff_schedules;

-- ══════════════════════════════════════════════════════════════════════════════
-- 10) A FLAG DO MÓDULO — com backfill EXPLÍCITO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Regra 5 da modularização: a chave nasce na fatia que a APLICA (é esta — a
-- página e a API vêm com gate). Regra 6: backfill explícito, nada de `defaultOn`
-- implícito, que já produziu dois defeitos medidos em produção.
--
-- O merge de `settings` é RASO: mandar o objeto inteiro sobrescreveria as outras
-- chaves. Por isso `||` sobre o jsonb existente, uma chave por vez.
--
-- Ligado só onde há operação de RH de verdade. A Estância do Vale tem dois
-- funcionários e uma cabana: é exatamente o caso que justifica a flag existir.

UPDATE properties
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('hasRH', true)
WHERE id = 'fazenda-do-rosa';

UPDATE properties
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('hasRH', false)
WHERE id <> 'fazenda-do-rosa';

-- ══════════════════════════════════════════════════════════════════════════════
-- 11) CONFERÊNCIA
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_padroes int; v_none int; v_sem int; v_velho int; v_flag int;
BEGIN
  SELECT count(*) INTO v_padroes FROM staff_work_patterns;
  SELECT count(*) INTO v_none    FROM staff_work_patterns WHERE base = 'none';
  SELECT count(*) INTO v_sem     FROM staff s
    WHERE s.active AND NOT EXISTS (SELECT 1 FROM staff_work_patterns p WHERE p."staffId" = s.id);
  SELECT count(*) INTO v_velho FROM (
    SELECT 1 FROM staff_schedules UNION ALL
    SELECT 1 FROM staff_schedule_overrides UNION ALL
    SELECT 1 FROM staff_schedule_checkpoints) x;
  SELECT count(*) INTO v_flag FROM properties WHERE settings ? 'hasRH';

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'padrões criados ......... %', v_padroes;
  RAISE NOTICE '  dos quais sem jornada . %', v_none;
  RAISE NOTICE 'ativos ainda sem padrão . %  (esperado: os que faltam cadastrar)', v_sem;
  RAISE NOTICE 'linhas no modelo velho .. %  (esperado: 0)', v_velho;
  RAISE NOTICE 'propriedades com hasRH .. %', v_flag;
  RAISE NOTICE '─────────────────────────────────────────────';

  IF v_velho <> 0 THEN
    RAISE EXCEPTION 'O modelo velho não ficou zerado (% linhas)', v_velho;
  END IF;
END $$;
