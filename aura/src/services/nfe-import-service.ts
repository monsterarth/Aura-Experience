// src/services/nfe-import-service.ts
// Lança a compra a partir do XML da NF-e. Dois passos, de propósito:
//
//   preview() — lê o XML, acha o fornecedor pelo CNPJ, tenta casar cada linha
//               com um produto daqui e devolve tudo para conferência. Não grava.
//   commit()  — recebe de volta o MESMO XML mais as decisões da tela e escreve.
//
// O commit relê o XML no servidor em vez de confiar nos números que voltaram do
// navegador: quantidade e custo saem sempre da nota, nunca do cliente. Da tela
// vêm só as ESCOLHAS (qual produto, qual fator, o que ignorar).
//
// A ordem em que uma linha encontra seu produto:
//   1. de-para gravado (fornecedor + cProd) — o que a pessoa ensinou antes
//   2. código de barras (cEAN = stock_products.barcode)
//   3. semelhança de nome — só como SUGESTÃO; nunca casa sozinho
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { PurchaseService } from "./purchase-service";
import { parseNfeXml, NfeInvoice, NfeItem, NfeParseError } from "@/lib/nfe";
import {
  InvoiceImportCommit, InvoiceImportLine, InvoiceImportPreview, InvoiceImportResult,
  PurchaseStatus, StockUnit, Supplier, SupplierProductMap,
} from "@/types/aura";

type DB = NonNullable<typeof supabaseAdmin>;
function db(): DB {
  return ((typeof window === "undefined" && supabaseAdmin) ? supabaseAdmin : supabase) as DB;
}
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const onlyDigits = (v?: string | null) => String(v ?? "").replace(/\D/g, "");
interface Actor { id: string; name: string; }

type ProductRow = { id: string; name: string; unit: string; barcode: string | null };

/** Normaliza para comparar nome: sem acento, sem pontuação, minúsculo. */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Palavras que não distinguem nada numa descrição de nota fiscal. */
const STOPWORDS = new Set(["de", "da", "do", "com", "sem", "para", "un", "und", "unid", "cx", "pct", "kg", "g", "ml", "lt", "l", "c", "pc"]);

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Quanto dos termos do produto daqui aparecem na descrição do fornecedor (0–1). */
function similarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const hits = ta.filter((t) => setB.has(t)).length;
  return hits / Math.max(ta.length, tb.length);
}

/** Unidade do XML (CX, UN, FR…) para a unidade do estoque, quando dá. */
function guessUnit(xmlUnit: string): StockUnit {
  const u = normalize(xmlUnit).replace(/\s/g, "");
  const map: Record<string, StockUnit> = {
    un: "un", und: "un", unid: "un", pc: "un", pç: "un", peca: "un", fr: "un", frasco: "un",
    kg: "kg", quilo: "kg", g: "g", grama: "g",
    l: "L", lt: "L", litro: "L", ml: "ml",
    cx: "cx", caixa: "cx", pct: "pct", pc10: "pct", pacote: "pct", fd: "pct", fardo: "pct",
    par: "par", rl: "rolo", rolo: "rolo",
  };
  return map[u] ?? "un";
}

/**
 * Custo da MERCADORIA na linha. IPI e ICMS-ST entram quando a pessoa pede: para
 * quem consome (e não revende), imposto é custo.
 *
 * Frete e desconto do item ficam de fora de propósito: na NF-e o vFrete/vDesc da
 * nota é a SOMA dos itens, e aqui eles viram campos da compra — que, por regra da
 * casa, não rateiam no custo médio (ver migration stock_purchase_freight.sql).
 */
function lineCost(item: NfeItem, includeTaxes: boolean): number {
  const base = item.total > 0 ? item.total : item.unitValue * item.quantity;
  return round2(base + (includeTaxes ? item.ipi + item.icmsSt : 0));
}

/**
 * Custo cheio da linha — mercadoria + o frete e o desconto DELA. É o que vale
 * para a linha que sai da compra (patrimônio ou ignorada): ela leva embora a
 * parte que lhe cabe, senão o desconto de uma TV sobraria em cima do refrigerante.
 */
function landedCost(item: NfeItem, includeTaxes: boolean): number {
  return round2(lineCost(item, includeTaxes) + item.freight - item.discount);
}

async function loadContext(propertyId: string, cnpj: string) {
  const [{ data: suppliers }, { data: products }] = await Promise.all([
    db().from("suppliers").select("id, name, cnpj, active").eq("propertyId", propertyId),
    db().from("stock_products").select("id, name, unit, barcode").eq("propertyId", propertyId).eq("deleted", false).eq("active", true),
  ]);

  const supplier = ((suppliers ?? []) as Supplier[]).find((s) => onlyDigits(s.cnpj) === cnpj && cnpj.length > 0) ?? null;

  let maps: SupplierProductMap[] = [];
  if (supplier) {
    const { data } = await db().from("supplier_product_map").select("*").eq("propertyId", propertyId).eq("supplierId", supplier.id);
    maps = (data ?? []) as SupplierProductMap[];
  }
  return { supplier, products: (products ?? []) as ProductRow[], maps };
}

export const NfeImportService = {
  /** Lê o XML e devolve a nota já casada com o que existe aqui. Não grava nada. */
  async preview(propertyId: string, xml: string, fileName?: string): Promise<InvoiceImportPreview> {
    const nfe = parseNfeXml(xml);

    const cnpj = nfe.emitter.cnpj;
    const { supplier, products, maps } = await loadContext(propertyId, cnpj);
    const mapByCode = new Map(maps.map((m) => [m.supplierCode, m]));
    const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [onlyDigits(p.barcode), p]));

    // Nota já lançada? A chave de acesso é única por propriedade.
    let duplicate: InvoiceImportPreview["duplicate"] = null;
    if (nfe.key) {
      const { data } = await db().from("purchases")
        .select("id, invoiceNumber, status, createdAt").eq("propertyId", propertyId).eq("invoiceKey", nfe.key).maybeSingle();
      if (data) {
        duplicate = {
          purchaseId: (data as { id: string }).id,
          invoiceNumber: (data as { invoiceNumber?: string }).invoiceNumber ?? null,
          status: (data as { status: PurchaseStatus }).status,
          createdAt: (data as { createdAt: string }).createdAt,
        };
      }
    }

    const lines: InvoiceImportLine[] = nfe.items.map((item) => {
      const base = {
        n: item.n, code: item.code, ean: item.ean, description: item.description,
        unit: item.unit, quantity: item.quantity, unitValue: item.unitValue, total: item.total,
        ipi: item.ipi, icmsSt: item.icmsSt, discount: item.discount, freight: item.freight,
        suggestedFactor: item.suggestedFactor,
      };

      const mapped = item.code ? mapByCode.get(item.code) : undefined;
      if (mapped) {
        const target = mapped.ignoreLine ? "ignore" : mapped.assetLine ? "asset" : "product";
        return {
          ...base,
          target: target as InvoiceImportLine["target"],
          productId: mapped.productId ?? null,
          factor: Number(mapped.factor) || 1,
          matchedBy: "map" as const,
          candidates: [],
        };
      }

      const byEan = item.ean ? byBarcode.get(onlyDigits(item.ean)) : undefined;
      if (byEan) {
        return {
          ...base, target: "product" as const, productId: byEan.id,
          factor: item.suggestedFactor ?? 1, matchedBy: "barcode" as const, candidates: [],
        };
      }

      // Sem casamento seguro: devolve os melhores palpites e deixa a linha em
      // aberto (productId null). A tela não deixa lançar assim.
      const candidates = products
        .map((p) => ({ p, score: similarity(p.name, item.description) }))
        .filter((c) => c.score >= 0.34)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((c) => ({ productId: c.p.id, name: c.p.name, unit: c.p.unit }));

      return {
        ...base, target: "product" as const, productId: null,
        factor: item.suggestedFactor ?? 1, matchedBy: candidates.length ? ("name" as const) : null, candidates,
      };
    });

    return {
      invoice: {
        key: nfe.key, number: nfe.number, series: nfe.series, model: nfe.model,
        issuedAt: nfe.issuedAt, operation: nfe.operation,
      },
      duplicate,
      supplier: {
        matchedId: supplier?.id ?? null,
        cnpj,
        name: supplier?.name ?? nfe.emitter.name,
        suggestion: {
          name: nfe.emitter.tradeName || nfe.emitter.name,
          cnpj,
          address: [nfe.emitter.address, nfe.emitter.city, nfe.emitter.uf].filter(Boolean).join(" — ") || undefined,
          phone: nfe.emitter.phone,
          email: nfe.emitter.email,
        },
      },
      lines,
      totals: {
        products: nfe.totals.products, freight: nfe.totals.freight, discount: nfe.totals.discount,
        icmsSt: nfe.totals.icmsSt, ipi: nfe.totals.ipi,
        other: round2(nfe.totals.other + nfe.totals.insurance),
        declared: nfe.totals.invoice,
      },
      xml,
      fileName,
    };
  },

  /** Escreve: fornecedor (se pedido), produtos novos, a compra em rascunho, os ativos e o de-para. */
  async commit(payload: InvoiceImportCommit, actor: Actor): Promise<InvoiceImportResult> {
    const { propertyId, xml } = payload;
    const nfe: NfeInvoice = parseNfeXml(xml);
    const itemByN = new Map(nfe.items.map((i) => [i.n, i]));

    if (nfe.key) {
      const { data: dup } = await db().from("purchases")
        .select("id, invoiceNumber").eq("propertyId", propertyId).eq("invoiceKey", nfe.key).maybeSingle();
      if (dup) {
        const n = (dup as { invoiceNumber?: string }).invoiceNumber;
        throw new Error(`Esta nota já foi lançada${n ? ` (NF ${n})` : ""}. A chave de acesso não se repete.`);
      }
    }

    // ── Fornecedor ────────────────────────────────────────────────────────────
    let supplierId = payload.supplierId ?? null;
    if (!supplierId && payload.createSupplier && nfe.emitter.cnpj) {
      const { data: existing } = await db().from("suppliers").select("id, cnpj").eq("propertyId", propertyId);
      const found = ((existing ?? []) as { id: string; cnpj?: string }[]).find((s) => onlyDigits(s.cnpj) === nfe.emitter.cnpj);
      if (found) {
        supplierId = found.id;
      } else {
        supplierId = crypto.randomUUID();
        const { error } = await db().from("suppliers").insert({
          id: supplierId, propertyId,
          name: nfe.emitter.tradeName || nfe.emitter.name,
          cnpj: nfe.emitter.cnpj,
          address: [nfe.emitter.address, nfe.emitter.city, nfe.emitter.uf].filter(Boolean).join(" — ") || null,
          phone: nfe.emitter.phone ?? null,
          email: nfe.emitter.email ?? null,
          active: true, createdAt: now(), updatedAt: now(),
        });
        if (error) throw error;
        await AuditService.log({
          propertyId, userId: actor.id, userName: actor.name,
          action: "SUPPLIER_CREATED", entity: "SUPPLIER", entityId: supplierId,
          details: `Fornecedor criado pela importação da NF ${nfe.number}: ${nfe.emitter.name}.`,
        });
      }
    }

    // ── Linhas: produto novo quando pedido, validação do resto ────────────────
    const includeTaxes = !!payload.includeTaxesInCost;
    const purchaseItems: { productId: string; quantity: number; unitCost: number }[] = [];
    const assetsToCreate: { name: string; categoryId?: string | null; locationId?: string | null; cost: number; count: number }[] = [];
    const mapRows: Partial<SupplierProductMap>[] = [];
    let createdProducts = 0;
    let skipped = 0;
    // Frete e desconto das linhas que SAEM da compra (patrimônio ou ignoradas):
    // saem com elas, senão o desconto de uma TV ficaria pesando no refrigerante.
    let excludedFreight = 0;
    let excludedDiscount = 0;

    for (const line of payload.lines) {
      const item = itemByN.get(line.n);
      if (!item) continue;                       // linha que não existe na nota: ignora
      const factor = Number(line.factor) > 0 ? Number(line.factor) : 1;
      const cost = lineCost(item, includeTaxes);

      let productId = line.productId ?? null;

      if (line.target === "new_product") {
        const name = (line.newProduct?.name || item.description).trim();
        productId = crypto.randomUUID();
        const { error } = await db().from("stock_products").insert({
          id: productId, propertyId, name,
          categoryId: line.newProduct?.categoryId ?? null,
          unit: line.newProduct?.unit ?? guessUnit(item.unit),
          barcode: item.ean ?? null,
          trackExpiry: line.newProduct?.trackExpiry ?? false,
          minStock: line.newProduct?.minStock ?? 0,
          averageCost: 0, active: true, deleted: false,
          createdAt: now(), updatedAt: now(),
        });
        if (error) throw error;
        createdProducts++;
        await AuditService.log({
          propertyId, userId: actor.id, userName: actor.name,
          action: "CREATE", entity: "STOCK", entityId: productId,
          details: `Produto criado pela importação da NF ${nfe.number}: ${name}.`,
        });
      }

      if (line.target === "asset") {
        const qty = Math.max(1, Math.round(item.quantity * factor));
        excludedFreight += item.freight;
        excludedDiscount += item.discount;
        assetsToCreate.push({
          name: (line.asset?.name || item.description).trim(),
          categoryId: line.asset?.categoryId ?? null,
          locationId: line.asset?.locationId ?? payload.locationId ?? null,
          cost: round2(landedCost(item, includeTaxes) / qty),
          count: Math.min(qty, 50),
        });
      } else if (line.target === "ignore") {
        excludedFreight += item.freight;
        excludedDiscount += item.discount;
        skipped++;
      } else {
        if (!productId) {
          throw new Error(`A linha ${line.n} ("${item.description}") ficou sem produto. Vincule ou marque como ignorar.`);
        }
        const quantity = round4(item.quantity * factor);
        if (quantity > 0) {
          purchaseItems.push({ productId, quantity, unitCost: round4(cost / quantity) });
        } else {
          skipped++;
        }

        // O EAN da nota é do PRODUTO: se ele ainda não tem código de barras, ganha agora.
        if (item.ean && line.target === "product") {
          const { data: prod } = await db().from("stock_products").select("barcode").eq("id", productId).maybeSingle();
          if (prod && !(prod as { barcode?: string }).barcode) {
            await db().from("stock_products").update({ barcode: item.ean, updatedAt: now() }).eq("id", productId);
          }
        }
      }

      if (line.remember && supplierId && item.code) {
        mapRows.push({
          supplierId, supplierCode: item.code,
          productId: line.target === "asset" || line.target === "ignore" ? null : productId,
          assetLine: line.target === "asset",
          ignoreLine: line.target === "ignore",
          factor, xmlUnit: item.unit, lastDescription: item.description, lastEan: item.ean,
        });
      }
    }

    if (purchaseItems.length === 0 && assetsToCreate.length === 0) {
      throw new Error("Nenhuma linha da nota foi aproveitada — não há o que lançar.");
    }

    // Frete/desconto que sobram para a COMPRA: o total da nota menos a parte das
    // linhas que saíram. `freightValue` vindo da tela é a diferença que a pessoa
    // escolheu jogar no frete e manda nela.
    const freightValue = payload.freightValue ?? round2(Math.max(0, nfe.totals.freight - excludedFreight));
    const discountValue = round2(Math.max(0, nfe.totals.discount - excludedDiscount));

    // ── A compra (rascunho: só o Receber mexe no estoque) ─────────────────────
    const purchaseId = await PurchaseService.upsertPurchase(
      propertyId,
      {
        supplierId, locationId: payload.locationId ?? null,
        invoiceNumber: nfe.number || undefined,
        invoiceKey: nfe.key, invoiceSeries: nfe.series || null, invoiceModel: nfe.model || null,
        invoiceXmlUrl: payload.invoiceXmlUrl ?? null,
        invoiceDeclaredTotal: nfe.totals.invoice,
        importSource: "xml_upload",
        status: "draft",
        isEmergency: payload.isEmergency ?? false,
        orderDate: nfe.issuedAt,
        freightValue, discountValue,
        notes: payload.notes,
      },
      purchaseItems,
      actor,
    );

    // ── Patrimônio: a linha que não é estoque vira ativo, já ligado à nota ────
    let createdAssets = 0;
    for (const a of assetsToCreate) {
      const rows = Array.from({ length: a.count }, (_, i) => ({
        id: crypto.randomUUID(), propertyId,
        name: a.count > 1 ? `${a.name} (${i + 1}/${a.count})` : a.name,
        categoryId: a.categoryId, locationId: a.locationId,
        acquisitionDate: nfe.issuedAt, acquisitionCost: a.cost,
        supplierId, purchaseId,
        depreciationMethod: "linear", residualValue: 0, status: "active",
        createdAt: now(), updatedAt: now(),
      }));
      const { error } = await db().from("assets").insert(rows);
      if (error) throw error;
      createdAssets += rows.length;
    }
    if (createdAssets > 0) {
      await AuditService.log({
        propertyId, userId: actor.id, userName: actor.name,
        action: "ASSET_CREATED", entity: "ASSET", entityId: purchaseId,
        details: `${createdAssets} ativo(s) criados pela importação da NF ${nfe.number}.`,
      });
    }

    // ── De-para: o que a pessoa ensinou fica ensinado ─────────────────────────
    if (mapRows.length && supplierId) {
      const { data: current } = await db().from("supplier_product_map")
        .select("id, supplierCode").eq("propertyId", propertyId).eq("supplierId", supplierId);
      const idByCode = new Map(((current ?? []) as { id: string; supplierCode: string }[]).map((m) => [m.supplierCode, m.id]));
      // Uma linha por código (a nota pode repetir o mesmo cProd) e formato idêntico
      // em todas — insert em lote com formatos mistos manda NULL onde falta chave.
      const deduped = new Map<string, Partial<SupplierProductMap>>();
      for (const r of mapRows) deduped.set(r.supplierCode as string, r);
      const rows = Array.from(deduped.values()).map((r) => ({
        id: idByCode.get(r.supplierCode as string) ?? crypto.randomUUID(),
        propertyId, supplierId: r.supplierId as string, supplierCode: r.supplierCode as string,
        productId: r.productId ?? null,
        assetLine: !!r.assetLine, ignoreLine: !!r.ignoreLine,
        factor: r.factor ?? 1, xmlUnit: r.xmlUnit ?? null,
        lastDescription: r.lastDescription ?? null, lastEan: r.lastEan ?? null,
        updatedAt: now(), createdAt: now(),
      }));
      const { error } = await db().from("supplier_product_map").upsert(rows, { onConflict: "id" });
      if (error) console.error("supplier_product_map upsert", error);
    }

    const totalItems = purchaseItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const totalValue = round2(totalItems + freightValue - discountValue);
    // A conferência honesta contra o vNF inclui o que saiu para patrimônio e o
    // que foi ignorado — senão toda nota com uma TV pareceria não fechar.
    const outOfPurchase = assetsToCreate.reduce((s, a) => s + a.cost * a.count, 0)
      + payload.lines.filter((l) => l.target === "ignore")
        .reduce((s, l) => { const it = itemByN.get(l.n); return s + (it ? landedCost(it, includeTaxes) : 0); }, 0);

    await AuditService.log({
      propertyId, userId: actor.id, userName: actor.name,
      action: "PURCHASE_IMPORTED", entity: "PURCHASE", entityId: purchaseId,
      details: `NF ${nfe.number} importada do XML — ${purchaseItems.length} item(ns)` +
        `${createdProducts ? `, ${createdProducts} produto(s) novo(s)` : ""}` +
        `${createdAssets ? `, ${createdAssets} ativo(s)` : ""}` +
        `${skipped ? `, ${skipped} linha(s) ignorada(s)` : ""}.`,
    });

    return {
      purchaseId, supplierId,
      createdProducts, createdAssets,
      mappedLines: purchaseItems.length, skippedLines: skipped,
      totalValue, declaredTotal: nfe.totals.invoice,
      difference: round2(totalValue + outOfPurchase - nfe.totals.invoice),
    };
  },
};

export { NfeParseError };
