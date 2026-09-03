// src/services/hsystem-service.ts
//
// Módulo Hsystem (HUNIT/HBOOK/HPRICE) — fase 1: inbound de reservas + outbound de
// disponibilidade. SERVER-ONLY (supabaseAdmin) — o polling roda por cron e a UI
// fala com /api/admin/hsystem/*.
//
// Modos (decisão 24/08/2026, ver /admin/hsystem):
//   shadow → espelha reservas SEM confirmar recebimento e SEM enviar disponibilidade.
//            A fila do HUNIT continua intacta para o PMS oficial (HMAX) — é o modo
//            de produção enquanto os dois rodarem em paralelo.
//   active → fluxo completo (confirma + envia disponibilidade). Sandbox de
//            homologação hoje; produção só no evento formal de troca de PMS.
//
// Encaixe por tipo: reserva chega por CATEGORIA (roomTypeId → categoryMap →
// cabin_categories). O sistema escolhe sozinho uma cabana livre da categoria,
// preferindo a que "encosta" em reservas existentes (menos buraco na grade);
// a recepção pode transferir depois pelo fluxo normal.
import { supabaseAdmin } from "@/lib/supabase";
import {
  Hunit,
  HunitError,
  type HunitCredentials,
  type HunitReservation,
  type HunitRoom,
  type HunitAvailabilityUpdate,
  type HunitPortal,
} from "@/lib/hunit";
import { PropertySecretsService } from "./property-secrets-service";
import { AuditService } from "./audit-service";
import type { GuestAgePolicy, HsystemConfig, HsystemReservationAction } from "@/types/aura";
import { DEFAULT_AGE_POLICY } from "@/types/aura";
import { DEFAULT_CHECK_IN_TIME, DEFAULT_CHECK_OUT_TIME } from "@/lib/stay-times";
import { createHash, randomUUID } from "crypto";
import { todayPropertyIso, addDays } from "@/lib/dates";

const DEFAULT_CONFIG: HsystemConfig = {
  mode: "shadow",
  hotelId: "",
  categoryMap: {},
  pushAvailability: false,
  horizonDays: 365,
  hbookPortalIds: [27],
};

/** Statuses de estadia que ocupam cabana (mesma régua do checkCabinAvailability). */
const OCCUPYING = ["pending", "pre_checkin_done", "active"] as const;
/** Manutenção que bloqueia cabana enquanto não concluída/cancelada. */
const BLOCKING_MAINTENANCE = ["pending", "in_progress", "waiting_conference", "paused"] as const;
/** Limite de itens por request do HUNIT é 1500 — folga de segurança. */
const MAX_ITEMS_PER_REQUEST = 1400;

const HSYSTEM_ACTOR = { id: "hsystem", name: "HSystem (HUNIT)" };

interface HsystemContext {
  propertyId: string;
  enabled: boolean;
  config: HsystemConfig;
  checkInTime: string;
  checkOutTime: string;
}

interface ProcessResult {
  action: HsystemReservationAction;
  detail?: string;
  stayIds?: string[];
  stayGroupId?: string | null;
  pmsIdentifier?: string;
}

function db() {
  if (!supabaseAdmin) throw new Error("HsystemService é server-only (supabaseAdmin ausente).");
  return supabaseAdmin;
}

// ─── Helpers de data/valor ───────────────────────────────────────────────────


function nightsBetween(ci: string, co: string): number {
  const a = new Date(`${ci}T12:00:00Z`).getTime();
  const b = new Date(`${co}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

/**
 * Carimba a hora-do-dia (política da propriedade) numa data, no FUSO DA POUSADA.
 * O createStayRecord do balcão usa o relógio local do navegador (BRT); aqui o
 * servidor roda em UTC, então o offset -03:00 vai explícito para a hora exibida
 * no app bater com a política (14:00 check-in continua 14:00).
 */
function stampBrt(dateStr: string, hhmm: string | undefined, fallback: string): string {
  const time = /^\d{1,2}:\d{2}$/.test(hhmm ?? "") ? (hhmm as string) : fallback;
  const [h, m] = time.split(":").map(Number);
  return new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`).toISOString();
}

/** Overlap de intervalos date-only, checkout exclusivo (mesma régua do app inteiro). */
function overlaps(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && aOut > bIn;
}

function dateOnly(v: string | null | undefined): string {
  return String(v ?? "").slice(0, 10);
}

function contentHashOf(r: HunitReservation): string {
  return createHash("sha1").update(JSON.stringify(r)).digest("hex");
}

/**
 * Separa criança de bebê pela política da propriedade.
 *
 * O HUNIT manda só `adults` e `children` — "bebê" não existe no protocolo. Mas
 * quando o canal informa as idades (`ageChildren`), dá para classificar sozinho:
 * quem está na faixa isenta entra como bebê, o resto como criança. Sem idade
 * informada, todos ficam como criança — errar para o lado de cobrar a mais
 * seria pior, mas errar para menos também: por isso o padrão é o que o canal
 * disse, e a recepção ajusta se souber.
 */
function splitChildren(children: number, ages: number[], policy: GuestAgePolicy): { children: number; babies: number } {
  if (children <= 0) return { children: 0, babies: 0 };
  if (ages.length === 0) return { children, babies: 0 };
  const babies = ages.filter((a) => a <= policy.freeUpToAge).length;
  // A lista de idades pode vir incompleta; nunca devolver mais gente do que veio.
  const safeBabies = Math.min(babies, children);
  return { children: children - safeBabies, babies: safeBabies };
}

/** Slug de canal para `Stay.source` — reaproveita os slugs do CRM quando existem. */
function sourceSlugFor(portalName: string | null, isHbook: boolean): string {
  if (isHbook) return "site";
  const n = (portalName ?? "").toLowerCase();
  if (n.includes("booking")) return "booking";
  if (n.includes("airbnb")) return "airbnb";
  if (n.includes("expedia")) return "expedia";
  if (n.includes("decolar")) return "decolar";
  return n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ota";
}

// ─── Cache curto de portais (nome do portal por id, p/ source e automações) ──
const portalCache = new Map<string, { at: number; portals: HunitPortal[] }>();
const PORTAL_TTL_MS = 6 * 3600_000;

async function getPortals(propertyId: string, creds: HunitCredentials): Promise<HunitPortal[]> {
  const hit = portalCache.get(propertyId);
  if (hit && Date.now() - hit.at < PORTAL_TTL_MS) return hit.portals;
  try {
    const portals = await Hunit.portalRead(creds);
    portalCache.set(propertyId, { at: Date.now(), portals });
    return portals;
  } catch {
    return hit?.portals ?? [];
  }
}

// ─── Serviço ────────────────────────────────────────────────────────────────

export const HsystemService = {
  async getContext(propertyId: string): Promise<HsystemContext> {
    // SÓ as 4 chaves que este contexto lê. `settings` inteiro são 13.180 bytes
    // comprimidos contra 407 aqui — e este caminho é o mais quente do sistema:
    // o cron externo do HUNIT chama 1x por minuto (medido em 03/09/2026,
    // 60 execuções na última hora em `hsystem_sync_log`), ou seja ~18 MB/dia
    // de egress só para ler quatro chaves.
    const { data } = await db()
      .from("properties")
      .select('hasHsystem:settings->hasHsystem, hsystemConfig:settings->hsystemConfig, checkInTime:settings->checkInTime, checkOutTime:settings->checkOutTime')
      .eq("id", propertyId)
      .maybeSingle();
    const settings = (data ?? {}) as Record<string, any>;
    const stored = (settings.hsystemConfig ?? {}) as Partial<HsystemConfig>;
    return {
      propertyId,
      enabled: settings.hasHsystem === true,
      config: {
        ...DEFAULT_CONFIG,
        ...stored,
        categoryMap: { ...(stored.categoryMap ?? {}) },
        hbookPortalIds: Array.isArray(stored.hbookPortalIds) && stored.hbookPortalIds.length > 0
          ? stored.hbookPortalIds.map(Number)
          : DEFAULT_CONFIG.hbookPortalIds,
        horizonDays: Math.min(730, Math.max(30, Number(stored.horizonDays) || DEFAULT_CONFIG.horizonDays)),
      },
      checkInTime: settings.checkInTime || DEFAULT_CHECK_IN_TIME,
      checkOutTime: settings.checkOutTime || DEFAULT_CHECK_OUT_TIME,
    };
  },

  /** Política de idade da propriedade (rate_settings) — cai no padrão se não houver. */
  async getAgePolicy(propertyId: string): Promise<GuestAgePolicy> {
    const { data } = await db()
      .from("rate_settings").select('"agePolicy"').eq("propertyId", propertyId).maybeSingle();
    const p = (data?.agePolicy ?? null) as GuestAgePolicy | null;
    return p && typeof p.freeUpToAge === "number" ? { ...DEFAULT_AGE_POLICY, ...p } : DEFAULT_AGE_POLICY;
  },

  async getCredentials(ctx: HsystemContext): Promise<HunitCredentials> {
    if (!ctx.config.hotelId) throw new Error("hotelId do HUNIT não configurado.");
    const secrets = await PropertySecretsService.get(ctx.propertyId);
    if (!secrets.hunitUserName || !secrets.hunitPassword) {
      throw new Error("Credenciais do HUNIT ausentes no cofre — configure em /admin/hsystem.");
    }
    return { hotelId: ctx.config.hotelId, userName: secrets.hunitUserName, password: secrets.hunitPassword };
  },

  // ── Teste de conexão (alimenta a UI de mapeamento) ─────────────────────────
  async testConnection(propertyId: string) {
    const ctx = await this.getContext(propertyId);
    const startedAt = new Date().toISOString();
    try {
      const creds = await this.getCredentials(ctx);
      const [portals, roomRates] = await Promise.all([Hunit.portalRead(creds), Hunit.roomRateRead(creds)]);
      portalCache.set(propertyId, { at: Date.now(), portals });
      await this._log(propertyId, "test", true, roomRates.length, {
        activePortals: portals.filter((p) => p.isActive).map((p) => `${p.id}·${p.name}`),
      }, null, startedAt);
      return { ok: true as const, portals, roomRates };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this._log(propertyId, "test", false, 0, null, msg, startedAt);
      return { ok: false as const, error: msg, portals: [], roomRates: [] };
    }
  },

  // ── Polling de reservas ────────────────────────────────────────────────────
  async syncBookings(propertyId: string) {
    const ctx = await this.getContext(propertyId);
    const startedAt = new Date().toISOString();
    const counts: Record<HsystemReservationAction, number> = {
      created: 0, updated: 0, cancelled: 0, skipped: 0, needs_attention: 0, failed: 0,
    };
    if (!ctx.enabled) return { ok: false, received: 0, counts, error: "Módulo desligado (hasHsystem)." };

    try {
      const creds = await this.getCredentials(ctx);
      const reservations = await Hunit.bookingRead(creds);
      const portals = await getPortals(propertyId, creds);

      const confirmables: { reservationId: string; pmsReservationIdentifier: string }[] = [];
      for (const resv of reservations) {
        const result = await this._processReservation(ctx, resv, portals);
        counts[result.action] += 1;
        // Confirmar tira a reserva da fila do hotel. Regras:
        //  • modo sombra: NUNCA (a fila é do PMS oficial).
        //  • 'failed' (erro transitório nosso): não confirma → o HUNIT reapresenta e o
        //    próximo ciclo tenta de novo.
        //  • precisa_atenção conta como recebida: o espelho existe e o humano age pela
        //    fila do AURA — sem confirmar ela voltaria a cada minuto como ruído.
        if (ctx.config.mode === "active" && result.action !== "failed") {
          confirmables.push({
            reservationId: resv.locatorId,
            pmsReservationIdentifier: result.pmsIdentifier ?? result.stayGroupId ?? result.stayIds?.[0] ?? resv.locatorId,
          });
        }
      }

      if (confirmables.length > 0) {
        await Hunit.confirmePost(creds, confirmables);
        const now = new Date().toISOString();
        await db()
          .from("hsystem_reservations")
          .update({ confirmedAt: now, updatedAt: now })
          .eq("propertyId", propertyId)
          .in("locatorId", confirmables.map((c) => c.reservationId));
      }

      await this._log(propertyId, "bookings", true, reservations.length, { counts, mode: ctx.config.mode }, null, startedAt);
      return { ok: true, received: reservations.length, counts };
    } catch (e) {
      const msg = e instanceof HunitError ? `${e.message} ${e.errors[0] ?? ""}`.trim() : e instanceof Error ? e.message : String(e);
      await this._log(propertyId, "bookings", false, 0, null, msg, startedAt);
      return { ok: false, received: 0, counts, error: msg };
    }
  },

  async _processReservation(ctx: HsystemContext, resv: HunitReservation, portals: HunitPortal[]): Promise<ProcessResult> {
    const pid = ctx.propertyId;
    const hash = contentHashOf(resv);
    const now = new Date().toISOString();
    const portalName = portals.find((p) => p.id === resv.portalId)?.name ?? null;

    const { data: existing } = await db()
      .from("hsystem_reservations")
      .select('"locatorId", "contentHash", action, "stayIds", "stayGroupId", "processedAt"')
      .eq("propertyId", pid)
      .eq("locatorId", resv.locatorId)
      .maybeSingle();

    // Payload idêntico já processado → nada a refazer (o confirme pode ter falhado
    // antes; devolvemos o mesmo pmsIdentifier para o retry da confirmação).
    if (existing?.processedAt && existing.contentHash === hash && existing.action !== "failed") {
      return {
        action: existing.action === "needs_attention" ? "needs_attention" : "skipped",
        detail: "payload idêntico já processado",
        stayIds: (existing.stayIds as string[]) ?? [],
        stayGroupId: existing.stayGroupId,
        pmsIdentifier: existing.stayGroupId ?? ((existing.stayIds as string[]) ?? [])[0] ?? resv.locatorId,
      };
    }

    // Espelho base (upsert) — payload nunca contém cartão (o parser já descartou).
    const firstRoom = resv.rooms[0];
    const baseRow = {
      propertyId: pid,
      locatorId: resv.locatorId,
      portalId: resv.portalId,
      portalName,
      channelReservationId: resv.id,
      status: resv.status,
      payload: resv as unknown as Record<string, unknown>,
      contentHash: hash,
      guestName: [resv.guest?.firstName, resv.guest?.lastName].filter(Boolean).join(" ") || null,
      checkIn: firstRoom?.arrivalDate ?? null,
      checkOut: firstRoom?.departureDate ?? null,
      totalValue: resv.totalValue,
      collectType: resv.collectType,
      paymentType: resv.paymentType,
      updatedAt: now,
    };
    await db().from("hsystem_reservations").upsert(baseRow, { onConflict: "propertyId,locatorId" });

    let result: ProcessResult;
    try {
      if (resv.status === "cancel") {
        result = await this._applyCancel(ctx, resv);
      } else if (resv.status === "modify") {
        result = await this._applyModify(ctx, resv, portals);
      } else {
        result = await this._applyNew(ctx, resv, portals);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result = { action: "failed", detail: msg };
      console.error(`[Hsystem] Falha ao processar reserva ${resv.locatorId}:`, e);
    }

    await db()
      .from("hsystem_reservations")
      .update({
        action: result.action,
        actionDetail: result.detail ?? null,
        error: result.action === "failed" ? result.detail ?? null : null,
        stayIds: result.stayIds ?? [],
        stayGroupId: result.stayGroupId ?? null,
        processedAt: now,
        updatedAt: new Date().toISOString(),
      })
      .eq("propertyId", pid)
      .eq("locatorId", resv.locatorId);

    if (result.action !== "skipped") {
      const auditAction = {
        created: "HSYSTEM_CREATED",
        updated: "HSYSTEM_UPDATED",
        cancelled: "HSYSTEM_CANCELLED",
        needs_attention: "HSYSTEM_NEEDS_ATTENTION",
        failed: "HSYSTEM_FAILED",
      } as const;
      await AuditService.log({
        propertyId: pid,
        userId: HSYSTEM_ACTOR.id,
        userName: HSYSTEM_ACTOR.name,
        action: auditAction[result.action],
        entity: "STAY",
        entityId: result.stayGroupId ?? result.stayIds?.[0] ?? resv.locatorId,
        details: `Reserva HUNIT ${resv.locatorId} (${portalName ?? `portal ${resv.portalId}`}) → ${result.action}${result.detail ? `: ${result.detail}` : ""}.`,
      });
    }
    return result;
  },

  // ── new ──
  async _applyNew(ctx: HsystemContext, resv: HunitReservation, portals: HunitPortal[]): Promise<ProcessResult> {
    const { data: already } = await db()
      .from("stays")
      .select("id, groupId, status")
      .eq("propertyId", ctx.propertyId)
      .eq("externalId", resv.locatorId);
    const alive = (already ?? []).filter((s) => s.status !== "cancelled" && s.status !== "archived");
    if (alive.length > 0) {
      return {
        action: "skipped",
        detail: "estadias já importadas para esta reserva",
        stayIds: alive.map((s) => s.id),
        stayGroupId: alive[0].groupId ?? null,
        pmsIdentifier: alive[0].groupId ?? alive[0].id,
      };
    }
    return this._createStays(ctx, resv, portals);
  },

  async _createStays(ctx: HsystemContext, resv: HunitReservation, portals: HunitPortal[]): Promise<ProcessResult> {
    const pid = ctx.propertyId;
    const rooms = resv.rooms.filter((r) => r.status !== "cancelled" && r.arrivalDate && r.departureDate);
    if (rooms.length === 0) return { action: "needs_attention", detail: "reserva sem quartos ativos com datas válidas" };

    // Mapeamento categoria — sem mapa não há encaixe.
    const unmapped = rooms.filter((r) => !ctx.config.categoryMap[r.roomTypeId]);
    if (unmapped.length > 0) {
      return {
        action: "needs_attention",
        detail: `tipo de quarto sem categoria mapeada: ${Array.from(new Set(unmapped.map((r) => r.roomTypeId))).join(", ")}`,
      };
    }

    const agePolicy = await this.getAgePolicy(pid);

    // Encaixe por tipo — sequencial para não alocar a mesma cabana duas vezes na
    // mesma reserva multi-quarto com datas sobrepostas.
    const taken = new Set<string>();
    const allocations: { room: HunitRoom; cabinId: string }[] = [];
    for (const room of rooms) {
      const categoryId = ctx.config.categoryMap[room.roomTypeId];
      const roomSplit = splitChildren(room.children || 0, room.childrenAges, agePolicy);
      const roomPax = (room.adults || 1) + roomSplit.children + roomSplit.babies;
      const cabinId = await this._allocateCabin(pid, categoryId, room.arrivalDate!, room.departureDate!, taken, [], roomPax);
      if (!cabinId) {
        return {
          action: "needs_attention",
          detail: `sem cabana livre com capacidade para ${roomPax} pessoa(s) na categoria de ${room.roomTypeId} (${room.arrivalDate} → ${room.departureDate})`,
        };
      }
      taken.add(cabinId);
      allocations.push({ room, cabinId });
    }

    const guestId = await this._upsertGuest(pid, resv);
    const accessCode = await this._generateAccessCode(pid);
    const groupId = allocations.length > 1 ? `GRP-${randomUUID().slice(0, 8).toUpperCase()}` : null;
    const isHbook = ctx.config.hbookPortalIds.includes(resv.portalId ?? -1);
    const portalName = portals.find((p) => p.id === resv.portalId)?.name ?? null;
    const source = sourceSlugFor(portalName, isHbook);
    const prepaid = resv.collectType === "CanalCollect";
    const nowIso = new Date().toISOString();

    const payloads = allocations.map(({ room, cabinId }, idx) => {
      const total = room.totalValue ?? (allocations.length === 1 ? resv.totalValue : null);
      const nights = nightsBetween(room.arrivalDate!, room.departureDate!);
      const overrides: Record<string, number> = {};
      for (const dr of room.dailyRates) {
        if (dr.date && dr.totalValue !== null) overrides[dr.date] = dr.totalValue;
      }
      const additionalGuests: { id: string; type: string; fullName: string; document: string; birthDate: string }[] = [];
      const split = splitChildren(room.children || 0, room.childrenAges, agePolicy);
      for (let i = 0; i < Math.max(0, room.adults - 1); i++) additionalGuests.push({ id: randomUUID(), type: "adult", fullName: "ACOMPANHANTE", document: "", birthDate: "" });
      for (let i = 0; i < split.children; i++) additionalGuests.push({ id: randomUUID(), type: "child", fullName: "ACOMPANHANTE", document: "", birthDate: "" });
      for (let i = 0; i < split.babies; i++) additionalGuests.push({ id: randomUUID(), type: "free", fullName: "ACOMPANHANTE", document: "", birthDate: "" });

      return {
        id: randomUUID(),
        propertyId: pid,
        guestId,
        cabinId,
        groupId,
        accessCode,
        checkIn: stampBrt(room.arrivalDate!, ctx.checkInTime, DEFAULT_CHECK_IN_TIME),
        checkOut: stampBrt(room.departureDate!, ctx.checkOutTime, DEFAULT_CHECK_OUT_TIME),
        counts: { adults: room.adults || 1, ...splitChildren(room.children || 0, room.childrenAges, agePolicy) },
        additionalGuests,
        internalUse: false,
        internalLabel: null,
        status: "pending",
        automationFlags: {
          enabled: isHbook,
          send48h: isHbook,
          send24h: isHbook,
          preCheckinSent: false,
          remindersCount: 0,
        },
        source,
        externalId: resv.locatorId,
        externalRoomId: room.roomLocatorId ?? room.id ?? String(idx),
        // Financeiro segue o collectType: canal já cobrou → registra mas pausa o
        // lançamento de diárias; hotel cobra → o cron daily-lodging lança normal.
        nightlyRate: total !== null && nights > 0 ? Math.round((total / nights) * 100) / 100 : null,
        lodgingTotal: total,
        lodgingPaused: prepaid,
        nightlyOverrides: Object.keys(overrides).length > 0 ? overrides : null,
      };
    });

    const { error } = await db().from("stays").insert(payloads);
    if (error) throw new Error(`insert de estadias falhou: ${error.message}`);

    return {
      action: "created",
      detail: `${payloads.length} estadia(s) criadas — ${prepaid ? "pré-paga no canal" : "cobrança no hotel"}${isHbook ? ", automações ligadas (motor)" : ", automações desligadas (OTA)"}`,
      stayIds: payloads.map((p) => p.id),
      stayGroupId: groupId,
      pmsIdentifier: groupId ?? payloads[0].id,
    };
  },

  // ── modify ──
  async _applyModify(ctx: HsystemContext, resv: HunitReservation, portals: HunitPortal[]): Promise<ProcessResult> {
    const pid = ctx.propertyId;
    const { data } = await db()
      .from("stays")
      .select('id, "cabinId", "groupId", status, "checkIn", "checkOut", "externalRoomId", counts, "nightlyOverrides"')
      .eq("propertyId", pid)
      .eq("externalId", resv.locatorId);
    const stays = (data ?? []).filter((s) => s.status !== "cancelled" && s.status !== "archived");
    if (stays.length === 0) return this._createStays(ctx, resv, portals);

    const attention: string[] = [];
    const touched: string[] = [];

    for (const room of resv.rooms) {
      const roomKey = room.roomLocatorId ?? room.id;
      const stay = stays.find((s) => s.externalRoomId === roomKey);
      if (!stay) {
        if (room.status !== "cancelled") attention.push(`quarto ${roomKey} não corresponde a nenhuma estadia importada`);
        continue;
      }

      if (room.status === "cancelled") {
        if (stay.status === "active" || stay.status === "finished") {
          attention.push(`quarto ${roomKey} cancelado no canal, mas a estadia já está ${stay.status} — resolver manualmente`);
        } else {
          await db().from("stays").update({ status: "cancelled", updatedAt: new Date().toISOString() }).eq("id", stay.id);
          touched.push(stay.id);
        }
        continue;
      }

      if (!room.arrivalDate || !room.departureDate) { attention.push(`quarto ${roomKey} sem datas válidas`); continue; }
      if (stay.status === "active" || stay.status === "finished") {
        attention.push(`estadia do quarto ${roomKey} já está ${stay.status} — alteração do canal precisa de conferência manual`);
        continue;
      }

      const oldCi = dateOnly(stay.checkIn);
      const oldCo = dateOnly(stay.checkOut);
      const datesChanged = oldCi !== room.arrivalDate || oldCo !== room.departureDate;
      let cabinId = stay.cabinId as string | null;

      if (datesChanged && cabinId) {
        const free = await this._isCabinFree(pid, cabinId, room.arrivalDate, room.departureDate, [stay.id]);
        if (!free) {
          const categoryId = ctx.config.categoryMap[room.roomTypeId];
          cabinId = categoryId
            ? await this._allocateCabin(pid, categoryId, room.arrivalDate, room.departureDate, new Set(), [stay.id])
            : null;
          if (!cabinId) {
            attention.push(`novas datas do quarto ${roomKey} não cabem em nenhuma cabana da categoria — reencaixar manualmente`);
            continue;
          }
        }
      }

      const total = room.totalValue ?? (resv.rooms.length === 1 ? resv.totalValue : null);
      const nights = nightsBetween(room.arrivalDate, room.departureDate);
      const overrides: Record<string, number> = {};
      for (const dr of room.dailyRates) if (dr.date && dr.totalValue !== null) overrides[dr.date] = dr.totalValue;

      const { error } = await db()
        .from("stays")
        .update({
          cabinId,
          checkIn: stampBrt(room.arrivalDate, ctx.checkInTime, DEFAULT_CHECK_IN_TIME),
          checkOut: stampBrt(room.departureDate, ctx.checkOutTime, DEFAULT_CHECK_OUT_TIME),
          counts: { adults: room.adults || 1, children: room.children || 0, babies: 0 },
          nightlyRate: total !== null && nights > 0 ? Math.round((total / nights) * 100) / 100 : null,
          lodgingTotal: total,
          lodgingPaused: resv.collectType === "CanalCollect",
          nightlyOverrides: Object.keys(overrides).length > 0 ? overrides : null,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", stay.id);
      if (error) throw new Error(`update da estadia ${stay.id} falhou: ${error.message}`);
      touched.push(stay.id);
    }

    const groupId = stays[0]?.groupId ?? null;
    const pmsIdentifier = groupId ?? stays[0]?.id;
    if (attention.length > 0) {
      return { action: "needs_attention", detail: attention.join(" · "), stayIds: touched, stayGroupId: groupId, pmsIdentifier };
    }
    return { action: "updated", detail: `${touched.length} estadia(s) atualizadas`, stayIds: touched, stayGroupId: groupId, pmsIdentifier };
  },

  // ── cancel ──
  async _applyCancel(ctx: HsystemContext, resv: HunitReservation): Promise<ProcessResult> {
    const pid = ctx.propertyId;
    const { data } = await db()
      .from("stays")
      .select('id, "groupId", status')
      .eq("propertyId", pid)
      .eq("externalId", resv.locatorId);
    const stays = (data ?? []).filter((s) => s.status !== "cancelled" && s.status !== "archived");
    if (stays.length === 0) return { action: "skipped", detail: "cancelamento sem estadia importada (nada a fazer)" };

    const blocked = stays.filter((s) => s.status === "active" || s.status === "finished");
    const cancellable = stays.filter((s) => s.status === "pending" || s.status === "pre_checkin_done");

    if (cancellable.length > 0) {
      const { error } = await db()
        .from("stays")
        .update({ status: "cancelled", updatedAt: new Date().toISOString() })
        .in("id", cancellable.map((s) => s.id));
      if (error) throw new Error(`cancelamento falhou: ${error.message}`);
    }

    const groupId = stays[0].groupId ?? null;
    const pmsIdentifier = groupId ?? stays[0].id;
    if (blocked.length > 0) {
      return {
        action: "needs_attention",
        detail: `canal cancelou, mas ${blocked.length} estadia(s) já ${blocked.length > 1 ? "estão" : "está"} em andamento/encerrada — conferir manualmente`,
        stayIds: cancellable.map((s) => s.id),
        stayGroupId: groupId,
        pmsIdentifier,
      };
    }
    return {
      action: "cancelled",
      detail: `${cancellable.length} estadia(s) canceladas (cabana liberada)`,
      stayIds: cancellable.map((s) => s.id),
      stayGroupId: groupId,
      pmsIdentifier,
    };
  },

  // ── Encaixe ────────────────────────────────────────────────────────────────

  /** Cabanas vendáveis de uma categoria: fora do "uso da casa" (ignoreInOccupancy).
   *  Obs.: `Cabin.active` existe só no tipo — a tabela não tem a coluna. */
  async _sellableCabins(propertyId: string, categoryId?: string) {
    let q = db()
      .from("cabins")
      .select('id, number, name, capacity, "categoryId", "ignoreInOccupancy"')
      .eq("propertyId", propertyId)
      // Cabana fora de operação não recebe reserva do canal. O filtro tinha
      // saído daqui porque a coluna não existia no DEV — existia só em
      // produção, que é onde a reserva de verdade cai.
      .eq("active", true);
    if (categoryId) q = q.eq("categoryId", categoryId);
    const { data } = await q;
    return (data ?? []).filter((c) => !c.ignoreInOccupancy);
  },

  async _busyIntervals(propertyId: string, cabinIds: string[], from: string, to: string, excludeStayIds: string[] = []) {
    if (cabinIds.length === 0) return new Map<string, { in: string; out: string }[]>();
    const [staysRes, maintRes] = await Promise.all([
      db()
        .from("stays")
        .select('id, "cabinId", "checkIn", "checkOut"')
        .eq("propertyId", propertyId)
        .in("cabinId", cabinIds)
        .in("status", [...OCCUPYING])
        .lt("checkIn", `${to}T23:59:59.999Z`)
        .gt("checkOut", from),
      db()
        .from("maintenance_tasks")
        .select('"cabinId", "expectedStart", "expectedEnd"')
        .eq("propertyId", propertyId)
        .eq("blocksCabin", true)
        .in("status", [...BLOCKING_MAINTENANCE])
        .in("cabinId", cabinIds),
    ]);

    const map = new Map<string, { in: string; out: string }[]>();
    const push = (cabinId: string, iv: { in: string; out: string }) => {
      if (!map.has(cabinId)) map.set(cabinId, []);
      map.get(cabinId)!.push(iv);
    };
    for (const s of staysRes.data ?? []) {
      if (excludeStayIds.includes(s.id)) continue;
      const iv = { in: dateOnly(s.checkIn), out: dateOnly(s.checkOut) };
      if (overlaps(iv.in, iv.out, from, to)) push(s.cabinId, iv);
    }
    for (const m of maintRes.data ?? []) {
      const start = dateOnly(m.expectedStart);
      const end = dateOnly(m.expectedEnd);
      if (!start || !end) continue;
      if (overlaps(start, end, from, to)) push(m.cabinId, { in: start, out: end });
    }
    return map;
  },

  async _isCabinFree(propertyId: string, cabinId: string, ci: string, co: string, excludeStayIds: string[] = []): Promise<boolean> {
    const busy = await this._busyIntervals(propertyId, [cabinId], ci, co, excludeStayIds);
    return (busy.get(cabinId) ?? []).every((iv) => !overlaps(iv.in, iv.out, ci, co));
  },

  /**
   * Escolhe a cabana da categoria para o período: livre, preferindo a que "encosta"
   * em reservas existentes (checkout no dia do check-in novo ou vice-versa) — menos
   * buraco na grade. Empate: menor número. null = nenhuma livre.
   */
  async _allocateCabin(
    propertyId: string,
    categoryId: string,
    ci: string,
    co: string,
    taken: Set<string>,
    excludeStayIds: string[] = [],
    /** Total de PESSOAS (inclui isentos — eles ocupam vaga, só não pagam). */
    pax = 0,
  ): Promise<string | null> {
    const all = (await this._sellableCabins(propertyId, categoryId)).filter((c) => !taken.has(c.id));
    // Capacidade é limite físico: bebê ocupa cama como qualquer um. Cabana sem
    // capacidade cadastrada (0/null) não é filtrada — seria pior recusar por
    // falta de cadastro do que aceitar e deixar a recepção conferir.
    const cabins = pax > 0
      ? all.filter((c) => !c.capacity || Number(c.capacity) >= pax)
      : all;
    if (cabins.length === 0) return null;
    // Janela larga (±1 dia) para enxergar os vizinhos que "encostam".
    const busy = await this._busyIntervals(propertyId, cabins.map((c) => c.id), addDays(ci, -1), addDays(co, 1), excludeStayIds);

    const candidates = cabins
      .map((c) => {
        const ivs = busy.get(c.id) ?? [];
        const conflict = ivs.some((iv) => overlaps(iv.in, iv.out, ci, co));
        const touches = ivs.filter((iv) => iv.out === ci || iv.in === co).length;
        return { id: c.id, number: c.number, conflict, touches };
      })
      .filter((c) => !c.conflict)
      .sort((a, b) => {
        if (b.touches !== a.touches) return b.touches - a.touches;
        const na = parseInt(a.number, 10);
        const nb = parseInt(b.number, 10);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
        return String(a.number).localeCompare(String(b.number));
      });

    return candidates[0]?.id ?? null;
  },

  // ── Disponibilidade (outbound) ─────────────────────────────────────────────

  /**
   * Disponibilidade por roomTypeId mapeado, dia a dia, comprimida em períodos de
   * valor igual (o formato do updateRQ). availability=0 fecha a venda.
   */
  async computeAvailability(ctx: HsystemContext): Promise<{ updates: HunitAvailabilityUpdate[]; hash: string; from: string; to: string }> {
    const from = todayPropertyIso();
    const horizon = ctx.config.horizonDays;
    const to = addDays(from, horizon - 1);
    const entries = Object.entries(ctx.config.categoryMap); // [roomTypeId, categoryId]
    const updates: HunitAvailabilityUpdate[] = [];

    if (entries.length > 0) {
      const allCabins = await this._sellableCabins(ctx.propertyId);
      const byCategory = new Map<string, { id: string }[]>();
      for (const c of allCabins) {
        const key = c.categoryId ?? "";
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key)!.push(c);
      }
      const relevantIds = entries.flatMap(([, catId]) => (byCategory.get(catId) ?? []).map((c) => c.id));
      const busy = await this._busyIntervals(ctx.propertyId, Array.from(new Set(relevantIds)), from, addDays(to, 1));

      for (const [roomTypeId, categoryId] of entries) {
        const cabins = byCategory.get(categoryId) ?? [];
        let runStart = from;
        let runValue: number | null = null;
        for (let i = 0; i < horizon; i++) {
          const day = addDays(from, i);
          const next = addDays(day, 1);
          const free = cabins.filter((c) => (busy.get(c.id) ?? []).every((iv) => !overlaps(iv.in, iv.out, day, next))).length;
          if (runValue === null) { runValue = free; runStart = day; continue; }
          if (free !== runValue) {
            updates.push({ roomTypeId, availability: runValue, from: runStart, to: addDays(day, -1), stopSell: runValue === 0 });
            runValue = free; runStart = day;
          }
        }
        if (runValue !== null) updates.push({ roomTypeId, availability: runValue, from: runStart, to, stopSell: runValue === 0 });
      }
    }

    const hash = createHash("sha1").update(JSON.stringify(updates)).digest("hex");
    return { updates, hash, from, to };
  },

  /**
   * Empurra a disponibilidade para o HUNIT. Só em mode=active — em modo sombra o
   * ARI é do PMS oficial e dois escritores brigam. Idempotente por hash: sem
   * mudança desde o último envio ok, não reenvia (a menos de `force`).
   */
  async pushAvailability(propertyId: string, opts: { force?: boolean } = {}) {
    const ctx = await this.getContext(propertyId);
    const startedAt = new Date().toISOString();
    if (!ctx.enabled) return { ok: false, sent: 0, error: "Módulo desligado (hasHsystem)." };
    if (ctx.config.mode !== "active") return { ok: false, sent: 0, skipped: "modo sombra — disponibilidade não é enviada" };
    if (Object.keys(ctx.config.categoryMap).length === 0) {
      return { ok: false, sent: 0, error: "Nenhuma categoria mapeada — configure o mapeamento antes de enviar." };
    }

    try {
      const { updates, hash, from, to } = await this.computeAvailability(ctx);

      if (!opts.force) {
        const { data: last } = await db()
          .from("hsystem_sync_log")
          .select("detail, ok")
          .eq("propertyId", propertyId)
          .eq("kind", "availability")
          .eq("ok", true)
          .order("startedAt", { ascending: false })
          .limit(1)
          .maybeSingle();
        if ((last?.detail as any)?.hash === hash) {
          return { ok: true, sent: 0, skipped: "sem mudanças desde o último envio" };
        }
      }

      const creds = await this.getCredentials(ctx);
      for (let i = 0; i < updates.length; i += MAX_ITEMS_PER_REQUEST) {
        await Hunit.availabilityUpdate(creds, updates.slice(i, i + MAX_ITEMS_PER_REQUEST));
      }

      await this._log(propertyId, "availability", true, updates.length, { hash, from, to }, null, startedAt);
      return { ok: true, sent: updates.length };
    } catch (e) {
      const msg = e instanceof HunitError ? `${e.message} ${e.errors[0] ?? ""}`.trim() : e instanceof Error ? e.message : String(e);
      await this._log(propertyId, "availability", false, 0, null, msg, startedAt);
      return { ok: false, sent: 0, error: msg };
    }
  },

  // ── Status para a página ───────────────────────────────────────────────────
  async getStatus(propertyId: string) {
    const ctx = await this.getContext(propertyId);
    const [secretsInfo, syncLogs, reservations, categories, attention] = await Promise.all([
      PropertySecretsService.describe(propertyId),
      db()
        .from("hsystem_sync_log")
        .select("*")
        .eq("propertyId", propertyId)
        .order("startedAt", { ascending: false })
        .limit(20)
        .then((r) => r.data ?? []),
      db()
        .from("hsystem_reservations")
        .select('"locatorId", "portalName", status, action, "actionDetail", "guestName", "checkIn", "checkOut", "totalValue", "collectType", "stayGroupId", "stayIds", "receivedAt", "confirmedAt", error')
        .eq("propertyId", propertyId)
        .order("receivedAt", { ascending: false })
        .limit(40)
        .then((r) => r.data ?? []),
      db()
        .from("cabin_categories")
        .select("id, name, order")
        .eq("propertyId", propertyId)
        .order("order", { ascending: true })
        .then((r) => r.data ?? []),
      db()
        .from("hsystem_reservations")
        .select('"locatorId"', { count: "exact", head: true })
        .eq("propertyId", propertyId)
        .eq("action", "needs_attention")
        .then((r) => r.count ?? 0),
    ]);

    return {
      enabled: ctx.enabled,
      config: ctx.config,
      secrets: secretsInfo,
      syncLogs,
      reservations,
      categories,
      needsAttention: attention,
    };
  },

  // ── Internos ───────────────────────────────────────────────────────────────

  async _generateAccessCode(propertyId: string): Promise<string> {
    // Mesmo alfabeto/critério do StayService.generateUniqueAccessCode (32 chars →
    // módulo sem viés; credencial do portal do hóspede sai de CSPRNG).
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (;;) {
      const buf = new Uint32Array(8);
      crypto.getRandomValues(buf);
      const code = Array.from(buf, (n) => chars.charAt(n % chars.length)).join("");
      const { data } = await db().from("stays").select("id").eq("propertyId", propertyId).eq("accessCode", code).limit(1);
      if (!data || data.length === 0) return code;
    }
  },

  /**
   * Ficha do hóspede a partir da reserva. `guests.id` É o documento: CPF (11
   * dígitos) vira o id; documento estrangeiro/ausente nasce provisório e
   * DETERMINÍSTICO (`GUEST-HU-<locatorId>`) — reimportar nunca duplica, e o
   * promoteGuestId acerta o id quando o CPF chegar no pré-check-in.
   */
  async _upsertGuest(propertyId: string, resv: HunitReservation): Promise<string> {
    const g = resv.guest;
    const fullName = [g?.firstName, g?.lastName].filter(Boolean).join(" ").trim() || "Hóspede (canal)";
    const digits = (g?.documentNumber ?? "").replace(/\D/g, "");
    const provisionalId = `GUEST-HU-${resv.locatorId}`;
    let id = digits.length === 11 ? digits : provisionalId;

    let phone = (g?.phone ?? "").replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;

    const { data: existing } = await db().from("guests").select("id, propertyId, fullName, email, phone").eq("id", id).maybeSingle();
    if (existing && existing.propertyId !== propertyId) {
      // id (PK global) pertence a outra propriedade — cai no provisório.
      id = provisionalId;
    }

    const { data: current } = existing && existing.propertyId === propertyId
      ? { data: existing }
      : await db().from("guests").select("id, propertyId, fullName, email, phone").eq("id", id).maybeSingle();

    const nowIso = new Date().toISOString();
    if (current && current.propertyId === propertyId) {
      const patch: Record<string, unknown> = {};
      if (!current.email && g?.email) patch.email = g.email;
      if (!current.phone && phone) patch.phone = phone;
      if (Object.keys(patch).length > 0) {
        await db().from("guests").update({ ...patch, updatedAt: nowIso }).eq("id", id);
      }
      return id;
    }

    // Colunas conferidas contra o schema real: guests NÃO tem createdAt (só updatedAt).
    const { error } = await db().from("guests").insert({
      id,
      propertyId,
      fullName,
      email: g?.email ?? "",
      phone,
      nationality: "Brasil",
      document: { type: g?.documentType ?? "Outro", number: g?.documentNumber ?? "N/A" },
      preferredLanguage: "pt",
      birthDate: "",
      gender: "Outro",
      occupation: "",
      allergies: [],
      address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil" },
      updatedAt: nowIso,
    });
    if (error) {
      // Corrida (dois ciclos simultâneos) — se a ficha apareceu, segue com ela.
      const { data: retry } = await db().from("guests").select("id").eq("id", id).maybeSingle();
      if (!retry) throw new Error(`insert do hóspede falhou: ${error.message}`);
    }
    return id;
  },

  async _log(
    propertyId: string,
    kind: "bookings" | "availability" | "kpi" | "test",
    ok: boolean,
    itemCount: number,
    detail: Record<string, unknown> | null,
    error: string | null,
    startedAt: string,
  ): Promise<void> {
    try {
      await db().from("hsystem_sync_log").insert({
        id: randomUUID(),
        propertyId,
        kind,
        ok,
        itemCount,
        detail,
        error,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[Hsystem] Falha ao gravar sync_log:", e);
    }
  },
};
