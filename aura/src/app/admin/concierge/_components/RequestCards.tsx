"use client";

import React from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, Clock, Edit2, Eye, EyeOff, Package, Pin, RotateCcw, ShoppingBag, Trash2, XCircle } from "lucide-react";
import type { ConciergeItem } from "@/types/aura";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { Card, Pill, Button, IconButton, Dialog, SectionLabel } from "@/components/aura";
import { ageLabel, avatarFromName, categoryLabel, categoryTone, resolveItemIcon, URGENCY, type EnrichedRequest, type RequestAction } from "./concierge-utils";

/** Ícone do item: emoji, imagem ou ícone por categoria. */
export function ItemIcon({ item, size = 32 }: { item: { image_url?: string; category: string; name?: string }; size?: number }) {
  const icon = resolveItemIcon(item);
  const t = toneOf(categoryTone(item.category));
  const base: React.CSSProperties = { width: size, height: size, borderRadius: Math.round(size * .28), background: t.bg, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" };
  if (icon.kind === "emoji") return <span style={{ ...base, fontSize: Math.round(size * .56) }}>{icon.value}</span>;
  if (icon.kind === "image") return <span style={base}><Image src={icon.value} alt={item.name ?? ""} fill className="object-cover" /></span>;
  return <span style={{ ...base, color: t.color }}>{item.category === "loan" ? <Package size={Math.round(size * .45)} /> : <ShoppingBag size={Math.round(size * .45)} />}</span>;
}

/** Cartão de pedido pendente com ações rápidas. */
export function PendingCard({ req, actioning, onAction, onDetail }: {
  req: EnrichedRequest; actioning: boolean; onAction: (id: string, action: RequestAction) => void; onDetail: () => void;
}) {
  const urg = URGENCY[req.urgency];
  const ut = toneOf(urg.tone);
  const isLoan = req.item?.category === "loan";
  return (
    <Card pad={0} style={{ borderColor: ut.border, overflow: "hidden" }}>
      <div style={{ height: 3, background: ut.color, opacity: .8 }} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <button type="button" onClick={onDetail} className="ak-press" style={{ all: "unset", display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", width: "100%" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: ut.bg, border: `1px solid ${ut.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: ut.color }}>
            {avatarFromName(req.cabinName || req.itemId || "?")}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 900, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{req.cabinName || "—"}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 11, color: T.muted, fontWeight: 600 }}><Pin size={10} /> Cabana</span>
          </span>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            <Pill tone={urg.tone} label={urg.label} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: T.muted, fontWeight: 600 }}><Clock size={10} /> {ageLabel(req.ageMin)}</span>
          </span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          <ItemIcon item={{ image_url: req.item?.image_url, category: req.item?.category ?? "consumption", name: req.item?.name }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{req.quantity}× {req.item?.name || req.itemId}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
              <Pill tone={categoryTone(req.item?.category)} label={categoryLabel(req.item?.category)} />
              {req.requestedBy === "maid" && <Pill tone="violet" label="Camareira" />}
            </div>
          </div>
        </div>

        {req.notes && <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic", paddingLeft: 10, borderLeft: `2px solid ${T.border2}`, lineHeight: 1.4 }}>“{req.notes}”</div>}

        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="soft" tone="green" size="sm" icon={CheckCircle2} onClick={() => onAction(req.id, "deliver")} loading={actioning} style={{ flex: 1 }}>Entregar</Button>
          {isLoan && (
            <>
              <Button variant="soft" tone="blue" size="sm" icon={RotateCcw} onClick={() => onAction(req.id, "return")} disabled={actioning} style={{ flex: 1 }}>Devolvido</Button>
              <IconButton icon={XCircle} label="Marcar como extraviado" variant="soft" tone="red" onClick={() => onAction(req.id, "lost")} disabled={actioning} />
            </>
          )}
          <IconButton icon={Eye} label="Ver detalhes" variant="secondary" onClick={onDetail} />
        </div>
      </div>
    </Card>
  );
}

/** Painel lateral (drawer no desktop, sheet no celular) com detalhes e ações do pedido. */
export function DetailPanel({ req, open, onClose, onAction }: {
  req: EnrichedRequest | null; open: boolean; onClose: () => void; onAction: (id: string, action: RequestAction) => void;
}) {
  const urg = req ? URGENCY[req.urgency] : URGENCY.new;
  const ut = toneOf(urg.tone);
  const isLoan = req?.item?.category === "loan";
  const act = (a: RequestAction) => { if (req) { onAction(req.id, a); onClose(); } };
  return (
    <Dialog open={open && !!req} onClose={onClose} presentation="auto" size="md" side="right"
      title={req?.item?.name || req?.itemId || "Pedido"} subtitle={`Pedido · ${req?.cabinName || "—"}`}
      footer={req ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <Button variant="soft" tone="green" icon={CheckCircle2} fullWidth onClick={() => act("deliver")}>Confirmar entrega</Button>
          {isLoan && (
            <>
              <Button variant="soft" tone="blue" icon={RotateCcw} fullWidth onClick={() => act("return")}>Item devolvido</Button>
              <Button variant="soft" tone="red" icon={XCircle} fullWidth onClick={() => act("lost")}>Marcar como extraviado</Button>
            </>
          )}
        </div>
      ) : undefined}
      footerRow
    >
      {req && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: 16, borderRadius: 16, background: T.glass, border: `1px solid ${T.border2}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ItemIcon item={{ image_url: req.item?.image_url, category: req.item?.category ?? "consumption", name: req.item?.name }} size={48} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: T.text }}>{req.quantity}× {req.item?.name || req.itemId}</div>
                <Pill tone={categoryTone(req.item?.category)} label={categoryLabel(req.item?.category)} style={{ marginTop: 4 }} />
              </div>
            </div>
            {req.notes && <div style={{ marginTop: 12, padding: "10px 12px", background: T.card, borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 13, color: T.muted, lineHeight: 1.5, fontStyle: "italic" }}>“{req.notes}”</div>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Cabana", value: req.cabinName || "—" },
              { label: "Tempo de espera", value: ageLabel(req.ageMin) },
              { label: "Solicitante", value: req.requestedBy === "maid" ? "Camareira" : "Hóspede" },
              { label: "Valor estimado", value: req.item && req.item.price > 0 ? `R$ ${(req.item.price * req.quantity).toFixed(2)}` : "Grátis" },
            ].map(info => (
              <div key={info.label} style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px" }}>
                <SectionLabel style={{ marginBottom: 4 }}>{info.label}</SectionLabel>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{info.value}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: "12px 14px", borderRadius: 12, background: ut.bg, border: `1px solid ${ut.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={16} color={ut.color} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: ut.color }}>{urg.label}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>Aguardando há {ageLabel(req.ageMin)}</div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Cartão de item do catálogo. */
export function CatalogCard({ item, onEdit, onToggleActive, onDelete, onRequest }: {
  item: ConciergeItem; onEdit: () => void; onToggleActive: () => void; onDelete: () => void; onRequest: () => void;
}) {
  const both = item.availableForGuest && item.availableForMaid;
  const accessLabel = both ? "Ambos" : item.availableForGuest ? "Só hóspede" : item.availableForMaid ? "Só camareira" : "Nenhum";
  const accessTone = both ? "neutral" : item.availableForGuest ? "green" : item.availableForMaid ? "violet" : "red";
  return (
    <Card pad={16} style={{ display: "flex", flexDirection: "column", gap: 10, opacity: item.active ? 1 : .6, borderStyle: item.active ? "solid" : "dashed" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <span style={{ filter: item.active ? "none" : "grayscale(1)" }}><ItemIcon item={item} size={40} /></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          {!item.active && <Pill tone="neutral" label="Desativado" />}
          <IconButton icon={item.active ? EyeOff : Eye} label={item.active ? "Desativar" : "Reativar"} size="sm" tone={item.active ? undefined : "green"} variant={item.active ? "ghost" : "soft"} onClick={onToggleActive} />
          <IconButton icon={Edit2} label="Editar" size="sm" onClick={onEdit} />
          <IconButton icon={Trash2} label="Arquivar item" size="sm" tone="red" onClick={onDelete} />
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: item.active ? T.text : T.muted, lineHeight: 1.3 }}>{item.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: item.price > 0 ? T.brandText : T.green }}>{item.price > 0 ? `R$ ${item.price.toFixed(2)}` : "Grátis"}</span>
          {item.included_qty > 0 && <span style={{ fontSize: 10, color: T.muted }}>· {item.included_qty} incluso(s)</span>}
          {item.stockAvailable === false && <Pill tone="red" label="Esgotado" />}
        </div>
        {item.active && <Pill tone={accessTone} label={accessLabel} style={{ marginTop: 6 }} />}
      </div>
      <Button variant="outline" size="sm" fullWidth onClick={onRequest} disabled={!item.active}>{item.active ? "Registrar pedido" : "Item desativado"}</Button>
    </Card>
  );
}
