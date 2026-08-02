// src/services/asset-service.ts
// Patrimônio: CRUD de ativos, depreciação linear, baixa/alienação e movimentações.
//
// Duas regras que este arquivo carrega:
//  1. Ativo baixado PARA de depreciar na data da baixa e usa o valor contábil
//     congelado ("bookValueAtDisposal"). Sem isso o valor derivaria para zero
//     para sempre e corromperia toda "posição patrimonial".
//  2. Depreciação de um período é calculada no FIM daquele período, nunca em
//     new Date() — senão reprocessar setembro em outubro dá outro número.
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import {
  Asset, AssetDepreciationEntry, AssetDetail, AssetDisposalInput, AssetLabel,
  AssetMovement, AssetStatus, AssetTransferInput, AssetWarrantyStatus,
  AuditLog, Cabin, MaintenanceTask, StockCategory, StockLocation,
} from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
interface Actor { id: string; name: string; }

/** Alfabeto sem I/O/0/1 — a plaqueta é lida em voz alta e digitada à mão. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Garantia "vencendo" quando falta isto ou menos. */
const WARRANTY_EXPIRING_DAYS = 60;

/**
 * Campos virtuais (calculados ou joinados) que NUNCA vão para o banco.
 * Toda coluna computada nova PRECISA entrar aqui — senão o upsert quebra com
 * `column "..." does not exist`.
 */
export const VIRTUAL_ASSET_FIELDS = [
  "category", "location", "cabinName", "bookValue", "monthlyDepreciation",
  "accumulatedDepreciation", "maintenanceCost", "openMaintenanceCount",
  "warrantyStatus", "disposalResult",
] as const;

/** Último instante do mês de um período 'YYYY-MM'. Torna a depreciação determinística. */
export function periodEnd(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return new Date();
  return new Date(Date.UTC(y, m, 0, 23, 59, 59)); // dia 0 do mês seguinte = último do mês
}

/** Depreciação linear até a data de referência (parando na baixa, se houver). */
export function computeDepreciation(a: Asset, ref: Date) {
  const cost = Number(a.acquisitionCost) || 0;
  const residual = Number(a.residualValue) || 0;
  const life = Number(a.usefulLifeMonths) || 0;
  if (a.depreciationMethod !== "linear" || life <= 0) {
    return { monthlyDepreciation: 0, accumulatedDepreciation: 0, bookValue: round2(cost) };
  }
  const base = Math.max(0, cost - residual);
  const monthly = base / life;
  const startStr = a.depreciationStart || a.acquisitionDate;
  if (!startStr) return { monthlyDepreciation: round2(monthly), accumulatedDepreciation: 0, bookValue: round2(cost) };

  // Ativo baixado congela na data da baixa: nem a depreciação anda, nem o valor.
  const disposal = a.disposalDate ? new Date(a.disposalDate) : null;
  const effectiveRef = disposal && disposal < ref ? disposal : ref;

  const start = new Date(startStr);
  const months = Math.max(0, (effectiveRef.getFullYear() - start.getFullYear()) * 12 + (effectiveRef.getMonth() - start.getMonth()));
  const accumulated = Math.min(monthly * months, base);
  const bookValue = a.bookValueAtDisposal != null && disposal
    ? Number(a.bookValueAtDisposal)
    : cost - accumulated;
  return {
    monthlyDepreciation: round2(monthly),
    accumulatedDepreciation: round2(accumulated),
    bookValue: round2(bookValue),
  };
}

/** Situação da garantia para o badge da lista/ficha/página pública. */
export function warrantyStatusOf(warrantyUntil?: string | null, ref = new Date()): AssetWarrantyStatus {
  if (!warrantyUntil) return "none";
  const until = new Date(warrantyUntil);
  if (until < ref) return "expired";
  const days = (until.getTime() - ref.getTime()) / 86_400_000;
  return days <= WARRANTY_EXPIRING_DAYS ? "expiring" : "active";
}

/** Base pública da propriedade — mesma regra de automation-service.ts:88-90. */
export function publicBaseUrl(settings?: { customDomain?: string } | null): string {
  return settings?.customDomain ? `https://${settings.customDomain}` : "https://aaura.app.br";
}

export const AssetService = {
  async getAssets(
    propertyId: string,
    opts: { includeDisposed?: boolean; statuses?: AssetStatus[]; categoryId?: string; locationId?: string; custodianId?: string } = {},
  ): Promise<Asset[]> {
    const ref = new Date();
    let q = db().from("assets").select("*").eq("propertyId", propertyId).order("name", { ascending: true });
    if (opts.statuses?.length) q = q.in("status", opts.statuses);
    else if (!opts.includeDisposed) q = q.not("status", "in", "(disposed,written_off)");
    if (opts.categoryId) q = q.eq("categoryId", opts.categoryId);
    if (opts.locationId) q = q.eq("locationId", opts.locationId);
    if (opts.custodianId) q = q.eq("custodianId", opts.custodianId);

    const [{ data: assets }, { data: categories }, { data: locations }, { data: cabins }] = await Promise.all([
      q,
      db().from("stock_categories").select("*").eq("propertyId", propertyId),
      db().from("stock_locations").select("*").eq("propertyId", propertyId),
      db().from("cabins").select("id, name").eq("propertyId", propertyId),
    ]);

    const catMap = new Map(((categories ?? []) as StockCategory[]).map((c) => [c.id, c]));
    const locMap = new Map(((locations ?? []) as StockLocation[]).map((l) => [l.id, l]));
    const cabMap = new Map(((cabins ?? []) as Pick<Cabin, "id" | "name">[]).map((c) => [c.id, c.name]));

    return ((assets ?? []) as Asset[]).map((a) => ({
      ...a,
      category: a.categoryId ? catMap.get(a.categoryId) : undefined,
      location: a.locationId ? locMap.get(a.locationId) : undefined,
      cabinName: a.cabinId ? cabMap.get(a.cabinId) : undefined,
      warrantyStatus: warrantyStatusOf(a.warrantyUntil, ref),
      disposalResult: a.disposalDate != null
        ? round2(Number(a.disposalValue ?? 0) - Number(a.bookValueAtDisposal ?? 0))
        : undefined,
      ...computeDepreciation(a, ref),
    }));
  },

  /** Ficha do ativo: um payload composto, montado em consultas paralelas. */
  async getAssetDetail(propertyId: string, id: string): Promise<AssetDetail | null> {
    const ref = new Date();
    const { data: raw } = await db().from("assets").select("*")
      .eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!raw) return null;
    const asset = raw as Asset;

    const [
      { data: category }, { data: location }, { data: cabin },
      { data: depreciation }, { data: maintenance }, movements, { data: audit },
      { data: property },
    ] = await Promise.all([
      asset.categoryId
        ? db().from("stock_categories").select("*").eq("id", asset.categoryId).maybeSingle()
        : Promise.resolve({ data: null }),
      asset.locationId
        ? db().from("stock_locations").select("*").eq("id", asset.locationId).maybeSingle()
        : Promise.resolve({ data: null }),
      asset.cabinId
        ? db().from("cabins").select("id, name").eq("id", asset.cabinId).maybeSingle()
        : Promise.resolve({ data: null }),
      db().from("asset_depreciation_entries").select("*")
        .eq("propertyId", propertyId).eq("assetId", id).order("period", { ascending: false }),
      db().from("maintenance_tasks").select("*")
        .eq("propertyId", propertyId).eq("assetId", id).order("createdAt", { ascending: false }).limit(100),
      this.getMovements(propertyId, id),
      db().from("audit_logs").select("*")
        .eq("propertyId", propertyId).eq("entityId", id).order("timestamp", { ascending: false }).limit(50),
      db().from("properties").select("settings").eq("id", propertyId).maybeSingle(),
    ]);

    const tasks = (maintenance ?? []) as MaintenanceTask[];
    const maintenanceCost = round2(tasks.reduce((s, t) => s + Number(t.cost ?? 0), 0));
    const openMaintenanceCount = tasks.filter(
      (t) => !["completed", "cancelled"].includes(t.status),
    ).length;

    const hydrated: Asset = {
      ...asset,
      category: (category ?? undefined) as StockCategory | undefined,
      location: (location ?? undefined) as StockLocation | undefined,
      cabinName: (cabin as { name?: string } | null)?.name,
      warrantyStatus: warrantyStatusOf(asset.warrantyUntil, ref),
      maintenanceCost,
      openMaintenanceCount,
      disposalResult: asset.disposalDate != null
        ? round2(Number(asset.disposalValue ?? 0) - Number(asset.bookValueAtDisposal ?? 0))
        : undefined,
      ...computeDepreciation(asset, ref),
    };

    const base = publicBaseUrl((property as { settings?: { customDomain?: string } } | null)?.settings);
    return {
      asset: hydrated,
      depreciation: (depreciation ?? []) as AssetDepreciationEntry[],
      maintenance: tasks,
      maintenanceCost,
      movements,
      audit: (audit ?? []) as AuditLog[],
      publicUrl: asset.publicCode ? `${base}/p/${asset.publicCode}` : "",
    };
  },

  async upsertAsset(propertyId: string, payload: Partial<Asset>, actor: Actor): Promise<string> {
    const isNew = !payload.id;
    const id = payload.id ?? crypto.randomUUID();

    // Estado anterior: é o que permite registrar a movimentação pelo diff.
    const previous = isNew
      ? null
      : ((await db().from("assets").select("*").eq("id", id).eq("propertyId", propertyId).maybeSingle()).data as Asset | null);

    const row: Record<string, unknown> = {
      ...payload, id, propertyId,
      depreciationMethod: payload.depreciationMethod ?? "linear",
      acquisitionCost: payload.acquisitionCost ?? 0,
      residualValue: payload.residualValue ?? 0,
      status: payload.status ?? "active",
      updatedAt: now(),
      ...(isNew && { createdAt: now() }),
    };

    if (isNew) {
      row.publicCode = await this.generatePublicCode();
      if (!String(payload.assetTag ?? "").trim()) row.assetTag = await this.nextAssetTag(propertyId);
    } else {
      // publicCode é imutável (trigger no banco) e assetTag não se renumera:
      // remover do payload evita erro em edições que reenviam o objeto inteiro.
      delete row.publicCode;
      if (previous?.assetTag) delete row.assetTag;
    }

    for (const k of VIRTUAL_ASSET_FIELDS) delete row[k];

    const { error } = await db().from("assets").upsert(row);
    if (error) throw error;

    // Movimentação automática pelo diff (local, cabana, custodiante, status).
    if (previous) await this._recordDiff(propertyId, id, previous, row as Partial<Asset>, actor);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: isNew ? "ASSET_CREATED" : "ASSET_UPDATED", entity: "ASSET", entityId: id,
      details: `Ativo ${isNew ? "criado" : "editado"}: ${payload.name}.`,
    });
    return id;
  },

  /** Transferência explícita (local / cabana / responsável / status) com motivo. */
  async moveAsset(propertyId: string, id: string, input: AssetTransferInput, actor: Actor): Promise<string> {
    const { data } = await db().from("assets").select("*").eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!data) throw new Error("Ativo não encontrado.");
    const prev = data as Asset;

    const patch: Partial<Asset> = { updatedAt: now() };
    if (input.toLocationId !== undefined) patch.locationId = input.toLocationId;
    if (input.toCabinId !== undefined) patch.cabinId = input.toCabinId;
    if (input.toCustodianId !== undefined) {
      patch.custodianId = input.toCustodianId;
      patch.custodianName = input.toCustodianName ?? null;
    }
    if (input.toStatus) patch.status = input.toStatus;

    const { error } = await db().from("assets").update(patch).eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;

    const movementId = await this._recordDiff(propertyId, id, prev, patch, actor, input.reason);
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: input.toCustodianId !== undefined && input.toLocationId === undefined ? "ASSET_CUSTODY_CHANGED" : "ASSET_MOVED",
      entity: "ASSET", entityId: id,
      details: `Ativo movimentado: ${prev.name}.${input.reason ? ` Motivo: ${input.reason}` : ""}`,
    });
    return movementId ?? "";
  },

  /**
   * Baixa/alienação. Congela o valor contábil, fecha a depreciação do mês e
   * preserva todo o histórico — ao contrário do DELETE, que o destruía.
   */
  async disposeAsset(propertyId: string, id: string, input: AssetDisposalInput, actor: Actor): Promise<void> {
    const { data } = await db().from("assets").select("*").eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!data) throw new Error("Ativo não encontrado.");
    const asset = data as Asset;
    if (asset.status === "disposed") throw new Error("Este ativo já foi baixado.");
    if (!input.disposalDate) throw new Error("Informe a data da baixa.");

    const disposalRef = new Date(input.disposalDate);
    const d = computeDepreciation({ ...asset, disposalDate: null, bookValueAtDisposal: null }, disposalRef);

    // Lançamento de fechamento no período da baixa (idempotente por assetId+period).
    const period = input.disposalDate.slice(0, 7);
    const { data: existing } = await db().from("asset_depreciation_entries")
      .select("id").eq("assetId", id).eq("period", period).maybeSingle();
    const entry = {
      propertyId, assetId: id, period,
      amount: d.monthlyDepreciation, accumulatedDepreciation: d.accumulatedDepreciation, bookValue: d.bookValue,
    };
    if (existing) await db().from("asset_depreciation_entries").update(entry).eq("id", (existing as { id: string }).id);
    else await db().from("asset_depreciation_entries").insert({ id: crypto.randomUUID(), ...entry, createdAt: now() });

    const { error } = await db().from("assets").update({
      status: "disposed",
      disposalDate: input.disposalDate,
      disposalType: input.disposalType,
      disposalReason: input.disposalReason,
      disposalValue: input.disposalValue ?? null,
      disposalDocUrl: input.disposalDocUrl || null,
      bookValueAtDisposal: d.bookValue,
      disposedBy: actor.id,
      disposedByName: actor.name,
      updatedAt: now(),
    }).eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;

    await db().from("asset_movements").insert({
      id: crypto.randomUUID(), propertyId, assetId: id, type: "disposal",
      fromStatus: asset.status, toStatus: "disposed",
      reason: input.disposalReason, referenceType: "disposal",
      performedBy: actor.id, performedByName: actor.name, createdAt: now(),
    });

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "ASSET_DISPOSED", entity: "ASSET", entityId: id,
      details: `Baixa de ${asset.name} (${input.disposalType}) em ${input.disposalDate}. Valor contábil R$ ${d.bookValue.toFixed(2)}.`,
    });
  },

  /** Desfaz uma baixa lançada por engano. Volta o ativo a 'active'. */
  async reinstateAsset(propertyId: string, id: string, reason: string, actor: Actor): Promise<void> {
    const { data } = await db().from("assets").select("*").eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!data) throw new Error("Ativo não encontrado.");
    const asset = data as Asset;
    if (asset.status !== "disposed") throw new Error("Este ativo não está baixado.");

    const { error } = await db().from("assets").update({
      status: "active",
      disposalDate: null, disposalType: null, disposalReason: null, disposalValue: null,
      disposalDocUrl: null, bookValueAtDisposal: null, disposedBy: null, disposedByName: null,
      updatedAt: now(),
    }).eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;

    await db().from("asset_movements").insert({
      id: crypto.randomUUID(), propertyId, assetId: id, type: "status",
      fromStatus: "disposed", toStatus: "active", reason,
      performedBy: actor.id, performedByName: actor.name, createdAt: now(),
    });
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "ASSET_REINSTATED", entity: "ASSET", entityId: id,
      details: `Baixa revertida: ${asset.name}. Motivo: ${reason}`,
    });
  },

  /**
   * Exclusão física — SÓ para erro de cadastro. Recusa qualquer ativo que já
   * tenha histórico: para tirar do patrimônio existe a baixa, que preserva a
   * contabilidade. (Antes disto, um clique apagava o ativo e, por CASCADE,
   * toda a depreciação junto.)
   */
  async deleteAsset(propertyId: string, id: string, actor: Actor): Promise<void> {
    const { data } = await db().from("assets").select("*").eq("id", id).eq("propertyId", propertyId).maybeSingle();
    if (!data) throw new Error("Ativo não encontrado.");
    const asset = data as Asset;
    if (asset.status === "disposed") {
      throw new Error("Ativo baixado não pode ser excluído — o histórico contábil precisa ser preservado.");
    }

    const [depr, tasks, moves] = await Promise.all([
      db().from("asset_depreciation_entries").select("id").eq("assetId", id).limit(1),
      db().from("maintenance_tasks").select("id").eq("assetId", id).limit(1),
      db().from("asset_movements").select("id").eq("assetId", id).limit(1),
    ]);
    if (depr.data?.length || tasks.data?.length || moves.data?.length) {
      throw new Error("Ativo com histórico registrado — use Baixa/alienação em vez de excluir.");
    }

    const { error } = await db().from("assets").delete().eq("id", id).eq("propertyId", propertyId);
    if (error) throw error;
    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "ASSET_DELETED", entity: "ASSET", entityId: id,
      details: `Ativo excluído (sem histórico): ${asset.name}.`,
    });
  },

  async getMovements(propertyId: string, assetId: string): Promise<AssetMovement[]> {
    const { data } = await db().from("asset_movements").select("*")
      .eq("propertyId", propertyId).eq("assetId", assetId).order("createdAt", { ascending: false });
    const rows = (data ?? []) as AssetMovement[];
    if (rows.length === 0) return [];

    const [{ data: locations }, { data: cabins }] = await Promise.all([
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
      db().from("cabins").select("id, name").eq("propertyId", propertyId),
    ]);
    const locMap = new Map(((locations ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
    const cabMap = new Map(((cabins ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

    return rows.map((m) => ({
      ...m,
      fromLocationName: m.fromLocationId ? locMap.get(m.fromLocationId) : undefined,
      toLocationName: m.toLocationId ? locMap.get(m.toLocationId) : undefined,
      fromCabinName: m.fromCabinId ? cabMap.get(m.fromCabinId) : undefined,
      toCabinName: m.toCabinId ? cabMap.get(m.toCabinId) : undefined,
    }));
  },

  async getDepreciationEntries(propertyId: string, assetId: string): Promise<AssetDepreciationEntry[]> {
    const { data } = await db().from("asset_depreciation_entries")
      .select("*").eq("propertyId", propertyId).eq("assetId", assetId).order("period", { ascending: false });
    return (data ?? []) as AssetDepreciationEntry[];
  },

  /**
   * Lança a depreciação do período (YYYY-MM) para os ativos lineares ativos.
   * Idempotente por (assetId, period). Usado pelo cron mensal.
   * A referência é o FIM DO PERÍODO — reprocessar o mesmo mês precisa dar o
   * mesmo número, senão a razão contábil não é reproduzível.
   */
  async runDepreciation(propertyId: string, period: string): Promise<number> {
    const ref = periodEnd(period);
    const { data: assets } = await db().from("assets").select("*")
      .eq("propertyId", propertyId).eq("depreciationMethod", "linear").in("status", ["active", "maintenance"]);
    let count = 0;
    for (const a of (assets ?? []) as Asset[]) {
      if (!a.usefulLifeMonths || a.usefulLifeMonths <= 0) continue;
      const d = computeDepreciation(a, ref);
      const amount = d.bookValue > Number(a.residualValue ?? 0) ? d.monthlyDepreciation : 0;
      const { data: existing } = await db().from("asset_depreciation_entries")
        .select("id").eq("assetId", a.id).eq("period", period).maybeSingle();
      if (existing) {
        await db().from("asset_depreciation_entries")
          .update({ amount, accumulatedDepreciation: d.accumulatedDepreciation, bookValue: d.bookValue }).eq("id", existing.id);
      } else {
        await db().from("asset_depreciation_entries").insert({
          id: crypto.randomUUID(), propertyId, assetId: a.id, period, amount,
          accumulatedDepreciation: d.accumulatedDepreciation, bookValue: d.bookValue, createdAt: now(),
        });
      }
      count++;
    }
    return count;
  },

  // ── Identificação ──────────────────────────────────────────────────────────

  /**
   * Aloca o próximo nº de patrimônio (ex.: PAT-0042). O contador é incrementado
   * num único statement atômico via RPC — read-modify-write no Node derraparia
   * se duas pessoas cadastrassem ao mesmo tempo.
   */
  async nextAssetTag(propertyId: string): Promise<string> {
    const { data: settings } = await db().from("stock_settings")
      .select("assetTagPrefix, assetTagPadding").eq("propertyId", propertyId).maybeSingle();
    const prefix = (settings as { assetTagPrefix?: string } | null)?.assetTagPrefix || "PAT";
    const padding = (settings as { assetTagPadding?: number } | null)?.assetTagPadding ?? 4;

    for (let attempt = 0; attempt < 5; attempt++) {
      const n = await this._bumpTagCounter(propertyId);
      const tag = `${prefix}-${String(n).padStart(padding, "0")}`;
      const { data: clash } = await db().from("assets").select("id")
        .eq("propertyId", propertyId).eq("assetTag", tag).maybeSingle();
      if (!clash) return tag;
    }
    throw new Error("Não foi possível alocar um nº de patrimônio livre.");
  },

  /** Incremento atômico do contador. Cria a linha na primeira vez. */
  async _bumpTagCounter(propertyId: string): Promise<number> {
    const { data: current } = await db().from("asset_tag_counters")
      .select("lastNumber").eq("propertyId", propertyId).maybeSingle();
    if (!current) {
      const { data: seeded } = await db().from("asset_tag_counters")
        .upsert({ propertyId, lastNumber: 1, updatedAt: now() }, { onConflict: "propertyId" })
        .select("lastNumber").single();
      return Number((seeded as { lastNumber: number } | null)?.lastNumber ?? 1);
    }
    const next = Number((current as { lastNumber: number }).lastNumber) + 1;
    const { data: bumped } = await db().from("asset_tag_counters")
      .update({ lastNumber: next, updatedAt: now() })
      .eq("propertyId", propertyId).eq("lastNumber", Number((current as { lastNumber: number }).lastNumber))
      .select("lastNumber").maybeSingle();
    // Se outra requisição incrementou entre o SELECT e o UPDATE, tenta de novo.
    if (!bumped) return this._bumpTagCounter(propertyId);
    return Number((bumped as { lastNumber: number }).lastNumber);
  },

  /** Código da plaqueta: 8 chars, único globalmente, gerado uma única vez. */
  async generatePublicCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = "";
      for (let i = 0; i < 8; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      const { data } = await db().from("assets").select("id").eq("publicCode", code).maybeSingle();
      if (!data) return code;
    }
    throw new Error("Não foi possível gerar um código de plaqueta único.");
  },

  /** Dados para a folha A4 de etiquetas. `ids` vazio = todos os ativos vivos. */
  async getLabelData(propertyId: string, ids: string[]): Promise<AssetLabel[]> {
    let q = db().from("assets")
      .select("id, name, assetTag, publicCode, locationId")
      .eq("propertyId", propertyId).order("assetTag", { ascending: true });
    if (ids.length) q = q.in("id", ids);
    else q = q.not("status", "in", "(disposed,written_off)");

    const [{ data }, { data: locations }, { data: property }] = await Promise.all([
      q,
      db().from("stock_locations").select("id, name").eq("propertyId", propertyId),
      db().from("properties").select("settings").eq("id", propertyId).maybeSingle(),
    ]);
    const locMap = new Map(((locations ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
    const base = publicBaseUrl((property as { settings?: { customDomain?: string } } | null)?.settings);

    return ((data ?? []) as { id: string; name: string; assetTag: string | null; publicCode: string | null; locationId: string | null }[])
      .filter((a) => !!a.publicCode)
      .map((a) => ({
        id: a.id,
        name: a.name,
        assetTag: a.assetTag ?? "",
        publicCode: a.publicCode as string,
        url: `${base}/p/${a.publicCode}`,
        locationName: a.locationId ? locMap.get(a.locationId) : undefined,
      }));
  },

  // ── Interno ────────────────────────────────────────────────────────────────

  /**
   * Grava uma linha em asset_movements quando local, cabana, custodiante ou
   * status mudaram. Devolve o id da movimentação (ou null se nada mudou).
   */
  async _recordDiff(
    propertyId: string, assetId: string,
    prev: Asset, next: Partial<Asset>, actor: Actor, reason?: string,
  ): Promise<string | null> {
    const changed = (key: keyof Asset) =>
      next[key] !== undefined && (next[key] ?? null) !== (prev[key] ?? null);

    const locationChanged = changed("locationId") || changed("cabinId");
    const custodyChanged = changed("custodianId");
    const statusChanged = changed("status");
    if (!locationChanged && !custodyChanged && !statusChanged) return null;

    const type = locationChanged ? "transfer" : custodyChanged ? "custody" : "status";
    const id = crypto.randomUUID();
    const { error } = await db().from("asset_movements").insert({
      id, propertyId, assetId, type,
      fromLocationId: locationChanged ? prev.locationId ?? null : null,
      toLocationId: locationChanged ? next.locationId ?? prev.locationId ?? null : null,
      fromCabinId: locationChanged ? prev.cabinId ?? null : null,
      toCabinId: locationChanged ? next.cabinId ?? prev.cabinId ?? null : null,
      fromCustodianId: custodyChanged ? prev.custodianId ?? null : null,
      fromCustodianName: custodyChanged ? prev.custodianName ?? null : null,
      toCustodianId: custodyChanged ? next.custodianId ?? null : null,
      toCustodianName: custodyChanged ? next.custodianName ?? null : null,
      fromStatus: statusChanged ? prev.status : null,
      toStatus: statusChanged ? next.status ?? null : null,
      reason: reason ?? null,
      performedBy: actor.id, performedByName: actor.name, createdAt: now(),
    });
    if (error) throw error;
    return id;
  },
};
