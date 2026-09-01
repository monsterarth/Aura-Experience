// src/services/timeclock-service.ts
//
// Módulo Ponto — fase 1 (registro dentro do Aura). SERVER-ONLY (supabaseAdmin):
// tudo entra por /api/admin/timeclock.
//
// A tabela guarda BATIDAS, não jornadas. O pareamento entrada→saída e os totais
// são derivados em src/lib/timeclock.ts, no cliente — que é onde o fuso da
// pousada existe. Aqui se cuida de gravar, corrigir com rastro e ler período.
//
// Três invariantes que este arquivo protege:
//  1. Só bate ponto no Aura quem tem `staff.timeSource === 'aura'`. Quem está em
//     'rep' recebe batida por importação, e deixar os dois caminhos abertos para
//     a mesma pessoa produziria dois totais concorrentes de horas.
//  2. Batida nunca é apagada nem sobrescrita em silêncio: ajuste preserva
//     `originalTs`, exclusão é lógica e carrega motivo.
//  3. Dois cliques seguidos no mesmo botão não viram duas batidas.
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { localHM } from "@/lib/timeclock";
import type { Staff, TimeClockEvent, TimeSource } from "@/types/aura";

export interface TimeClockActor { id: string; name: string }

function db() {
  if (!supabaseAdmin) throw new Error("TimeClockService é server-only (supabaseAdmin ausente).");
  return supabaseAdmin;
}

/**
 * Janela em que uma segunda batida do mesmo tipo é considerada repique de
 * clique, não intenção. Curta o bastante para não atrapalhar quem sai e volta
 * de fato (ninguém trabalha 40 segundos), longa o bastante para cobrir duplo
 * toque em conexão ruim.
 */
export const MIN_PUNCH_INTERVAL_SECONDS = 60;

// Sem aspas: o PostgREST resolve camelCase sozinho no `select`, e as aspas
// derrubam a inferência de tipos do supabase-js (mesmo padrão de api-auth.ts).
const COLUMNS =
  "id, staffId, propertyId, ts, kind, source, ip, lat, lng, geoAccuracy, note, " +
  "createdBy, createdByName, createdAt, originalTs, editedBy, editedByName, " +
  "editedAt, deletedAt, deletedBy, deletedByName, deleteReason, repSerial, nsr";

/** O `select` por string concatenada não é literal, então o supabase-js não
 *  consegue inferir a linha e devolve o tipo de erro genérico. Estes dois
 *  helpers concentram o cast num lugar só, em vez de espalhá-lo por chamada. */
function mapRow(row: unknown): TimeClockEvent {
  return row as TimeClockEvent;
}

function mapRows(rows: unknown): TimeClockEvent[] {
  return (rows ?? []) as TimeClockEvent[];
}

export const TimeClockService = {
  /** Cadastro de quem registra ponto — usado pelo painel de gestão. */
  async listTrackedStaff(propertyId: string): Promise<Staff[]> {
    const { data, error } = await db()
      .from("staff")
      .select("*")
      .eq("propertyId", propertyId)
      .neq("timeSource", "none")
      .order("fullName");
    if (error) throw new Error(error.message);
    return (data ?? []) as Staff[];
  },

  async getStaff(staffId: string): Promise<Staff | null> {
    const { data, error } = await db().from("staff").select("*").eq("id", staffId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Staff) ?? null;
  },

  /**
   * Batidas de um período. `to` é exclusivo — quem chama passa o início do dia
   * seguinte, para não depender de "23:59:59.999" e perder a batida do segundo
   * final do último dia.
   */
  async listEvents(params: { staffId?: string; propertyId?: string; from: string; to: string }): Promise<TimeClockEvent[]> {
    let query = db()
      .from("time_clock_events")
      .select(COLUMNS)
      .gte("ts", params.from)
      .lt("ts", params.to)
      .order("ts", { ascending: true });

    if (params.staffId) query = query.eq("staffId", params.staffId);
    else if (params.propertyId) query = query.eq("propertyId", params.propertyId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return mapRows(data);
  },

  async getEvent(eventId: string): Promise<TimeClockEvent | null> {
    const { data, error } = await db()
      .from("time_clock_events")
      .select(COLUMNS)
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapRow(data) : null;
  },

  /** A última batida válida da pessoa — base da trava anti-repique. */
  async lastEvent(staffId: string): Promise<TimeClockEvent | null> {
    const { data, error } = await db()
      .from("time_clock_events")
      .select(COLUMNS)
      .eq("staffId", staffId)
      .is("deletedAt", null)
      .order("ts", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ? mapRow(data[0]) : null;
  },

  /**
   * Registra a batida do próprio funcionário.
   *
   * O `kind` vem decidido pelo cliente a partir do estado que ele está vendo, e
   * é reconferido aqui: se a última batida já é do mesmo tipo, a segunda é
   * recusada. Sem isso, dois toques no botão abrem duas entradas e a jornada
   * seguinte nasce torta.
   */
  async punch(params: {
    staffId: string;
    propertyId: string | null;
    kind: "in" | "out";
    actor: TimeClockActor;
    ip?: string | null;
    lat?: number | null;
    lng?: number | null;
    geoAccuracy?: number | null;
  }): Promise<{ event: TimeClockEvent } | { error: string }> {
    const staff = await this.getStaff(params.staffId);
    if (!staff) return { error: "Funcionário não encontrado." };
    if ((staff.timeSource ?? "none") !== "aura") {
      return { error: "Esta pessoa não registra ponto pelo Aura." };
    }

    const last = await this.lastEvent(params.staffId);
    if (last) {
      const secondsSince = (Date.now() - new Date(last.ts).getTime()) / 1000;
      if (last.kind === params.kind && secondsSince < MIN_PUNCH_INTERVAL_SECONDS) {
        return { error: `Já registrado às ${localHM(last.ts)}.` };
      }
      if (last.kind === params.kind) {
        return {
          error: params.kind === "in"
            ? "Já existe uma entrada em aberto. Registre a saída ou corrija em Ponto."
            : "Não há entrada em aberto para fechar.",
        };
      }
    } else if (params.kind === "out") {
      return { error: "Não há entrada em aberto para fechar." };
    }

    const { data, error } = await db()
      .from("time_clock_events")
      .insert({
        "staffId": params.staffId,
        "propertyId": params.propertyId,
        ts: new Date().toISOString(),
        kind: params.kind,
        source: "aura",
        ip: params.ip ?? null,
        lat: params.lat ?? null,
        lng: params.lng ?? null,
        "geoAccuracy": params.geoAccuracy ?? null,
        "createdBy": params.actor.id,
        "createdByName": params.actor.name,
      })
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return { event: mapRow(data) };
  },

  /**
   * Lança uma batida que faltou (esquecimento). Nasce com `source: 'manual'` —
   * o relatório mostra quais horas foram digitadas em vez de registradas, e essa
   * distinção é justamente o que dá valor às outras.
   */
  async addManual(params: {
    staffId: string;
    propertyId: string | null;
    ts: string;
    kind: "in" | "out";
    note?: string | null;
    actor: TimeClockActor;
  }): Promise<TimeClockEvent> {
    const { data, error } = await db()
      .from("time_clock_events")
      .insert({
        "staffId": params.staffId,
        "propertyId": params.propertyId,
        ts: params.ts,
        kind: params.kind,
        source: "manual",
        note: params.note ?? null,
        "createdBy": params.actor.id,
        "createdByName": params.actor.name,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    const created = mapRow(data);

    await AuditService.log({
      propertyId: params.propertyId ?? "",
      userId: params.actor.id,
      userName: params.actor.name,
      action: "TIMECLOCK_MANUAL",
      entity: "TIMECLOCK",
      entityId: created.id,
      newData: { staffId: params.staffId, ts: params.ts, kind: params.kind },
      details: `Batida lançada à mão: ${params.kind === "in" ? "entrada" : "saída"} ${new Date(params.ts).toLocaleString("pt-BR")}`,
    });

    return created;
  },

  /**
   * Corrige o horário de uma batida.
   *
   * `originalTs` só é escrito na PRIMEIRA correção: ele guarda o valor com que a
   * batida nasceu, não o penúltimo palpite. Correções seguintes atualizam quem e
   * quando, e o histórico completo fica na auditoria.
   */
  async adjust(params: {
    eventId: string;
    ts: string;
    note?: string | null;
    actor: TimeClockActor;
  }): Promise<TimeClockEvent> {
    const { data: current, error: readError } = await db()
      .from("time_clock_events")
      .select(COLUMNS)
      .eq("id", params.eventId)
      .single();
    if (readError) throw new Error(readError.message);

    const previous = mapRow(current);
    const patch: Record<string, unknown> = {
      ts: params.ts,
      "editedBy": params.actor.id,
      "editedByName": params.actor.name,
      "editedAt": new Date().toISOString(),
    };
    if (!previous.originalTs) patch["originalTs"] = previous.ts;
    if (params.note !== undefined) patch.note = params.note;

    const { data, error } = await db()
      .from("time_clock_events")
      .update(patch)
      .eq("id", params.eventId)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId: previous.propertyId ?? "",
      userId: params.actor.id,
      userName: params.actor.name,
      action: "TIMECLOCK_ADJUSTED",
      entity: "TIMECLOCK",
      entityId: params.eventId,
      oldData: { ts: previous.ts },
      newData: { ts: params.ts, note: params.note ?? null },
      details: `Batida corrigida: ${new Date(previous.ts).toLocaleString("pt-BR")} → ${new Date(params.ts).toLocaleString("pt-BR")}`,
    });

    return mapRow(data);
  },

  /** Exclusão LÓGICA: sai do cálculo, permanece no histórico. */
  async remove(params: { eventId: string; reason?: string | null; actor: TimeClockActor }): Promise<void> {
    const { data: current, error: readError } = await db()
      .from("time_clock_events")
      .select(COLUMNS)
      .eq("id", params.eventId)
      .single();
    if (readError) throw new Error(readError.message);
    const previous = mapRow(current);

    const { error } = await db()
      .from("time_clock_events")
      .update({
        "deletedAt": new Date().toISOString(),
        "deletedBy": params.actor.id,
        "deletedByName": params.actor.name,
        "deleteReason": params.reason ?? null,
      })
      .eq("id", params.eventId);
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId: previous.propertyId ?? "",
      userId: params.actor.id,
      userName: params.actor.name,
      action: "TIMECLOCK_DELETED",
      entity: "TIMECLOCK",
      entityId: params.eventId,
      oldData: { ts: previous.ts, kind: previous.kind },
      details: `Batida excluída (${previous.kind === "in" ? "entrada" : "saída"} ${new Date(previous.ts).toLocaleString("pt-BR")})${params.reason ? ` — ${params.reason}` : ""}`,
    });
  },

  /** Troca a origem do ponto de alguém. Auditado: muda como as horas nascem. */
  async setSource(params: {
    staffId: string;
    staffName: string;
    propertyId: string | null;
    source: TimeSource;
    actor: TimeClockActor;
  }): Promise<void> {
    const { error } = await db()
      .from("staff")
      .update({ "timeSource": params.source })
      .eq("id", params.staffId);
    if (error) throw new Error(error.message);

    const LABEL: Record<TimeSource, string> = { none: "não registra", aura: "bate no Aura", rep: "bate no relógio" };
    await AuditService.log({
      propertyId: params.propertyId ?? "",
      userId: params.actor.id,
      userName: params.actor.name,
      action: "TIMECLOCK_SOURCE_SET",
      entity: "TIMECLOCK",
      entityId: params.staffId,
      newData: { timeSource: params.source },
      details: `Ponto de ${params.staffName}: ${LABEL[params.source]}`,
    });
  },
};
