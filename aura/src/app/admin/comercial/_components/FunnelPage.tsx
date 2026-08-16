// Página de UM funil comercial (Reservas OU Casamentos) — os vendedores são
// pessoas diferentes, então cada funil tem página própria; este componente
// carrega o miolo comum: pipeline, fila de follow-ups, drawer e ações.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { useTabParam } from "@/lib/settings-deeplink";
import {
  BellRing, CalendarClock, CalendarDays, ExternalLink, Eye, EyeOff, Handshake,
  Heart, Hourglass, KanbanSquare, LayoutList, Loader2, Plus, RefreshCw, Search,
  TrendingDown, TrendingUp,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import type { RateBundle } from "@/services/rate-service";
import { CrmAlarm, CrmChannel, CrmEntityType, CrmLead, Guest, RateQuoteRecord, WaitlistEntry } from "@/types/aura";
import { PipelineBoard } from "./PipelineBoard";
import { LeadListView } from "./LeadListView";
import { TodayQueue } from "./TodayQueue";
import { AlarmsQueue } from "./AlarmsQueue";
import { WaitlistTab } from "./WaitlistTab";
import { LeadDrawer } from "./LeadDrawer";
import { MarkLostModal } from "./MarkLostModal";
import { NewQuoteWizard, type QuoteSeed } from "./NewQuoteWizard";
import type { PromotePayload } from "./PromoteGuestModal";
import { S, QUOTE_STAGES, WEDDING_STAGES, ACTIVE_STAGES, leadAlert, money, todayIso } from "./shared";

type TabId = "pipeline" | "alarmes" | "espera";

const FUNNEL_CFG: Record<CrmEntityType, {
  title: string; subtitle: string; icon: React.ReactNode;
}> = {
  quote: {
    title: "Pipeline Estadias",
    subtitle: "Orçamentos de reserva — do primeiro contato ao pagamento.",
    icon: <CalendarDays size={22} color="#9b6dff" />,
  },
  wedding: {
    title: "Pipeline Casamentos",
    subtitle: "Leads de casamento — da visita ao contrato assinado.",
    icon: <Heart size={22} color="#fb7185" />,
  },
};

export function FunnelPage({ funnel }: { funnel: CrmEntityType }) {
  const { currentProperty: property } = useProperty();
  const { userData } = useAuth();
  const router = useRouter();
  const cfg = FUNNEL_CFG[funnel];
  const stages = funnel === "quote" ? QUOTE_STAGES : WEDDING_STAGES;

  // Wizard "Nova cotação" (só reservas) — o RateBundle é cacheado entre aberturas.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSeed, setWizardSeed] = useState<QuoteSeed | null>(null);
  const bundleCache = useRef<RateBundle | null>(null);

  const openWizard = (seed: QuoteSeed | null = null) => {
    setWizardSeed(seed);
    setWizardOpen(true);
  };

  /** Semente a partir de um orçamento: editar o MESMO (keepId) ou clonar só
   *  o cliente para um lead NOVO (o anterior fica intacto). */
  const seedFromQuote = (q: RateQuoteRecord, keepId: boolean): QuoteSeed => ({
    quoteId: keepId ? q.id : null,
    clientName: q.clientName, clientPhone: q.clientPhone,
    clientEmail: q.clientEmail, clientDocument: q.clientDocument,
    guestId: q.guestId, source: q.source,
    checkIn: keepId ? q.checkIn : null, checkOut: keepId ? q.checkOut : null,
    rooms: keepId ? q.rooms ?? null : null,
    adults: q.adults, children: q.children, babies: q.babies, pets: q.pets,
    fluctuationPct: keepId ? q.fluctuationPct : null,
    fluctuationAuto: keepId ? q.fluctuationAuto ?? false : null,
    discountIds: keepId ? q.discountIds : null,
    adhocValue: keepId ? q.adhocValue : null,
    adhocType: keepId ? q.adhocType : null,
  });

  // Host público da proposta (mesma regra do resto: domínio próprio → fallback).
  const proposalBase = (property?.settings as { customDomain?: string } | undefined)?.customDomain
    ? `https://${(property!.settings as { customDomain?: string }).customDomain}`
    : "https://aaura.app.br";

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [channels, setChannels] = useState<CrmChannel[]>([]);
  const [alarms, setAlarms] = useState<CrmAlarm[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>(useTabParam<TabId>(
    funnel === "quote" ? ["pipeline", "alarmes", "espera"] : ["pipeline", "alarmes"],
    "pipeline"
  ));
  // Kanban ↔ Lista (toggle do projeto de design) + perdidos ocultos por padrão
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [showLost, setShowLost] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [losing, setLosing] = useState<CrmLead | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAlarms = useCallback(async () => {
    if (!property?.id) return;
    const res = await fetch(`/api/admin/comercial/alarms?propertyId=${property.id}&funnel=${funnel}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setAlarms(data.alarms || []);
  }, [property?.id, funnel]);

  // Lista de espera é conceito de RESERVAS (períodos concorridos).
  const loadWaitlist = useCallback(async () => {
    if (!property?.id || funnel !== "quote") return;
    const res = await fetch(`/api/admin/comercial/waitlist?propertyId=${property.id}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setWaitlist(data.entries || []);
  }, [property?.id, funnel]);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const res = await fetch(`/api/admin/comercial?propertyId=${property.id}&funnel=${funnel}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLeads(data.leads || []);
      setChannels(data.channels || []);
      loadAlarms();
      loadWaitlist();
    } catch {
      toast.error("Erro ao carregar o pipeline.");
    } finally {
      setLoading(false);
    }
  }, [property?.id, funnel, loadAlarms, loadWaitlist]);

  useEffect(() => { load(); }, [load]);

  /** Recarrega e re-sincroniza o lead aberto no drawer. */
  const reload = useCallback(async (keepOpenId?: string) => {
    if (!property?.id) return;
    const res = await fetch(`/api/admin/comercial?propertyId=${property.id}&funnel=${funnel}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    const fresh: CrmLead[] = data.leads || [];
    setLeads(fresh);
    setChannels(data.channels || []);
    if (keepOpenId) setSelected(fresh.find((l) => l.id === keepOpenId) ?? null);
  }, [property?.id, funnel]);

  /** Lead por id SEM o recorte de 60d (deep-link, alarme antigo, anti-dup). */
  const fetchLeadById = useCallback(async (id: string): Promise<CrmLead | null> => {
    if (!property?.id) return null;
    const res = await fetch(
      `/api/admin/comercial?propertyId=${property.id}&funnel=${funnel}&id=${id}`
    ).catch(() => null);
    if (!res?.ok) return null;
    return (await res.json())?.lead ?? null;
  }, [property?.id, funnel]);

  // Deep-links (só reservas): ?quoteId= abre o drawer — inclusive de lead
  // fechado fora do recorte de 60d — e ?new=1 abre o wizard, com &guestId=
  // semeando o cliente pela ficha. A ref guarda o VALOR tratado: o mesmo
  // link clicado de novo (ex.: ClientPanel dentro do drawer) re-dispara.
  const searchParams = useSearchParams();
  const handledDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!property?.id || funnel !== "quote") return;
    const quoteId = searchParams.get("quoteId");
    const isNew = searchParams.get("new");
    const guestId = searchParams.get("guestId");
    if (!quoteId && !isNew) return;
    const key = `${quoteId ?? ""}|${isNew ?? ""}|${guestId ?? ""}`;
    if (handledDeepLink.current === key) return;
    handledDeepLink.current = key;

    if (quoteId) {
      fetchLeadById(quoteId).then((l) => {
        if (l) setSelected(l);
        else toast.error("Orçamento não encontrado.");
      });
      return;
    }
    if (guestId) {
      fetch(`/api/admin/guests/lookup?propertyId=${property.id}&doc=${encodeURIComponent(guestId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const g = d?.guest as Guest | null;
          if (g) {
            openWizard({
              clientName: g.fullName, clientPhone: g.phone || null,
              clientEmail: g.email || null, clientDocument: g.id, guestId: g.id,
            });
          } else {
            toast.info("Hóspede não encontrado — cotação em branco.");
            openWizard();
          }
        })
        .catch(() => openWizard());
    } else {
      openWizard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, property?.id, funnel, fetchLeadById]);

  // Conversão da lista de espera: o wizard abre semeado AQUI e a entrada só
  // vira 'converted' quando o orçamento salvo É do lead (match por telefone/
  // nome — a recepção pode ser interrompida e cotar OUTRO cliente no meio;
  // mismatch mantém a entrada armada para o orçamento certo vir depois).
  const waitlistPending = useRef<{ id: string; phone: string; name: string } | null>(null);

  const convertWaitlistEntry = (e: WaitlistEntry) => {
    waitlistPending.current = { id: e.id, phone: e.phone || "", name: e.name || "" };
    openWizard({
      clientName: e.name, clientPhone: e.phone || null, clientEmail: e.email || null,
      checkIn: e.periodStart, checkOut: e.periodEnd,
      adults: e.guests || undefined, source: e.source || null,
    });
  };

  const resolveWaitlistPending = useCallback(async (quoteId: string) => {
    const pending = waitlistPending.current;
    if (!pending || !property?.id) return;
    try {
      const res = await fetch(`/api/admin/tarifario/quotes?propertyId=${property.id}&id=${quoteId}`);
      if (!res.ok) return;
      const quote = (await res.json())?.quote;
      if (!quote) return;
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const tail = (p: string) => p.replace(/\D/g, "").slice(-8);
      const phoneMatches = pending.phone && quote.clientPhone
        && tail(pending.phone) === tail(String(quote.clientPhone));
      const nameMatches = pending.name && quote.clientName
        && norm(pending.name) === norm(String(quote.clientName));
      if (!phoneMatches && !nameMatches) return;

      const patch = await fetch("/api/admin/comercial/waitlist", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: property.id, id: pending.id, status: "converted", quoteId,
        }),
      });
      if (patch.ok) {
        waitlistPending.current = null;
        toast.success("Lista de espera: entrada convertida em orçamento.");
        loadWaitlist();
      }
    } catch { /* melhor manter armado do que fechar a entrada errada */ }
  }, [property?.id, loadWaitlist]);

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = norm(search);
    return leads.filter((l) => norm(`${l.title} ${l.phone || ""} ${l.email || ""}`).includes(q));
  }, [leads, search]);

  // Perdidos ficam ocultos por padr\u00e3o (mostrarPerdidos do projeto de design)
  const visibleStages = useMemo(
    () => stages.filter((s) => showLost || s.id !== "lost"),
    [stages, showLost]
  );
  const visibleLeads = useMemo(
    () => filtered.filter((l) => showLost || l.stage !== "lost"),
    [filtered, showLost]
  );

  const kpis = useMemo(() => {
    const active = leads.filter((l) => ACTIVE_STAGES.has(l.stage));
    const overdue = leads.filter((l) => leadAlert(l) !== null);
    const won = leads.filter((l) => l.stage === "won" || l.stage === "confirmed" || l.stage === "completed");
    const lost = leads.filter((l) => l.stage === "lost");
    return {
      activeCount: active.length,
      activeValue: active.reduce((s, l) => s + l.value, 0),
      overdueCount: overdue.length,
      wonValue: won.reduce((s, l) => s + l.value, 0),
      lostValue: lost.reduce((s, l) => s + l.value, 0),
    };
  }, [leads]);

  // ── Ações (reusam os endpoints de cada funil) ──────────────────────────────

  const withBusy = async (lead: CrmLead, fn: () => Promise<void>) => {
    setBusyId(lead.id);
    try { await fn(); }
    catch (e) { toast.error(e instanceof Error && e.message ? e.message : "Erro na operação."); }
    finally { setBusyId(null); }
  };

  const patchQuote = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch("/api/admin/tarifario/quotes", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: property!.id, id, patch }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
  };

  const patchWedding = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/weddings/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
  };

  // Patch genérico do drawer (valor negociado, canal, prazos) — recepção pode,
  // o rastro fica na timeline + auditoria (regra da fase B.5).
  const patchLead = (lead: CrmLead, patch: Record<string, unknown>) => withBusy(lead, async () => {
    if (lead.entityType === "quote") await patchQuote(lead.id, patch);
    else await patchWedding(lead.id, patch);
    await reload(lead.id);
    toast.success("Lead atualizado.");
  });

  // "Promover a hóspede": vincula a ficha escolhida (existente) ou cria a nova
  // com os dados conferidos na modal — SEM mexer no estágio do lead.
  // Rejeita de volta (em vez do withBusy, que engole): a modal só fecha quando
  // a promoção deu certo — CPF recusado tem de manter o formulário na tela.
  const promoteGuest = async (lead: CrmLead, payload: PromotePayload) => {
    setBusyId(lead.id);
    try {
      const res = await fetch("/api/admin/tarifario/quotes/promote-guest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: property!.id, id: lead.id, ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      if (!data?.guestId) throw new Error("Não foi possível criar a ficha — confira os dados.");
      await reload(lead.id);
      toast.success("Cliente promovido a hóspede.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao promover a hóspede.");
      throw e;
    } finally {
      setBusyId(null);
    }
  };

  const moveStage = (lead: CrmLead, stage: string) => withBusy(lead, async () => {
    if (lead.entityType === "quote") await patchQuote(lead.id, { status: stage });
    else await patchWedding(lead.id, { status: stage });
    await reload(lead.id);
    toast.success("Etapa atualizada.");
  });

  const win = (lead: CrmLead) => withBusy(lead, async () => {
    if (lead.entityType === "wedding") {
      await patchWedding(lead.id, { status: "confirmed" });
      await reload(lead.id);
      toast.success("Casamento confirmado!");
      return;
    }
    const res = await fetch("/api/admin/tarifario/quotes/convert", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: property!.id, id: lead.id }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error);
    await reload();
    setSelected(null);
    toast.success("Ganhou! Hóspede garantido.");
    if (confirm("Criar a estadia agora, já pré-preenchida?")) {
      const params = new URLSearchParams({
        checkIn: data.checkIn, checkOut: data.checkOut, quoteId: lead.id,
        // O pax vem do orçamento: a estadia não pode nascer com 2 adultos
        // fixos quando a negociação fechou outra composição.
        adults: String(data.adults ?? 2),
        children: String(data.children ?? 0),
        babies: String(data.babies ?? 0),
      });
      if (data.guestId) params.set("guestId", data.guestId);
      router.push(`/admin/stays/new?${params}`);
    }
  });

  const markLost = (lead: CrmLead, reason: string) => withBusy(lead, async () => {
    if (lead.entityType === "quote") {
      await patchQuote(lead.id, { status: "lost", lostReason: reason });
    } else {
      const res = await fetch(`/api/admin/weddings/${lead.id}/lost`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
    }
    setLosing(null);
    setSelected(null);
    await reload();
    toast.success("Arquivado como perdido.");
  });

  const followUp = (lead: CrmLead, note: string) => withBusy(lead, async () => {
    const res = await fetch("/api/admin/comercial/follow-up", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: property!.id, entityType: lead.entityType, entityId: lead.id,
        note: note || undefined,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error);
    await reload(lead.id);
    toast.success(`Contato registrado — próximo em ${String(data.followUpAt).split("-").reverse().slice(0, 2).join("/")}.`);
  });

  const addNote = (lead: CrmLead, note: string) => withBusy(lead, async () => {
    const res = await fetch("/api/admin/comercial/interactions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: property!.id, entityType: lead.entityType, entityId: lead.id, note,
      }),
    });
    if (!res.ok) throw new Error();
    toast.success("Nota registrada.");
  });

  // Só casamentos têm tela de origem própria — orçamento vive AQUI (o drawer
  // é a ficha, o wizard é a edição; o Tarifário virou tabelas/calendário).
  const openOrigin = (lead: CrmLead) => {
    if (lead.entityType === "wedding") router.push(`/admin/casamentos?weddingId=${lead.id}`);
  };

  // Anti-duplicidade do wizard: abrir o lead existente em vez de criar outro.
  const openExistingQuote = (quoteId: string) => {
    setWizardOpen(false);
    const lead = leads.find((l) => l.id === quoteId);
    if (lead) { setSelected(lead); return; }
    fetchLeadById(quoteId).then((l) => {
      if (l) setSelected(l);
      else toast.error("Orçamento não encontrado.");
    });
  };

  // Drop do kanban: coluna decide a ação — ganhar/perder têm fluxos próprios.
  const handleDropLead = (leadId: string, stageId: string) => {
    if (busyId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === stageId) return;
    if (stageId === "won" || stageId === "confirmed") { win(lead); return; }
    if (stageId === "lost") { setLosing(lead); return; }
    moveStage(lead, stageId);
  };

  // ── Alarmes ────────────────────────────────────────────────────────────────

  const [alarmBusyId, setAlarmBusyId] = useState<string | null>(null);

  const alarmDone = async (a: CrmAlarm) => {
    setAlarmBusyId(a.id);
    try {
      const res = await fetch("/api/admin/comercial/alarms", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: property!.id, id: a.id, done: true }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      await loadAlarms();
      toast.success("Alarme concluído.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao concluir o alarme.");
    } finally {
      setAlarmBusyId(null);
    }
  };

  const alarmDelete = async (a: CrmAlarm) => {
    if (!confirm(`Excluir o alarme "${a.title}"?`)) return;
    setAlarmBusyId(a.id);
    try {
      const res = await fetch(
        `/api/admin/comercial/alarms?propertyId=${property!.id}&id=${a.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      await loadAlarms();
      toast.success("Alarme excluído.");
    } catch {
      toast.error("Erro ao excluir o alarme.");
    } finally {
      setAlarmBusyId(null);
    }
  };

  // Lead ainda no pipeline → drawer direto; fora do recorte de 60d → busca
  // por id e abre o MESMO drawer (casamento antigo vai para a tela própria).
  const openAlarmLead = (a: CrmAlarm) => {
    const lead = leads.find((l) => l.id === a.entityId);
    if (lead) { setSelected(lead); return; }
    if (a.entityType === "wedding") {
      router.push(`/admin/casamentos?weddingId=${a.entityId}`);
      return;
    }
    fetchLeadById(a.entityId).then((l) => {
      if (l) setSelected(l);
      else toast.error("Lead do alarme não encontrado.");
    });
  };

  const dueAlarmCount = useMemo(
    () => alarms.filter((a) => a.dueAt <= todayIso()).length,
    [alarms]
  );

  const waitingCount = useMemo(
    () => waitlist.filter((e) => e.status === "waiting" || e.status === "contacted").length,
    [waitlist]
  );

  if (!property) return null;

  const kpiCards = [
    {
      icon: Handshake, label: "Em negociação",
      value: `R$ ${money(kpis.activeValue)}`, color: T.text,
      sub: `${kpis.activeCount} lead${kpis.activeCount !== 1 ? "s" : ""} ativo${kpis.activeCount !== 1 ? "s" : ""}`,
    },
    {
      icon: CalendarClock, label: "Follow-ups vencidos",
      value: String(kpis.overdueCount), color: kpis.overdueCount > 0 ? T.red : T.emerald,
      sub: kpis.overdueCount > 0 ? "precisam de contato" : "fila em dia",
    },
    {
      icon: TrendingUp, label: "Fechados (60d)",
      value: `R$ ${money(kpis.wonValue)}`, color: T.emerald,
      sub: funnel === "wedding" ? "contratos confirmados" : "reservas ganhas",
    },
    {
      icon: TrendingDown, label: "Perdidos (60d)",
      value: `R$ ${money(kpis.lostValue)}`, color: T.red,
      sub: "arquivados com motivo",
    },
  ];

  const segTab = (activeSeg: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
    borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit",
    fontSize: 12.5, fontWeight: 700, transition: "all .15s",
    background: activeSeg ? T.card : "transparent",
    color: activeSeg ? T.text : T.muted,
  });

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-.02em", color: T.text, display: "flex", alignItems: "center", gap: 10 }}>
            {cfg.icon} {cfg.title}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted }}>{cfg.subtitle}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {funnel === "quote" && (
            <button onClick={() => openWizard()} style={S.gradBtn}>
              <Plus size={14} /> Nova cotação
            </button>
          )}
          {funnel === "wedding" && (
            <Link href="/admin/casamentos" style={{ ...S.ghostBtn, textDecoration: "none" }}>
              <ExternalLink size={13} /> Gestão do evento
            </Link>
          )}
          <div style={{ display: "flex", gap: 4, background: T.glass, borderRadius: 12, padding: 4, border: `1px solid ${T.border}` }}>
            {([
              // Follow-ups não é mais aba: virou a "Fila de hoje" fixa no
              // topo do pipeline (UI do projeto de design).
              { id: "pipeline" as TabId, label: "Pipeline", icon: KanbanSquare, badge: 0, count: 0 },
              { id: "alarmes" as TabId, label: "Alarmes", icon: BellRing, badge: dueAlarmCount, count: 0 },
              // Espera é conceito de reservas; contador neutro (não é urgência)
              ...(funnel === "quote"
                ? [{ id: "espera" as TabId, label: "Espera", icon: Hourglass, badge: 0, count: waitingCount }]
                : []),
            ]).map(({ id, label, icon: Icon, badge, count }) => (
              <button key={id} onClick={() => setTab(id)} style={segTab(tab === id)}>
                <Icon size={15} />
                <span>{label}</span>
                {badge > 0 && (
                  <span style={{
                    minWidth: 16, height: 16, borderRadius: 999, padding: "0 4px",
                    background: T.grad, color: "#fff", fontSize: 9, fontWeight: 900,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {badge}
                  </span>
                )}
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.muted }}>({count})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs do funil */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {kpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={{ ...S.card, padding: "14px 18px", position: "relative", overflow: "hidden" }}>
              <div style={{
                position: "absolute", top: -20, right: -20, width: 70, height: 70, borderRadius: "50%",
                background: `radial-gradient(circle,${k.color === T.text ? T.g1 : k.color}18 0%,transparent 70%)`,
                pointerEvents: "none",
              }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>
                <Icon size={11} /> {k.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6, color: k.color, letterSpacing: "-.5px" }}>{k.value}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{k.sub}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 0", gap: 10, color: T.muted }}>
          <Loader2 className="animate-spin" size={20} color={T.g1} /> Carregando pipeline…
        </div>
      ) : tab === "pipeline" ? (
        <>
          {/* Fila de hoje — follow-ups + cobranças, sempre visível (design) */}
          <TodayQueue leads={leads} alarms={alarms}
            busyId={busyId} alarmBusyId={alarmBusyId}
            onOpenLead={setSelected} onOpenAlarm={openAlarmLead}
            onContact={(l) => followUp(l, "")} onAlarmDone={alarmDone} />

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, background: T.glass,
              border: `1px solid ${T.border2}`, borderRadius: 10, padding: "7px 12px",
              flex: 1, minWidth: 220, maxWidth: 300,
            }}>
              <Search size={13} color={T.muted} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone, e-mail…"
                autoComplete="off"
                style={{ background: "none", border: "none", outline: "none", color: T.text, fontFamily: "inherit", fontSize: 13, flex: 1 }} />
            </div>
            <span style={{ fontSize: 11, color: T.muted2 }}>
              {visibleLeads.length} lead{visibleLeads.length !== 1 ? "s" : ""} no funil
            </span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setShowLost((v) => !v)}
                title={showLost ? "Ocultar perdidos" : "Mostrar perdidos"}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 11px",
                  borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11, fontWeight: 800,
                  background: showLost ? T.glass2 : "transparent",
                  border: `1px solid ${showLost ? T.border2 : "transparent"}`,
                  color: showLost ? T.text : T.muted,
                }}>
                {showLost ? <Eye size={12} /> : <EyeOff size={12} />} perdidos
              </button>
              <div style={{ display: "flex", gap: 2, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3 }}>
                {([
                  { id: "kanban" as const, label: "Kanban", icon: KanbanSquare },
                  { id: "lista" as const, label: "Lista", icon: LayoutList },
                ]).map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setView(id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "6px 10px",
                      borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
                      fontSize: 11, fontWeight: 800, transition: "all .15s",
                      background: view === id ? T.card : "transparent",
                      color: view === id ? T.text : T.muted,
                    }}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
              <button onClick={() => { setLoading(true); load(); }} disabled={loading}
                style={{ ...S.ghostBtn, opacity: loading ? 0.5 : 1 }}>
                <RefreshCw size={13} /> Atualizar
              </button>
            </div>
          </div>

          {view === "kanban" ? (
            <PipelineBoard stages={visibleStages} leads={visibleLeads}
              channels={channels} alarms={alarms} onOpen={setSelected}
              onDropLead={handleDropLead} dragDisabled={busyId !== null}
              onAddNew={funnel === "quote" ? () => openWizard() : undefined} />
          ) : (
            <LeadListView stages={visibleStages} leads={visibleLeads}
              channels={channels} onOpen={setSelected} />
          )}
        </>
      ) : tab === "alarmes" ? (
        <AlarmsQueue alarms={alarms} busyId={alarmBusyId}
          onDone={alarmDone} onDelete={alarmDelete} onOpen={openAlarmLead} />
      ) : (
        <WaitlistTab propertyId={property.id} entries={waitlist} onChanged={loadWaitlist}
          onConvert={convertWaitlistEntry} />
      )}

      {selected && (
        <LeadDrawer
          propertyId={property.id}
          lead={selected}
          channels={channels}
          busy={busyId === selected.id}
          onClose={() => setSelected(null)}
          onFollowUp={(note) => followUp(selected, note)}
          onAddNote={(note) => addNote(selected, note)}
          onMoveStage={(stage) => moveStage(selected, stage)}
          onMarkLost={() => setLosing(selected)}
          onWin={() => win(selected)}
          onOpenOrigin={() => openOrigin(selected)}
          onPatch={(patch) => patchLead(selected, patch)}
          onPromoteGuest={(payload) => promoteGuest(selected, payload)}
          onAlarmsChanged={loadAlarms}
          onQuoteChanged={() => reload(selected.id)}
          onDeleted={() => { setSelected(null); reload(); }}
          onEditQuote={(q) => openWizard(seedFromQuote(q, true))}
          onDuplicateQuote={(q) => openWizard(seedFromQuote(q, false))}
          proposalUrl={selected.entityType === "quote" ? `${proposalBase}/cotacao/${selected.id}` : null}
        />
      )}

      {losing && (
        <MarkLostModal lead={losing} busy={busyId === losing.id}
          onCancel={() => setLosing(null)}
          onConfirm={(reason) => markLost(losing, reason)} />
      )}

      {wizardOpen && funnel === "quote" && (
        <NewQuoteWizard
          // A semente entra na key: trocar de "editar" para "nova" precisa
          // remontar o wizard (o estado inicial vem toda da seed).
          key={wizardSeed?.quoteId ?? (wizardSeed ? "dup" : "new")}
          propertyId={property.id}
          channels={channels}
          attendantName={userData?.fullName || "Recepção"}
          proposalBase={proposalBase}
          initialBundle={bundleCache.current}
          onBundleLoaded={(b) => { bundleCache.current = b; }}
          onClose={() => { setWizardOpen(false); setWizardSeed(null); }}
          onSaved={(id) => { reload(selected?.id); resolveWaitlistPending(id); }}
          onOpenExisting={openExistingQuote}
          seed={wizardSeed}
        />
      )}
    </div>
  );
}
