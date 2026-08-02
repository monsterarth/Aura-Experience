// src/services/asset-public-service.ts
//
// SUPERFÍCIE ANÔNIMA DO PATRIMÔNIO. Tudo neste arquivo é alcançável por qualquer
// pessoa que escaneie a plaqueta de um equipamento — hóspede, camareira, técnico,
// visitante. Ele existe isolado justamente para que toda a superfície pública
// caiba numa revisão só.
//
// REGRA ÚNICA E INEGOCIÁVEL: a lista de colunas do select() é literal e explícita.
// NUNCA usar select('*') aqui. A tabela `assets` tem RLS `TO authenticated`, o que
// obriga estas consultas a rodarem com service-role — logo a allowlist de colunas
// é a ÚNICA defesa. Um select('*') com delete de chaves depois vaza qualquer
// coluna que alguém adicionar no ano que vem.
//
// Fora: acquisitionCost, residualValue, depreciação, supplierId, purchaseId,
// invoiceUrl, warrantyDocUrl, warrantyProvider, notes, custodiante, baixa e
// serialNumber (o nº de série é o que se usa para fraudar garantia ou receptar).
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { warrantyStatusOf } from "./asset-service";
import { notifyMaintenanceAssigned } from "@/lib/push-notify";
import { AssetPublicReportInput, AssetPublicReportResult, AssetPublicView, AssetStatus } from "@/types/aura";

/** Colunas do ativo que podem sair para o mundo. Nada além disto. */
const PUBLIC_ASSET_COLUMNS =
  "id, propertyId, publicCode, name, assetTag, brand, model, status, imageUrl, warrantyUntil, categoryId, locationId, cabinId";

/** Status considerados "chamado ainda aberto" para o merge de relatos. */
const OPEN_TASK_STATUSES = ["pending", "in_progress", "paused"];
/** Teto de relatos anônimos por ativo, por hora. */
const REPORT_CEILING_PER_HOUR = 3;
/** Piso de conteúdo da descrição. */
const MIN_DESCRIPTION = 15;
const MAX_DESCRIPTION = 1000;
const MIN_DISTINCT_CHARS = 4;
/** Formulário preenchido em menos que isto é robô. */
const MIN_ELAPSED_MS = 2000;

const now = () => new Date().toISOString();

export const AssetPublicService = {
  /** Ficha pública da plaqueta. `null` quando o código não resolve. */
  async getPublicFicha(code: string): Promise<AssetPublicView | null> {
    if (!supabaseAdmin || !code) return null;
    const { data } = await supabaseAdmin
      .from("assets")
      .select(PUBLIC_ASSET_COLUMNS)
      .eq("publicCode", code.toUpperCase())
      .maybeSingle();
    if (!data) return null;

    const a = data as unknown as {
      id: string; propertyId: string; publicCode: string; name: string;
      assetTag: string | null; brand: string | null; model: string | null;
      status: AssetStatus; imageUrl: string | null; warrantyUntil: string | null;
      categoryId: string | null; locationId: string | null; cabinId: string | null;
    };

    const [{ data: property }, { data: category }, { data: location }, { data: cabin }] = await Promise.all([
      supabaseAdmin.from("properties").select("id, name, logoUrl, theme").eq("id", a.propertyId).maybeSingle(),
      a.categoryId
        ? supabaseAdmin.from("stock_categories").select("name").eq("id", a.categoryId).maybeSingle()
        : Promise.resolve({ data: null }),
      a.locationId
        ? supabaseAdmin.from("stock_locations").select("name").eq("id", a.locationId).maybeSingle()
        : Promise.resolve({ data: null }),
      a.cabinId
        ? supabaseAdmin.from("cabins").select("name").eq("id", a.cabinId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!property) return null;

    const p = property as { id: string; name: string; logoUrl?: string; theme?: AssetPublicView["property"]["theme"] };
    return {
      id: a.id,
      publicCode: a.publicCode,
      name: a.name,
      assetTag: a.assetTag,
      brand: a.brand,
      model: a.model,
      status: a.status,
      imageUrl: a.imageUrl,
      categoryName: (category as { name?: string } | null)?.name ?? null,
      locationName: (location as { name?: string } | null)?.name ?? null,
      cabinName: (cabin as { name?: string } | null)?.name ?? null,
      warrantyUntil: a.warrantyUntil,
      warrantyStatus: warrantyStatusOf(a.warrantyUntil),
      property: { id: p.id, name: p.name, logoUrl: p.logoUrl, theme: p.theme },
    };
  },

  /**
   * Relato de problema pela plaqueta. Cria (ou reforça) uma ordem de manutenção
   * já vinculada ao ativo.
   *
   * As guardas retornam `{ ok: true }` sem gravar em vez de erro: um bot nunca
   * deve descobrir que foi bloqueado, e um código inválido não pode virar oráculo
   * de enumeração.
   */
  async createReport(code: string, input: AssetPublicReportInput): Promise<AssetPublicReportResult> {
    if (!supabaseAdmin) return { ok: false, error: "Serviço indisponível." };

    // 1) Honeypot — campo escondido só um robô preenche.
    if (input.website && input.website.trim()) return { ok: true };

    // 2) Tempo de preenchimento.
    if (typeof input.elapsedMs === "number" && input.elapsedMs < MIN_ELAPSED_MS) return { ok: true };

    // 3) Piso de conteúdo (este é erro de verdade: a pessoa precisa corrigir).
    const description = (input.description ?? "").trim();
    if (description.length < MIN_DESCRIPTION) {
      return { ok: false, error: `Descreva o problema com pelo menos ${MIN_DESCRIPTION} caracteres.` };
    }
    if (description.length > MAX_DESCRIPTION) {
      return { ok: false, error: "Descrição muito longa." };
    }
    if (new Set(description.toLowerCase().replace(/\s/g, "")).size < MIN_DISTINCT_CHARS) {
      return { ok: false, error: "Descreva o problema com suas palavras." };
    }

    // 4) Resolve o ativo. Código inválido: sucesso silencioso.
    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("id, propertyId, name, cabinId, locationId, assetTag")
      .eq("publicCode", code.toUpperCase())
      .maybeSingle();
    if (!asset) return { ok: true };
    const a = asset as {
      id: string; propertyId: string; name: string;
      cabinId: string | null; locationId: string | null; assetTag: string | null;
    };

    const reporter = (input.reporterName ?? "").trim().slice(0, 80);
    const stamp = new Date().toLocaleString("pt-BR");

    // 5) Merge com chamado aberto: cinco pessoas relatando o mesmo ar-condicionado
    //    quebrado devem gerar UMA tarefa, não cinco. É a guarda mais útil daqui.
    const { data: open } = await supabaseAdmin
      .from("maintenance_tasks")
      .select("id, description")
      .eq("assetId", a.id)
      .eq("reportSource", "qr")
      .in("status", OPEN_TASK_STATUSES)
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (open) {
      const t = open as { id: string; description: string };
      await supabaseAdmin
        .from("maintenance_tasks")
        .update({
          description: `${t.description}\n\n[+1 relato · ${stamp}${reporter ? ` · ${reporter}` : ""}] ${description}`,
          updatedAt: now(),
        })
        .eq("id", t.id);
      return { ok: true, merged: true };
    }

    // 6) Teto horário — depois do merge, para relatos de problemas DIFERENTES.
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("maintenance_tasks")
      .select("id", { count: "exact", head: true })
      .eq("assetId", a.id)
      .eq("reportSource", "qr")
      .gte("createdAt", since);
    if ((count ?? 0) >= REPORT_CEILING_PER_HOUR) return { ok: true };

    // 7) Cria o chamado. A localização precisa vir junto, senão a tarefa cai sem
    //    lugar nenhum no quadro da manutenção.
    const { data: location } = a.locationId
      ? await supabaseAdmin.from("stock_locations").select("name").eq("id", a.locationId).maybeSingle()
      : { data: null };
    const locationName = (location as { name?: string } | null)?.name;

    const taskId = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("maintenance_tasks").insert({
      id: taskId,
      propertyId: a.propertyId,
      assetId: a.id,
      reportSource: "qr",
      cabinId: a.cabinId ?? null,
      customLocation: a.cabinId ? null : [locationName, a.name].filter(Boolean).join(" · "),
      title: `${a.name}${a.assetTag ? ` (#${a.assetTag})` : ""} — problema relatado na plaqueta`,
      description: `${description}\n\n— relatado em ${stamp}${reporter ? ` por ${reporter}` : " (anônimo)"} via QR ${code.toUpperCase()}`,
      priority: "medium",
      status: "pending",
      checklist: [],
      assignedTo: [],
      isRecurring: false,
      imageUrl: input.imageUrl || null,
      createdAt: now(),
      updatedAt: now(),
    });
    if (error) {
      console.error("[AssetPublicService.createReport]", error);
      return { ok: false, error: "Não foi possível registrar o relato. Tente novamente." };
    }

    // O id da tarefa entra no `details` de propósito: AuditService deduplica por
    // (userId, entityId, details) em 10s, e dois relatos legítimos com o mesmo
    // texto colapsariam num log só.
    await AuditService.log({
      propertyId: a.propertyId,
      userId: "public",
      userName: reporter || "Plaqueta QR",
      action: "ASSET_PUBLIC_REPORT",
      entity: "ASSET",
      entityId: a.id,
      details: `Relato pela plaqueta em ${a.name}: chamado ${taskId}.`,
    });

    // triggerTaskPush é no-op no servidor e /api/push/notify exige sessão —
    // no caminho público o push sai daqui. Sem assignedTo, notifyMaintenance
    // abre em leque para os cargos maintenance/technician.
    await notifyMaintenanceAssigned(taskId).catch(() => { });

    return { ok: true };
  },
};
