// src/lib/nfe.ts
// Leitura do XML da NF-e / NFC-e (layout 4.00). Puro: entra texto, sai objeto —
// sem banco, sem rede. Quem casa fornecedor e produto é o nfe-import-service.
//
// O arquivo que o fornecedor manda (ou o contador exporta) costuma vir como
// <nfeProc> (nota + protocolo de autorização), mas <NFe> solto também aparece.
// Os dois entram aqui.
//
// Uma sutileza que vale ouro no de-para: a nota descreve o mesmo item em duas
// unidades — a COMERCIAL (uCom/qCom/vUnCom, o que foi vendido: "2 CX") e a
// TRIBUTÁVEL (uTrib/qTrib, o que foi tributado: "24 UN"). Quando as duas
// divergem, qTrib/qCom É o fator de embalagem, de graça, sem ninguém digitar.
import { XMLParser } from "fast-xml-parser";

export interface NfeItem {
  n: number;                    // nItem
  code: string;                 // cProd — o código do produto NO FORNECEDOR
  ean: string | null;           // cEAN ("SEM GTIN" vira null)
  description: string;          // xProd
  ncm?: string;
  cfop?: string;
  unit: string;                 // uCom
  quantity: number;             // qCom
  unitValue: number;            // vUnCom
  total: number;                // vProd
  taxUnit?: string;             // uTrib
  taxQuantity?: number;         // qTrib
  discount: number;             // vDesc do item
  freight: number;              // vFrete do item
  ipi: number;                  // vIPI do item
  icmsSt: number;               // vICMSST do item
  /** qTrib/qCom quando a embalagem é fechada (2 CX que tributaram 24 UN dá 12). null quando não dá para inferir. */
  suggestedFactor: number | null;
}

export interface NfeParty {
  cnpj: string;
  name: string;
  tradeName?: string;
  ie?: string;
  address?: string;
  city?: string;
  uf?: string;
  phone?: string;
  email?: string;
}

export interface NfeInvoice {
  key: string | null;           // chave de acesso (44 dígitos)
  number: string;               // nNF
  series: string;               // serie
  model: string;                // 55 = NF-e · 65 = NFC-e
  issuedAt: string | null;      // YYYY-MM-DD (dhEmi/dEmi)
  operation?: string;           // natOp
  emitter: NfeParty;
  recipient: { cnpj: string; name: string };
  totals: {
    products: number;           // vProd
    freight: number;            // vFrete
    discount: number;           // vDesc
    icmsSt: number;             // vST
    ipi: number;                // vIPI
    insurance: number;          // vSeg
    other: number;              // vOutro
    invoice: number;            // vNF — o total que o fornecedor cobrou
  };
  items: NfeItem[];
  additionalInfo?: string;      // infCpl
}

export class NfeParseError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Tudo string: parse automático estragaria cProd "0012" e a chave de 44 dígitos.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type Node = Record<string, unknown>;

const txt = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return String((v as Node)["#text"] ?? "").trim();
  return String(v).trim();
};
const num = (v: unknown): number => {
  const n = Number(txt(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const arr = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const digits = (v: unknown) => txt(v).replace(/\D/g, "");

/** Só os 44 dígitos, venham do Id ("NFe3524...") ou do protocolo de autorização. */
function extractKey(infNFe: Node, root: Node): string | null {
  const fromId = digits(infNFe["@_Id"]);
  if (fromId.length === 44) return fromId;
  const prot = (root.protNFe as Node | undefined)?.infProt as Node | undefined;
  const fromProt = digits(prot?.chNFe);
  return fromProt.length === 44 ? fromProt : null;
}

/** dhEmi vem com fuso ("2026-06-12T10:00:00-03:00"); guardamos só a data dela. */
function emissionDate(ide: Node): string | null {
  const raw = txt(ide.dhEmi) || txt(ide.dEmi);
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Fator de embalagem inferido da própria nota. Devolve null quando as unidades
 * são iguais, quando o resultado não fecha em número redondo (1,0345 é ruído de
 * arredondamento, não embalagem) ou quando é 1 — aí quem decide é a pessoa.
 */
function inferFactor(unit: string, qty: number, taxUnit: string, taxQty: number): number | null {
  if (!taxQty || !qty) return null;
  if (!taxUnit || taxUnit.toUpperCase() === unit.toUpperCase()) return null;
  const f = taxQty / qty;
  if (!Number.isFinite(f) || f <= 1) return null;
  const rounded = Math.round(f * 10000) / 10000;
  return Math.abs(rounded - Math.round(rounded)) < 0.001 ? Math.round(rounded) : null;
}

function parseItem(det: Node, index: number): NfeItem {
  const prod = (det.prod ?? {}) as Node;
  const imposto = (det.imposto ?? {}) as Node;

  // O IPI mora em IPITrib; o ICMS-ST em um dos grupos ICMSxx (o grupo muda com a CST).
  const ipiGroup = (imposto.IPI as Node | undefined)?.IPITrib as Node | undefined;
  const icmsNode = (imposto.ICMS ?? {}) as Node;
  let icmsSt = 0;
  for (const g of Object.values(icmsNode)) {
    if (g && typeof g === "object" && "vICMSST" in (g as object)) icmsSt += num((g as Node).vICMSST);
  }

  const ean = txt(prod.cEAN).toUpperCase();
  const unit = txt(prod.uCom);
  const quantity = num(prod.qCom);
  const taxUnit = txt(prod.uTrib);
  const taxQuantity = num(prod.qTrib);

  return {
    n: Number(txt(det["@_nItem"])) || index + 1,
    code: txt(prod.cProd),
    ean: !ean || ean.includes("SEM GTIN") ? null : ean,
    description: txt(prod.xProd),
    ncm: txt(prod.NCM) || undefined,
    cfop: txt(prod.CFOP) || undefined,
    unit,
    quantity,
    unitValue: num(prod.vUnCom),
    total: num(prod.vProd),
    taxUnit: taxUnit || undefined,
    taxQuantity: taxQuantity || undefined,
    discount: num(prod.vDesc),
    freight: num(prod.vFrete),
    ipi: num(ipiGroup?.vIPI),
    icmsSt,
    suggestedFactor: inferFactor(unit, quantity, taxUnit, taxQuantity),
  };
}

export function parseNfeXml(xml: string): NfeInvoice {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new NfeParseError("Arquivo não é um XML válido.");
  }

  // <nfeProc><NFe><infNFe>... ou <NFe><infNFe> direto.
  const proc = (doc.nfeProc ?? doc) as Node;
  const nfe = (proc.NFe ?? proc) as Node;
  const infNFe = nfe.infNFe as Node | undefined;
  if (!infNFe) {
    throw new NfeParseError("XML não parece uma NF-e: não achei o bloco infNFe. Confira se não é um arquivo de evento ou de cancelamento.");
  }

  const ide = (infNFe.ide ?? {}) as Node;
  const emit = (infNFe.emit ?? {}) as Node;
  const dest = (infNFe.dest ?? {}) as Node;
  const ender = (emit.enderEmit ?? {}) as Node;
  const icmsTot = ((infNFe.total as Node | undefined)?.ICMSTot ?? {}) as Node;

  const items = arr(infNFe.det as Node | Node[] | undefined).map(parseItem);
  if (items.length === 0) throw new NfeParseError("A nota não tem itens (bloco det vazio).");

  const street = [txt(ender.xLgr), txt(ender.nro), txt(ender.xBairro)].filter(Boolean).join(", ");

  return {
    key: extractKey(infNFe, proc),
    number: txt(ide.nNF),
    series: txt(ide.serie),
    model: txt(ide.mod) || "55",
    issuedAt: emissionDate(ide),
    operation: txt(ide.natOp) || undefined,
    emitter: {
      cnpj: digits(emit.CNPJ) || digits(emit.CPF),
      name: txt(emit.xNome),
      tradeName: txt(emit.xFant) || undefined,
      ie: txt(emit.IE) || undefined,
      address: street || undefined,
      city: txt(ender.xMun) || undefined,
      uf: txt(ender.UF) || undefined,
      phone: digits(ender.fone) || undefined,
      email: txt(emit.email) || undefined,
    },
    recipient: { cnpj: digits(dest.CNPJ) || digits(dest.CPF), name: txt(dest.xNome) },
    totals: {
      products: num(icmsTot.vProd),
      freight: num(icmsTot.vFrete),
      discount: num(icmsTot.vDesc),
      icmsSt: num(icmsTot.vST),
      ipi: num(icmsTot.vIPI),
      insurance: num(icmsTot.vSeg),
      other: num(icmsTot.vOutro),
      invoice: num(icmsTot.vNF),
    },
    items,
    additionalInfo: txt((infNFe.infAdic as Node | undefined)?.infCpl) || undefined,
  };
}
