// Página de UM funil comercial (Reservas OU Casamentos) — os vendedores são
// pessoas diferentes, então cada funil tem página própria; este componente
// carrega o miolo comum: pipeline, fila de follow-ups, drawer e ações.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { useTabParam } from "@/lib/settings-deeplink";
import { cn } from "@/lib/utils";
import {
  BellRing, CalendarClock, CalendarDays, ExternalLink, Eye, EyeOff, Handshake,
  Heart, Hourglass, KanbanSquare, LayoutList, Loader2, RefreshCw, Search,
  TrendingDown, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrmAlarm, CrmChannel, CrmEntityType, CrmLead, WaitlistEntry } from "@/types/aura";
import { PipelineBoard } from "./PipelineBoard";
import { LeadListView } from "./LeadListView";
import { TodayQueue } from "./TodayQueue";
import { AlarmsQueue } from "./AlarmsQueue";
import { WaitlistTab } from "./WaitlistTab";
import { LeadDrawer } from "./LeadDrawer";
import { MarkLostModal } from "./MarkLostModal";
import { QUOTE_STAGES, WEDDING_STAGES, ACTIVE_STAGES, leadAlert, money, todayIso } from "./shared";

type TabId = "pipeline" | "alarmes" | "espera";

const FUNNEL_CFG: Record<CrmEntityType, {
  title: string; subtitle: string; icon: React.ReactNode;
}> = {
  quote: {
    title: "Pipeline Estadias",
    subtitle: "Orçamentos de reserva — do primeiro contato ao pagamento.",
    icon: <CalendarDays className="text-primary" size={24} />,
  },
  wedding: {
    title: "Pipeline Casamentos",
    subtitle: "Leads de casamento — da visita ao contrato assinado.",
    icon: <Heart className="text-pink-500" size={24} />,
  },
};

export function FunnelPage({ funnel }: { funnel: CrmEntityType }) {
  const { currentProperty: property } = useProperty();
  const router = useRouter();
  const cfg = FUNNEL_CFG[funnel];
  const stages = funnel === "quote" ? QUOTE_STAGES : WEDDING_STAGES;

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

  // "Promover a hóspede": vincula/cria a ficha SEM mexer no estágio do lead.
  const promoteGuest = (lead: CrmLead, guestId?: string) => withBusy(lead, async () => {
    const res = await fetch("/api/admin/tarifario/quotes/promote-guest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: property!.id, id: lead.id, guestId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error);
    await reload(lead.id);
    if (data.guestId) toast.success("Cliente promovido a hóspede.");
    else toast.info("Lead sem CPF — preencha o documento no Tarifário para criar a ficha.");
  });

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
    toast.success(data.guestId ? "Ganhou! Hóspede garantido." : "Ganhou! (sem CPF para criar o hóspede)");
    if (confirm("Criar a estadia agora, já pré-preenchida?")) {
      const params = new URLSearchParams({
        checkIn: data.checkIn, checkOut: data.checkOut, quoteId: lead.id,
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

  const openOrigin = (lead: CrmLead) => {
    router.push(lead.entityType === "quote"
      ? `/admin/tarifario?quoteId=${lead.id}`
      : `/admin/casamentos?weddingId=${lead.id}`);
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

  // Lead ainda no pipeline → drawer; fechado há mais de 60d → tela de origem.
  const openAlarmLead = (a: CrmAlarm) => {
    const lead = leads.find((l) => l.id === a.entityId);
    if (lead) setSelected(lead);
    else router.push(a.entityType === "quote"
      ? `/admin/tarifario?quoteId=${a.entityId}`
      : `/admin/casamentos?weddingId=${a.entityId}`);
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

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            {cfg.icon} {cfg.title}
          </h1>
          <p className="text-sm text-muted-foreground">{cfg.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {funnel === "wedding" && (
            <Link href="/admin/casamentos"
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-secondary text-foreground rounded-xl px-3 py-2 hover:bg-accent transition-colors">
              <ExternalLink size={13} /> Gestão do evento
            </Link>
          )}
          <div className="flex gap-1 bg-secondary rounded-xl p-1">
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
              <button key={id} onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}>
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
                {badge > 0 && (
                  <span className="text-[10px] font-black bg-red-500 text-white rounded-full px-1.5">
                    {badge}
                  </span>
                )}
                {count > 0 && (
                  <span className="text-[10px] font-bold text-muted-foreground">({count})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs do funil */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Handshake size={11} /> Em negociação
          </p>
          <p className="text-xl font-black text-foreground mt-1">R$ {money(kpis.activeValue)}</p>
          <p className="text-xs text-muted-foreground">{kpis.activeCount} lead{kpis.activeCount !== 1 ? "s" : ""} ativo{kpis.activeCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <CalendarClock size={11} /> Follow-ups vencidos
          </p>
          <p className={cn("text-xl font-black mt-1", kpis.overdueCount > 0 ? "text-red-500" : "text-emerald-500")}>
            {kpis.overdueCount}
          </p>
          <p className="text-xs text-muted-foreground">{kpis.overdueCount > 0 ? "precisam de contato" : "fila em dia"}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <TrendingUp size={11} /> Fechados (60d)
          </p>
          <p className="text-xl font-black text-emerald-600 mt-1">R$ {money(kpis.wonValue)}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <TrendingDown size={11} /> Perdidos (60d)
          </p>
          <p className="text-xl font-black text-red-500 mt-1">R$ {money(kpis.lostValue)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={20} /> Carregando pipeline…
        </div>
      ) : tab === "pipeline" ? (
        <>
          {/* Fila de hoje — follow-ups + cobranças, sempre visível (design) */}
          <TodayQueue leads={leads} alarms={alarms}
            busyId={busyId} alarmBusyId={alarmBusyId}
            onOpenLead={setSelected} onOpenAlarm={openAlarmLead}
            onContact={(l) => followUp(l, "")} onAlarmDone={alarmDone} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="field-input !pl-9" placeholder="Buscar por nome, telefone, e-mail…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className="text-[11px] text-muted-foreground/70">
              {visibleLeads.length} lead{visibleLeads.length !== 1 ? "s" : ""} no funil
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setShowLost((v) => !v)}
                title={showLost ? "Ocultar perdidos" : "Mostrar perdidos"}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors",
                  showLost ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}>
                {showLost ? <Eye size={12} /> : <EyeOff size={12} />} perdidos
              </button>
              <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
                {([
                  { id: "kanban" as const, label: "Kanban", icon: KanbanSquare },
                  { id: "lista" as const, label: "Lista", icon: LayoutList },
                ]).map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setView(id)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors",
                      view === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }} disabled={loading}>
                <RefreshCw size={14} className="mr-1" /> Atualizar
              </Button>
            </div>
          </div>

          {view === "kanban" ? (
            <PipelineBoard stages={visibleStages} leads={visibleLeads}
              channels={channels} alarms={alarms} onOpen={setSelected} />
          ) : (
            <LeadListView stages={visibleStages} leads={visibleLeads}
              channels={channels} onOpen={setSelected} />
          )}
        </>
      ) : tab === "alarmes" ? (
        <AlarmsQueue alarms={alarms} busyId={alarmBusyId}
          onDone={alarmDone} onDelete={alarmDelete} onOpen={openAlarmLead} />
      ) : (
        <WaitlistTab propertyId={property.id} entries={waitlist} onChanged={loadWaitlist} />
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
          onPromoteGuest={(guestId) => promoteGuest(selected, guestId)}
          onAlarmsChanged={loadAlarms}
        />
      )}

      {losing && (
        <MarkLostModal lead={losing} busy={busyId === losing.id}
          onCancel={() => setLosing(null)}
          onConfirm={(reason) => markLost(losing, reason)} />
      )}
    </div>
  );
}
