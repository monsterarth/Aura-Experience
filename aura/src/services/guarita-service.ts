// src/services/guarita-service.ts
//
// Módulo Guarita — cadastro de placas, movimentos, tarifa do dia e turno.
// SERVER-ONLY (supabaseAdmin): o app da guarita fala por /api/field/guarita e o
// admin por /api/admin/guarita. Ver docs/GUARITA.md.
//
// A ideia que organiza tudo: a PLACA é cadastro, não anotação diária. Quando o
// guarita digita, o sistema responde quem é — e a digitação vira conferência.
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import type {
  ParkingRate, ParkingShift, ParkingShiftSummary, PlateLookup,
  Vehicle, VehicleKind, VehicleMovement, VehicleStatus,
} from "@/types/aura";

export interface GuaritaActor { id: string; name: string }

function db() {
  if (!supabaseAdmin) throw new Error("GuaritaService é server-only (supabaseAdmin ausente).");
  return supabaseAdmin;
}

/** Data de hoje no fuso da pousada (BRT). O servidor roda em UTC. */
export function todayBrt(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * "abc-1d23", "ABC 1D23" e "abc1d23" são o mesmo carro. Sem isto o cadastro
 * duplica na primeira semana e o pátio passa a mentir.
 */
export function normalizePlate(plate: string | null | undefined): string {
  return (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Formata para leitura (ABC1D23 → ABC-1D23). Só exibição. */
export function displayPlate(plate: string): string {
  const p = normalizePlate(plate);
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

const KIND_LABEL: Record<VehicleKind, string> = {
  guest: "Hóspede", visitor: "Visita", supplier: "Fornecedor", staff: "Equipe", customer: "Cliente",
};

export const GuaritaService = {
  // ── Contexto ───────────────────────────────────────────────────────────────

  async isEnabled(propertyId: string): Promise<boolean> {
    const { data } = await db().from("properties").select("settings").eq("id", propertyId).maybeSingle();
    return (data?.settings as any)?.hasGuarita === true;
  },

  // ── Tarifa do dia ──────────────────────────────────────────────────────────

  async getRate(propertyId: string, date = todayBrt()): Promise<ParkingRate | null> {
    const { data } = await db()
      .from("parking_rates").select("*")
      .eq("propertyId", propertyId).eq("date", date).maybeSingle();
    return (data as ParkingRate) ?? null;
  },

  async setRate(
    propertyId: string,
    date: string,
    input: { amount: number; closed?: boolean },
    actor: GuaritaActor,
  ): Promise<ParkingRate> {
    const amount = Math.max(0, Math.round((Number(input.amount) || 0) * 100) / 100);
    const closed = input.closed === true;
    const row = {
      propertyId, date, amount, closed,
      setBy: actor.id, setByName: actor.name, setAt: new Date().toISOString(),
    };
    const { error } = await db().from("parking_rates").upsert(row, { onConflict: "propertyId,date" });
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "PARKING_RATE_SET", entity: "PARKING", entityId: date,
      details: closed ? `Estacionamento fechado em ${date}.` : `Tarifa de ${date}: R$ ${amount.toFixed(2)}.`,
    });
    return row as ParkingRate;
  },

  /** Últimos valores usados — alimentam os presets do app. */
  async getRatePresets(propertyId: string): Promise<number[]> {
    const { data } = await db()
      .from("parking_rates").select("amount")
      .eq("propertyId", propertyId).eq("closed", false).gt("amount", 0)
      .order("date", { ascending: false }).limit(60);
    const seen = new Set<number>();
    for (const r of data ?? []) seen.add(Number(r.amount));
    const list = Array.from(seen).sort((a, b) => a - b);
    return list.length > 0 ? list.slice(0, 6) : [30, 50, 80, 100, 150];
  },

  // ── Turno ──────────────────────────────────────────────────────────────────

  async getOpenShift(propertyId: string): Promise<ParkingShift | null> {
    const { data } = await db()
      .from("parking_shifts").select("*")
      .eq("propertyId", propertyId).eq("status", "open").maybeSingle();
    return (data as ParkingShift) ?? null;
  },

  /** Abre o turno se não houver um aberto — o guarita nunca precisa pensar nisso. */
  async ensureShift(propertyId: string, actor: GuaritaActor): Promise<ParkingShift> {
    const open = await this.getOpenShift(propertyId);
    if (open) return open;

    const { data: last } = await db()
      .from("parking_shifts").select("number")
      .eq("propertyId", propertyId).order("number", { ascending: false }).limit(1).maybeSingle();

    const row = {
      propertyId,
      number: (last?.number ?? 0) + 1,
      status: "open",
      openedAt: new Date().toISOString(),
      openedBy: actor.id,
      openedByName: actor.name,
    };
    const { data, error } = await db().from("parking_shifts").insert(row).select("*").single();
    if (error) {
      // Corrida (dois toques ao mesmo tempo): o índice parcial garante um só aberto.
      const again = await this.getOpenShift(propertyId);
      if (again) return again;
      throw new Error(error.message);
    }
    return data as ParkingShift;
  },

  async closeShift(propertyId: string, actor: GuaritaActor, notes?: string): Promise<ParkingShift | null> {
    const shift = await this.getOpenShift(propertyId);
    if (!shift) return null;

    const summary = await this.summarize(propertyId, shift.id);
    const { data, error } = await db()
      .from("parking_shifts")
      .update({
        status: "closed",
        closedAt: new Date().toISOString(),
        closedBy: actor.id,
        closedByName: actor.name,
        summary,
        notes: notes ?? null,
      })
      .eq("id", shift.id).eq("status", "open")
      .select("*").single();
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "PARKING_SHIFT_CLOSED", entity: "PARKING", entityId: String(shift.number),
      details: `Turno ${shift.number} fechado: R$ ${summary.total.toFixed(2)} em ${summary.paidCount} veículo(s).`,
    });
    return data as ParkingShift;
  },

  /** Resumo de um turno — o número que hoje é levado à recepção em papel. */
  async summarize(propertyId: string, shiftId: string): Promise<ParkingShiftSummary> {
    const { data } = await db()
      .from("vehicle_movements")
      .select('amount, "paymentMethod", kind, "exitedAt"')
      .eq("propertyId", propertyId).eq("shiftId", shiftId);

    const rows = data ?? [];
    const byMethod: Record<string, { count: number; total: number }> = {};
    const freeByKind: Record<string, number> = {};
    let total = 0, paidCount = 0, stillInside = 0;

    for (const r of rows) {
      const amount = Number(r.amount) || 0;
      if (!r.exitedAt) stillInside += 1;
      if (amount > 0 && r.paymentMethod) {
        total += amount;
        paidCount += 1;
        const m = byMethod[r.paymentMethod] ?? { count: 0, total: 0 };
        m.count += 1; m.total += amount;
        byMethod[r.paymentMethod] = m;
      } else {
        freeByKind[r.kind] = (freeByKind[r.kind] ?? 0) + 1;
      }
    }
    return { total: Math.round(total * 100) / 100, paidCount, byMethod, freeByKind, stillInside };
  },

  // ── A placa ────────────────────────────────────────────────────────────────

  /**
   * O coração do app: digita a placa, o sistema diz quem é.
   *
   * Ordem de busca: cadastro → estadia com essa placa (pré-check-in) → staff.
   * Isso é o que faz o hóspede ser reconhecido na primeira vez que passa, sem
   * ninguém ter cadastrado nada.
   */
  async lookupPlate(propertyId: string, rawPlate: string): Promise<PlateLookup> {
    const plate = normalizePlate(rawPlate);
    const base: PlateLookup = { plate, vehicle: null, source: "none", kind: "customer", status: "normal" };
    if (!plate) return base;

    const [{ data: vehicle }, { data: openMov }, { count: visitCount }] = await Promise.all([
      db().from("vehicles").select("*").eq("propertyId", propertyId).eq("plate", plate).maybeSingle(),
      db().from("vehicle_movements").select("*")
        .eq("propertyId", propertyId).eq("plate", plate).is("exitedAt", null)
        .order("enteredAt", { ascending: false }).limit(1).maybeSingle(),
      db().from("vehicle_movements").select("id", { count: "exact", head: true })
        .eq("propertyId", propertyId).eq("plate", plate),
    ]);

    const out: PlateLookup = {
      ...base,
      vehicle: (vehicle as Vehicle) ?? null,
      openMovement: (openMov as VehicleMovement) ?? null,
      visitCount: visitCount ?? 0,
    };

    if (vehicle) {
      out.source = "vehicle";
      out.kind = vehicle.kind as VehicleKind;
      out.status = vehicle.status as VehicleStatus;
      out.statusReason = vehicle.statusReason;
    }

    // Estadia com esta placa — `stays.vehiclePlate` vem digitada no pré-check-in,
    // então a comparação é feita normalizada, em memória (o conjunto é pequeno).
    const today = todayBrt();
    const { data: stays } = await db()
      .from("stays")
      .select('id, "vehiclePlate", "guestId", "cabinId", "checkOut", status')
      .eq("propertyId", propertyId)
      .in("status", ["pending", "pre_checkin_done", "active"])
      .not("vehiclePlate", "is", null)
      .gte("checkOut", today);

    const stay = (stays ?? []).find(s => normalizePlate(s.vehiclePlate) === plate);
    if (stay) {
      out.stayId = stay.id;
      out.checkOut = stay.checkOut;
      if (out.source === "none") { out.source = "stay"; out.kind = "guest"; }
      const [{ data: guest }, { data: cabin }] = await Promise.all([
        stay.guestId ? db().from("guests").select("fullName").eq("id", stay.guestId).maybeSingle() : Promise.resolve({ data: null }),
        stay.cabinId ? db().from("cabins").select("name").eq("id", stay.cabinId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      out.guestName = (guest as any)?.fullName ?? null;
      out.cabinName = (cabin as any)?.name ?? null;
    }

    if (out.source === "none") {
      const { data: staffRows } = await db()
        .from("staff").select('id, "fullName", "vehiclePlate"')
        .eq("propertyId", propertyId).not("vehiclePlate", "is", null);
      const member = (staffRows ?? []).find(s => normalizePlate(s.vehiclePlate) === plate);
      if (member) {
        out.source = "staff";
        out.kind = "staff";
        out.staffName = member.fullName;
      }
    }

    return out;
  },

  // ── Cadastro ───────────────────────────────────────────────────────────────

  async upsertVehicle(
    propertyId: string,
    input: Partial<Vehicle> & { plate: string },
    actor: GuaritaActor,
  ): Promise<Vehicle> {
    const plate = normalizePlate(input.plate);
    if (!plate) throw new Error("Placa inválida.");

    const { data: existing } = await db()
      .from("vehicles").select("*").eq("propertyId", propertyId).eq("plate", plate).maybeSingle();

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const k of ["model", "color", "ownerName", "ownerPhone", "marketingOptIn", "kind", "guestId", "staffId", "supplierId", "notes"] as const) {
      if (input[k] !== undefined) patch[k] = input[k];
    }

    if (existing) {
      const { data, error } = await db().from("vehicles").update(patch).eq("id", existing.id).select("*").single();
      if (error) throw new Error(error.message);
      return data as Vehicle;
    }

    const { data, error } = await db().from("vehicles")
      .insert({ propertyId, plate, kind: input.kind ?? "customer", status: "normal", ...patch })
      .select("*").single();
    if (error) {
      // Corrida no primeiro registro da placa: alguém acabou de criar.
      const { data: again } = await db().from("vehicles").select("*").eq("propertyId", propertyId).eq("plate", plate).maybeSingle();
      if (again) return again as Vehicle;
      throw new Error(error.message);
    }
    return data as Vehicle;
  },

  /** Marca ou tira a atenção de uma placa. Sempre com motivo e autor. */
  async setVehicleStatus(
    propertyId: string,
    plate: string,
    status: VehicleStatus,
    reason: string | null,
    actor: GuaritaActor,
  ): Promise<Vehicle> {
    const vehicle = await this.upsertVehicle(propertyId, { plate }, actor);
    const { data, error } = await db().from("vehicles")
      .update({
        status,
        statusReason: status === "normal" ? null : (reason ?? null),
        statusBy: actor.id, statusByName: actor.name, statusAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .eq("id", vehicle.id).select("*").single();
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "VEHICLE_STATUS_SET", entity: "PARKING", entityId: normalizePlate(plate),
      details: status === "normal"
        ? `Placa ${displayPlate(plate)} voltou ao normal.`
        : `Placa ${displayPlate(plate)} marcada como ${status}${reason ? `: ${reason}` : ""}.`,
    });
    return data as Vehicle;
  },

  // ── Movimentos ─────────────────────────────────────────────────────────────

  async registerEntry(
    propertyId: string,
    input: {
      plate: string;
      kind: VehicleKind;
      amount?: number;
      paymentMethod?: string | null;
      cardBrand?: string | null;
      installments?: number | null;
      nsu?: string | null;
      stayId?: string | null;
      ownerName?: string | null;
      ownerPhone?: string | null;
      marketingOptIn?: boolean;
      model?: string | null;
      notes?: string | null;
    },
    actor: GuaritaActor,
  ): Promise<VehicleMovement> {
    const plate = normalizePlate(input.plate);
    if (!plate) throw new Error("Placa inválida.");

    // Já está no pátio? Registrar duas entradas cria dois carros onde há um.
    const { data: open } = await db()
      .from("vehicle_movements").select("id")
      .eq("propertyId", propertyId).eq("plate", plate).is("exitedAt", null).limit(1).maybeSingle();
    if (open) throw Object.assign(new Error("Este veículo já está no pátio."), { code: "ALREADY_INSIDE" });

    const amount = Math.max(0, Math.round((Number(input.amount) || 0) * 100) / 100);
    if (amount > 0 && !input.paymentMethod) throw new Error("Escolha a forma de pagamento.");

    const shift = await this.ensureShift(propertyId, actor);

    // Quando o guarita aponta a estadia (hóspede/visita cuja placa ainda não era
    // conhecida), o vínculo é gravado nos DOIS lados: o cadastro da placa passa a
    // apontar para o hóspede e a estadia passa a carregar a placa. É o que faz o
    // carro ser reconhecido sozinho na próxima entrada — inclusive no painel de
    // chegadas, que lê `stays.vehiclePlate`.
    let guestId: string | null = null;
    if (input.stayId) {
      const { data: stay } = await db()
        .from("stays").select('id, "guestId", "vehiclePlate"')
        .eq("id", input.stayId).eq("propertyId", propertyId).maybeSingle();
      if (stay) {
        guestId = stay.guestId ?? null;
        // Só preenche se estiver vazia: o hóspede pode ter informado outro carro
        // no pré-check-in, e o dele não se sobrescreve.
        if (input.kind === "guest" && !normalizePlate(stay.vehiclePlate)) {
          await db().from("stays")
            .update({ vehiclePlate: plate, updatedAt: new Date().toISOString() })
            .eq("id", stay.id);
        }
      }
    }

    const vehicle = await this.upsertVehicle(propertyId, {
      plate,
      kind: input.kind,
      model: input.model ?? undefined,
      ownerName: input.ownerName ?? undefined,
      ownerPhone: input.ownerPhone ?? undefined,
      marketingOptIn: input.marketingOptIn,
      ...(guestId && input.kind === "guest" ? { guestId } : {}),
    }, actor);

    const row = {
      propertyId,
      vehicleId: vehicle.id,
      plate,
      kind: input.kind,
      stayId: input.stayId ?? null,
      enteredAt: new Date().toISOString(),
      amount,
      paymentMethod: amount > 0 ? input.paymentMethod : null,
      cardBrand: input.cardBrand ?? null,
      installments: input.installments ?? null,
      nsu: input.nsu ?? null,
      shiftId: shift.id,
      registeredBy: actor.id,
      registeredByName: actor.name,
      notes: input.notes ?? null,
    };

    const { data, error } = await db().from("vehicle_movements").insert(row).select("*").single();
    if (error) throw new Error(error.message);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "PARKING_ENTRY", entity: "PARKING", entityId: plate,
      details: amount > 0
        ? `Entrada ${displayPlate(plate)} (${KIND_LABEL[input.kind]}) — R$ ${amount.toFixed(2)} ${input.paymentMethod}.`
        : `Entrada ${displayPlate(plate)} (${KIND_LABEL[input.kind]}) — isento.`,
    });
    return data as VehicleMovement;
  },

  async registerExit(propertyId: string, movementId: string, actor: GuaritaActor): Promise<VehicleMovement> {
    const { data, error } = await db()
      .from("vehicle_movements")
      .update({
        exitedAt: new Date().toISOString(),
        exitBy: actor.id, exitByName: actor.name,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", movementId).eq("propertyId", propertyId).is("exitedAt", null)
      .select("*").single();
    if (error) throw Object.assign(new Error("Este veículo já teve a saída registrada."), { code: "ALREADY_OUT" });

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "PARKING_EXIT", entity: "PARKING", entityId: (data as VehicleMovement).plate,
      details: `Saída ${displayPlate((data as VehicleMovement).plate)}.`,
    });
    return data as VehicleMovement;
  },

  /** Quem está no pátio agora — entrada sem saída. */
  async getPatio(propertyId: string): Promise<VehicleMovement[]> {
    const { data } = await db()
      .from("vehicle_movements").select("*")
      .eq("propertyId", propertyId).is("exitedAt", null)
      .order("enteredAt", { ascending: false });

    const rows = (data ?? []) as VehicleMovement[];
    return this._enrich(propertyId, rows);
  },

  /** Preenche hóspede e cabana dos movimentos ligados a estadia. */
  async _enrich(propertyId: string, rows: VehicleMovement[]): Promise<VehicleMovement[]> {
    const stayIds = Array.from(new Set(rows.map(r => r.stayId).filter(Boolean))) as string[];
    if (stayIds.length === 0) return rows;

    const { data: stays } = await db()
      .from("stays").select('id, "guestId", "cabinId"').in("id", stayIds);
    const guestIds = Array.from(new Set((stays ?? []).map(s => s.guestId).filter(Boolean))) as string[];
    const cabinIds = Array.from(new Set((stays ?? []).map(s => s.cabinId).filter(Boolean))) as string[];

    const [{ data: guests }, { data: cabins }] = await Promise.all([
      guestIds.length ? db().from("guests").select('id, "fullName"').in("id", guestIds) : Promise.resolve({ data: [] as any[] }),
      cabinIds.length ? db().from("cabins").select("id, name").in("id", cabinIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const guestById: Record<string, string> = {};
    (guests ?? []).forEach((g: any) => { guestById[g.id] = g.fullName; });
    const cabinById: Record<string, string> = {};
    (cabins ?? []).forEach((c: any) => { cabinById[c.id] = c.name; });
    const stayById: Record<string, any> = {};
    (stays ?? []).forEach((s: any) => { stayById[s.id] = s; });

    return rows.map(r => {
      const stay = r.stayId ? stayById[r.stayId] : null;
      return {
        ...r,
        guestName: stay?.guestId ? guestById[stay.guestId] ?? null : null,
        cabinName: stay?.cabinId ? cabinById[stay.cabinId] ?? null : null,
      };
    });
  },

  // ── Painel ─────────────────────────────────────────────────────────────────

  /**
   * O que a guarita precisa saber no turno. Quase tudo vem de dado que já
   * existe — chegadas trazem hora prevista e placa do pré-check-in.
   */
  async getDashboard(propertyId: string) {
    const today = todayBrt();
    const dayStart = `${today}T00:00:00`;
    const dayEnd = `${today}T23:59:59.999`;

    const [rate, shift, patio, arrivalsRes, departuresRes, eventsRes, housedRes] = await Promise.all([
      this.getRate(propertyId, today),
      this.getOpenShift(propertyId),
      this.getPatio(propertyId),
      db().from("stays")
        .select('id, "guestId", "cabinId", "checkIn", "expectedArrivalTime", "vehiclePlate", status, "internalUse", "internalLabel", counts')
        .eq("propertyId", propertyId)
        .in("status", ["pending", "pre_checkin_done"])
        .gte("checkIn", dayStart).lte("checkIn", dayEnd),
      db().from("stays")
        .select('id, "guestId", "cabinId", "checkOut", status')
        .eq("propertyId", propertyId)
        .in("status", ["active", "pre_checkin_done"])
        .gte("checkOut", dayStart).lte("checkOut", dayEnd),
      db().from("events")
        .select("id, title, startDate, endDate")
        .eq("propertyId", propertyId)
        .lte("startDate", dayEnd).gte("endDate", dayStart)
        .limit(5),
      // Quem está em casa — alimenta o seletor de "qual cabana/titular" quando o
      // guarita marca hóspede ou visita e a placa ainda não é conhecida.
      db().from("stays")
        .select('id, "guestId", "cabinId", "checkOut", status, "internalUse", "internalLabel", "vehiclePlate"')
        .eq("propertyId", propertyId)
        .in("status", ["active", "pending", "pre_checkin_done"])
        .not("cabinId", "is", null)
        .lte("checkIn", dayEnd).gte("checkOut", dayStart),
    ]);

    const arrivals = arrivalsRes.data ?? [];
    const departures = departuresRes.data ?? [];
    const housedRows = housedRes.data ?? [];
    const ids = Array.from(new Set([...arrivals, ...departures, ...housedRows].flatMap(s => [s.guestId, s.cabinId]).filter(Boolean))) as string[];

    const [{ data: guests }, { data: cabins }] = await Promise.all([
      ids.length ? db().from("guests").select('id, "fullName"').in("id", ids) : Promise.resolve({ data: [] as any[] }),
      ids.length ? db().from("cabins").select("id, name").in("id", ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const nameById: Record<string, string> = {};
    (guests ?? []).forEach((g: any) => { nameById[g.id] = g.fullName; });
    const cabinById: Record<string, string> = {};
    (cabins ?? []).forEach((c: any) => { cabinById[c.id] = c.name; });

    const decorate = (s: any) => ({
      id: s.id,
      guestName: s.internalUse ? (s.internalLabel || "Uso da casa") : (s.guestId ? nameById[s.guestId] ?? "Hóspede" : "Hóspede"),
      cabinName: s.cabinId ? cabinById[s.cabinId] ?? null : null,
      expectedArrivalTime: s.expectedArrivalTime ?? null,
      vehiclePlate: s.vehiclePlate ? normalizePlate(s.vehiclePlate) : null,
      checkIn: s.checkIn ?? null,
      checkOut: s.checkOut ?? null,
    });

    const summary = shift ? await this.summarize(propertyId, shift.id) : null;

    return {
      date: today,
      rate,
      ratePresets: await this.getRatePresets(propertyId),
      shift,
      summary,
      patio,
      arrivals: arrivals.map(decorate).sort((a, b) => (a.expectedArrivalTime ?? "99").localeCompare(b.expectedArrivalTime ?? "99")),
      departures: departures.map(decorate),
      housed: housedRows
        .map(s => ({
          id: s.id,
          guestName: s.internalUse ? (s.internalLabel || "Uso da casa") : (s.guestId ? nameById[s.guestId] ?? "Hóspede" : "Hóspede"),
          cabinName: s.cabinId ? cabinById[s.cabinId] ?? null : null,
          status: s.status,
          hasPlate: !!normalizePlate(s.vehiclePlate),
        }))
        .sort((a, b) => (a.cabinName ?? "").localeCompare(b.cabinName ?? "", "pt-BR", { numeric: true })),
      events: eventsRes.data ?? [],
    };
  },

  // ── Relatório (o número que substitui a reserva-fantasma) ──────────────────

  async getReport(propertyId: string, from: string, to: string) {
    const { data } = await db()
      .from("vehicle_movements").select("*")
      .eq("propertyId", propertyId)
      .gte("enteredAt", `${from}T00:00:00`)
      .lte("enteredAt", `${to}T23:59:59.999`)
      .order("enteredAt", { ascending: false });

    const rows = (data ?? []) as VehicleMovement[];
    const byDay: Record<string, { total: number; count: number; free: number }> = {};
    const byMethod: Record<string, { count: number; total: number }> = {};
    let total = 0, paidCount = 0, freeCount = 0;

    for (const r of rows) {
      const day = String(r.enteredAt).slice(0, 10);
      const amount = Number(r.amount) || 0;
      const d = byDay[day] ?? { total: 0, count: 0, free: 0 };
      if (amount > 0 && r.paymentMethod) {
        total += amount; paidCount += 1;
        d.total += amount; d.count += 1;
        const m = byMethod[r.paymentMethod] ?? { count: 0, total: 0 };
        m.count += 1; m.total += amount;
        byMethod[r.paymentMethod] = m;
      } else {
        freeCount += 1; d.free += 1;
      }
      byDay[day] = d;
    }

    return {
      from, to,
      total: Math.round(total * 100) / 100,
      paidCount, freeCount,
      byMethod,
      byDay: Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a)).map(([date, v]) => ({ date, ...v })),
      movements: rows.slice(0, 200),
    };
  },

  async listShifts(propertyId: string, limit = 30): Promise<ParkingShift[]> {
    const { data } = await db()
      .from("parking_shifts").select("*")
      .eq("propertyId", propertyId)
      .order("number", { ascending: false }).limit(limit);
    return (data ?? []) as ParkingShift[];
  },
};
