// src/services/guarita-service.ts
//
// Módulo Guarita — cadastro de placas, movimentos, tarifa do dia e turno.
// SERVER-ONLY (supabaseAdmin): o app da guarita fala por /api/field/guarita e o
// admin por /api/admin/guarita. Ver docs/GUARITA.md.
//
// A ideia que organiza tudo: a PLACA é cadastro, não anotação diária. Quando o
// guarita digita, o sistema responde quem é — e a digitação vira conferência.
import { supabaseAdmin } from "@/lib/supabase";
import { isModuleOn } from "@/lib/modules";
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
  // O gate de módulo das rotas saiu daqui para `requireModule` (src/lib/api-auth.ts)
  // em 04/09/2026 — era a cópia que as outras rotas copiaram.

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

    // A NSU pode entrar depois, mas não pode atravessar o fechamento: sem ela a
    // recepção recebe um turno que não bate com o extrato da maquininha.
    const pending = await this.getPendingMovements(propertyId, shift.id);
    if (pending.length > 0) {
      throw Object.assign(
        new Error(`Falta a NSU de ${pending.length} pagamento(s) em cartão: ${pending.map(p => displayPlate(p.plate)).join(", ")}.`),
        { code: "PENDING_NSU" },
      );
    }

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
        stay.guestId ? db().from("guests").select("fullName").eq("id", stay.guestId).eq("propertyId", propertyId).maybeSingle() : Promise.resolve({ data: null }),
        stay.cabinId ? db().from("cabins").select("name").eq("id", stay.cabinId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      out.guestName = (guest as any)?.fullName ?? null;
      out.cabinName = (cabin as any)?.name ?? null;
    }

    // Vínculo já gravado no cadastro. Sem isto o carro do fornecedor volta a ser
    // um nome digitado toda vez, mesmo depois de cadastrado.
    if (vehicle?.staffId) {
      const { data: member } = await db()
        .from("staff").select('"fullName"').eq("id", vehicle.staffId).maybeSingle();
      out.staffName = (member as any)?.fullName ?? out.staffName ?? null;
    }
    if (vehicle?.supplierId) {
      const { data: supplier } = await db()
        .from("suppliers").select("name").eq("id", vehicle.supplierId).maybeSingle();
      out.supplierName = (supplier as any)?.name ?? null;
    }

    // Última cartada: a placa está no cadastro da equipe, mesmo sem veículo
    // cadastrado. É como o carro do funcionário se identifica sem ninguém
    // ter passado pela guarita antes.
    if (out.source === "none") {
      const { data: staffRows } = await db()
        .from("staff").select('id, "fullName", "vehiclePlate"')
        .eq("propertyId", propertyId).not("vehiclePlate", "is", null);
      const member = (staffRows ?? []).find(s => normalizePlate(s.vehiclePlate) === plate);
      if (member) {
        out.source = "staff";
        out.kind = "staff";
        out.staffId = member.id;
        out.staffName = member.fullName;
      }
    }

    return out;
  },

  // ── Cadastro ───────────────────────────────────────────────────────────────

  /**
   * O cadastro de placas, para a tela do admin.
   *
   * A ideia que organiza o módulo é "a placa é cadastro, não anotação do dia" —
   * mas o cadastro não tinha tela: só as placas MARCADAS apareciam. Sem isto
   * ninguém corrige um dono errado nem descobre por que um carro é isento.
   */
  async listVehicles(
    propertyId: string,
    opts: { search?: string; kind?: VehicleKind | "all"; status?: VehicleStatus | "all"; limit?: number } = {},
  ): Promise<{ vehicles: Vehicle[]; total: number }> {
    let q = db()
      .from("vehicles").select("*", { count: "exact" })
      .eq("propertyId", propertyId);

    if (opts.kind && opts.kind !== "all") q = q.eq("kind", opts.kind);
    if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);

    const search = (opts.search ?? "").trim();
    if (search) {
      // A placa é buscada NORMALIZADA (quem digita "abc-1d23" quer o mesmo
      // carro); nome e modelo aceitam pedaço solto.
      const plate = normalizePlate(search);
      // A vírgula separa os termos do `or` e o parêntese o fecha: deixar passar
      // é injeção de filtro, não busca. O `%` sai para não virar curinga solto.
      const like = `%${search.replace(/[%,()]/g, "")}%`;
      q = q.or(`plate.ilike.%${plate}%,ownerName.ilike.${like},model.ilike.${like}`);
    }

    const { data, count } = await q
      .order("updatedAt", { ascending: false })
      .limit(opts.limit ?? 100);

    return { vehicles: (data ?? []) as Vehicle[], total: count ?? 0 };
  },

  /**
   * Com quem uma placa pode ser vinculada: gente da equipe e fornecedores.
   *
   * `suppliers` é tabela do módulo de Estoque. A dependência é SUAVE de
   * propósito — pousada com Guarita e sem Estoque devolve lista vazia e a tela
   * cai no nome digitado, que é como funciona hoje. Módulo não pode depender
   * duro de tabela de outro módulo (docs/MODULARIZATION.md, regra 2).
   */
  async listLinkTargets(propertyId: string): Promise<{
    staff: { id: string; name: string; role: string; plate: string | null }[];
    suppliers: { id: string; name: string }[];
  }> {
    const { data: property } = await db()
      .from("properties").select("settings").eq("id", propertyId).maybeSingle();
    const hasStock = isModuleOn(property?.settings, "estoque");

    const [staffRes, supplierRes] = await Promise.all([
      db().from("staff").select('id, "fullName", role, "vehiclePlate"')
        .eq("propertyId", propertyId).eq("active", true).order("fullName"),
      hasStock
        ? db().from("suppliers").select("id, name").eq("propertyId", propertyId).eq("active", true).order("name")
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    return {
      staff: (staffRes.data ?? []).map((r: any) => ({
        id: r.id, name: r.fullName, role: r.role, plate: r.vehiclePlate ?? null,
      })),
      suppliers: ((supplierRes.data ?? []) as { id: string; name: string }[]).map(r => ({ id: r.id, name: r.name })),
    };
  },


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

  /**
   * A mesma NSU não pode aparecer duas vezes no dia.
   *
   * O guarita copia o número da via da maquininha; repetir significa que ele
   * colou no carro errado (ou registrou o mesmo pagamento duas vezes) — e a
   * conciliação com a adquirente quebraria sem ninguém perceber.
   */
  async assertNsuFree(propertyId: string, nsu: string, whenIso: string, exceptMovementId?: string): Promise<void> {
    const value = String(nsu ?? "").trim();
    if (!value) return;

    // O dia é o da pousada (BRT), não o do servidor: o turno da noite atravessa
    // a virada em UTC e a mesma NSU passaria batida na fresta.
    const day = new Date(new Date(whenIso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    const from = `${day}T03:00:00.000Z`;
    const to = new Date(new Date(from).getTime() + 24 * 3600_000 - 1).toISOString();

    const { data } = await db()
      .from("vehicle_movements").select("id, plate")
      .eq("propertyId", propertyId).eq("nsu", value)
      .gte("enteredAt", from).lte("enteredAt", to);

    const clash = (data ?? []).find(r => r.id !== exceptMovementId);
    if (clash) {
      throw Object.assign(
        new Error(`A NSU ${value} já foi usada hoje em ${displayPlate(clash.plate)}.`),
        { code: "NSU_DUPLICATED" },
      );
    }
  },

  async registerEntry(
    propertyId: string,
    input: {
      plate: string;
      kind: VehicleKind;
      amount?: number;
      paymentMethod?: string | null;
      cardBrand?: string | null;
      nsu?: string | null;
      stayId?: string | null;
      /** Vínculo apontado pelo guarita quando o tipo é Equipe. */
      staffId?: string | null;
      /** Idem para Fornecedor — id da tabela `suppliers`. */
      supplierId?: string | null;
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
    if (input.nsu) await this.assertNsuFree(propertyId, input.nsu, new Date().toISOString());

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
      // Mesmo princípio do hóspede: o vínculo apontado no portão fica gravado, e
      // na próxima entrada o sistema já responde de quem é o carro.
      ...(input.staffId && input.kind === "staff" ? { staffId: input.staffId } : {}),
      ...(input.supplierId && input.kind === "supplier" ? { supplierId: input.supplierId } : {}),
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

  /**
   * Pagamento em cartão sem NSU é registro pela metade: sem ele a conciliação
   * com a adquirente não fecha. Pode ser preenchido depois — mas não passa do
   * fim do turno.
   */
  pendingNsu(m: Pick<VehicleMovement, "paymentMethod" | "nsu" | "amount">): boolean {
    const card = m.paymentMethod === "credit" || m.paymentMethod === "debit";
    return card && Number(m.amount) > 0 && !String(m.nsu ?? "").trim();
  },

  /** Movimentos do turno aberto que ainda estão incompletos. */
  async getPendingMovements(propertyId: string, shiftId?: string): Promise<VehicleMovement[]> {
    const shift = shiftId ?? (await this.getOpenShift(propertyId))?.id;
    if (!shift) return [];
    const { data } = await db()
      .from("vehicle_movements").select("*")
      .eq("propertyId", propertyId).eq("shiftId", shift)
      .in("paymentMethod", ["credit", "debit"])
      .order("enteredAt", { ascending: false });
    return ((data ?? []) as VehicleMovement[]).filter(m => this.pendingNsu(m));
  },

  /**
   * Corrige um movimento já registrado — o erro de digitação aparece depois, e
   * o NSU quase sempre é preenchido no fim. Só o turno ABERTO aceita correção:
   * turno fechado congelou o resumo.
   */
  async updateMovement(
    propertyId: string,
    movementId: string,
    patch: {
      kind?: VehicleKind;
      amount?: number;
      paymentMethod?: string | null;
      cardBrand?: string | null;
      nsu?: string | null;
      stayId?: string | null;
      ownerName?: string | null;
      ownerPhone?: string | null;
      notes?: string | null;
    },
    actor: GuaritaActor,
  ): Promise<VehicleMovement> {
    const { data: current } = await db()
      .from("vehicle_movements").select("*")
      .eq("id", movementId).eq("propertyId", propertyId).maybeSingle();
    if (!current) throw new Error("Registro não encontrado.");

    const { data: shift } = await db()
      .from("parking_shifts").select("status").eq("id", (current as VehicleMovement).shiftId ?? "").maybeSingle();
    if (shift?.status === "closed") {
      throw Object.assign(new Error("Turno já fechado — este registro não pode mais ser alterado."), { code: "SHIFT_CLOSED" });
    }

    const next: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.kind !== undefined) next.kind = patch.kind;
    if (patch.stayId !== undefined) next.stayId = patch.stayId;
    if (patch.notes !== undefined) next.notes = patch.notes;
    if (patch.amount !== undefined) {
      const amount = Math.max(0, Math.round((Number(patch.amount) || 0) * 100) / 100);
      next.amount = amount;
      next.paymentMethod = amount > 0 ? (patch.paymentMethod ?? (current as VehicleMovement).paymentMethod) : null;
      if (amount === 0) { next.cardBrand = null; next.nsu = null; }
    } else if (patch.paymentMethod !== undefined) {
      next.paymentMethod = patch.paymentMethod;
    }
    if (patch.cardBrand !== undefined) next.cardBrand = patch.cardBrand;
    if (patch.nsu !== undefined) {
      next.nsu = patch.nsu ? String(patch.nsu).trim() : null;
      if (next.nsu) {
        await this.assertNsuFree(propertyId, next.nsu as string, (current as VehicleMovement).enteredAt, movementId);
      }
    }

    if (Number(next.amount ?? (current as VehicleMovement).amount) > 0 && !next.paymentMethod && !(current as VehicleMovement).paymentMethod) {
      throw new Error("Escolha a forma de pagamento.");
    }

    const { data, error } = await db()
      .from("vehicle_movements").update(next).eq("id", movementId).select("*").single();
    if (error) throw new Error(error.message);

    // O dono do carro também se corrige aqui — é onde o guarita percebe o erro.
    if (patch.ownerName !== undefined || patch.ownerPhone !== undefined || patch.kind !== undefined) {
      await this.upsertVehicle(propertyId, {
        plate: (current as VehicleMovement).plate,
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.ownerName !== undefined ? { ownerName: patch.ownerName } : {}),
        ...(patch.ownerPhone !== undefined ? { ownerPhone: patch.ownerPhone } : {}),
      }, actor);
    }

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "PARKING_ENTRY", entity: "PARKING", entityId: (current as VehicleMovement).plate,
      details: `Registro de ${displayPlate((current as VehicleMovement).plate)} corrigido.`,
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

  /**
   * Preenche o que a lista precisa mostrar: hóspede e cabana (dos movimentos
   * ligados a estadia) e o cadastro da placa — é dele que sai o nome do
   * fornecedor e do cliente.
   */
  async _enrich(propertyId: string, rows: VehicleMovement[]): Promise<VehicleMovement[]> {
    if (rows.length === 0) return rows;

    const vehicleIds = Array.from(new Set(rows.map(r => r.vehicleId).filter(Boolean))) as string[];
    const { data: vehicles } = vehicleIds.length
      ? await db().from("vehicles").select("*").in("id", vehicleIds)
      : { data: [] as any[] };
    const vehicleById: Record<string, Vehicle> = {};
    (vehicles ?? []).forEach((v: any) => { vehicleById[v.id] = v as Vehicle; });
    const withVehicle = rows.map(r => ({ ...r, vehicle: r.vehicleId ? vehicleById[r.vehicleId] ?? null : null }));

    const stayIds = Array.from(new Set(rows.map(r => r.stayId).filter(Boolean))) as string[];
    if (stayIds.length === 0) return withVehicle;
    rows = withVehicle;

    const { data: stays } = await db()
      .from("stays").select('id, "guestId", "cabinId"').in("id", stayIds);
    const guestIds = Array.from(new Set((stays ?? []).map(s => s.guestId).filter(Boolean))) as string[];
    const cabinIds = Array.from(new Set((stays ?? []).map(s => s.cabinId).filter(Boolean))) as string[];

    const [{ data: guests }, { data: cabins }] = await Promise.all([
      guestIds.length ? db().from("guests").select('id, "fullName"').in("id", guestIds).eq("propertyId", propertyId) : Promise.resolve({ data: [] as any[] }),
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
      ids.length ? db().from("guests").select('id, "fullName"').in("id", ids).eq("propertyId", propertyId) : Promise.resolve({ data: [] as any[] }),
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
    const pendingNsu = shift ? await this.getPendingMovements(propertyId, shift.id) : [];

    return {
      date: today,
      rate,
      ratePresets: await this.getRatePresets(propertyId),
      shift,
      summary,
      pendingNsu: await this._enrich(propertyId, pendingNsu),
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
