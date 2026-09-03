// src/services/hr-service.ts
//
// RH v2 — escala, ausências e o dia materializado. SERVER-ONLY (supabaseAdmin):
// tudo entra por /api/admin/rh/* e /api/rh/*.
//
// A conta de "trabalha ou não" NÃO mora aqui: mora em `src/lib/schedule-engine.ts`,
// que é puro e testável. Aqui se cuida de ler o banco, MATERIALIZAR o resultado
// numa linha por pessoa por dia, e responder as perguntas agregadas que o modelo
// velho não conseguia responder (horas do mês, quem trabalha domingo, quem está
// escalado num dia de ausência).
//
// Três invariantes que este arquivo protege:
//
//  1. ORIGEM `manual` É SAGRADA. O regerador reescreve tudo que veio do padrão ou
//     de ausência, e nunca toca no que uma pessoa ajustou à mão. Sem isso, salvar
//     a escala apagaria a correção de quem monta — que é exatamente o tipo de
//     defeito que faz um módulo deixar de ser usado.
//
//  2. AUSÊNCIA VENCE PADRÃO. Se a pessoa está de férias, o dia não é de trabalho,
//     por mais que o padrão diga que sim. O contrário nunca acontece: ausência não
//     cria dia de trabalho.
//
//  3. NADA SEM `propertyId`. Toda leitura e toda escrita filtram por propriedade —
//     é a regra 7 da modularização aplicada a `staff`.
import { supabaseAdmin } from "@/lib/supabase";
import {
  eachDay,
  daysOfMonth,
  addDaysYMD,
  diffDays,
  dowOf,
  minutesBetween,
  patternForDate,
  resolveDay,
  type WorkPattern,
} from "@/lib/schedule-engine";
import type {
  MeuDiaResponse,
  MonthGrid,
  MonthGridRow,
  ScheduleAlert,
  SchedulePeriod,
  ShiftOrigin,
  StaffAbsence,
  StaffShift,
  WorkPatternTemplate,
} from "@/types/hr";

function db() {
  if (!supabaseAdmin) throw new Error("HRService é server-only (supabaseAdmin ausente).");
  return supabaseAdmin;
}

export interface HRActor { id: string; name: string }

// Sem aspas no select: o PostgREST resolve camelCase sozinho, e as aspas derrubam
// a inferência de tipos do supabase-js (mesmo padrão de timeclock-service.ts).
const PATTERN_COLS =
  "id, staffId, propertyId, templateId, base, startTime, endTime, weekdays, " +
  "cycleOnDays, cycleOffDays, cycleAnchor, rules, weekdayTimeOverrides, " +
  "effectiveFrom, effectiveTo, note, createdBy, createdByName, createdAt";

const ABSENCE_COLS =
  "id, staffId, propertyId, type, startDate, endDate, isPartialDay, startTime, " +
  "endTime, status, reason, documentUrl, createdBy, createdByName, createdAt, updatedAt";

const SHIFT_COLS =
  "id, staffId, propertyId, date, isWork, startTime, endTime, plannedMinutes, " +
  "origin, absenceId, patternId, note, updatedBy, updatedByName, updatedAt";

const TEMPLATE_COLS =
  "id, propertyId, name, base, startTime, endTime, cycleOnDays, cycleOffDays, " +
  "weekdays, rules, weekdayTimeOverrides, archivedAt, createdBy, createdAt, updatedAt";

/** `select` montado por concatenação não é literal, então o supabase-js devolve
 *  o tipo de erro genérico. Estes dois helpers reancoram sem espalhar `any`. */
function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}
function row<T>(data: unknown): T | null {
  return (data ?? null) as T | null;
}

// ─── rótulo do padrão ────────────────────────────────────────────────────────

/**
 * Como a escala da pessoa se chama na tela. O modelo velho guardava "6x1" numa
 * coluna; aqui o nome é DERIVADO da forma, que é o que impede o rótulo de mentir
 * quando alguém muda a regra e esquece de trocar o tipo.
 */
export function patternLabel(p: WorkPattern | null | undefined): string {
  if (!p || p.base === "none") return "Sem jornada fixa";
  if (p.base === "cycle") {
    const on = p.cycleOnDays ?? 0;
    const off = p.cycleOffDays ?? 0;
    const horas = minutesBetween(p.startTime, p.endTime) / 60;
    // 1 dia sim / 1 dia não com turno de 12h é o que todo mundo chama de 12x36.
    if (on === 1 && off === 1 && horas === 12) return "12x36";
    return `Ciclo ${on}x${off}`;
  }
  const n = (p.weekdays ?? []).length;
  if (n === 5) return "5x2";
  if (n === 6) return "6x1";
  if (n === 7) return "Todos os dias";
  return `${n} dia(s) por semana`;
}

// ─── leitura ─────────────────────────────────────────────────────────────────

export const HRService = {
  async getPatterns(propertyId: string): Promise<WorkPattern[]> {
    const { data, error } = await db()
      .from("staff_work_patterns")
      .select(PATTERN_COLS)
      .eq("propertyId", propertyId);
    if (error) throw new Error(`Falha ao ler padrões de escala: ${error.message}`);
    return rows<WorkPattern>(data);
  },

  async getPatternsForStaff(staffId: string): Promise<WorkPattern[]> {
    const { data, error } = await db()
      .from("staff_work_patterns")
      .select(PATTERN_COLS)
      .eq("staffId", staffId)
      .order("effectiveFrom", { ascending: false });
    if (error) throw new Error(`Falha ao ler padrão da pessoa: ${error.message}`);
    return rows<WorkPattern>(data);
  },

  async getTemplates(propertyId: string): Promise<WorkPatternTemplate[]> {
    const { data, error } = await db()
      .from("work_pattern_templates")
      .select(TEMPLATE_COLS)
      .eq("propertyId", propertyId)
      .is("archivedAt", null)
      .order("name");
    if (error) throw new Error(`Falha ao ler modelos de jornada: ${error.message}`);
    return rows<WorkPatternTemplate>(data);
  },

  /** Ausências que TOCAM o período — não só as que começam dentro dele. */
  async getAbsences(propertyId: string, from: string, to: string): Promise<StaffAbsence[]> {
    const { data, error } = await db()
      .from("staff_absences")
      .select(ABSENCE_COLS)
      .eq("propertyId", propertyId)
      .neq("status", "cancelada")
      .lte("startDate", to)
      .gte("endDate", from)
      .order("startDate");
    if (error) throw new Error(`Falha ao ler ausências: ${error.message}`);
    return rows<StaffAbsence>(data);
  },

  async getShifts(propertyId: string, from: string, to: string): Promise<StaffShift[]> {
    const { data, error } = await db()
      .from("staff_shifts")
      .select(SHIFT_COLS)
      .eq("propertyId", propertyId)
      .gte("date", from)
      .lte("date", to)
      .order("date");
    if (error) throw new Error(`Falha ao ler escala: ${error.message}`);
    return rows<StaffShift>(data);
  },

  async getPeriod(propertyId: string, month: string): Promise<SchedulePeriod | null> {
    const { data, error } = await db()
      .from("schedule_periods")
      .select("*")
      .eq("propertyId", propertyId)
      .eq("month", month)
      .maybeSingle();
    if (error) throw new Error(`Falha ao ler publicação do mês: ${error.message}`);
    return row<SchedulePeriod>(data);
  },

  // ─── materialização ────────────────────────────────────────────────────────

  /**
   * Gera (ou regera) os dias de um período. Idempotente por (staffId, date).
   *
   * O que NÃO é tocado: linhas com `origin = 'manual'`. Quem montou a escala
   * mexeu naquela célula de propósito, e regerar não pode desfazer isso — a
   * pessoa mexe de novo se quiser voltar ao padrão.
   *
   * Devolve quantos dias foram escritos e quantos foram preservados, porque é
   * isso que a tela mostra depois de "Regerar".
   */
  async materialize(
    propertyId: string,
    from: string,
    to: string,
    opts: { staffIds?: string[] } = {},
  ): Promise<{ gravados: number; preservados: number }> {
    const client = db();

    let staffQuery = client
      .from("staff")
      .select("id, fullName, role, active")
      .eq("propertyId", propertyId)
      .eq("active", true);
    if (opts.staffIds?.length) staffQuery = staffQuery.in("id", opts.staffIds);

    const { data: staffData, error: staffError } = await staffQuery;
    if (staffError) throw new Error(`Falha ao ler equipe: ${staffError.message}`);
    const equipe = rows<{ id: string; fullName: string; role: string }>(staffData);
    if (equipe.length === 0) return { gravados: 0, preservados: 0 };

    const [padroes, ausencias, existentes] = await Promise.all([
      this.getPatterns(propertyId),
      this.getAbsences(propertyId, from, to),
      this.getShifts(propertyId, from, to),
    ]);

    const porPessoa = new Map<string, WorkPattern[]>();
    for (const p of padroes) {
      const lista = porPessoa.get(p.staffId) ?? [];
      lista.push(p);
      porPessoa.set(p.staffId, lista);
    }

    const manuais = new Set(
      existentes.filter(s => s.origin === "manual").map(s => `${s.staffId}|${s.date}`),
    );

    const dias = eachDay(from, to);
    const linhas: Array<Record<string, unknown>> = [];
    let preservados = 0;

    for (const pessoa of equipe) {
      const patterns = porPessoa.get(pessoa.id) ?? [];
      const minhasAusencias = ausencias.filter(a => a.staffId === pessoa.id);

      // Quem não tem jornada não gera linha nenhuma. Gravar 30 dias de
      // `isWork=false` para um diretor faria o relatório dizer "30 folgas" onde a
      // verdade é "não tem escala" — e são ~900 linhas por trimestre de dado que
      // mente. A grade mostra a pessoa em `semPadrao`, que é a informação certa.
      const temJornada = patterns.some(p => p.base !== "none");
      if (!temJornada && minhasAusencias.length === 0) continue;

      for (const ymd of dias) {
        if (manuais.has(`${pessoa.id}|${ymd}`)) {
          preservados++;
          continue;
        }

        const pattern = patternForDate(patterns, ymd);
        const dia = resolveDay(pattern, ymd);

        const ausencia = minhasAusencias.find(a => a.startDate <= ymd && a.endDate >= ymd);

        let isWork = dia.isWork;
        let startTime = dia.startTime ?? null;
        let endTime = dia.endTime ?? null;
        let plannedMinutes = dia.plannedMinutes;
        let origin: ShiftOrigin = "pattern";
        let absenceId: string | null = null;
        let note: string | null = dia.reason ?? null;

        if (ausencia) {
          origin = "absence";
          absenceId = ausencia.id;
          note = ausencia.reason ?? ausencia.type;
          if (ausencia.isPartialDay && dia.isWork) {
            // Saída ao médico não apaga o dia: encurta.
            const foraMin = minutesBetween(ausencia.startTime, ausencia.endTime);
            plannedMinutes = Math.max(0, dia.plannedMinutes - foraMin);
          } else {
            // Invariante 2: ausência vence padrão, e nunca cria dia de trabalho.
            isWork = false;
            startTime = null;
            endTime = null;
            plannedMinutes = 0;
          }
        }

        linhas.push({
          staffId: pessoa.id,
          propertyId,
          date: ymd,
          isWork,
          startTime,
          endTime,
          plannedMinutes,
          origin,
          absenceId,
          patternId: pattern?.id ?? null,
          note,
          updatedBy: "system",
          updatedByName: "Gerador de escala",
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Lotes de 500: o PostgREST engasga em payload muito grande, e um mês de 32
    // pessoas já são ~960 linhas.
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await client
        .from("staff_shifts")
        .upsert(linhas.slice(i, i + 500), { onConflict: "staffId,date" });
      if (error) throw new Error(`Falha ao gravar escala: ${error.message}`);
    }

    return { gravados: linhas.length, preservados };
  },

  // ─── a grade do mês ────────────────────────────────────────────────────────

  async getMonthGrid(propertyId: string, month: string): Promise<MonthGrid> {
    const dias = daysOfMonth(month);
    const from = dias[0];
    const to = dias[dias.length - 1];

    const client = db();
    const [{ data: staffData, error: staffError }, shifts, padroes, ausencias, periodo] =
      await Promise.all([
        client
          .from("staff")
          .select("id, fullName, role")
          .eq("propertyId", propertyId)
          .eq("active", true)
          .order("role")
          .order("fullName"),
        this.getShifts(propertyId, from, to),
        this.getPatterns(propertyId),
        this.getAbsences(propertyId, from, to),
        this.getPeriod(propertyId, month),
      ]);
    if (staffError) throw new Error(`Falha ao ler equipe: ${staffError.message}`);

    const equipe = rows<{ id: string; fullName: string; role: string }>(staffData);

    const porPessoa = new Map<string, WorkPattern[]>();
    for (const p of padroes) {
      const lista = porPessoa.get(p.staffId) ?? [];
      lista.push(p);
      porPessoa.set(p.staffId, lista);
    }

    const shiftsPorPessoa = new Map<string, Record<string, StaffShift>>();
    for (const s of shifts) {
      const mapa = shiftsPorPessoa.get(s.staffId) ?? {};
      mapa[s.date] = s;
      shiftsPorPessoa.set(s.staffId, mapa);
    }

    const linhas: MonthGridRow[] = equipe.map(p => {
      const days = shiftsPorPessoa.get(p.id) ?? {};
      const vigente = patternForDate(porPessoa.get(p.id) ?? [], to);
      return {
        staffId: p.id,
        staffName: p.fullName,
        role: p.role,
        patternLabel: patternLabel(vigente),
        days,
        plannedMinutes: Object.values(days).reduce((acc, d) => acc + (d.plannedMinutes ?? 0), 0),
      };
    });

    const semPadrao = equipe
      .filter(p => (porPessoa.get(p.id) ?? []).length === 0)
      .map(p => ({ staffId: p.id, staffName: p.fullName, role: p.role }));

    return {
      month,
      propertyId,
      status: periodo?.status ?? "rascunho",
      publishedAt: periodo?.publishedAt ?? null,
      rows: linhas,
      alerts: computeAlerts(linhas, ausencias, semPadrao, dias),
      semPadrao,
    };
  },

  // ─── o dia da pessoa (o que os apps de campo consomem) ─────────────────────

  /**
   * Substitui as três requisições que cada app de campo dispara hoje para
   * escrever uma linha de texto. Devolve o rótulo já montado — a tela não
   * recalcula nada, o que também tira o fuso do navegador da conta.
   */
  async getMeuDia(
    staff: { id: string; propertyId: string },
    from: string,
    to: string,
    today: string,
  ): Promise<MeuDiaResponse> {
    const client = db();
    const [{ data: shiftData, error }, patterns, periodo, ausencias] = await Promise.all([
      client
        .from("staff_shifts")
        .select(SHIFT_COLS)
        .eq("staffId", staff.id)
        .gte("date", from)
        .lte("date", to)
        .order("date"),
      this.getPatternsForStaff(staff.id),
      this.getPeriod(staff.propertyId, today.slice(0, 7)),
      this.getAbsences(staff.propertyId, from, to),
    ]);
    if (error) throw new Error(`Falha ao ler sua escala: ${error.message}`);

    const porData = new Map(rows<StaffShift>(shiftData).map(s => [s.date, s]));
    const minhasAusencias = ausencias.filter(a => a.staffId === staff.id);
    const vigente = patternForDate(patterns, today);

    const days = eachDay(from, to).map(date => {
      const s = porData.get(date);

      // Sem linha materializada, CALCULA na hora a partir do padrão. É o que
      // impede o app de campo de mostrar "Sem escala definida" só porque o mês
      // ainda não foi gerado — regressão que a pessoa sentiria antes de qualquer
      // um perceber que faltou rodar o gerador. Leitura pura: não grava nada.
      if (!s) {
        const pattern = patternForDate(patterns, date);
        const dia = resolveDay(pattern, date);
        const ausencia = minhasAusencias.find(a => a.startDate <= date && a.endDate >= date);
        const trabalha = dia.isWork && !(ausencia && !ausencia.isPartialDay);

        if (!pattern) {
          return {
            date,
            isWork: false,
            startTime: null,
            endTime: null,
            label: "Sem escala definida",
            hasOverride: false,
            origin: "pattern" as ShiftOrigin,
            reason: null,
          };
        }
        return {
          date,
          isWork: trabalha,
          startTime: trabalha ? dia.startTime ?? null : null,
          endTime: trabalha ? dia.endTime ?? null : null,
          label: trabalha
            ? `${dia.startTime ?? ""}${dia.endTime ? ` às ${dia.endTime}` : ""}`.trim() || "Trabalho"
            : "Folga",
          hasOverride: Boolean(ausencia),
          origin: (ausencia ? "absence" : "pattern") as ShiftOrigin,
          reason: ausencia ? ausencia.reason ?? ausencia.type : dia.reason ?? null,
        };
      }

      const label = s.isWork
        ? `${s.startTime ?? ""}${s.endTime ? ` às ${s.endTime}` : ""}`.trim() || "Trabalho"
        : "Folga";
      return {
        date,
        isWork: s.isWork,
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
        label,
        hasOverride: s.origin !== "pattern",
        origin: s.origin,
        reason: s.note ?? null,
      };
    });

    return {
      today,
      days,
      patternLabel: patternLabel(vigente),
      published: periodo?.status === "publicada",
    };
  },

  // ─── escrita ───────────────────────────────────────────────────────────────

  /**
   * Salva um padrão novo para a pessoa. A versão anterior NÃO é apagada: ganha
   * `effectiveTo` na véspera. É o que torna "quem estava em 12x36 em maio" uma
   * pergunta com resposta — o modelo velho empilhava isso num array dentro de um
   * blob e por isso não respondia.
   */
  async savePattern(
    input: Omit<WorkPattern, "id"> & { id?: string },
    actor: HRActor,
  ): Promise<WorkPattern> {
    const client = db();

    const { data: abertos, error: readError } = await client
      .from("staff_work_patterns")
      .select("id, effectiveFrom")
      .eq("staffId", input.staffId)
      .is("effectiveTo", null);
    if (readError) throw new Error(`Falha ao ler padrão vigente: ${readError.message}`);

    for (const aberto of rows<{ id: string; effectiveFrom: string }>(abertos)) {
      if (aberto.id === input.id) continue;
      const fim = addDaysYMD(input.effectiveFrom, -1);
      // Padrão novo que começa antes do vigente seria buraco de vigência: em vez
      // de gravar dado inconsistente, o anterior é encerrado no próprio início.
      const effectiveTo = fim < aberto.effectiveFrom ? aberto.effectiveFrom : fim;
      const { error } = await client
        .from("staff_work_patterns")
        .update({ effectiveTo })
        .eq("id", aberto.id);
      if (error) throw new Error(`Falha ao encerrar padrão anterior: ${error.message}`);
    }

    const payload = {
      staffId: input.staffId,
      propertyId: input.propertyId,
      templateId: input.templateId ?? null,
      base: input.base,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      weekdays: input.weekdays ?? null,
      cycleOnDays: input.cycleOnDays ?? null,
      cycleOffDays: input.cycleOffDays ?? null,
      cycleAnchor: input.cycleAnchor ?? null,
      rules: input.rules ?? [],
      weekdayTimeOverrides: input.weekdayTimeOverrides ?? null,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      note: input.note ?? null,
      createdBy: actor.id,
      createdByName: actor.name,
    };

    const { data, error } = input.id
      ? await client.from("staff_work_patterns").update(payload).eq("id", input.id).select(PATTERN_COLS).single()
      : await client.from("staff_work_patterns").insert(payload).select(PATTERN_COLS).single();
    if (error) throw new Error(`Falha ao salvar padrão: ${error.message}`);

    return row<WorkPattern>(data)!;
  },

  /** Ajuste manual de uma célula. Vira `origin='manual'` e o regerador respeita. */
  async setDay(
    input: {
      staffId: string;
      propertyId: string;
      date: string;
      isWork: boolean;
      startTime?: string | null;
      endTime?: string | null;
      note?: string | null;
    },
    actor: HRActor,
  ): Promise<StaffShift> {
    const { data, error } = await db()
      .from("staff_shifts")
      .upsert(
        {
          staffId: input.staffId,
          propertyId: input.propertyId,
          date: input.date,
          isWork: input.isWork,
          startTime: input.isWork ? input.startTime ?? null : null,
          endTime: input.isWork ? input.endTime ?? null : null,
          plannedMinutes: input.isWork ? minutesBetween(input.startTime, input.endTime) : 0,
          origin: "manual",
          absenceId: null,
          note: input.note ?? null,
          updatedBy: actor.id,
          updatedByName: actor.name,
          updatedAt: new Date().toISOString(),
        },
        { onConflict: "staffId,date" },
      )
      .select(SHIFT_COLS)
      .single();
    if (error) throw new Error(`Falha ao ajustar o dia: ${error.message}`);
    return row<StaffShift>(data)!;
  },

  /** Devolve a célula ao padrão: apaga o ajuste manual e regera aquele dia. */
  async resetDay(staffId: string, propertyId: string, date: string): Promise<void> {
    const { error } = await db()
      .from("staff_shifts")
      .delete()
      .eq("staffId", staffId)
      .eq("date", date);
    if (error) throw new Error(`Falha ao desfazer o ajuste: ${error.message}`);
    await this.materialize(propertyId, date, date, { staffIds: [staffId] });
  },

  async saveAbsence(
    input: Omit<StaffAbsence, "id" | "createdAt" | "updatedAt"> & { id?: string },
    actor: HRActor,
  ): Promise<StaffAbsence> {
    const client = db();
    const payload = {
      staffId: input.staffId,
      propertyId: input.propertyId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      isPartialDay: input.isPartialDay ?? false,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      status: input.status ?? "confirmada",
      reason: input.reason ?? null,
      documentUrl: input.documentUrl ?? null,
      createdBy: actor.id,
      createdByName: actor.name,
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = input.id
      ? await client.from("staff_absences").update(payload).eq("id", input.id).select(ABSENCE_COLS).single()
      : await client.from("staff_absences").insert(payload).select(ABSENCE_COLS).single();
    if (error) throw new Error(`Falha ao salvar ausência: ${error.message}`);

    // A escala do período tem que refletir a ausência na hora — senão a tela
    // mostra a pessoa escalada num dia em que ela está de férias.
    await this.materialize(input.propertyId, input.startDate, input.endDate, {
      staffIds: [input.staffId],
    });

    return row<StaffAbsence>(data)!;
  },

  async deleteAbsence(id: string): Promise<void> {
    const client = db();
    const { data, error: readError } = await client
      .from("staff_absences")
      .select("staffId, propertyId, startDate, endDate")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw new Error(`Falha ao ler ausência: ${readError.message}`);
    const a = row<{ staffId: string; propertyId: string; startDate: string; endDate: string }>(data);
    if (!a) return;

    const { error } = await client.from("staff_absences").delete().eq("id", id);
    if (error) throw new Error(`Falha ao apagar ausência: ${error.message}`);

    await this.materialize(a.propertyId, a.startDate, a.endDate, { staffIds: [a.staffId] });
  },

  /**
   * Publica o mês. Antes de publicar, materializa — publicar um mês pela metade
   * seria pior do que não publicar, porque o time confiaria nele.
   */
  async publishMonth(propertyId: string, month: string, actor: HRActor): Promise<SchedulePeriod> {
    const dias = daysOfMonth(month);
    await this.materialize(propertyId, dias[0], dias[dias.length - 1]);

    const { data, error } = await db()
      .from("schedule_periods")
      .upsert(
        {
          propertyId,
          month,
          status: "publicada",
          publishedAt: new Date().toISOString(),
          publishedBy: actor.id,
          publishedByName: actor.name,
          updatedAt: new Date().toISOString(),
        },
        { onConflict: "propertyId,month" },
      )
      .select("*")
      .single();
    if (error) throw new Error(`Falha ao publicar o mês: ${error.message}`);
    return row<SchedulePeriod>(data)!;
  },

  async unpublishMonth(propertyId: string, month: string): Promise<void> {
    const { error } = await db()
      .from("schedule_periods")
      .update({ status: "rascunho", publishedAt: null, updatedAt: new Date().toISOString() })
      .eq("propertyId", propertyId)
      .eq("month", month);
    if (error) throw new Error(`Falha ao despublicar o mês: ${error.message}`);
  },

  /** Copia o mês anterior para o atual, respeitando ajustes manuais já feitos. */
  async replicatePreviousMonth(propertyId: string, month: string, actor: HRActor): Promise<number> {
    const dias = daysOfMonth(month);
    const anterior = addDaysYMD(dias[0], -1).slice(0, 7);
    const diasAnterior = daysOfMonth(anterior);

    const [origem, destino] = await Promise.all([
      this.getShifts(propertyId, diasAnterior[0], diasAnterior[diasAnterior.length - 1]),
      this.getShifts(propertyId, dias[0], dias[dias.length - 1]),
    ]);

    const jaManual = new Set(
      destino.filter(s => s.origin === "manual").map(s => `${s.staffId}|${s.date}`),
    );

    // Alinha pelo DIA DA SEMANA, não pelo número do dia: copiar "dia 1 → dia 1"
    // jogaria a folga de domingo para uma quarta.
    const deslocamento = diffDays(dias[0], diasAnterior[0]);
    const alinhado = deslocamento - (deslocamento % 7);

    const linhas = origem
      .map(s => {
        const novaData = addDaysYMD(s.date, alinhado);
        return { s, novaData };
      })
      .filter(({ novaData }) => novaData >= dias[0] && novaData <= dias[dias.length - 1])
      .filter(({ s, novaData }) => !jaManual.has(`${s.staffId}|${novaData}`))
      .map(({ s, novaData }) => ({
        staffId: s.staffId,
        propertyId,
        date: novaData,
        isWork: s.isWork,
        startTime: s.startTime,
        endTime: s.endTime,
        plannedMinutes: s.plannedMinutes,
        origin: "manual" as ShiftOrigin,
        absenceId: null,
        note: s.note,
        updatedBy: actor.id,
        updatedByName: actor.name,
        updatedAt: new Date().toISOString(),
      }));

    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await db()
        .from("staff_shifts")
        .upsert(linhas.slice(i, i + 500), { onConflict: "staffId,date" });
      if (error) throw new Error(`Falha ao replicar o mês: ${error.message}`);
    }
    return linhas.length;
  },
};

// ─── alertas ─────────────────────────────────────────────────────────────────

/** Máximo de dias seguidos antes de virar alerta. Seis é o limite do 6x1. */
const MAX_DIAS_SEGUIDOS = 6;
/** Descanso mínimo entre duas jornadas, em minutos. */
const INTERVALO_MINIMO = 11 * 60;

/**
 * Os alertas AVISAM, nunca bloqueiam — decisão do dono. Quem monta a escala vê o
 * problema e decide; o sistema não sabe do combinado que existe fora dele.
 */
function computeAlerts(
  linhas: MonthGridRow[],
  ausencias: StaffAbsence[],
  semPadrao: Array<{ staffId: string; staffName: string; role: string }>,
  dias: string[],
): ScheduleAlert[] {
  const alerts: ScheduleAlert[] = [];

  for (const p of semPadrao) {
    alerts.push({
      kind: "sem_padrao",
      severity: "media",
      staffId: p.staffId,
      staffName: p.staffName,
      message: `${p.staffName} não tem jornada cadastrada — não entra na escala.`,
    });
  }

  for (const linha of linhas) {
    let seguidos = 0;
    let inicioSequencia: string | null = null;

    for (const ymd of dias) {
      const dia = linha.days[ymd];

      if (dia?.isWork) {
        if (seguidos === 0) inicioSequencia = ymd;
        seguidos++;
        if (seguidos === MAX_DIAS_SEGUIDOS + 1) {
          alerts.push({
            kind: "muitos_dias_seguidos",
            severity: "alta",
            staffId: linha.staffId,
            staffName: linha.staffName,
            date: inicioSequencia ?? ymd,
            message: `${linha.staffName} fica mais de ${MAX_DIAS_SEGUIDOS} dias seguidos sem folga a partir de ${br(inicioSequencia ?? ymd)}.`,
          });
        }
      } else {
        seguidos = 0;
        inicioSequencia = null;
      }

      // Escalado num dia em que está ausente. Depois de materializar isso não
      // deveria acontecer — mas um ajuste manual consegue produzir, e é
      // exatamente o erro que ninguém percebe até a pessoa não aparecer.
      if (dia?.isWork) {
        const ausencia = ausencias.find(
          a => a.staffId === linha.staffId && !a.isPartialDay && a.startDate <= ymd && a.endDate >= ymd,
        );
        if (ausencia) {
          alerts.push({
            kind: "escalado_e_ausente",
            severity: "alta",
            staffId: linha.staffId,
            staffName: linha.staffName,
            date: ymd,
            message: `${linha.staffName} está escalada em ${br(ymd)} e ausente (${ausencia.type}).`,
          });
        }
      }

      // Intervalo entre o fim de ontem e o começo de hoje.
      const ontem = linha.days[addDaysYMD(ymd, -1)];
      if (dia?.isWork && ontem?.isWork && ontem.endTime && dia.startTime) {
        const folga = minutesBetween(ontem.endTime, dia.startTime);
        if (folga > 0 && folga < INTERVALO_MINIMO) {
          alerts.push({
            kind: "intervalo_curto",
            severity: "media",
            staffId: linha.staffId,
            staffName: linha.staffName,
            date: ymd,
            message: `${linha.staffName} tem menos de 11h entre o turno de ${br(addDaysYMD(ymd, -1))} e o de ${br(ymd)}.`,
          });
        }
      }
    }
  }

  // Setor descoberto: só faz sentido para cargo que tem gente suficiente para se
  // esperar cobertura todo dia. Com uma pessoa só, "descoberto" é a folga dela.
  const porCargo = new Map<string, MonthGridRow[]>();
  for (const linha of linhas) {
    const lista = porCargo.get(linha.role) ?? [];
    lista.push(linha);
    porCargo.set(linha.role, lista);
  }
  for (const [role, membros] of Array.from(porCargo.entries())) {
    if (membros.length < 2) continue;
    for (const ymd of dias) {
      const temAlguem = membros.some(m => m.days[ymd]?.isWork);
      const temEscala = membros.some(m => m.days[ymd]);
      if (temEscala && !temAlguem) {
        alerts.push({
          kind: "setor_descoberto",
          severity: "media",
          date: ymd,
          message: `Ninguém de ${role} trabalha em ${br(ymd)} (${dowLabel(ymd)}).`,
        });
      }
    }
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "alta" ? -1 : 1));
}

function br(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

const DOWS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function dowLabel(ymd: string): string {
  return DOWS[dowOf(ymd)];
}
