// src/app/admin/comercial/page.tsx
// Hub Comercial — o CRM da fazenda numa tela: pipeline unificado dos dois
// funis (orçamentos de reserva + casamentos), fila de follow-ups do dia e
// detalhe do lead com histórico. As ações reusam os endpoints de cada funil;
// a tela de KPIs entra na fase C como terceira aba.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useTabParam } from "@/lib/settings-deeplink";
import { cn } from "@/lib/utils";
import {
  CalendarClock, CalendarDays, Handshake, Heart, KanbanSquare, ListChecks,
  Loader2, RefreshCw, Search, TrendingDown, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrmChannel, CrmLead } from "@/types/aura";
import { PipelineBoard } from "./_components/PipelineBoard";
import { FollowUpQueue } from "./_components/FollowUpQueue";
import { LeadDrawer } from "./_components/LeadDrawer";
import { MarkLostModal } from "./_components/MarkLostModal";
import { QUOTE_STAGES, WEDDING_STAGES, ACTIVE_STAGES, leadAlert, money } from "./_components/shared";

type TabId = "pipeline" | "followups";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "pipeline", label: "Pipeline", icon: KanbanSquare },
  { id: "followups", label: "Follow-ups", icon: ListChecks },
];

function ComercialPage() {
  const { currentProperty: property } = useProperty();
  const router = useRouter();

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [channels, setChannels] = useState<CrmChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>(useTabParam(TABS.map((t) => t.id), "pipeline"));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [losing, setLosing] = useState<CrmLead | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const res = await fetch(`/api/admin/comercial?propertyId=${property.id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLeads(data.leads || []);
      setChannels(data.channels || []);
    } catch {
      toast.error("Erro ao carregar o pipeline.");
    } finally {
      setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => { load(); }, [load]);

  /** Recarrega e re-sincroniza o lead aberto no drawer. */
  const reload = useCallback(async (keepOpen?: { entityType: string; id: string }) => {
    if (!property?.id) return;
    const res = await fetch(`/api/admin/comercial?propertyId=${property.id}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    const fresh: CrmLead[] = data.leads || [];
    setLeads(fresh);
    setChannels(data.channels || []);
    if (keepOpen) {
      setSelected(fresh.find((l) => l.entityType === keepOpen.entityType && l.id === keepOpen.id) ?? null);
    }
  }, [property?.id]);

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = norm(search);
    return leads.filter((l) => norm(`${l.title} ${l.phone || ""} ${l.email || ""}`).includes(q));
  }, [leads, search]);

  const quoteLeads = filtered.filter((l) => l.entityType === "quote");
  const weddingLeads = filtered.filter((l) => l.entityType === "wedding");

  // ── KPIs de topo ────────────────────────────────────────────────────────────
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

  // ── Ações ───────────────────────────────────────────────────────────────────

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

  const moveStage = (lead: CrmLead, stage: string) => withBusy(lead, async () => {
    if (lead.entityType === "quote") await patchQuote(lead.id, { status: stage });
    else await patchWedding(lead.id, { status: stage });
    await reload({ entityType: lead.entityType, id: lead.id });
    toast.success("Etapa atualizada.");
  });

  const win = (lead: CrmLead) => withBusy(lead, async () => {
    if (lead.entityType === "wedding") {
      await patchWedding(lead.id, { status: "confirmed" });
      await reload({ entityType: lead.entityType, id: lead.id });
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
    await reload({ entityType: lead.entityType, id: lead.id });
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

  if (!property) return null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Handshake className="text-primary" size={24} /> Comercial
          </h1>
          <p className="text-sm text-muted-foreground">
            Pipeline dos leads da fazenda — reservas e casamentos num lugar só.
          </p>
        </div>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}>
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
              {id === "followups" && kpis.overdueCount > 0 && (
                <span className="text-[10px] font-black bg-red-500 text-white rounded-full px-1.5">
                  {kpis.overdueCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Em negociação</p>
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="field-input !pl-9" placeholder="Buscar por nome, telefone, e-mail…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }} disabled={loading}>
          {loading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={20} /> Carregando pipeline…
        </div>
      ) : tab === "pipeline" ? (
        <div className="space-y-8">
          <PipelineBoard title="Reservas" icon={<CalendarDays size={16} className="text-primary" />}
            stages={QUOTE_STAGES} leads={quoteLeads} channels={channels} onOpen={setSelected} />
          <PipelineBoard title="Casamentos" icon={<Heart size={16} className="text-pink-500" />}
            stages={WEDDING_STAGES} leads={weddingLeads} channels={channels} onOpen={setSelected} />
        </div>
      ) : (
        <FollowUpQueue leads={filtered} busyId={busyId}
          onOpen={setSelected} onQuickContact={(l) => followUp(l, "")} />
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

export default function ComercialPageGuarded() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "reception"]}>
      <ComercialPage />
    </RoleGuard>
  );
}
