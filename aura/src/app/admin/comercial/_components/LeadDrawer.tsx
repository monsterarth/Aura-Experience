// Painel de detalhe do lead no hub: contato, prazos, ações comerciais e a
// timeline do histórico. As ações reusam os endpoints existentes de cada
// funil. Visual: identidade do admin (dark glass — ver src/app/admin/CLAUDE.md).
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, BedDouble, CalendarClock, CalendarDays, ChevronDown, ChevronUp,
  CopyPlus, ExternalLink, GripVertical, Heart, Instagram, Link2, Loader2, Mail,
  MessageSquare, Pencil, Phone, Save, Send, Tag, Trash2, X, XCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { T } from "@/lib/admin-tokens";
import { instagramDisplay, instagramUrl } from "@/lib/instagram";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { offeredTotal, resolveRoomValue, roomDisplayName } from "@/lib/rate-engine";
import { parseMoneyBR, moneyToInput } from "@/lib/parse-money";
import { CrmChannel, CrmLead, RateQuoteRecord, RateQuoteRoom, WeddingInstallment } from "@/types/aura";
import { ClientPanel } from "./ClientPanel";
import { IntakePanel } from "./IntakePanel";
import type { PromotePayload } from "./PromoteGuestModal";
import { InteractionTimeline } from "./InteractionTimeline";
import { LeadAlarms } from "./LeadAlarms";
import { S, QUOTE_STAGES, WEDDING_STAGES, ACTIVE_STAGES, fmtBR, money, pillS, todayIso } from "./shared";
import { Dialog, IconButton, useIsMobile } from "@/components/aura";

const drawerLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase",
  color: T.muted, margin: 0,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: T.muted, marginBottom: 5, display: "block",
};

/** Setinha de ordem (toque e teclado, onde arrastar não vale). */
const orderArrowS = (off: boolean): React.CSSProperties => ({
  padding: 0, height: 11, display: "flex", alignItems: "center", justifyContent: "center",
  background: "none", border: "none", fontFamily: "inherit",
  cursor: off ? "default" : "pointer", color: T.muted2, opacity: off ? 0.25 : 1,
});

const contactBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800,
  background: T.glass2, border: `1px solid ${T.border2}`, color: T.text,
  borderRadius: 10, padding: "7px 11px", cursor: "pointer", fontFamily: "inherit",
  textDecoration: "none",
};

/**
 * "Orçamento" (só orçamentos): as ACOMODAÇÕES pedidas e, dentro de cada uma,
 * as cabanas oferecidas — sem precisar pular para o Tarifário. Escolher pede
 * confirmação e dá para desfazer (o × ao lado da escolhida): antes um clique
 * definia a escolha sem volta. A gravação passa por `select-room`, que valida
 * a opção no servidor — preço nunca vem do cliente.
 */
function QuoteSnapshot({ propertyId, lead, busy, active, onChanged, onEdit, onDuplicate, onLoaded }: {
  propertyId: string;
  lead: CrmLead;
  busy: boolean;
  active: boolean;
  /** Escolha gravada — a página recarrega o pipeline (valor do card muda). */
  onChanged: () => void;
  onEdit: (quote: RateQuoteRecord) => void;
  onDuplicate: (quote: RateQuoteRecord) => void;
  /** Avisa o drawer se o orçamento tem acomodações (o valor global some). */
  onLoaded?: (hasRooms: boolean) => void;
}) {
  const [quote, setQuote] = useState<RateQuoteRecord | null>(null);
  const [confirming, setConfirming] = useState<{ roomId: string; categoryId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  /** Cabana com o preço em edição (acomodação + categoria) + rascunho. */
  const [editingPrice, setEditingPrice] = useState<{ roomId: string; categoryId: string } | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  /** Arrasto da ordem das acomodações (a mesma que o cliente lê no link). */
  const [dragRoomId, setDragRoomId] = useState<string | null>(null);
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setQuote(null);
    setConfirming(null);
    fetch(`/api/admin/tarifario/quotes?propertyId=${propertyId}&id=${lead.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setQuote(d?.quote ?? null);
        onLoaded?.(!!d?.quote?.rooms?.length);
      })
      .catch(() => { if (alive) setQuote(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, lead.id]);

  if (!quote) return null;

  // Orçamento anterior à fase 3: o snapshot vira uma acomodação única.
  const rooms: RateQuoteRoom[] = quote.rooms && quote.rooms.length > 0
    ? quote.rooms
    : (quote.snapshot?.length ? [{
        id: "legacy", label: null,
        adults: quote.adults, children: quote.children, babies: quote.babies, pets: quote.pets,
        options: quote.snapshot, selectedCategory: quote.selectedCategory ?? null,
      }] : []);
  if (rooms.length === 0) return null;

  /** Grava a mudança da acomodação (escolha e/ou preço de uma cabana). */
  const patchRoom = async (
    roomId: string,
    patch: { categoryId?: string | null; price?: { categoryId: string; value: number | null } },
    okMsg: string,
  ) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/quotes/select-room", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, id: quote.id, roomId, ...patch }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error);
      setQuote(d.quote);
      setConfirming(null);
      setEditingPrice(null);
      onChanged();
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao gravar.");
    } finally {
      setSaving(false);
    }
  };

  const commit = (roomId: string, categoryId: string | null) =>
    patchRoom(roomId, { categoryId }, categoryId ? "Cabana escolhida." : "Escolha desfeita.");

  /**
   * Grava a nova ordem. Otimista: a lista já muda no clique/solta (arrastar e
   * ver a peça voltar para o lugar enquanto salva é pior que não arrastar);
   * se o servidor recusar, volta ao que estava e diz o porquê.
   */
  const saveOrder = async (nextRooms: RateQuoteRoom[]) => {
    const before = quote.rooms ?? [];
    setQuote({ ...quote, rooms: nextRooms });
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/quotes/reorder-rooms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId, id: quote.id, roomIds: nextRooms.map((r) => r.id),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error);
      setQuote(d.quote);
      onChanged();
    } catch (e) {
      setQuote({ ...quote, rooms: before });
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao reordenar.");
    } finally {
      setSaving(false);
    }
  };

  const moveRoom = (roomId: string, delta: -1 | 1) => {
    const i = rooms.findIndex((r) => r.id === roomId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= rooms.length) return;
    const next = [...rooms];
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    saveOrder(next);
  };

  const dropRoom = (targetId: string) => {
    if (!dragRoomId || dragRoomId === targetId) return;
    const from = rooms.findIndex((r) => r.id === dragRoomId);
    const to = rooms.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...rooms];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveOrder(next);
  };

  /** Preço oferecido DESTA cabana; vazio/0 volta ao valor do tarifário. */
  const commitPrice = (roomId: string, categoryId: string) => {
    const v = parseMoneyBR(priceDraft);
    const value = Number.isFinite(v) && v > 0 ? v : null;
    patchRoom(roomId, { price: { categoryId, value } },
      value ? "Preço oferecido atualizado." : "Cabana voltou ao valor de tabela.");
  };

  const nights = rooms[0]?.options[0]?.nights ?? 0;
  const totalPax = rooms.reduce((s, r) => s + r.adults + r.children, 0);
  const busyAll = busy || saving;

  // Períodos mistos (chegada escalonada): a data sai do resumo e passa a
  // aparecer em TODAS as acomodações — inclusive a que casa com o span.
  const periodKey = (r: RateQuoteRoom) =>
    `${r.checkIn || quote.checkIn}|${r.checkOut || quote.checkOut}`;
  const mixedPeriods = new Set(rooms.map(periodKey)).size > 1;

  return (
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={drawerLabel}>Orçamento</p>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => onEdit(quote)} disabled={busyAll}
            title="Recalcular este orçamento (datas, pessoas, descontos)"
            style={{ ...S.ghostBtn, padding: "5px 10px", fontSize: 11 }}>
            <Pencil size={11} /> Editar
          </button>
          <button onClick={() => onDuplicate(quote)} disabled={busyAll}
            title="Criar OUTRO orçamento para o mesmo cliente (este fica intacto)"
            style={{ ...S.ghostBtn, padding: "5px 10px", fontSize: 11 }}>
            <CopyPlus size={11} /> Nova cotação
          </button>
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: T.muted, margin: 0 }}>
        {mixedPeriods
          ? `Datas por acomodação · entre ${fmtBR(quote.checkIn)} e ${fmtBR(quote.checkOut)}`
          : `${fmtBR(quote.checkIn)} → ${fmtBR(quote.checkOut)} · ${nights} noite${nights !== 1 ? "s" : ""}`}
        {" · "}{rooms.length} acomodaç{rooms.length > 1 ? "ões" : "ão"} · {totalPax} pagante{totalPax !== 1 ? "s" : ""}
        {active && rooms.length > 1 && (
          <span style={{ color: T.muted2 }}> · arraste para ordenar como o cliente vê no link</span>
        )}
      </p>

      {rooms.map((room, i) => {
        // Com várias, a de opção única leva o NOME da cabana (roomDisplayName).
        const label = rooms.length > 1
          ? roomDisplayName(room, i)
          : room.label?.trim() || "Cabanas oferecidas";
        const roomNights = room.options[0]?.nights ?? 0;
        // Ordenar é edição comercial: só em lead ativo e com mais de uma.
        const sortable = active && rooms.length > 1;
        return (
          <div key={room.id}
            onDragOver={(e) => {
              if (!dragRoomId || dragRoomId === room.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverRoomId !== room.id) setDragOverRoomId(room.id);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOverRoomId((cur) => (cur === room.id ? null : cur));
            }}
            onDrop={(e) => {
              e.preventDefault();
              dropRoom(room.id);
              setDragRoomId(null);
              setDragOverRoomId(null);
            }}
            style={{
              display: "flex", flexDirection: "column", gap: 6, borderRadius: 10,
              opacity: dragRoomId === room.id ? 0.55 : 1,
              outline: dragOverRoomId === room.id ? `2px dashed ${T.g1Border}` : "none",
              outlineOffset: 5,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {sortable && (
                <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                  <span draggable={!busyAll}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", room.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragRoomId(room.id);
                    }}
                    onDragEnd={() => { setDragRoomId(null); setDragOverRoomId(null); }}
                    title="Arraste para mudar a ordem — é a ordem que o cliente vê no link"
                    style={{ display: "flex", cursor: busyAll ? "default" : "grab", color: T.muted2 }}>
                    <GripVertical size={13} />
                  </span>
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <button onClick={() => moveRoom(room.id, -1)} disabled={busyAll || i === 0}
                      title="Subir na ordem" style={orderArrowS(busyAll || i === 0)}>
                      <ChevronUp size={10} />
                    </button>
                    <button onClick={() => moveRoom(room.id, 1)} disabled={busyAll || i === rooms.length - 1}
                      title="Descer na ordem" style={orderArrowS(busyAll || i === rooms.length - 1)}>
                      <ChevronDown size={10} />
                    </button>
                  </span>
                </span>
              )}
              <span style={{ fontSize: 11.5, fontWeight: 800, color: T.text }}>{label}</span>
              <span style={{ fontSize: 10.5, color: T.muted }}>
                {room.adults + room.children} pagante{room.adults + room.children !== 1 ? "s" : ""}
                {room.babies > 0 ? ` · ${room.babies} isento${room.babies > 1 ? "s" : ""}` : ""}
                {room.pets > 0 ? ` · ${room.pets} pet${room.pets > 1 ? "s" : ""}` : ""}
              </span>
              {mixedPeriods && (
                <span style={{ ...pillS(T.gradSoft, T.g1, T.g1Border), fontSize: 9 }}>
                  {fmtBR(room.checkIn || quote.checkIn)} → {fmtBR(room.checkOut || quote.checkOut)}
                  {roomNights > 0 ? ` · ${roomNights}n` : ""}
                </span>
              )}
              {room.allowOverCapacity && (
                <span style={{ ...pillS(T.amberBg, T.amber, T.amberBorder), fontSize: 9, gap: 3 }}>
                  <AlertTriangle size={9} /> exceção de capacidade
                </span>
              )}
            </div>
            {room.allowOverCapacity && room.overCapacityReason && (
              <p style={{ fontSize: 10.5, color: T.amber, margin: 0, lineHeight: 1.45 }}>
                Justificativa: {room.overCapacityReason}
              </p>
            )}
            {room.options.map((c) => {
              const key = c.categoryId || c.category;
              const chosen = room.selectedCategory === c.categoryId || room.selectedCategory === c.category;
              const asking = confirming?.roomId === room.id && confirming.categoryId === key;
              const editing = editingPrice?.roomId === room.id && editingPrice.categoryId === key;
              // Preço oferecido DESTA cabana: a negociação acontece aqui, uma
              // cabana por vez — o total do orçamento é consequência.
              const offered = offeredTotal(room, c);
              const custom = Math.abs(offered - c.finalTotal) > 0.5;
              // Riscado = o que o tarifário calculou (flutuação já embutida)
              // quando estamos oferecendo mais barato; sem oferta própria, o
              // riscado volta a ser o valor cheio antes dos descontos.
              const strike = custom
                ? (offered < c.finalTotal ? c.finalTotal : null)
                : (Math.abs(c.finalTotal - c.rawTotal) > 5 ? c.rawTotal : null);
              return (
                <div key={key}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: chosen ? T.gradSoft : T.glass,
                    border: `1px solid ${chosen ? T.g1Border : T.border}`,
                    borderRadius: 11, padding: "9px 12px", opacity: busyAll ? 0.6 : 1,
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.category}
                    </div>
                    <div style={{ fontSize: 10.5, color: T.muted }}>
                      média R$ {money(custom && c.nights > 0 ? offered / c.nights : c.avgNightly)}/noite
                      {custom ? " · preço oferecido" : ""}
                    </div>
                  </div>
                  {c.overCapacity && (
                    <span
                      title={`Sem preço para ${c.overCapacity.requestedPax} pessoas — cotada pela tabela de ${c.overCapacity.pricedPax}.`}
                      style={{ ...pillS(T.amberBg, T.amber, T.amberBorder), fontSize: 9, gap: 3, flexShrink: 0 }}>
                      <AlertTriangle size={9} /> exceção · tabela {c.overCapacity.pricedPax}p
                    </span>
                  )}

                  {editing ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                      <input autoFocus style={{ ...S.input, width: 108, padding: "4px 8px", fontSize: 11 }}
                        inputMode="decimal" placeholder={moneyToInput(c.finalTotal)}
                        value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitPrice(room.id, key);
                          if (e.key === "Escape") setEditingPrice(null);
                        }} />
                      <button onClick={() => commitPrice(room.id, key)} disabled={busyAll}
                        style={{ ...S.gradBtn, padding: "4px 10px", fontSize: 10.5, boxShadow: "none" }}>
                        {saving ? <Loader2 size={11} className="animate-spin" /> : "OK"}
                      </button>
                      <button onClick={() => setEditingPrice(null)}
                        style={{ ...S.ghostBtn, padding: "4px 8px", fontSize: 10.5 }}>
                        Cancelar
                      </button>
                    </span>
                  ) : (<>
                    {strike && !asking && (
                      <span style={{ fontSize: 11, color: T.muted2, textDecoration: "line-through", flexShrink: 0 }}>
                        R$ {money(strike)}
                      </span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 900, flexShrink: 0, color: custom ? T.amber : chosen ? T.g1 : T.text }}>
                      R$ {money(offered)}
                    </span>
                    {active && !asking && (
                      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                        <button onClick={() => { setPriceDraft(custom ? moneyToInput(offered) : ""); setEditingPrice({ roomId: room.id, categoryId: key }); }}
                          title="Oferecer outro valor para esta cabana" disabled={busyAll}
                          style={{ padding: 4, borderRadius: 7, background: "none", border: "none", color: custom ? T.amber : T.muted, cursor: "pointer", display: "flex" }}>
                          <Pencil size={11} />
                        </button>
                        {custom && (
                          <button onClick={() => patchRoom(room.id, { price: { categoryId: key, value: null } }, "Cabana voltou ao valor de tabela.")}
                            title="Voltar ao valor do tarifário" disabled={busyAll}
                            style={{ padding: 4, borderRadius: 7, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    )}
                  </>)}

                  {asking ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                      <span style={{ fontSize: 10.5, color: T.muted }}>Confirmar?</span>
                      <button onClick={() => commit(room.id, key)} disabled={busyAll}
                        style={{ ...S.gradBtn, padding: "4px 10px", fontSize: 10.5, boxShadow: "none" }}>
                        {saving ? <Loader2 size={11} className="animate-spin" /> : "Sim"}
                      </button>
                      <button onClick={() => setConfirming(null)} disabled={busyAll}
                        style={{ ...S.ghostBtn, padding: "4px 8px", fontSize: 10.5 }}>
                        Não
                      </button>
                    </span>
                  ) : chosen ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ ...pillS(T.gradSoft, T.g1, T.g1Border), fontSize: 9 }}>escolhida</span>
                      {active && (
                        <button onClick={() => commit(room.id, null)} disabled={busyAll}
                          title="Desfazer a escolha"
                          style={{ padding: 4, borderRadius: 7, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
                          <X size={12} />
                        </button>
                      )}
                    </span>
                  ) : active ? (
                    <button onClick={() => setConfirming({ roomId: room.id, categoryId: key })}
                      disabled={busyAll}
                      style={{
                        padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                        fontSize: 10, fontWeight: 800, flexShrink: 0,
                        border: `1px solid ${T.border2}`, background: "transparent", color: T.muted,
                      }}>
                      escolher
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}

      {(() => {
        const totals = rooms.map((r) => resolveRoomValue(r));
        const sum = totals.reduce((s, t) => s + t.value, 0);
        const approx = totals.some((t) => t.approximate);
        if (sum <= 0) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted }}>
              {approx ? "Total a partir de" : "Total do orçamento"}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 900, color: T.text }}>
              R$ {money(sum)}
            </span>
          </div>
        );
      })()}

      {lead.negotiatedValue != null && (
        <p style={{ fontSize: 10.5, color: T.muted, margin: 0 }}>
          Valor negociado vence a tabela — a escolha define a cabana, não o valor do lead.
        </p>
      )}
    </div>
  );
}

/**
 * "Cobranças do contrato" (só casamentos): as parcelas reais, read-only —
 * a gestão (editar/pagar) vive na aba financeiro do painel do casamento.
 * Falha do fetch (ex.: migration pendente) = seção não aparece.
 */
function ContractCharges({ lead }: { lead: CrmLead }) {
  const [items, setItems] = useState<WeddingInstallment[] | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    fetch(`/api/admin/weddings/${lead.id}/installments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setItems(d?.installments ?? null); })
      .catch(() => { if (alive) setItems(null); });
    return () => { alive = false; };
  }, [lead.id]);

  if (!items || items.length === 0) return null;

  const t = todayIso();
  const statusOf = (i: WeddingInstallment) =>
    i.paid ? { label: "paga", bg: T.greenBg, fg: T.green }
      : i.dueDate && i.dueDate < t ? { label: "vencida", bg: T.redBg, fg: T.red }
      : i.dueDate ? { label: "pendente", bg: T.amberBg, fg: T.amber }
      : { label: "aguarda", bg: T.glass3, fg: T.muted };

  return (
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={drawerLabel}>Cobranças do contrato</p>
      {items.map((i) => {
        const st = statusOf(i);
        return (
          <div key={i.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            background: T.glass, border: `1px solid ${T.border}`, borderRadius: 11, padding: "9px 12px",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: T.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {i.label}
              </p>
              <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>
                {i.dueDate ? `Vencimento ${fmtBR(i.dueDate)}` : "Sem vencimento combinado"}
              </p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 900, color: T.text, flexShrink: 0 }}>
              R$ {money(Number(i.value))}
            </span>
            <span style={{
              fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em",
              borderRadius: 999, padding: "3px 9px", background: st.bg, color: st.fg, flexShrink: 0,
            }}>
              {st.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Input de data que só grava no blur/Enter: patch a cada change disparava no
 * meio da digitação do ano (Chrome emite change assim que a data fica
 * "completa" — ex.: ano 0002), desabilitava o campo (busy) e persistia data
 * lixo. Datas antes de 2000 são descartadas como digitação incompleta.
 */
/** Rascunho da seção Negociação — nada vai ao servidor antes do Salvar. */
type NegDraft = {
  /** Texto em formato BR ("3.450,00"); vazio = volta ao valor de tabela. */
  negotiatedValue: string;
  source: string;
  followUpAt: string;
  expiresAt: string;
};

const negDraftFromLead = (lead: CrmLead): NegDraft => ({
  negotiatedValue: lead.negotiatedValue != null ? moneyToInput(lead.negotiatedValue) : "",
  source: lead.source ?? "",
  followUpAt: lead.followUpAt ?? "",
  expiresAt: lead.expiresAt ?? "",
});

/**
 * Seção "Negociação" (só orçamentos): valor negociado, canal de origem e
 * prazos. A recepção mexe SEM aval de gerente — o registro fica na timeline
 * (value_change) e na auditoria.
 *
 * Rascunho local + botão Salvar, nunca gravação por tecla ou por blur: sair do
 * campo sem querer não pode virar mudança de valor negociado. O que muda é o
 * que vai no PATCH — mandar o bloco inteiro carimbaria value_change à toa.
 *
 * Componente no topo do módulo de propósito: definido dentro do render
 * perderia o foco a cada tecla (pegadinha já vivida no form de casamentos).
 */
function NegotiationSection({
  lead, channels, busy, hideValue, onPatch, onDirtyChange,
}: {
  lead: CrmLead;
  channels: CrmChannel[];
  busy: boolean;
  /** Orçamento com acomodações: o valor é fechado POR acomodação, acima. */
  hideValue?: boolean;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  /** Avisa o drawer que há rascunho pendente (guarda do fechar). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<NegDraft>(() => negDraftFromLead(lead));
  const [saving, setSaving] = useState(false);

  // Só resincroniza quando o dado vem de FORA (outro lead, recarga) — não a
  // cada render, senão o que está sendo digitado seria apagado.
  const syncedTo = useRef(JSON.stringify(negDraftFromLead(lead)));
  useEffect(() => {
    const fresh = negDraftFromLead(lead);
    const key = JSON.stringify(fresh);
    if (syncedTo.current !== key) {
      syncedTo.current = key;
      setDraft(fresh);
    }
  }, [lead]);

  const saved = negDraftFromLead(lead);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  // Desmontar (drawer fechou por outro caminho) não pode deixar o aviso preso.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const patchDraft = <K extends keyof NegDraft>(key: K, value: NegDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    if (!isDirty || busy || saving) return;
    const patch: Record<string, unknown> = {};

    if (draft.negotiatedValue !== saved.negotiatedValue) {
      const v = parseMoneyBR(draft.negotiatedValue);
      patch.negotiatedValue = Number.isFinite(v) && v > 0 ? v : null;
    }
    if (draft.source !== saved.source) patch.source = draft.source || null;
    // Data absurda (o "0002-05-12" de quem digita o ano no campo errado) volta
    // ao que estava em vez de virar prazo.
    if (draft.followUpAt !== saved.followUpAt) {
      patch.followUpAt = draft.followUpAt && draft.followUpAt >= "2000-01-01" ? draft.followUpAt : null;
    }
    if (draft.expiresAt !== saved.expiresAt) {
      patch.expiresAt = draft.expiresAt && draft.expiresAt >= "2000-01-01" ? draft.expiresAt : null;
    }
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      await onPatch(patch);
    } finally {
      setSaving(false);
    }
  };

  const busyAll = busy || saving;

  return (
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <p style={drawerLabel}>Negociação</p>
        {isDirty && (
          <span style={{ ...pillS(T.amberBg, T.amber, T.amberBorder), fontSize: 9 }}>
            não salvo
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: hideValue ? "none" : undefined }}>
          <label style={fieldLabel}>Valor negociado</label>
          <input style={S.input} inputMode="decimal" disabled={busyAll}
            placeholder={lead.value > 0 ? `Tabela: ${money(lead.value)}` : "Ex.: 3450,00"}
            value={draft.negotiatedValue}
            onChange={(e) => patchDraft("negotiatedValue", e.target.value)} />
          <p style={{ fontSize: 10, color: T.muted2, margin: "4px 0 0" }}>
            {draft.negotiatedValue.trim()
              ? "Vence o valor de tabela."
              : lead.value > 0
                ? `Vazio = vale a tabela (${lead.valueApproximate ? "a partir de " : ""}R$ ${money(lead.value)}).`
                : "Vazio = vale a tabela."}
          </p>
        </div>
        <div>
          <label style={fieldLabel}>Canal de origem</label>
          <select style={{ ...S.input, background: T.card }} value={draft.source} disabled={busyAll}
            onChange={(e) => patchDraft("source", e.target.value)}>
            <option value="">—</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Próximo follow-up</label>
          <input type="date" style={S.input} value={draft.followUpAt} disabled={busyAll}
            onChange={(e) => patchDraft("followUpAt", e.target.value)} />
        </div>
        <div>
          <label style={fieldLabel}>Validade do lead</label>
          <input type="date" style={S.input} value={draft.expiresAt} disabled={busyAll}
            onChange={(e) => patchDraft("expiresAt", e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={save} disabled={!isDirty || busyAll}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
            borderRadius: 10, border: `1px solid ${isDirty ? T.g1Border : T.border}`,
            background: isDirty ? T.gradSoft : "transparent",
            color: isDirty ? T.g1 : T.muted, fontSize: 12, fontWeight: 800,
            cursor: isDirty && !busyAll ? "pointer" : "default", fontFamily: "inherit",
          }}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar
        </button>
        {isDirty && !saving && (
          <button onClick={() => setDraft(negDraftFromLead(lead))} disabled={busyAll}
            style={{
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 11, color: T.muted, textDecoration: "underline", textUnderlineOffset: 2,
              padding: 0,
            }}>
            descartar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Vínculo manual do orçamento com uma estadia já criada — paridade com o
 * funil antigo do Tarifário (o elo automático continua sendo o fluxo
 * "Ganhou" → nova estadia). Lista estadias do mesmo check-in via link-stay.
 */
function StayLinkSection({ propertyId, lead, onLinked }: {
  propertyId: string;
  lead: CrmLead;
  onLinked: () => void;
}) {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [choice, setChoice] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    let alive = true;
    setOptions([]);
    setChoice("");
    fetch(`/api/admin/tarifario/quotes/link-stay?propertyId=${propertyId}&checkIn=${lead.dateRef}`)
      .then((r) => (r.ok ? r.json() : { stays: [] }))
      .then((d) => { if (alive) setOptions(d.stays || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [propertyId, lead.id, lead.dateRef]);

  if (options.length === 0) return null;

  const link = async () => {
    if (!choice) return;
    setLinking(true);
    try {
      const res = await fetch("/api/admin/tarifario/quotes/link-stay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, quoteId: lead.id, stayId: choice }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      toast.success(data?.nightlyRate
        ? `Estadia vinculada — diária de R$ ${Number(data.nightlyRate).toFixed(2)} programada.`
        : "Estadia vinculada ao orçamento.");
      onLinked();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao vincular a estadia.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={drawerLabel}>Vincular estadia existente</p>
      <p style={{ fontSize: 11, color: T.muted, margin: 0, lineHeight: 1.5 }}>
        A reserva já foi criada por fora? Vincular marca o orçamento como ganho e
        programa a diária congelada na estadia.
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <select style={{ ...S.input, flex: 1, background: T.card }} value={choice}
          onChange={(e) => setChoice(e.target.value)} disabled={linking}>
          <option value="">Estadias com esse check-in…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button onClick={link} disabled={!choice || linking}
          style={{ ...S.gradBtn, padding: "8px 13px", fontSize: 12, opacity: !choice || linking ? 0.5 : 1 }}>
          {linking ? <Loader2 size={13} className="animate-spin" /> : <BedDouble size={13} />}
          Vincular
        </button>
      </div>
    </div>
  );
}

/** Excluir orçamento — confirm inline em 2 passos; a rota restringe a gestão. */
function DeleteQuoteSection({ propertyId, lead, busy, onDeleted }: {
  propertyId: string;
  lead: CrmLead;
  busy: boolean;
  onDeleted: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/tarifario/quotes?propertyId=${propertyId}&id=${lead.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      toast.success("Orçamento excluído.");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao excluir.");
      setDeleting(false);
      setAsking(false);
    }
  };

  return (
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {asking ? (<>
        <span style={{ fontSize: 11.5, color: T.red, fontWeight: 700 }}>
          Excluir o orçamento de {lead.title}? Sem volta.
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={doDelete} disabled={deleting}
            style={{
              padding: "5px 11px", borderRadius: 9, border: "none", cursor: "pointer",
              background: T.redBg, color: T.red, fontSize: 11, fontWeight: 800,
              fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5,
            }}>
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Excluir
          </button>
          <button onClick={() => setAsking(false)} disabled={deleting}
            style={{ ...S.ghostBtn, padding: "5px 9px", fontSize: 11 }}>
            Cancelar
          </button>
        </span>
      </>) : (<>
        <button onClick={() => setAsking(true)} disabled={busy}
          style={{
            background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 10.5, color: T.muted, textDecoration: "underline", textUnderlineOffset: 2,
            padding: 0, display: "inline-flex", alignItems: "center", gap: 5,
          }}>
          <Trash2 size={11} /> Excluir orçamento
        </button>
        {lead.stayId && (
          <span style={{ fontSize: 10, color: T.muted2 }}>
            a estadia vinculada continua existindo
          </span>
        )}
      </>)}
    </div>
  );
}

export function LeadDrawer({
  open = true,
  propertyId, lead, channels, busy,
  onClose, onFollowUp, onAddNote, onMoveStage, onMarkLost, onWin, onOpenOrigin, onPatch,
  onPromoteGuest, onAlarmsChanged, onEditQuote, onDuplicateQuote, onQuoteChanged,
  onDeleted, proposalUrl,
}: {
  open?: boolean;
  propertyId: string;
  lead: CrmLead;
  channels: CrmChannel[];
  busy: boolean;
  onClose: () => void;
  onFollowUp: (note: string) => Promise<void>;
  onAddNote: (note: string) => Promise<void>;
  onMoveStage: (stage: string) => Promise<void>;
  onMarkLost: () => void;
  onWin: () => void;
  onOpenOrigin: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onPromoteGuest: (payload: PromotePayload) => Promise<void>;
  onAlarmsChanged?: () => void;
  /** Reabre o wizard recalculando ESTE orçamento. */
  onEditQuote?: (quote: RateQuoteRecord) => void;
  /** Abre o wizard com o cliente preenchido, criando um lead NOVO. */
  onDuplicateQuote?: (quote: RateQuoteRecord) => void;
  /** Escolha de cabana gravada — a página recarrega o pipeline. */
  onQuoteChanged?: () => void;
  /** Orçamento excluído — a página fecha o drawer e recarrega. */
  onDeleted?: () => void;
  /** Link público da proposta (/cotacao/<id>), quando disponível. */
  proposalUrl?: string | null;
}) {
  const { userData, isAdmin, isSuperAdmin } = useAuth();
  const canDelete = isSuperAdmin || isAdmin || userData?.role === "manager";
  const [note, setNote] = useState("");
  const [noteMode, setNoteMode] = useState<"follow_up" | "note">("follow_up");
  const [sending, setSending] = useState(false);
  // Timeline recarrega quando uma ação nossa muda o histórico
  const [timelineKey, setTimelineKey] = useState(0);
  // Com acomodações, o valor é fechado por acomodação (some o campo global).
  const [quoteHasRooms, setQuoteHasRooms] = useState(false);
  // Dados do cliente (ClientPanel) têm o próprio "Salvar" — fechar o drawer
  // com edição pendente ali precisa avisar, não descartar em silêncio.
  const [clientDirty, setClientDirty] = useState(false);
  const [negDirty, setNegDirty] = useState(false);
  const isMobile = useIsMobile();
  const { requestClose, guardProps } = useCloseGuard(onClose, {
    open, escape: false,
    dirty: clientDirty || negDirty,
    message: "Há alterações não salvas nos dados do cliente. Fechar mesmo assim?",
  });

  const isQuote = lead.entityType === "quote";
  const stages = isQuote ? QUOTE_STAGES : WEDDING_STAGES;
  const active = ACTIVE_STAGES.has(lead.stage);
  const stageDef = stages.find((s) => s.id === lead.stage);
  const channelLabel = lead.source
    ? channels.find((c) => c.id === lead.source)?.label ?? lead.source : null;

  const submitNote = async () => {
    if (!note.trim() && noteMode === "note") return;
    setSending(true);
    try {
      if (noteMode === "follow_up") await onFollowUp(note.trim());
      else await onAddNote(note.trim());
      setNote("");
      setTimelineKey((k) => k + 1);
    } finally {
      setSending(false);
    }
  };

  // Patch (valor/canal/prazos) muda o histórico → timeline recarrega junto.
  const patchAndRefresh = async (patch: Record<string, unknown>) => {
    await onPatch(patch);
    setTimelineKey((k) => k + 1);
  };

  const promoteAndRefresh = async (payload: PromotePayload) => {
    await onPromoteGuest(payload);
    setTimelineKey((k) => k + 1);
  };

  // Ganho exige ficha de hóspede (o servidor recusa de todo jeito) — melhor
  // dizer aqui do que deixar o clique virar erro.
  const needsGuest = isQuote && !lead.guestId;

  // Etapas intermediárias (won/lost têm fluxos próprios: onWin / onMarkLost)
  const moveTargets = stages.filter((s) =>
    s.id !== lead.stage && !["won", "lost", "completed", "cancelled"].includes(s.id)
  );

  const segBtn = (activeSeg: boolean): React.CSSProperties => ({
    textAlign: "center", padding: "7px 0", borderRadius: 9, border: "none",
    fontSize: 9, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase",
    cursor: "pointer", fontFamily: "inherit",
    background: activeSeg ? T.card : "transparent", boxShadow: activeSeg ? "0 1px 2px rgba(0,0,0,.08)" : "none",
    color: activeSeg ? T.text : T.muted,
  });

  return (
    <Dialog open={open} onClose={requestClose} presentation={isMobile ? "fullscreen" : "drawer"} size="lg" side="right" rawBody hideClose panelProps={guardProps} ariaLabel={lead.title}>
      {/* Duas colunas em tela larga: editar o orçamento pede espaço, e
          histórico/alarmes não precisam disputar scroll com o cliente. */}
      <style>{`
        .crm-drawer-body { display:flex; flex-direction:column; flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
        .crm-drawer-col-right { border-top: 1px solid ${T.border}; }
        @media (min-width: 1000px) {
          .crm-drawer-body { display:grid; grid-template-columns: 1fr 1fr; overflow:hidden; }
          .crm-drawer-col { overflow-y:auto; height:100%; }
          .crm-drawer-col-right { border-top:none; border-left: 1px solid ${T.border}; }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        {/* Header */}
        <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...drawerLabel, display: "flex", alignItems: "center", gap: 5 }}>
                {isQuote ? <><CalendarDays size={11} /> Orçamento de reserva</> : <><Heart size={11} /> Casamento</>}
              </p>
              <h2 style={{
                fontSize: 19, fontWeight: 900, color: T.text, margin: "3px 0 0",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {lead.title}
              </h2>
            </div>
            <IconButton icon={X} label="Fechar" variant="secondary" onClick={requestClose} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
            {stageDef && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800,
                color: T.text, background: T.glass2, borderRadius: 999, padding: "4px 10px",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: stageDef.dot }} /> {stageDef.label}
              </span>
            )}
            {lead.value > 0 && (
              <span style={{ fontWeight: 900, color: T.text }}>
                {lead.valueApproximate ? "a partir de " : ""}R$ {money(lead.value)}
              </span>
            )}
            {channelLabel && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: T.muted }}>
                <Tag size={11} /> {channelLabel}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12, color: T.muted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <CalendarDays size={11} />{isQuote ? "Check-in" : "Casamento"}:{" "}
              <b style={{ color: T.text }}>{fmtBR(lead.dateRef)}</b>
            </span>
            {active && lead.followUpAt && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CalendarClock size={11} />Follow-up: {fmtBR(lead.followUpAt)}
              </span>
            )}
            {active && lead.expiresAt && <span>Validade: {fmtBR(lead.expiresAt)}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {lead.phone && (
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                style={{
                  ...contactBtn, background: T.emeraldBg,
                  border: `1px solid ${T.emeraldBorder}`, color: T.emerald,
                }}>
                <Phone size={12} /> WhatsApp
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} style={contactBtn}>
                <Mail size={12} /> {lead.email}
              </a>
            )}
            {/* Lead de DM: o @ é o contato — abre o perfil direto. */}
            {instagramUrl(lead.instagram) && (
              <a href={instagramUrl(lead.instagram)!} target="_blank" rel="noreferrer"
                style={contactBtn}>
                <Instagram size={12} /> {instagramDisplay(lead.instagram)}
              </a>
            )}
            {/* Orçamento vive AQUI (editar = wizard); só casamento tem tela própria. */}
            {!isQuote && (
              <button onClick={onOpenOrigin} style={contactBtn}>
                <ExternalLink size={12} /> Abrir em Casamentos
              </button>
            )}
            {isQuote && proposalUrl && (
              <button style={contactBtn}
                title="Link da proposta para o cliente escolher e aceitar"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(proposalUrl);
                    toast.success("Link da proposta copiado!");
                  } catch {
                    toast.error("Não foi possível copiar o link.");
                  }
                }}>
                <Link2 size={12} /> Copiar link da proposta
              </button>
            )}
          </div>
        </div>

        <div className="crm-drawer-body">
          <div className="crm-drawer-col">
            {/* Titular — só orçamentos; recorrente/novo, vínculo e histórico do cliente */}
            {isQuote && (
              <ClientPanel propertyId={propertyId} lead={lead} busy={busy}
                editable={active} onPromote={promoteAndRefresh} onPatch={patchAndRefresh}
                onDirtyChange={setClientDirty} />
            )}

            {/* Cadastro do titular — o que o cliente preencheu na proposta
                (ou o link para pedir, quando ainda não veio) */}
            {isQuote && (
              <IntakePanel propertyId={propertyId} lead={lead} busy={busy}
                onPatch={patchAndRefresh}
                onChanged={() => setTimelineKey((k) => k + 1)} />
            )}

            {/* Orçamento — acomodações pedidas e as cabanas oferecidas em cada */}
            {isQuote && (
              <QuoteSnapshot propertyId={propertyId} lead={lead} busy={busy} active={active}
                onChanged={() => { onQuoteChanged?.(); setTimelineKey((k) => k + 1); }}
                onEdit={(q) => onEditQuote?.(q)}
                onDuplicate={(q) => onDuplicateQuote?.(q)}
                onLoaded={setQuoteHasRooms} />
            )}

            {/* Negociação — só orçamentos; casamentos têm o financeiro na gestão do evento */}
            {isQuote && active && (
              <NegotiationSection lead={lead} channels={channels} busy={busy}
                hideValue={quoteHasRooms} onPatch={patchAndRefresh}
                onDirtyChange={setNegDirty} />
            )}

            {/* Vincular estadia — paridade com o funil antigo do Tarifário:
                fecha o elo manualmente quando a reserva foi criada por fora. */}
            {isQuote && !lead.stayId && (
              <StayLinkSection propertyId={propertyId} lead={lead}
                onLinked={() => { onQuoteChanged?.(); setTimelineKey((k) => k + 1); }} />
            )}

            {/* Excluir — só gestão vê (a rota barra de todo jeito). */}
            {isQuote && canDelete && (
              <DeleteQuoteSection propertyId={propertyId} lead={lead} busy={busy}
                onDeleted={() => { onDeleted?.(); onClose(); }} />
            )}

            {/* Cobranças do contrato — só casamentos (parcelas reais, read-only) */}
            {!isQuote && <ContractCharges lead={lead} />}
          </div>

          <div className="crm-drawer-col crm-drawer-col-right">
          {/* Alarmes — também em lead FECHADO (cobrança é pós-fechamento) */}
          <LeadAlarms propertyId={propertyId} lead={lead}
            onChanged={() => { onAlarmsChanged?.(); setTimelineKey((k) => k + 1); }} />

          {/* Ações */}
          {active && (
            <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {moveTargets.map((s) => (
                  <button key={s.id} disabled={busy} onClick={() => onMoveStage(s.id)}
                    style={{
                      padding: "6px 11px", borderRadius: 10, fontSize: 11, fontWeight: 800,
                      border: `1px solid ${T.border2}`, background: T.card,
                      color: T.muted, cursor: "pointer", fontFamily: "inherit",
                      opacity: busy ? 0.5 : 1,
                    }}>
                    → {s.label}
                  </button>
                ))}
                <button disabled={busy || needsGuest} onClick={onWin}
                  title={needsGuest ? "Promova o cliente a hóspede antes de fechar" : undefined}
                  style={{
                    padding: "6px 11px", borderRadius: 10, fontSize: 11, fontWeight: 800,
                    border: "none", background: T.emeraldBg, color: T.emerald,
                    cursor: needsGuest ? "not-allowed" : "pointer", fontFamily: "inherit",
                    opacity: busy || needsGuest ? 0.5 : 1,
                  }}>
                  ✓ {isQuote ? "Ganhou" : "Confirmou"}
                </button>
                <button disabled={busy} onClick={onMarkLost}
                  style={{
                    padding: "6px 11px", borderRadius: 10, fontSize: 11, fontWeight: 800,
                    border: "none", background: T.redBg, color: T.red,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 4, opacity: busy ? 0.5 : 1,
                  }}>
                  <XCircle size={12} /> Perdeu
                </button>
              </div>
              {needsGuest && (
                <p style={{ fontSize: 11, color: T.muted, margin: "-4px 0 0", lineHeight: 1.5 }}>
                  Para fechar, promova o cliente a hóspede acima — é a ficha que sustenta
                  estadia, fólio e histórico.
                </p>
              )}

              {/* Registrar contato / nota */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, background: T.glass, borderRadius: 12 }}>
                  <button onClick={() => setNoteMode("follow_up")} style={segBtn(noteMode === "follow_up")}>
                    Contato (renova prazos)
                  </button>
                  <button onClick={() => setNoteMode("note")} style={segBtn(noteMode === "note")}>
                    Só nota
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...S.input, flex: 1 }}
                    placeholder={noteMode === "follow_up" ? "O que ficou combinado? (opcional)" : "Anotação interna"}
                    value={note} onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNote()} />
                  <button onClick={submitNote}
                    disabled={sending || (noteMode === "note" && !note.trim())}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 38, borderRadius: 11, border: "none", background: T.grad,
                      color: "#fff", cursor: "pointer",
                      opacity: sending || (noteMode === "note" && !note.trim()) ? 0.6 : 1,
                    }}>
                    {sending ? <Loader2 size={13} className="animate-spin" /> :
                      noteMode === "follow_up" ? <Send size={14} /> : <MessageSquare size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={{ padding: 20 }}>
            <p style={{ ...drawerLabel, marginBottom: 14 }}>Histórico</p>
            <InteractionTimeline key={timelineKey} propertyId={propertyId} lead={lead} />
          </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
