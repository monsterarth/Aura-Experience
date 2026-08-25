// src/lib/hunit.ts
//
// Cliente do protocolo HUNIT (Hsystem) — API de integração PMS, XML sobre POST.
// Doc oficial: "HUNIT API de Integração PMS" v14.0 (10/08/2024). Puro: só HTTP +
// parse/normalização; nada de Supabase aqui (isso é do hsystem-service).
//
// Cuidados herdados da doc:
//  • Endpoint é pms.hunit.com.br (mudou na v12 — a lib comunitária antiga aponta
//    para services.hunit.com.br, NÃO usar).
//  • Decimais vêm com VÍRGULA ("600,0000"); datas de room em DD/MM/YYYY, ranges
//    em YYYY-MM-DD, createDateTime ISO. Normalizamos tudo aqui.
//  • Limites: 1500 itens/request e 60 requests/min (o service faz o chunking).
//  • paymentType=1 traz cartão no elemento <payment> — o parser DESCARTA o
//    elemento inteiro; dado de cartão nunca sai desta função.
import { XMLParser } from "fast-xml-parser";

export const HUNIT_BASE_URL = "https://pms.hunit.com.br/api";

export interface HunitCredentials {
  hotelId: string;
  userName: string;
  password: string;
}

export interface HunitPortal {
  id: number;
  name: string;
  isActive: boolean;
  isChildPortal?: boolean;
  masterPortalId?: number | null;
  masterPortal?: string | null;
}

export interface HunitRoomRateRow {
  id: string;
  roomTypeId: string;
  name: string;
  isActive: boolean;
  rateTypeId: string | null;
  isChildRoomRate: boolean;
  masterRoomRateId: string | null;
  masterRoomRate: string | null;
}

export interface HunitDailyRate {
  date: string | null;      // YYYY-MM-DD
  totalValue: number | null;
}

export interface HunitRoom {
  id: string;
  roomLocatorId: string | null;
  roomTypeId: string;
  rateTypeId: string | null;
  status: string | null;             // active | cancelled ...
  arrivalDate: string | null;        // YYYY-MM-DD (normalizado de DD/MM/YYYY)
  departureDate: string | null;      // YYYY-MM-DD
  adults: number;
  children: number;
  totalValue: number | null;
  totalValueWithTaxes: number | null;
  dailyRates: HunitDailyRate[];
  mealPlan: string | null;
  remark: string | null;
  guest: { firstName: string | null; email: string | null; phone: string | null } | null;
  addons: { name: string; totalValue: number | null }[];
}

export interface HunitReservation {
  hotelId: string | null;
  portalId: number | null;
  /** Id da reserva no portal de ORIGEM (channelReservationId). */
  id: string | null;
  /** Id único da reserva dentro do HUNIT — chave da confirmação. */
  locatorId: string;
  status: "new" | "modify" | "cancel" | string;
  createDateTime: string | null;
  cancellationDateTime: string | null;
  paymentType: number | null;
  collectType: string | null;        // HotelCollect | CanalCollect
  remark: string | null;
  totalValue: number | null;
  totalValueWithTaxes: number | null;
  totalAddOns: number | null;
  rooms: HunitRoom[];
  guest: {
    firstName: string | null;
    lastName: string | null;
    documentType: string | null;
    documentNumber: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

export interface HunitAvailabilityUpdate {
  roomTypeId: string;
  availability: number;
  /** Datas YYYY-MM-DD, `to` INCLUSIVO (semântica de período do HUNIT). */
  from: string;
  to: string;
  stopSell?: boolean;
}

export class HunitError extends Error {
  constructor(message: string, public readonly errors: string[] = []) {
    super(message);
    this.name = "HunitError";
  }
}

// ─── Normalização ────────────────────────────────────────────────────────────

/** "600,0000" → 600 · "1.234,56" → 1234.56 · "300.0" → 300. null se não numérico. */
export function parseHunitDecimal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "05/03/2024" ou "2024-03-05[T...]" → "2024-03-05". null se irreconhecível. */
export function parseHunitDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function int(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

function bool(v: unknown): boolean {
  return String(v ?? "").toLowerCase() === "true";
}

// ─── XML ─────────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Tudo como string: parse numérico automático quebraria ids ("0123") e decimais com vírgula.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const escapeXml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function buildRequest(rootTag: string, creds: HunitCredentials, innerXml = ""): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<${rootTag}>` +
    `<hotelId>${escapeXml(creds.hotelId)}</hotelId>` +
    `<userName>${escapeXml(creds.userName)}</userName>` +
    `<password>${escapeXml(creds.password)}</password>` +
    innerXml +
    `</${rootTag}>`
  );
}

async function post(path: string, xml: string, timeoutMs = 25_000): Promise<any> {
  const res = await fetch(`${HUNIT_BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/xml",
      accept: "application/xml",
      "cache-control": "no-cache",
    },
    body: xml,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new HunitError(`HUNIT respondeu HTTP ${res.status} em ${path}.`, [body.slice(0, 300)]);
  }
  let parsed: any;
  try {
    parsed = parser.parse(body);
  } catch {
    throw new HunitError(`Resposta do HUNIT em ${path} não é XML válido.`, [body.slice(0, 300)]);
  }
  // Erros de negócio vêm como <erros><error>…</error></erros> dentro do RS.
  const rs = parsed?.[Object.keys(parsed).find((k) => k.endsWith("RS")) ?? ""] ?? parsed;
  const errors = toArray<any>(rs?.erros?.error).map((e) => String(e)).filter(Boolean);
  if (errors.length > 0) {
    throw new HunitError(`HUNIT retornou erro em ${path}: ${errors[0]}`, errors);
  }
  return rs;
}

// ─── Parse de reserva ────────────────────────────────────────────────────────

function parseRoom(raw: any): HunitRoom {
  return {
    id: str(raw?.id) ?? "",
    roomLocatorId: str(raw?.roomLocatorId),
    roomTypeId: str(raw?.roomTypeId) ?? "",
    rateTypeId: str(raw?.rateTypeId),
    status: str(raw?.status),
    arrivalDate: parseHunitDate(raw?.arrivalDate),
    departureDate: parseHunitDate(raw?.departureDate),
    adults: int(raw?.adults) ?? 0,
    children: int(raw?.children) ?? 0,
    totalValue: parseHunitDecimal(raw?.totalValue),
    totalValueWithTaxes: parseHunitDecimal(raw?.totalValueWithTaxes),
    dailyRates: toArray<any>(raw?.dailyRates?.dailyRate).map((d) => ({
      date: parseHunitDate(d?.date),
      totalValue: parseHunitDecimal(d?.totalValue),
    })),
    mealPlan: str(raw?.mealPlan),
    remark: str(raw?.remark),
    guest: raw?.guest
      ? { firstName: str(raw.guest.firstName), email: str(raw.guest.email), phone: str(raw.guest.phone) }
      : null,
    addons: toArray<any>(raw?.addons?.addon).map((a) => ({
      name: str(a?.name) ?? "",
      totalValue: parseHunitDecimal(a?.totalValue),
    })),
  };
}

/** Parse de <reservation>. O elemento <payment> (cartão) é IGNORADO por completo. */
function parseReservation(raw: any): HunitReservation | null {
  const locatorId = str(raw?.locatorId);
  if (!locatorId) return null;
  return {
    hotelId: str(raw?.hotelId),
    portalId: int(raw?.portalId),
    id: str(raw?.id),
    locatorId,
    status: (str(raw?.status) ?? "new") as HunitReservation["status"],
    createDateTime: str(raw?.createDateTime),
    cancellationDateTime: str(raw?.cancellationDateTime),
    paymentType: int(raw?.paymentType),
    collectType: str(raw?.collectType),
    remark: str(raw?.remark),
    totalValue: parseHunitDecimal(raw?.totalValue),
    totalValueWithTaxes: parseHunitDecimal(raw?.totalValueWithTaxes),
    totalAddOns: parseHunitDecimal(raw?.totalAddOns),
    rooms: toArray<any>(raw?.rooms?.room).map(parseRoom),
    guest: raw?.guest
      ? {
          firstName: str(raw.guest.firstName),
          lastName: str(raw.guest.lastName),
          documentType: str(raw.guest.documentType),
          documentNumber: str(raw.guest.documentNumber ?? raw.guest.document),
          email: str(raw.guest.email),
          phone: str(raw.guest.phone),
        }
      : null,
  };
}

// ─── Operações ───────────────────────────────────────────────────────────────

export const Hunit = {
  /** Lista de portais (OTAs + HBOOK). `isActive` = configurado para ESTE hotel. */
  async portalRead(creds: HunitCredentials): Promise<HunitPortal[]> {
    const rs = await post("portal/read", buildRequest("portalRQ", creds));
    return toArray<any>(rs?.portal).map((p) => ({
      id: int(p?.["@_id"]) ?? 0,
      name: str(p?.["@_name"]) ?? "",
      isActive: bool(p?.["@_isActive"]),
      isChildPortal: bool(p?.["@_isChildPortal"]),
      masterPortalId: int(p?.["@_masterPortalId"]),
      masterPortal: str(p?.["@_masterPortal"]),
    }));
  },

  /** Tipos de quarto × tarifa do hotel (chave do mapeamento categoria ↔ roomTypeId). */
  async roomRateRead(creds: HunitCredentials): Promise<HunitRoomRateRow[]> {
    const rs = await post("roomrate/read", buildRequest("roomRateRQ", creds));
    return toArray<any>(rs?.roomRate).map((r) => ({
      id: str(r?.["@_id"]) ?? "",
      roomTypeId: str(r?.["@_roomTypeId"]) ?? "",
      name: (str(r?.["@_name"]) ?? "").replace(/\s+/g, " ").trim(),
      isActive: bool(r?.["@_isActive"]),
      rateTypeId: str(r?.["@_rateTypeId"]),
      isChildRoomRate: bool(r?.["@_isChildRoomRate"]),
      masterRoomRateId: str(r?.["@_masterRoomRateId"]),
      masterRoomRate: str(r?.["@_MasterRoomRate"] ?? r?.["@_masterRoomRate"]),
    }));
  },

  /**
   * Reservas pendentes de entrega (new/modify/cancel). Elas só saem da fila após
   * a confirmação — em modo sombra NUNCA confirmamos (a fila é do PMS oficial).
   * Obs.: a doc v14 usa `reservationRQ` como raiz (o exemplo da pág. 11 com
   * `roomRateRQ` é typo confirmado pelo formato das demais chamadas).
   */
  async bookingRead(creds: HunitCredentials): Promise<HunitReservation[]> {
    const rs = await post("booking/read", buildRequest("reservationRQ", creds));
    return toArray<any>(rs?.reservation)
      .map(parseReservation)
      .filter((r): r is HunitReservation => r !== null);
  },

  /** Busca individual pelo locatorId. */
  async bookingByIdRead(creds: HunitCredentials, locatorId: string): Promise<HunitReservation | null> {
    const rs = await post(
      "bookingbyid/read",
      buildRequest("reservationByIdRQ", creds, `<locatorId>${escapeXml(locatorId)}</locatorId>`),
    );
    const list = toArray<any>(rs?.reservation).map(parseReservation).filter(Boolean) as HunitReservation[];
    return list[0] ?? null;
  },

  /**
   * Confirma o recebimento — tira a reserva da fila do hotel. `pmsReservationIdentifier`
   * é o nosso identificador (groupId/stayId); em modify/cancel devolvemos o MESMO
   * enviado na reserva nova (regra da doc).
   */
  async confirmePost(
    creds: HunitCredentials,
    confirmations: { reservationId: string; pmsReservationIdentifier: string }[],
  ): Promise<void> {
    if (confirmations.length === 0) return;
    const inner =
      "<confirmations>" +
      confirmations
        .map(
          (c) =>
            "<confirmation>" +
            `<reservationId>${escapeXml(c.reservationId)}</reservationId>` +
            `<pmsReservationIdentifier>${escapeXml(c.pmsReservationIdentifier)}</pmsReservationIdentifier>` +
            "</confirmation>",
        )
        .join("") +
      "</confirmations>";
    await post("confirme/post", buildRequest("reservationConfirmeRQ", creds, inner));
  },

  /**
   * Envia disponibilidade (e stopSell) por tipo de quarto e período. `to` é
   * inclusivo; os 7 flags de dia-da-semana vão sempre true (períodos contínuos —
   * a compressão por valor igual é feita pelo service). Limite de 1500 itens por
   * request é responsabilidade do chamador (o service faz chunking).
   */
  async availabilityUpdate(creds: HunitCredentials, updates: HunitAvailabilityUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    const inner =
      "<updates>" +
      updates
        .map(
          (u) =>
            "<update>" +
            `<dateRange from="${escapeXml(u.from)}" to="${escapeXml(u.to)}" sun="true" mon="true" tue="true" wed="true" thu="true" fri="true" sat="true" />` +
            `<roomTypeId>${escapeXml(u.roomTypeId)}</roomTypeId>` +
            `<availability>${Math.max(0, Math.floor(u.availability))}</availability>` +
            (u.stopSell !== undefined ? `<stopSell>${u.stopSell ? "true" : "false"}</stopSell>` : "") +
            "</update>",
        )
        .join("") +
      "</updates>";
    await post("availability/update", buildRequest("updateRQ", creds, inner));
  },

  /**
   * KPIs diários (alimenta HPrice): occupancy %, revenue, dailyRate (ADR), revPar,
   * occupiedUHs, availableUHs — todos opcionais, ao menos um por update.
   */
  async occupancyRateUpdate(
    creds: HunitCredentials,
    updates: {
      date: string;
      occupancy?: number;
      revenue?: number;
      dailyRate?: number;
      revPar?: number;
      occupiedUHs?: number;
      availableUHs?: number;
    }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    const attr = (k: string, v: number | undefined) =>
      v === undefined || v === null || Number.isNaN(v) ? "" : ` ${k}="${escapeXml(v)}"`;
    const inner =
      "<updates>" +
      updates
        .map(
          (u) =>
            `<update date="${escapeXml(u.date)}"` +
            attr("occupancy", u.occupancy) +
            attr("revenue", u.revenue) +
            attr("dailyRate", u.dailyRate) +
            attr("revPar", u.revPar) +
            attr("occupiedUHs", u.occupiedUHs) +
            attr("availableUHs", u.availableUHs) +
            " />",
        )
        .join("") +
      "</updates>";
    await post("occupancyrate/update", buildRequest("occupancyRateRQ", creds, inner));
  },
};
