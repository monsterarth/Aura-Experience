// A linha do tempo de UMA estadia — o que aconteceu, quando e por quem.
//
// Não existe tabela de "eventos da estadia": a história está espalhada por dez
// lugares que só têm em comum a coluna `stayId`. Este serviço junta todos num
// extrato só, ordenado, e é a ÚNICA peça que sabe dessa dispersão.
//
// Duas armadilhas que o código abaixo resolve e que não são óbvias:
//
//  1. A criação da reserva NÃO é achável por stayId. `StayService.createStay`
//     grava o log com `entityId = groupId || "MULTIPLE"` (uma reserva pode nascer
//     com várias cabanas), então 464 criações em produção dividem o mesmo
//     entityId. O jeito de reencontrar a sua é o `accessCode`, que aparece no
//     texto do log e é único por reserva.
//
//  2. As diárias do cron não passam por auditoria — `FinanceService.postDueLodging`
//     insere direto em `folio_items`. Por isso o fólio entra aqui só com
//     `category = 'lodging'`: todo o resto do fólio já vem auditado, e ler as
//     duas fontes duplicaria cada lançamento manual.
import { supabaseAdmin } from "@/lib/supabase";
import { getTaskLabel } from "@/lib/task-ui";
import type { HousekeepingTask } from "@/types/aura";

/** Família do evento — decide ícone e cor na ficha; não é o texto mostrado. */
export type StayTimelineKind =
  | "created" | "precheckin" | "checkin" | "checkout"
  | "folio" | "folio_out" | "bill_closed" | "bill_reopened" | "lodging"
  | "housekeeping" | "structure" | "concierge" | "survey"
  | "breakfast" | "maintenance" | "parking" | "fb"
  | "key" | "loan" | "lost" | "guest" | "quote" | "update";

/** De onde veio a ação — o "via portal" que a recepção quer distinguir. */
export type StayTimelineChannel = "portal" | "app" | "admin" | "system";

export interface StayTimelineEvent {
  id: string;
  /** ISO. Ordenação decrescente. */
  at: string;
  kind: StayTimelineKind;
  title: string;
  detail?: string | null;
  /** Quem fez. `null` quando o autor não ficou registrado na origem. */
  actor?: string | null;
  channel?: StayTimelineChannel | null;
}

function db() {
  if (!supabaseAdmin) throw new Error("stay-timeline: uso apenas server-side.");
  return supabaseAdmin;
}

const ev = (
  id: string,
  at: string | null | undefined,
  kind: StayTimelineKind,
  title: string,
  extra?: { detail?: string | null; actor?: string | null; channel?: StayTimelineChannel | null },
): StayTimelineEvent | null => (at ? { id, at, kind, title, ...extra } : null);

// ── Auditoria: action + texto → família e rótulo ─────────────────────────────
//
// O `details` do log já é uma frase escrita para gente ler, então ele vira o
// subtítulo e o rótulo curto sai da ação. `UPDATE` é o caso chato: é a ação de
// quase tudo que mexe na estadia, então o rótulo se decide pelo texto.

const AUDIT_LABEL: Record<string, { kind: StayTimelineKind; title: string }> = {
  CHECKIN: { kind: "checkin", title: "Check-in realizado" },
  CHECKOUT: { kind: "checkout", title: "Check-out realizado" },
  PRE_CHECKIN: { kind: "precheckin", title: "Pré-check-in enviado pelo hóspede" },
  CREATE: { kind: "created", title: "Reserva criada" },
  STAY_GROUP_CREATE: { kind: "created", title: "Reserva criada (grupo)" },
  REASSIGN_GUEST: { kind: "guest", title: "Titular trocado" },
  RATE_QUOTE_LINKED: { kind: "quote", title: "Orçamento vinculado" },
  LODGING_PAUSED: { kind: "lodging", title: "Diárias pausadas" },
  LODGING_RESUMED: { kind: "lodging", title: "Diárias retomadas" },
  LODGING_NIGHT_OVERRIDDEN: { kind: "lodging", title: "Valor de diária alterado" },
};

/** Só para `UPDATE`/`DELETE`: o texto do log diz o que de fato mudou. */
const AUDIT_SNIFF: { re: RegExp; kind: StayTimelineKind; title: string }[] = [
  { re: /^estornou/i, kind: "folio_out", title: "Lançamento estornado" },
  { re: /lançou item na conta/i, kind: "folio", title: "Item lançado na conta" },
  { re: /lançou crédito/i, kind: "folio", title: "Pagamento lançado" },
  { re: /conta encerrada/i, kind: "bill_closed", title: "Conta encerrada" },
  { re: /conta reaberta/i, kind: "bill_reopened", title: "Conta reaberta" },
  { re: /^chave/i, kind: "key", title: "Chave" },
  { re: /empréstimo|emprestad/i, kind: "loan", title: "Empréstimo" },
  { re: /esquecido|achados e perdidos/i, kind: "lost", title: "Objeto esquecido" },
  { re: /diária/i, kind: "lodging", title: "Diárias" },
  { re: /marcou o item da conta/i, kind: "folio", title: "Item da conta atualizado" },
  { re: /transferência de cabana/i, kind: "update", title: "Acomodação trocada" },
  { re: /ficha de hospedagem editada/i, kind: "update", title: "Ficha editada" },
  { re: /pré-check-?in|pre-check-?in/i, kind: "precheckin", title: "Pré-check-in" },
];

function fromAudit(row: { id: string; action: string; details: string | null; timestamp: string; userName: string | null }): StayTimelineEvent {
  const details = row.details || "";
  const fixed = AUDIT_LABEL[row.action];
  const sniffed = fixed ? null : AUDIT_SNIFF.find(s => s.re.test(details));
  const label = fixed ?? sniffed ?? {
    kind: (row.action === "DELETE" ? "folio_out" : "update") as StayTimelineKind,
    title: row.action === "DELETE" ? "Registro removido" : "Estadia atualizada",
  };
  return {
    id: `audit:${row.id}`,
    at: row.timestamp,
    kind: label.kind,
    title: label.title,
    detail: details || null,
    actor: row.userName || null,
    channel: row.userName === "Sistema" ? "system" : "admin",
  };
}

// ── Governança ───────────────────────────────────────────────────────────────

const HK_STATUS_TITLE: Record<string, string> = {
  completed: "concluída",
  cancelled: "cancelada",
  skipped: "pulada",
};

export const StayTimelineService = {
  /**
   * Extrato completo de uma estadia, do mais recente para o mais antigo.
   *
   * Dez consultas em paralelo, todas filtradas por `stayId` — nenhuma varre
   * tabela inteira. Falha de uma fonte não derruba as outras: a linha do tempo
   * é leitura, e mostrar nove fontes é melhor do que mostrar erro.
   */
  async getForStay(propertyId: string, stayId: string): Promise<StayTimelineEvent[]> {
    const c = db();

    const { data: stay } = await c
      .from("stays")
      .select('id, accessCode, checkInActual, checkOutActual, createdAt')
      .eq("id", stayId)
      .eq("propertyId", propertyId)
      .maybeSingle();
    if (!stay) return [];

    const accessCode = (stay as { accessCode?: string }).accessCode || "";

    // Uma fonte que falha não pode derrubar as outras nove: o Supabase resolve
    // com `error` em vez de rejeitar, então os dois caminhos são tratados.
    const settle = async <T>(p: PromiseLike<{ data: T[] | null; error?: { message: string } | null }>, tag: string): Promise<T[]> => {
      try {
        const { data, error } = await p;
        if (error) console.error(`[stay-timeline] fonte ${tag}:`, error.message);
        return data ?? [];
      } catch (e) {
        console.error(`[stay-timeline] fonte ${tag} falhou:`, e);
        return [];
      }
    };

    const [audit, created, folio, hk, bookings, requests, surveys, breakfast, maint, vehicles, fb] = await Promise.all([
      settle(c.from("audit_logs").select('id, action, details, timestamp, userName')
        .eq("propertyId", propertyId).eq("entityId", stayId).order("timestamp", { ascending: false }).limit(300), "audit"),
      // A criação só é reencontrável pelo código da reserva — ver o cabeçalho.
      accessCode
        ? settle(c.from("audit_logs").select('id, action, details, timestamp, userName')
            .eq("propertyId", propertyId).eq("entity", "STAY").in("action", ["CREATE", "STAY_GROUP_CREATE"])
            .ilike("details", `%${accessCode}%`).limit(4), "criação")
        : Promise.resolve([]),
      settle(c.from("folio_items").select('id, description, totalPrice, createdAt')
        .eq("stayId", stayId).eq("category", "lodging").order("createdAt", { ascending: false }).limit(120), "fólio"),
      settle(c.from("housekeeping_tasks")
        .select('id, type, status, assignedTo, startedAt, finishedAt, skippedAt, cabinChecked, cabinCheckedBy, cabinCheckedAt, conferredBy')
        .eq("stayId", stayId).limit(120), "faxina"),
      settle(c.from("structure_bookings").select('id, structureId, date, startTime, endTime, status, source, type, createdAt, notes')
        .eq("stayId", stayId).eq("type", "booking").limit(80), "estruturas"),
      settle(c.from("concierge_requests").select('id, itemId, quantity, status, urgent, notes, createdAt, updatedAt, requestedBy, assignedName')
        .eq("stayId", stayId).limit(120), "concierge"),
      settle(c.from("survey_responses").select('id, metrics, createdAt').eq("stayId", stayId).limit(10), "pesquisa"),
      settle(c.from("breakfast_attendance").select('id, status, arrivedAt, seatedAt, leftAt, additionalGuests, date')
        .eq("stayId", stayId).not("arrivedAt", "is", null).limit(60), "café"),
      settle(c.from("maintenance_tasks").select('id, title, status, priority, assignedTo, createdAt, startedAt, finishedAt')
        .eq("stayId", stayId).limit(60), "manutenção"),
      settle(c.from("vehicle_movements").select('id, plate, kind, enteredAt, exitedAt, registeredByName, exitByName, amount')
        .eq("stayId", stayId).limit(60), "guarita"),
      settle(c.from("fb_orders").select("id, type, modality, status, total_price, created_at").eq("stay_id", stayId).limit(60), "restaurante"),
    ]);

    // Nomes de quem executou: governança e manutenção guardam só o id do staff —
    // e `assignedTo` é uma LISTA (uma faxina pode ter duas camareiras).
    const staffIds = new Set<string>();
    const collect = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(x => typeof x === "string" && x && staffIds.add(x));
      else if (typeof v === "string" && v) staffIds.add(v);
    };
    for (const t of hk as any[]) collect(t.assignedTo), collect(t.cabinCheckedBy), collect(t.conferredBy);
    for (const t of maint as any[]) collect(t.assignedTo);

    const names = new Map<string, string>();
    if (staffIds.size > 0) {
      const staff = await settle(
        c.from("staff").select('id, fullName').in("id", Array.from(staffIds)),
        "staff",
      );
      for (const s of staff as any[]) names.set(s.id, s.fullName);
    }
    /** Id (ou lista de ids) → nomes legíveis. `null` quando ninguém ficou registrado. */
    const who = (v: unknown): string | null => {
      const ids = Array.isArray(v) ? v : v ? [v] : [];
      const out = ids.map(id => names.get(String(id))).filter(Boolean) as string[];
      return out.length ? out.join(" e ") : null;
    };

    // Nomes das estruturas e dos itens do concierge.
    const structureIds = Array.from(new Set((bookings as any[]).map(b => b.structureId).filter(Boolean)));
    const itemIds = Array.from(new Set((requests as any[]).map(r => r.itemId).filter(Boolean)));
    const [structures, items] = await Promise.all([
      structureIds.length ? settle(c.from("structures").select("id, name").in("id", structureIds), "structures") : Promise.resolve([]),
      itemIds.length ? settle(c.from("concierge_items").select("id, name, category").in("id", itemIds), "itens") : Promise.resolve([]),
    ]);
    const structureName = new Map((structures as any[]).map(s => [s.id, s.name as string]));

    // `structure_bookings` não tem coluna de autor — quem marcou está no log,
    // indexado pelo id da reserva. Sem isto, todo agendamento de balcão fica anônimo.
    const bookingAuthor = new Map<string, string>();
    if ((bookings as any[]).length > 0) {
      const logs = await settle(
        c.from("audit_logs").select('entityId, userName')
          .eq("propertyId", propertyId).eq("action", "STRUCTURE_BOOKING_CREATED")
          .in("entityId", (bookings as any[]).map(b => b.id)),
        "autor da reserva",
      );
      for (const l of logs as any[]) if (l.userName) bookingAuthor.set(l.entityId, l.userName);
    }
    const itemMeta = new Map((items as any[]).map(i => [i.id, i as { name: string; category: string }]));

    const out: (StayTimelineEvent | null)[] = [];

    for (const row of [...(created as any[]), ...(audit as any[])]) out.push(fromAudit(row));

    for (const f of folio as any[]) {
      out.push(ev(`lodging:${f.id}`, f.createdAt, "lodging", "Diária lançada", {
        detail: `${f.description} — ${money(f.totalPrice)}`,
        actor: "Sistema",
        channel: "system",
      }));
    }

    for (const t of hk as any[]) {
      const label = getTaskLabel(t.type as HousekeepingTask["type"]);
      out.push(ev(`hk-start:${t.id}`, t.startedAt, "housekeeping", `${label} iniciada`, { actor: who(t.assignedTo), channel: "app" }));
      if (t.status !== "skipped") {
        out.push(ev(`hk-end:${t.id}`, t.finishedAt, "housekeeping", `${label} ${HK_STATUS_TITLE[t.status] ?? "concluída"}`, { actor: who(t.assignedTo), channel: "app" }));
      }
      out.push(ev(`hk-skip:${t.id}`, t.skippedAt, "housekeeping", `${label} pulada`, { actor: who(t.assignedTo), channel: "app" }));
      out.push(ev(`hk-conf:${t.id}`, t.cabinCheckedAt, "housekeeping", "Conferência de saída concluída", {
        detail: "frigobar, chave, achados e empréstimos",
        actor: who(t.cabinCheckedBy) ?? who(t.conferredBy),
        channel: "app",
      }));
    }

    for (const b of bookings as any[]) {
      const name = structureName.get(b.structureId) || "Estrutura";
      const when = [fmtDate(b.date), [b.startTime, b.endTime].filter(Boolean).join("–")].filter(Boolean).join(" · ");
      const viaPortal = b.source === "guest";
      out.push(ev(`sb:${b.id}`, b.createdAt, "structure", `${name} agendada${viaPortal ? " pelo portal" : ""}`, {
        detail: [when, b.status !== "approved" ? statusPt(b.status) : null, b.notes].filter(Boolean).join(" · ") || null,
        actor: viaPortal ? "Hóspede" : bookingAuthor.get(b.id) ?? null,
        channel: viaPortal ? "portal" : "admin",
      }));
    }

    for (const r of requests as any[]) {
      const item = itemMeta.get(r.itemId);
      const name = item?.name || "Item";
      const qty = r.quantity > 1 ? ` ×${r.quantity}` : "";
      const fromGuest = r.requestedBy === "guest";
      out.push(ev(`cr:${r.id}`, r.createdAt, "concierge", `Pedido: ${name}${qty}`, {
        detail: [r.urgent ? "urgente" : null, r.notes].filter(Boolean).join(" · ") || null,
        actor: fromGuest ? "Hóspede" : r.assignedName || null,
        channel: fromGuest ? "portal" : "app",
      }));
      if (["delivered", "returned", "lost"].includes(r.status) && r.updatedAt && r.updatedAt !== r.createdAt) {
        const title = r.status === "delivered"
          ? (item?.category === "loan" ? `Emprestado: ${name}` : `Entregue: ${name}`)
          : r.status === "returned" ? `Devolvido: ${name}` : `Extraviado: ${name}`;
        out.push(ev(`cr-out:${r.id}`, r.updatedAt, "concierge", title, { actor: r.assignedName || null, channel: "app" }));
      }
    }

    for (const s of surveys as any[]) {
      const m = (s.metrics || {}) as { npsScore?: number; averageRating?: number };
      const bits = [
        m.npsScore != null ? `NPS ${m.npsScore}` : null,
        m.averageRating != null ? `média ${Number(m.averageRating).toFixed(1)}` : null,
      ].filter(Boolean).join(" · ");
      out.push(ev(`sv:${s.id}`, s.createdAt, "survey", "Avaliação respondida", {
        detail: bits || null, actor: "Hóspede", channel: "portal",
      }));
    }

    for (const b of breakfast as any[]) {
      const extra = Number(b.additionalGuests || 0);
      out.push(ev(`bk:${b.id}`, b.arrivedAt ?? b.seatedAt, "breakfast", "Café da manhã", {
        detail: extra > 0 ? `${extra + 1} pessoas` : null, channel: "app",
      }));
    }

    for (const t of maint as any[]) {
      out.push(ev(`mt:${t.id}`, t.createdAt, "maintenance", `Manutenção aberta: ${t.title}`, {
        detail: t.priority ? `prioridade ${t.priority}` : null, channel: "admin",
      }));
      out.push(ev(`mt-end:${t.id}`, t.finishedAt, "maintenance", `Manutenção concluída: ${t.title}`, { actor: who(t.assignedTo), channel: "app" }));
    }

    for (const v of vehicles as any[]) {
      out.push(ev(`vh-in:${v.id}`, v.enteredAt, "parking", `Entrada de veículo ${v.plate}`, {
        detail: v.kind ? String(v.kind) : null, actor: v.registeredByName || null, channel: "app",
      }));
      out.push(ev(`vh-out:${v.id}`, v.exitedAt, "parking", `Saída de veículo ${v.plate}`, {
        detail: v.amount ? money(v.amount) : null, actor: v.exitByName || null, channel: "app",
      }));
    }

    for (const o of fb as any[]) {
      out.push(ev(`fb:${o.id}`, o.created_at, "fb", o.type === "breakfast" ? "Pedido de café da manhã" : "Pedido no restaurante", {
        detail: [o.modality, o.total_price ? money(o.total_price) : null].filter(Boolean).join(" · ") || null,
        actor: "Hóspede",
        channel: "portal",
      }));
    }

    return (out.filter(Boolean) as StayTimelineEvent[]).sort((a, b) => b.at.localeCompare(a.at));
  },
};

const money = (v: number | null | undefined) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return y && m && day ? `${day}/${m}` : "";
};

const statusPt = (s: string) =>
  ({ cancelled: "cancelada", rejected: "recusada", completed: "realizada", expired: "expirada", pending: "aguardando" } as Record<string, string>)[s] ?? s;
