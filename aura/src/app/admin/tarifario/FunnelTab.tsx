// Aba Funil — CRM leve dos orçamentos salvos: colunas por estágio
// (Aberto → Enviado → Negociando → Ganho | Perdido), métricas por coluna e
// conversão em estadia (cria/vincula o hóspede e abre /admin/stays/new).
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Baby, CalendarClock, CalendarDays, Check, Heart, Link2, Loader2,
  PawPrint, Pencil, Phone, RefreshCw, Search, StickyNote, Tag, Trash2, Users, X,
} from "lucide-react";
import { CRM_LOST_REASONS_QUOTE, Guest, RateQuoteRecord, RateQuoteStatus } from "@/types/aura";
import { GuestService } from "@/services/guest-service";
import type { RateBundle } from "@/services/rate-service";
import { dateToIso, formatBRL, formatDateBR, nightsBetween, resolveQuoteValue } from "@/lib/rate-engine";

interface Props {
  propertyId: string;
  bundle: RateBundle;
  /** Aba visível (refaz o fetch ao entrar). */
  active: boolean;
  /** Incrementado quando a aba Orçamento salva algo novo. */
  refreshSignal: number;
  /** Reabre o orçamento na calculadora (aba Orçamento) com tudo hidratado. */
  onReopenQuote: (q: RateQuoteRecord) => void;
}

const STAGES: { id: RateQuoteStatus; label: string; dot: string }[] = [
  { id: "open", label: "Aberto", dot: "bg-blue-500" },
  { id: "sent", label: "Enviado", dot: "bg-cyan-500" },
  { id: "negotiating", label: "Negociando", dot: "bg-amber-500" },
  { id: "won", label: "Ganho", dot: "bg-emerald-500" },
  { id: "lost", label: "Perdido", dot: "bg-red-500" },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Regra única de valor (rate-engine) — a mesma do vínculo com estadia e KPIs. */
function quoteValue(q: RateQuoteRecord): { value: number; from: boolean } {
  const r = resolveQuoteValue(q);
  return { value: r.value, from: r.approximate };
}

/** Chave estável de um item do snapshot (id novo; nome nos dados antigos). */
const snapKey = (c: { categoryId?: string; category: string }) => c.categoryId || c.category;

export default function FunnelTab({ propertyId, bundle, active, refreshSignal, onReopenQuote }: Props) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<RateQuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RateQuoteRecord | null>(null);
  // Motivo de perda curado (substitui o prompt() antigo)
  const [losing, setLosing] = useState<RateQuoteRecord | null>(null);

  const channelLabel = (slug?: string | null) =>
    slug ? bundle.channels.find((c) => c.id === slug)?.label ?? slug : undefined;
  const todayIso = dateToIso(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tarifario/quotes?propertyId=${propertyId}`);
      const data = res.ok ? await res.json() : { quotes: [] };
      setQuotes(Array.isArray(data.quotes) ? data.quotes : []);
    } catch {
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (active) load();
  }, [active, refreshSignal, load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return quotes;
    const q = norm(search);
    return quotes.filter((r) =>
      norm(`${r.clientName || ""} ${r.clientDocument || ""} ${r.clientPhone || ""} ${r.clientEmail || ""}`).includes(q)
    );
  }, [quotes, search]);

  const byStage = useMemo(() => {
    const map = new Map<RateQuoteStatus, RateQuoteRecord[]>();
    for (const s of STAGES) map.set(s.id, []);
    for (const r of filtered) map.get(r.status)?.push(r);
    return map;
  }, [filtered]);

  const patchQuote = async (id: string, patch: Partial<RateQuoteRecord>) => {
    const res = await fetch("/api/admin/tarifario/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, id, patch }),
    });
    if (!res.ok) throw new Error();
  };

  const moveStage = async (r: RateQuoteRecord, status: RateQuoteStatus) => {
    if (status === r.status) return;
    setBusyId(r.id);
    try {
      if (status === "won") {
        const res = await fetch("/api/admin/tarifario/quotes/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, id: r.id }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error);
        await load();
        toast.success(data.guestId ? "Ganhou! Hóspede vinculado." : "Ganhou! (sem CPF para criar o hóspede)");
        if (confirm("Criar a estadia agora, já pré-preenchida?")) {
          const params = new URLSearchParams({
            checkIn: data.checkIn,
            checkOut: data.checkOut,
            quoteId: r.id, // fecha o ciclo: a estadia criada volta vinculada ao orçamento
          });
          if (data.guestId) params.set("guestId", data.guestId);
          router.push(`/admin/stays/new?${params}`);
        }
        return;
      }
      if (status === "lost") {
        setLosing(r); // modal com motivos curados — o PATCH sai de lá
        return;
      }
      await patchQuote(r.id, { status });
      await load();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao mover o orçamento.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: RateQuoteRecord) => {
    if (!confirm(`Excluir o orçamento de "${r.clientName || "sem nome"}"?`)) return;
    try {
      const res = await fetch(`/api/admin/tarifario/quotes?id=${r.id}&propertyId=${propertyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Orçamento excluído.");
      setSelected(null);
      await load();
    } catch {
      toast.error("Erro ao excluir (verifique sua permissão).");
    }
  };

  const weddingLabel = (id?: string | null) =>
    id ? bundle.weddings.find((w) => w.id === id)?.couple : undefined;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-foreground flex items-center gap-2 flex-wrap">
        <span>🤝 O funil completo — reservas + casamentos, fila de follow-ups e histórico — agora vive em</span>
        <button className="font-bold text-primary underline underline-offset-4"
          onClick={() => router.push("/admin/comercial")}>
          Comercial →
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="field-input !pl-9" placeholder="Buscar por nome, CPF, telefone…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RefreshCw size={14} className="mr-1" />}
          Atualizar
        </Button>
      </div>

      {loading && quotes.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando funil…
        </div>
      ) : quotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-14 text-center text-muted-foreground">
          <Users size={32} className="mx-auto mb-3 opacity-40" />
          <p>Nenhum orçamento no funil ainda.</p>
          <p className="text-xs mt-1">Preencha o cliente na aba Orçamento e salve — ou copie o WhatsApp.</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const rows = byStage.get(stage.id) || [];
            const total = rows.reduce((sum, r) => sum + quoteValue(r).value, 0);
            return (
              <div key={stage.id} className="w-[250px] shrink-0">
                <div className="flex items-center gap-2 px-1 mb-2">
                  <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  <span className="text-sm font-bold text-foreground">{stage.label}</span>
                  <span className="text-xs text-muted-foreground">({rows.length})</span>
                  {total > 0 && (
                    <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
                      R$ {formatBRL(total)}
                    </span>
                  )}
                </div>
                <div className="space-y-2 min-h-[120px] bg-secondary/30 rounded-xl p-2">
                  {rows.map((r) => {
                    const v = quoteValue(r);
                    const nights = nightsBetween(r.checkIn, r.checkOut);
                    const wedding = weddingLabel(r.weddingId);
                    return (
                      <button key={r.id} onClick={() => setSelected(r)}
                        className="w-full text-left bg-card border border-border rounded-xl p-3 space-y-1.5 hover:border-foreground/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {r.clientName || "Sem nome"}
                          </p>
                          {busyId === r.id && <Loader2 size={13} className="animate-spin shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays size={11} />
                          {formatDateBR(r.checkIn)} → {formatDateBR(r.checkOut)} · {nights}n
                        </p>
                        {r.clientPhone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone size={11} /> {r.clientPhone}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {v.value > 0 && (
                            <span className="text-xs font-bold text-foreground">
                              {v.from ? "a partir de " : ""}R$ {formatBRL(v.value)}
                            </span>
                          )}
                          {r.selectedCategory && (
                            <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5">{r.selectedCategory}</span>
                          )}
                          {wedding && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 inline-flex items-center gap-0.5">
                              <Heart size={9} /> {wedding}
                            </span>
                          )}
                          {r.guestId && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 inline-flex items-center gap-0.5">
                              <Check size={9} /> hóspede
                            </span>
                          )}
                          {r.source && (
                            <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5 inline-flex items-center gap-0.5">
                              <Tag size={9} /> {channelLabel(r.source)}
                            </span>
                          )}
                          {r.status !== "won" && r.status !== "lost" &&
                            ((r.expiresAt && r.expiresAt < todayIso) ||
                             (r.followUpAt && r.followUpAt <= todayIso)) && (
                            <span className={`text-[10px] rounded-full px-2 py-0.5 inline-flex items-center gap-0.5 ${
                              r.expiresAt && r.expiresAt < todayIso
                                ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                            }`}>
                              <CalendarClock size={9} />
                              {r.expiresAt && r.expiresAt < todayIso ? "prazo vencido" : "follow-up"}
                            </span>
                          )}
                          {r.notes && <StickyNote size={11} className="text-muted-foreground" />}
                          {r.pets > 0 && <PawPrint size={11} className="text-muted-foreground" />}
                          {r.babies > 0 && <Baby size={11} className="text-muted-foreground" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {r.createdByName || "—"} · {formatDateBR((r.createdAt || "").slice(0, 10))}
                        </p>
                      </button>
                    );
                  })}
                  {rows.length === 0 && (
                    <p className="text-center text-[11px] text-muted-foreground py-6">vazio</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <QuoteDetailModal
          propertyId={propertyId}
          quote={selected}
          weddingLabel={weddingLabel(selected.weddingId)}
          busy={busyId === selected.id}
          onClose={() => setSelected(null)}
          onMoveStage={(status) => { setSelected(null); moveStage(selected, status); }}
          onDelete={() => remove(selected)}
          onSaved={async () => { setSelected(null); await load(); }}
          onReopen={() => { const q = selected; setSelected(null); onReopenQuote(q); }}
          patchQuote={patchQuote}
        />
      )}

      {losing && (
        <LostQuoteModal
          quote={losing}
          busy={busyId === losing.id}
          onCancel={() => setLosing(null)}
          onConfirm={async (reason) => {
            setBusyId(losing.id);
            try {
              await patchQuote(losing.id, { status: "lost", lostReason: reason });
              setLosing(null);
              await load();
            } catch {
              toast.error("Erro ao arquivar o orçamento.");
            } finally {
              setBusyId(null);
            }
          }}
        />
      )}
    </div>
  );
}

// ── Modal de perda com motivos curados (vira dado de KPI, não texto solto) ──

function LostQuoteModal({ quote, busy, onCancel, onConfirm }: {
  quote: RateQuoteRecord;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const final = reason === "__outro__" ? custom.trim() : reason;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="bg-background rounded-2xl w-full max-w-md p-5 space-y-3">
        <h3 className="font-bold text-foreground">Arquivar orçamento perdido</h3>
        <p className="text-xs text-muted-foreground">
          {quote.clientName || "Sem nome"} · {formatDateBR(quote.checkIn)} → {formatDateBR(quote.checkOut)}
        </p>
        <div className="space-y-1.5">
          {[...CRM_LOST_REASONS_QUOTE, "__outro__"].map((r) => (
            <label key={r}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                reason === r ? "border-red-300 bg-red-50" : "border-border bg-card hover:border-foreground/30"
              }`}>
              <input type="radio" name="quote-lost" checked={reason === r} onChange={() => setReason(r)} />
              {r === "__outro__" ? "Outro motivo…" : r}
            </label>
          ))}
          {reason === "__outro__" && (
            <input autoFocus className="field-input" placeholder="Descreva o motivo"
              value={custom} onChange={(e) => setCustom(e.target.value)} />
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="outline" className="text-red-600" disabled={!final || busy}
            onClick={() => onConfirm(final)}>
            {busy && <Loader2 size={13} className="mr-1 animate-spin" />} Arquivar como perdido
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de detalhes/edição ─────────────────────────────────────────────────

function QuoteDetailModal({
  propertyId, quote, weddingLabel, busy, onClose, onMoveStage, onDelete, onSaved, onReopen, patchQuote,
}: {
  propertyId: string;
  quote: RateQuoteRecord;
  weddingLabel?: string;
  busy: boolean;
  onClose: () => void;
  onMoveStage: (s: RateQuoteStatus) => void;
  onDelete: () => void;
  onSaved: () => Promise<void>;
  onReopen: () => void;
  patchQuote: (id: string, patch: Partial<RateQuoteRecord>) => Promise<void>;
}) {
  const [clientName, setClientName] = useState(quote.clientName || "");
  const [clientDocument, setClientDocument] = useState(quote.clientDocument || "");
  const [clientPhone, setClientPhone] = useState(quote.clientPhone || "");
  const [clientEmail, setClientEmail] = useState(quote.clientEmail || "");
  const [selectedCategory, setSelectedCategory] = useState(quote.selectedCategory || "");
  const [notes, setNotes] = useState(quote.notes || "");
  const [guestId, setGuestId] = useState(quote.guestId || "");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestResults, setGuestResults] = useState<Guest[]>([]);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vínculo manual com estadia (fecha o elo que antes só existia via "won")
  const [linkOptions, setLinkOptions] = useState<{ id: string; label: string }[]>([]);
  const [linkChoice, setLinkChoice] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (quote.stayId) return;
    fetch(`/api/admin/tarifario/quotes/link-stay?propertyId=${propertyId}&checkIn=${quote.checkIn}`)
      .then((r) => (r.ok ? r.json() : { stays: [] }))
      .then((d) => setLinkOptions(d.stays || []))
      .catch(() => {});
  }, [propertyId, quote.stayId, quote.checkIn]);

  const linkStay = async () => {
    if (!linkChoice) return;
    setLinking(true);
    try {
      const res = await fetch("/api/admin/tarifario/quotes/link-stay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, quoteId: quote.id, stayId: linkChoice }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      toast.success(
        data?.nightlyRate
          ? `Estadia vinculada — diária de R$ ${Number(data.nightlyRate).toFixed(2)} programada.`
          : "Estadia vinculada ao orçamento."
      );
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao vincular a estadia.");
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (guestQuery.trim().length < 2) { setGuestResults([]); return; }
    debounce.current = setTimeout(async () => {
      const data = await GuestService.listGuests(propertyId, guestQuery.trim());
      setGuestResults(data.slice(0, 5));
    }, 300);
  }, [guestQuery, propertyId]);

  const nights = nightsBetween(quote.checkIn, quote.checkOut);

  const save = async () => {
    setSaving(true);
    try {
      // Compat: selectedCategory pode ser id (novo) ou nome (registros antigos).
      const chosen = (quote.snapshot || []).find(
        (c) => snapKey(c) === selectedCategory || c.category === selectedCategory
      );
      await patchQuote(quote.id, {
        clientName: clientName || null,
        clientDocument: clientDocument || null,
        clientPhone: clientPhone || null,
        clientEmail: clientEmail || null,
        guestId: guestId || null,
        selectedCategory: chosen ? snapKey(chosen) : null,
        finalValue: chosen ? chosen.finalTotal : null,
        notes: notes || null,
      });
      toast.success("Orçamento atualizado.");
      await onSaved();
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-bold text-lg text-foreground">{quote.clientName || "Orçamento sem nome"}</h3>
            <p className="text-xs text-muted-foreground">
              {formatDateBR(quote.checkIn)} → {formatDateBR(quote.checkOut)} · {nights} noite{nights > 1 ? "s" : ""} ·{" "}
              {quote.adults}A {quote.children}C {quote.babies}B {quote.pets}🐾
              {weddingLabel && <> · 💍 {weddingLabel}</>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Estágio */}
          <div>
            <label className="field-label">Estágio do funil</label>
            <div className="flex gap-1.5 flex-wrap">
              {STAGES.map((s) => (
                <button key={s.id} disabled={busy}
                  onClick={() => s.id !== quote.status && onMoveStage(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    quote.status === s.id
                      ? "bg-foreground text-background border-foreground"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            {quote.status === "lost" && quote.lostReason && (
              <p className="text-xs text-red-500 mt-1">Motivo: {quote.lostReason}</p>
            )}
          </div>

          {/* Cliente */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">Nome</label>
              <input className="field-input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">CPF / documento</label>
              <input className="field-input" value={clientDocument} onChange={(e) => setClientDocument(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Telefone</label>
              <input className="field-input" value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <label className="field-label">E-mail</label>
              <input className="field-input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
          </div>

          {/* Vínculo com hóspede */}
          <div className="relative">
            <label className="field-label">Hóspede vinculado</label>
            {guestId ? (
              <div className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
                <Check size={14} /> <span className="font-mono text-xs">{guestId}</span>
                <button className="ml-auto hover:text-red-600" onClick={() => setGuestId("")} title="Desvincular">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <input className="field-input" placeholder="Buscar hóspede para vincular…"
                  value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} />
                {guestResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-xl shadow-xl overflow-hidden">
                    {guestResults.map((g) => (
                      <button key={g.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-secondary"
                        onClick={() => { setGuestId(g.id); setGuestQuery(""); setGuestResults([]); }}>
                        <span className="font-semibold">{g.fullName}</span>
                        <span className="text-xs text-muted-foreground"> · {g.document?.number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Estadia (elo com o financeiro: gera as diárias no fólio) */}
          <div>
            <label className="field-label">Estadia</label>
            {quote.stayId ? (
              <div className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
                <Link2 size={14} className="shrink-0" />
                <span>Vinculada · <span className="font-mono text-xs">{quote.stayId.slice(0, 8)}</span></span>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <select className="field-input flex-1" value={linkChoice}
                    onChange={(e) => setLinkChoice(e.target.value)}>
                    <option value="">Vincular a uma estadia existente…</option>
                    {linkOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <Button variant="outline" size="sm" disabled={!linkChoice || linking} onClick={linkStay}>
                    {linking ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                  </Button>
                </div>
                {linkOptions.length === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <AlertTriangle size={11} /> Nenhuma estadia com check-in perto de {formatDateBR(quote.checkIn)}.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Opções congeladas no orçamento */}
          <div>
            <label className="field-label">Opções orçadas (preço congelado) — marque a escolhida</label>
            <div className="space-y-1.5">
              {(quote.snapshot || []).map((c) => {
                const isChosen = selectedCategory === snapKey(c) || selectedCategory === c.category;
                return (
                  <label key={snapKey(c)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                      isChosen
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-border bg-card hover:border-foreground/30"
                    }`}>
                    <input type="radio" name="cat" checked={isChosen}
                      onChange={() => setSelectedCategory(snapKey(c))} />
                    <span className="flex-1">{c.category}</span>
                    <b>R$ {formatBRL(c.finalTotal)}</b>
                  </label>
                );
              })}
              {selectedCategory && (
                <button className="text-xs text-muted-foreground underline"
                  onClick={() => setSelectedCategory("")}>
                  limpar escolha
                </button>
              )}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="field-label">Notas</label>
            <textarea className="field-input !h-20" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Contexto da negociação, follow-ups…" />
          </div>
        </div>

        <div className="flex items-center gap-2 p-5 border-t border-border flex-wrap">
          <Button variant="outline" size="sm" className="text-red-600" onClick={onDelete}>
            <Trash2 size={13} className="mr-1" /> Excluir
          </Button>
          <Button variant="outline" size="sm" onClick={onReopen}>
            <Pencil size={13} className="mr-1" /> Reabrir na calculadora
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 size={14} className="mr-1 animate-spin" />} Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
